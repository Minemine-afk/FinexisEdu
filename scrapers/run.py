"""Refreshes data/ from university fee pages and exchange rates (ECB, then Frankfurter or the IMF).

    python -m scrapers.run               # update data/ and write scrapers/out/summary.md
    python -m scrapers.run --dry-run     # print what would change, write nothing
    python -m scrapers.run --only nus    # just one university

The monthly GitHub Action runs this and opens a PR whose body is the summary,
so a human reviews every change before it reaches the site.
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
from dataclasses import dataclass, field
from datetime import date, timedelta
from pathlib import Path
from typing import Callable

import requests
import yaml

from .fetch import fetch_text
from .models import FeeHistoryEntry, Programme, Registry, Source, University

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
REGISTRY_PATH = Path(__file__).resolve().parent / "registry.yaml"
# Extra registry files, one per university or country, merged with registry.yaml.
REGISTRY_DIR = Path(__file__).resolve().parent / "registry.d"
SUMMARY_PATH = Path(__file__).resolve().parent / "out" / "summary.md"

FLAG_THRESHOLD = 0.25  # changes bigger than this are called out for review
MANUAL_CHECK_AFTER = timedelta(days=330)
# The currencies the site started with, in their original order; others follow A to Z.
FIRST_CURRENCIES = ["GBP", "AUD", "USD", "EUR", "CAD", "NZD", "CHF", "JPY"]


def fx_currencies(data_dir: Path) -> list[str]:
    """Every country's currency except SGD (mirrors fxCurrencies in lib/fx.ts)."""
    used = {json.loads(f.read_text())["currency"] for f in (data_dir / "countries").glob("*.json")} - {"SGD"}
    return [c for c in FIRST_CURRENCIES if c in used] + sorted(used - set(FIRST_CURRENCIES))

Fetcher = Callable[[str, str], str]


def load_registry(path: Path = REGISTRY_PATH, extra_dir: Path = REGISTRY_DIR) -> Registry:
    """registry.yaml plus every `sources:` list in registry.d/*.yaml, in filename order."""
    sources = list(yaml.safe_load(path.read_text())["sources"])
    if extra_dir.is_dir():
        for part in sorted(extra_dir.glob("*.yaml")):
            sources.extend(yaml.safe_load(part.read_text()).get("sources") or [])
    return Registry.model_validate({"sources": sources})


@dataclass
class Change:
    university: str
    programme: str
    what: str
    old: float | None
    new: float

    @property
    def pct(self) -> float | None:
        return None if not self.old else (self.new - self.old) / self.old

    @property
    def flagged(self) -> bool:
        return self.pct is None or abs(self.pct) > FLAG_THRESHOLD


@dataclass
class Report:
    changes: list[Change] = field(default_factory=list)
    verified: list[str] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)
    manual: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------


def extract_amount(text: str, pattern: str) -> float | None:
    """The amount matched by `pattern`. With several capture groups the amounts
    are added up, for fees published as separate line items."""
    m = re.search(pattern, text, re.IGNORECASE)
    if not m:
        return None
    total = 0.0
    for group in m.groups():
        digits = re.sub(r"[^\d.]", "", group or "")
        try:
            total += float(digits)
        except ValueError:
            return None
    return total


def extract_year(text: str, pattern: str) -> int | None:
    years = [int(y) for y in re.findall(pattern, text, re.IGNORECASE) if str(y).isdigit()]
    return max(years) if years else None


def matching_programmes(uni: University, level, field_, name) -> list[Programme]:
    return [
        p
        for p in uni.programmes
        if (level is None or p.level == level)
        and (field_ is None or p.field == field_)
        and (name is None or name.lower() in p.name.lower())
    ]


def apply_source(source: Source, text: str, uni: University, today: date, report: Report) -> None:
    """Updates `uni` in place from one source page's text."""
    found: list[tuple[Programme, str, str, float]] = []
    for t in source.targets:
        amount = extract_amount(text, t.pattern)
        label = f"{uni.id} {t.level or '*'}/{t.field or '*'} {t.tier} {t.key}"
        if amount is None:
            report.problems.append(f"{label}: pattern not found on {source.url}")
            continue
        if t.key.startswith("living."):
            apply_living(uni, t.key.removeprefix("living."), round(amount * t.multiplier, 2), today, report)
            continue
        progs = matching_programmes(uni, t.level, t.field, t.programme)
        if not progs:
            report.problems.append(f"{label}: no programme in data/ matches this target")
            continue
        for p in progs:
            found.append((p, t.tier, t.key, round(amount * t.multiplier, 2)))

    page_year = extract_year(text, source.year_pattern) if source.year_pattern else None
    touched = {id(p): p for p, *_ in found}

    for p in touched.values():
        if page_year and page_year < p.feeYear:
            report.problems.append(
                f"{uni.id} {p.name}: page shows {page_year} fees but data already has {p.feeYear}; skipped"
            )
            continue
        if page_year and page_year > p.feeYear:
            # New academic year: keep last year's figures as history before overwriting.
            for tier in ("citizen", "pr", "international"):
                fees = getattr(p.fees, tier)
                if fees is not None:
                    p.feeHistory.append(
                        FeeHistoryEntry(
                            feeYear=p.feeYear,
                            tier=tier,
                            annualTuition=fees.annualTuition,
                            annualCompulsoryFees=fees.annualCompulsoryFees,
                            oneOffFees=fees.oneOffFees,
                            sourceUrl=p.sourceUrl,
                        )
                    )
            report.notes.append(f"{uni.id} {p.name}: fee year {p.feeYear} -> {page_year}")
            p.feeYear = page_year

    for p, tier, key, amount in found:
        if page_year and page_year < p.feeYear:
            continue
        fees = getattr(p.fees, tier)
        if fees is None:
            report.problems.append(f"{uni.id} {p.name}: no {tier} tier in data to update")
            continue
        old = getattr(fees, key)
        if abs(old - amount) > 0.5:
            report.changes.append(Change(uni.id, p.name, f"{tier} {key}", old, amount))
            setattr(fees, key, amount)
        p.lastVerified = today

    for p in touched.values():
        if p.lastVerified == today:
            report.verified.append(f"{uni.id}: {p.name}")


def apply_living(uni: University, category: str, monthly: float, today: date, report: Report) -> None:
    living = uni.livingCosts
    if living is None:
        report.problems.append(f"{uni.id}: living-cost target but no livingCosts in data")
        return
    old = getattr(living.monthly, category)
    if abs(old - monthly) > 0.5:
        report.changes.append(Change(uni.id, "living costs", f"monthly {category}", old, monthly))
        setattr(living.monthly, category, monthly)
    if living.lastVerified != today:
        living.lastVerified = today
        report.verified.append(f"{uni.id}: living costs")


# ---------------------------------------------------------------------------
# Data files
# ---------------------------------------------------------------------------


def _tidy(value):
    """Writes 8250.0 as 8250 so diffs stay readable."""
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, dict):
        return {k: _tidy(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_tidy(v) for v in value]
    return value


def load_universities(data_dir: Path) -> dict[str, tuple[Path, University]]:
    out = {}
    for path in sorted((data_dir / "universities").glob("*/*.json")):
        uni = University.model_validate_json(path.read_text())
        out[uni.id] = (path, uni)
    return out


def save_university(path: Path, uni: University) -> None:
    data = _tidy(uni.model_dump(mode="json", exclude_none=True))
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


FX_CODES = json.loads((ROOT / "lib" / "fx-imf.json").read_text())
FX_MAX_AGE_MONTHS = 12  # older IMF rates are treated as missing
FX_MAX_AGE_DAYS = 7  # older central-bank rates from Frankfurter are treated as missing
FX_MAX_GAP = 0.02  # two central banks further apart than this are treated as unreliable
FX_MAJOR_BANKS = ["MAS", "BOE", "BOC", "RBA", "IMF"]
FRANKFURTER = "https://api.frankfurter.dev"


def imf_country(currency: str) -> str | None:
    """The IMF country code whose exchange rate stands for a currency (mirrors imfCountry in lib/fx.ts)."""
    return FX_CODES["area"].get(currency) or FX_CODES["iso3"].get(currency[:2])


def imf_rates(currencies: list[str], today: date) -> tuple[dict[str, float], dict[str, str]]:
    """Units of each currency per SGD from the latest IMF month-end rates, and the month each comes from
    (mirrors getImfRates in lib/fx.ts)."""
    want = {imf_country(c): c for c in currencies if imf_country(c)}
    months_back = today.year * 12 + today.month - 1 - FX_MAX_AGE_MONTHS
    start = f"{months_back // 12}-{months_back % 12 + 1:02d}"
    res = requests.get(
        f"https://api.imf.org/external/sdmx/2.1/data/IMF.STA,ER/{'+'.join(['SGP', *want])}.XDC_USD.EOP_RT.M",
        params={"startPeriod": start},
        headers={"Accept": "application/vnd.sdmx.data+csv;version=1.0.0"},
        timeout=60,
    )
    res.raise_for_status()
    header, *rows = [r.split(",") for r in res.text.strip().splitlines()]
    country, period, value = (header.index(h) for h in ("COUNTRY", "TIME_PERIOD", "OBS_VALUE"))
    series: dict[str, dict[str, float]] = {}
    for r in rows:
        if r[value] and float(r[value]) > 0:
            series.setdefault(r[country], {})[r[period].replace("-M", "-")] = float(r[value])
    sgd = series.get("SGP") or {}
    if not sgd:
        raise ValueError("no IMF rate for the Singapore dollar")
    rates: dict[str, float] = {}
    months: dict[str, str] = {}
    for code, currency in want.items():
        shared = sorted(m for m in series.get(code, {}) if m in sgd)
        if shared:
            rates[currency] = float(f"{series[code][shared[-1]] / sgd[shared[-1]]:.5g}")
            months[currency] = shared[-1]
    return rates, months


def ecb_rates() -> tuple[str, dict[str, float]]:
    """The ECB's daily rates as units per SGD and their date, from the ECB's own file or else
    Frankfurter's copy (mirrors getEcbRates in lib/fx.ts)."""
    try:
        res = requests.get("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml", timeout=30)
        res.raise_for_status()
        day = re.search(r"time=['\"](\d{4}-\d{2}-\d{2})['\"]", res.text)
        per_euro = {"EUR": 1.0} | {
            c: float(r) for c, r in re.findall(r"currency=['\"]([A-Z]{3})['\"]\s+rate=['\"]([\d.]+)['\"]", res.text)
        }
        if not day or "SGD" not in per_euro:
            raise ValueError("no date or SGD rate in the ECB file")
        sgd = per_euro.pop("SGD")
        return day.group(1), {c: float(f"{r / sgd:.5g}") for c, r in per_euro.items()}
    except Exception:  # noqa: BLE001 - fall back to Frankfurter's copy
        res = requests.get(f"{FRANKFURTER}/v1/latest?base=SGD", timeout=30)
        res.raise_for_status()
        body = res.json()
        return body["date"], body["rates"]


def frankfurter_rates(currencies: list[str], today: date) -> tuple[dict[str, float], dict[str, dict[str, str]]]:
    """Units of each currency per SGD from a named central bank through Frankfurter, and the bank and
    date each comes from (mirrors getFrankfurterRates in lib/fx.ts)."""
    res = requests.get(
        f"{FRANKFURTER}/v2/rates", params={"base": "SGD", "quotes": ",".join(currencies), "expand": "providers"}, timeout=60
    )
    res.raise_for_status()
    providers = requests.get(f"{FRANKFURTER}/v2/providers", timeout=60)
    providers.raise_for_status()
    banks = providers.json()
    names = {p["key"]: p["name"] for p in banks}
    oldest = (today - timedelta(days=FX_MAX_AGE_DAYS)).isoformat()
    rates: dict[str, float] = {}
    sources: dict[str, dict[str, str]] = {}
    for row in res.json():
        if row["quote"] not in currencies:
            continue
        order = FX_MAJOR_BANKS + [p["key"] for p in banks if p["pivot_currency"] == row["quote"]]
        fresh = [
            p for key in order for p in row.get("providers") or [] if p["key"] == key and p["date"] >= oldest and p["rate"] > 0
        ]
        if not fresh or (len(fresh) > 1 and abs(fresh[0]["rate"] / fresh[1]["rate"] - 1) > FX_MAX_GAP):
            continue
        rates[row["quote"]] = float(f"{fresh[0]['rate']:.5g}")
        sources[row["quote"]] = {"name": names.get(fresh[0]["key"], fresh[0]["key"]), "date": fresh[0]["date"]}
    return rates, sources


def refresh_fx(data_dir: Path, report: Report, dry_run: bool, today: date | None = None) -> None:
    """ECB rates where published, and for the rest the source chosen in data/settings.json: a central bank
    through Frankfurter or the IMF's month-end rate (mirrors getRates in lib/fx.ts)."""
    other = json.loads((data_dir / "settings.json").read_text()).get("otherExchangeRates", "frankfurter")
    try:
        currencies = fx_currencies(data_dir)
        day, ecb = ecb_rates()
        rates = {c: ecb[c] for c in currencies if c in ecb}
        month_end: dict[str, str] = {}
        sources: dict[str, dict[str, str]] = {}
        if missing := [c for c in currencies if c not in rates]:
            if other == "imf":
                extra, month_end = imf_rates(missing, today or date.today())
            else:
                extra, sources = frankfurter_rates(missing, today or date.today())
            rates |= extra
        if missing := [c for c in currencies if c not in rates]:
            name = "the IMF" if other == "imf" else "a central bank through Frankfurter"
            raise ValueError(f"neither the ECB nor {name} has a recent rate for " + ", ".join(missing))
    except Exception as err:  # noqa: BLE001 - any failure just keeps the old file
        report.problems.append(f"exchange rates: {err}")
        return
    if not dry_run:
        payload: dict = {"base": "SGD", "date": day, "rates": dict(sorted(rates.items()))}
        if month_end:
            payload["monthEnd"] = dict(sorted(month_end.items()))
        if sources:
            payload["sources"] = dict(sorted(sources.items()))
        (data_dir / "fx-fallback.json").write_text(json.dumps(payload, indent=2) + "\n")
    report.notes.append(f"fallback exchange rates refreshed ({day})")


def _median_rate(growth: list[float]) -> float:
    return round(min(max(statistics.median(growth), 0.0), 0.15), 3)


def update_fee_increase_defaults(data_dir: Path, unis: list[University], report: Report, dry_run: bool) -> None:
    """Sets each country's default yearly increase to the median observed increase,
    once there are at least five fee series with two or more years of history.

    Each series contributes one observation: its compound yearly growth from
    the earliest to the latest published fee. Taking every year-on-year step
    instead would bias the median towards zero where fees rise in steps every
    other year, as Singapore Citizen fees do. Rates are also kept per fee tier,
    since Singapore Citizen fees rise far more slowly than international ones.
    Identical fee series within a university (e.g. one national rate listed
    under ten faculties) count once.
    """
    for path in sorted((data_dir / "countries").glob("*.json")):
        country = json.loads(path.read_text())
        by_tier: dict[str, list[float]] = {"citizen": [], "pr": [], "international": []}
        for uni in (u for u in unis if u.country == country["code"]):
            seen: set[tuple] = set()
            for p in uni.programmes:
                for tier, growth in by_tier.items():
                    current = getattr(p.fees, tier)
                    history = [(h.feeYear, h.annualTuition) for h in p.feeHistory if h.tier == tier]
                    series = tuple(sorted(history + ([(p.feeYear, current.annualTuition)] if current else [])))
                    if len(series) < 2 or (tier, series) in seen:
                        continue
                    seen.add((tier, series))
                    (y0, a), (y1, b) = series[0], series[-1]
                    if y1 > y0 and a > 0:
                        growth.append((b / a) ** (1 / (y1 - y0)) - 1)

        updated = dict(country)
        all_growth = [g for gs in by_tier.values() for g in gs]
        if len(all_growth) >= 5:
            updated["defaultFeeIncrease"] = _median_rate(all_growth)
        tiers = {t: _median_rate(gs) for t, gs in by_tier.items() if len(gs) >= 5}
        if len(tiers) > 1:
            updated["feeIncreaseByTier"] = tiers
        if updated != country:
            report.notes.append(
                f"{country['name']}: default yearly increase {country['defaultFeeIncrease']:.1%} -> "
                f"{updated['defaultFeeIncrease']:.1%}"
                + (f"; by tier {', '.join(f'{t} {r:.1%}' for t, r in tiers.items())}" if len(tiers) > 1 else "")
                + f" ({len(all_growth)} observations)"
            )
            if not dry_run:
                path.write_text(json.dumps(updated, indent=2) + "\n")


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------


def run(
    registry: Registry,
    data_dir: Path,
    today: date,
    fetch: Fetcher = fetch_text,
    dry_run: bool = False,
    only: str | None = None,
    with_fx: bool = True,
) -> Report:
    report = Report()
    unis = load_universities(data_dir)
    dirty: set[str] = set()
    pages: dict[str, str] = {}

    for source in registry.sources:
        if only and source.university != only:
            continue
        if source.university not in unis:
            report.problems.append(f"{source.university}: in registry but no data file")
            continue
        if source.manual or not source.targets:
            continue
        url = str(source.url)
        try:
            if url not in pages:
                pages[url] = fetch(url, source.parser)
        except Exception as err:  # noqa: BLE001 - report and keep the old data
            report.problems.append(f"{source.university}: could not fetch {url} ({err})")
            continue
        path, uni = unis[source.university]
        before = uni.model_dump_json()
        apply_source(source, pages[url], uni, today, report)
        if uni.model_dump_json() != before:
            dirty.add(uni.id)

    if not only:
        for uni_id, (_, uni) in unis.items():
            for p in uni.programmes:
                if today - p.lastVerified > MANUAL_CHECK_AFTER:
                    report.manual.append(f"{uni.name}: {p.name} (last checked {p.lastVerified}) — {p.sourceUrl}")
            living = uni.livingCosts
            if living and today - living.lastVerified > MANUAL_CHECK_AFTER:
                report.manual.append(f"{uni.name}: living costs (last checked {living.lastVerified}) — {living.sourceUrl}")
        if with_fx:
            refresh_fx(data_dir, report, dry_run, today)
        update_fee_increase_defaults(data_dir, [u for _, u in unis.values()], report, dry_run)

    if not dry_run:
        for uni_id in dirty:
            save_university(*unis[uni_id])
    return report


def summarise(report: Report) -> str:
    lines = ["## Fee data refresh", ""]
    flagged = [c for c in report.changes if c.flagged]
    if flagged:
        lines += [f"### ⚠️ Large changes (over {FLAG_THRESHOLD:.0%}), check these against the source", ""]
        lines += [f"- **{c.university}** {c.programme}, {c.what}: {c.old:,.0f} → {c.new:,.0f}" for c in flagged]
        lines.append("")
    normal = [c for c in report.changes if not c.flagged]
    if normal:
        lines += ["### Fee changes", "", "| University | Programme | Fee | Old | New | Change |", "|---|---|---|---:|---:|---:|"]
        lines += [
            f"| {c.university} | {c.programme} | {c.what} | {c.old:,.0f} | {c.new:,.0f} | {c.pct:+.1%} |" for c in normal
        ]
        lines.append("")
    if report.notes:
        lines += ["### Other updates", ""] + [f"- {n}" for n in report.notes] + [""]
    if report.problems:
        lines += ["### Scraper problems (old values kept)", ""] + [f"- {p}" for p in report.problems] + [""]
    if report.manual:
        lines += ["### Needs a manual check (not verified for 11+ months)", ""]
        lines += [f"- {m}" for m in report.manual] + [""]
    lines.append(f"Verified {len(report.verified)} programme(s) against their source pages.")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="print the summary without writing files")
    ap.add_argument("--only", help="only process this university id")
    ap.add_argument("--strict", action="store_true", help="exit with status 1 if any source had problems")
    ap.add_argument("--summary", type=Path, default=SUMMARY_PATH, help="where to write the PR summary")
    args = ap.parse_args(argv)

    registry = load_registry()
    report = run(registry, DATA_DIR, date.today(), dry_run=args.dry_run, only=args.only)
    summary = summarise(report)
    if args.dry_run:
        print(summary)
    else:
        args.summary.parent.mkdir(parents=True, exist_ok=True)
        args.summary.write_text(summary)
        print(summary)
    return 1 if args.strict and report.problems else 0


if __name__ == "__main__":
    sys.exit(main())
