"""Decides whether a fee refresh can go live without a person looking at it first.

    cp -r data /tmp/data-before && python -m scrapers.run && python -m scrapers.guard --before /tmp/data-before

Compares data/ after the scrape with the copy taken before it. It passes only when every change
is the kind the scraper is meant to make and is small enough to be believable:

- only fees, fee years, fee history, "last checked" dates, monthly living costs, the countries'
  default yearly increases and the fallback exchange rates have changed; no file was added or
  removed and no programme was added, removed or renamed;
- no programme whose fee was entered by hand (a partner's programme or one citing a manual page)
  has changed at all, apart from its "last checked" date;
- no fee or living cost moved by more than 25% or fell to zero, and none appeared from zero;
- no Singapore Citizen or PR fee changed sides relative to the international fee (say, a
  subsidised rate becoming the full fee);
- a fee year only moved on by one year, and last year's figures were kept as history;
- no country's default yearly increase moved by more than one percentage point;
- no exchange rate moved by more than 10%.

Exit status 0 means safe to publish; 1 means a person should review. Either way the reasons are
written as Markdown (to --out if given, and to stdout).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .models import Registry
from .run import DATA_DIR, FLAG_THRESHOLD, load_registry, manual_only_urls, target_programmes, University

FEE_KEYS = ("annualTuition", "annualCompulsoryFees", "oneOffFees")
TIERS = ("citizen", "pr", "international")
# Programme keys the scraper may change. Anything else changing means something went wrong.
PROGRAMME_KEYS = {"fees", "feeYear", "feeHistory", "lastVerified"}
MAX_RATE_STEP = 0.01  # a country's default yearly increase, in absolute terms
MAX_FX_MOVE = 0.10


def _files(root: Path) -> set[str]:
    return {str(p.relative_to(root)) for p in root.rglob("*") if p.is_file()}


def _scrapable(registry: Registry, uni_id: str, uni: University) -> set[str]:
    """Names of the programmes a scraped target is allowed to change."""
    hand_entered = manual_only_urls(registry).get(uni_id, set())
    names: set[str] = set()
    for s in registry.sources:
        if s.university != uni_id or s.manual:
            continue
        for t in s.targets:
            if not t.key.startswith("living."):
                names |= {p.name for p in target_programmes(s, t, uni, hand_entered)}
    return names


def _amount_problem(label: str, old, new) -> str | None:
    old = old or 0
    new = new or 0
    if old == new:
        return None
    if old == 0:
        return f"{label}: was 0, now {new:,.0f}"
    if new <= 0:
        return f"{label}: {old:,.0f} → {new:,.0f}"
    move = new / old - 1
    if abs(move) > FLAG_THRESHOLD:
        return f"{label}: {old:,.0f} → {new:,.0f} ({move:+.0%})"
    return None


def _check_programme(uni_id: str, before: dict, after: dict, scrapable: bool) -> list[str]:
    label = f"{uni_id} {before['name']}"
    out: list[str] = []
    changed = {k for k in set(before) | set(after) if before.get(k) != after.get(k)}
    if extra := changed - PROGRAMME_KEYS:
        out.append(f"{label}: unexpected change to {', '.join(sorted(extra))}")
    if not scrapable and changed - {"lastVerified"}:
        out.append(f"{label}: fee was entered by hand but the scrape changed it")
        return out

    old_year, new_year = before["feeYear"], after["feeYear"]
    if new_year not in (old_year, old_year + 1):
        out.append(f"{label}: fee year {old_year} → {new_year}")
    old_hist, new_hist = before.get("feeHistory", []), after.get("feeHistory", [])
    if new_hist[: len(old_hist)] != old_hist:
        out.append(f"{label}: earlier fee history was changed")
    added = new_hist[len(old_hist) :]
    if added and (new_year == old_year or any(h["feeYear"] != old_year for h in added)):
        out.append(f"{label}: fee history added without a move to the next fee year")
    if new_year != old_year and not added:
        out.append(f"{label}: fee year moved on without keeping last year's fees as history")

    def order(fees: dict, tier: str) -> int | None:
        """-1, 0 or 1: whether this tier's tuition is below, equal to or above the international one."""
        if not fees.get(tier) or tier == "international":
            return None
        a, b = fees[tier]["annualTuition"], fees["international"]["annualTuition"]
        return (a > b) - (a < b)

    for tier in ("citizen", "pr"):
        old_order, new_order = order(before["fees"], tier), order(after["fees"], tier)
        if old_order is not None and new_order is not None and old_order != new_order:
            words = {-1: "below", 0: "equal to", 1: "above"}
            out.append(f"{label}: {tier} tuition was {words[old_order]} the international fee and is now {words[new_order]} it")

    for tier in TIERS:
        old_fees, new_fees = before["fees"].get(tier), after["fees"].get(tier)
        if (old_fees is None) != (new_fees is None):
            out.append(f"{label}: {tier} fees added or removed")
            continue
        for key in FEE_KEYS if old_fees else ():
            if problem := _amount_problem(f"{label}, {tier} {key}", old_fees.get(key), new_fees.get(key)):
                out.append(problem)
    return out


def _check_university(uni_id: str, before: dict, after: dict, registry: Registry) -> list[str]:
    out: list[str] = []
    changed = {k for k in set(before) | set(after) if before.get(k) != after.get(k)}
    if extra := changed - {"programmes", "livingCosts"}:
        out.append(f"{uni_id}: unexpected change to {', '.join(sorted(extra))}")

    old_living, new_living = before.get("livingCosts"), after.get("livingCosts")
    if (old_living is None) != (new_living is None):
        out.append(f"{uni_id}: living costs added or removed")
    elif old_living:
        moved = {k for k in set(old_living) | set(new_living) if old_living.get(k) != new_living.get(k)}
        if extra := moved - {"monthly", "lastVerified"}:
            out.append(f"{uni_id} living costs: unexpected change to {', '.join(sorted(extra))}")
        for k in set(old_living["monthly"]) | set(new_living["monthly"]):
            old_v, new_v = old_living["monthly"].get(k), new_living["monthly"].get(k)
            if problem := _amount_problem(f"{uni_id} living costs, monthly {k}", old_v, new_v):
                out.append(problem)

    old_progs, new_progs = before["programmes"], after["programmes"]
    if [p["name"] for p in old_progs] != [p["name"] for p in new_progs]:
        return out + [f"{uni_id}: programmes were added, removed, renamed or reordered"]
    scrapable = _scrapable(registry, uni_id, University.model_validate(before))
    for old_p, new_p in zip(old_progs, new_progs):
        if old_p != new_p:
            out += _check_programme(uni_id, old_p, new_p, old_p["name"] in scrapable)
    return out


def _check_country(name: str, before: dict, after: dict) -> list[str]:
    out: list[str] = []
    changed = {k for k in set(before) | set(after) if before.get(k) != after.get(k)}
    if extra := changed - {"defaultFeeIncrease", "feeIncreaseByTier"}:
        return [f"{name}: unexpected change to {', '.join(sorted(extra))}"]
    pairs = [("default", before.get("defaultFeeIncrease"), after.get("defaultFeeIncrease"))]
    old_tiers, new_tiers = before.get("feeIncreaseByTier") or {}, after.get("feeIncreaseByTier") or {}
    pairs += [(t, old_tiers.get(t), new_tiers.get(t)) for t in set(old_tiers) | set(new_tiers)]
    for label, old, new in pairs:
        if new is None or old == new:
            continue
        if not 0 <= new <= 0.15 or (old is not None and abs(new - old) > MAX_RATE_STEP):
            out.append(f"{name}: {label} yearly increase {old if old is None else f'{old:.1%}'} → {new:.1%}")
    return out


def _check_fx(before: dict, after: dict) -> list[str]:
    out: list[str] = []
    old_rates, new_rates = before.get("rates", {}), after.get("rates", {})
    if missing := set(old_rates) - set(new_rates):
        out.append(f"exchange rates: {', '.join(sorted(missing))} dropped")
    for c in set(old_rates) & set(new_rates):
        if old_rates[c] <= 0 or new_rates[c] <= 0 or abs(new_rates[c] / old_rates[c] - 1) > MAX_FX_MOVE:
            out.append(f"exchange rates: {c} {old_rates[c]} → {new_rates[c]}")
    return out


def check(before_dir: Path, after_dir: Path, registry: Registry) -> list[str]:
    """Every reason the refresh in `after_dir` needs a person to look at it; empty when it's safe."""
    reasons: list[str] = []
    before_files, after_files = _files(before_dir), _files(after_dir)
    if added := after_files - before_files:
        reasons.append("files added: " + ", ".join(sorted(added)))
    if removed := before_files - after_files:
        reasons.append("files removed: " + ", ".join(sorted(removed)))
    for rel in sorted(before_files & after_files):
        old_text, new_text = (before_dir / rel).read_bytes(), (after_dir / rel).read_bytes()
        if old_text == new_text:
            continue
        if not rel.endswith(".json"):
            reasons.append(f"{rel}: changed, and the scraper never edits this file")
            continue
        old, new = json.loads(old_text), json.loads(new_text)
        if rel.startswith("universities/"):
            reasons += _check_university(old.get("id", rel), old, new, registry)
        elif rel.startswith("countries/"):
            reasons += _check_country(old.get("name", rel), old, new)
        elif rel == "fx-fallback.json":
            reasons += _check_fx(old, new)
        else:
            reasons.append(f"{rel}: changed, and the scraper never edits this file")
    return reasons


def report(reasons: list[str]) -> str:
    if not reasons:
        return "### ✅ Safety checks passed\n\nEvery change is within the limits for publishing without review.\n"
    lines = ["### ⛔ Held for review", "", "These changes are outside the limits for publishing without review:", ""]
    return "\n".join(lines + [f"- {r}" for r in reasons]) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--before", type=Path, required=True, help="copy of data/ taken before the scrape")
    ap.add_argument("--after", type=Path, default=DATA_DIR, help="data/ after the scrape (default: data/)")
    ap.add_argument("--out", type=Path, help="also write the Markdown report here")
    args = ap.parse_args(argv)

    reasons = check(args.before, args.after, load_registry())
    text = report(reasons)
    print(text)
    if args.out:
        args.out.write_text(text)
    return 1 if reasons else 0


if __name__ == "__main__":
    sys.exit(main())
