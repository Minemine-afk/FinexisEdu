"""Refreshes data/ from university fee pages and the exchange-rate API.

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
SUMMARY_PATH = Path(__file__).resolve().parent / "out" / "summary.md"

FLAG_THRESHOLD = 0.25  # changes bigger than this are called out for review
MANUAL_CHECK_AFTER = timedelta(days=330)
FX_CURRENCIES = ["GBP", "AUD", "USD", "CAD", "NZD", "JPY"]
FX_URL = "https://api.frankfurter.dev/v1/latest?base=SGD&symbols=" + ",".join(FX_CURRENCIES)

Fetcher = Callable[[str, str], str]


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
    m = re.search(pattern, text, re.IGNORECASE)
    if not m:
        return None
    digits = re.sub(r"[^\d.]", "", m.group(1))
    try:
        return float(digits)
    except ValueError:
        return None


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
                        FeeHistoryEntry(feeYear=p.feeYear, tier=tier, annualTuition=fees.annualTuition)
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


def refresh_fx(data_dir: Path, report: Report, dry_run: bool) -> None:
    try:
        res = requests.get(FX_URL, timeout=30)
        res.raise_for_status()
        body = res.json()
        rates = {c: body["rates"][c] for c in FX_CURRENCIES}
    except Exception as err:  # noqa: BLE001 - any failure just keeps the old file
        report.problems.append(f"exchange rates: {err}")
        return
    if not dry_run:
        payload = {"base": "SGD", "date": body["date"], "rates": dict(sorted(rates.items()))}
        (data_dir / "fx-fallback.json").write_text(json.dumps(payload, indent=2) + "\n")
    report.notes.append(f"fallback exchange rates refreshed ({body['date']})")


def update_fee_increase_defaults(data_dir: Path, unis: list[University], report: Report, dry_run: bool) -> None:
    """Sets each country's default yearly increase to the median observed increase,
    once there are at least five year-on-year data points."""
    for path in sorted((data_dir / "countries").glob("*.json")):
        country = json.loads(path.read_text())
        growth: list[float] = []
        for uni in (u for u in unis if u.country == country["code"]):
            for p in uni.programmes:
                series = sorted(
                    [(h.feeYear, h.annualTuition) for h in p.feeHistory if h.tier == "international"]
                    + [(p.feeYear, p.fees.international.annualTuition)]
                )
                for (y0, a), (y1, b) in zip(series, series[1:]):
                    if y1 > y0 and a > 0:
                        growth.append((b / a) ** (1 / (y1 - y0)) - 1)
        if len(growth) < 5:
            continue
        rate = round(min(max(statistics.median(growth), 0.0), 0.15), 3)
        if rate != country["defaultFeeIncrease"]:
            report.notes.append(
                f"{country['name']}: default yearly increase {country['defaultFeeIncrease']:.1%} -> {rate:.1%}"
                f" (median of {len(growth)} observations)"
            )
            if not dry_run:
                country["defaultFeeIncrease"] = rate
                path.write_text(json.dumps(country, indent=2) + "\n")


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
        if with_fx:
            refresh_fx(data_dir, report, dry_run)
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

    registry = Registry.model_validate(yaml.safe_load(REGISTRY_PATH.read_text()))
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
