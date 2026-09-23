import json
import shutil
from datetime import date
from pathlib import Path

import pytest

from scrapers.fetch import html_to_text
from scrapers.models import Registry
from scrapers.run import extract_amount, extract_year, run, summarise

FIXTURES = Path(__file__).parent / "fixtures"
TODAY = date(2026, 9, 23)

UNI = {
    "id": "testu",
    "name": "Test University",
    "country": "sg",
    "city": "Singapore",
    "currency": "SGD",
    "programmes": [
        {
            "level": "bachelor",
            "field": "computing",
            "name": "Bachelor of Computing",
            "durationYears": 4,
            "feeYear": 2025,
            "fees": {
                "citizen": {"annualTuition": 8500, "annualCompulsoryFees": 500, "oneOffFees": 0},
                "pr": {"annualTuition": 12000, "annualCompulsoryFees": 500, "oneOffFees": 0},
                "international": {"annualTuition": 30000, "annualCompulsoryFees": 500, "oneOffFees": 0},
            },
            "sourceUrl": "https://example.edu/fees",
            "lastVerified": "2025-09-01",
            "sourceType": "official",
            "cohortLocked": True,
        }
    ],
}


def registry(**overrides):
    source = {
        "university": "testu",
        "country": "sg",
        "url": "https://example.edu/fees",
        "year_pattern": r"AY\s*(\d{4})/\d{2}",
        "targets": [
            {"level": "bachelor", "field": "computing", "tier": "citizen", "pattern": r"Computing S\$ ?([\d,]+)"},
            {"level": "bachelor", "field": "computing", "tier": "pr", "pattern": r"Computing S\$ ?[\d,]+ S\$ ?([\d,]+)"},
            {"level": "bachelor", "field": "computing", "tier": "international",
             "pattern": r"Computing S\$ ?[\d,]+ S\$ ?[\d,]+ S\$ ?([\d,]+)"},
            {"tier": "citizen", "key": "annualCompulsoryFees", "pattern": r"Student services fee: S\$ ?([\d,]+)"},
        ],
    }
    source.update(overrides)
    return Registry.model_validate({"sources": [source]})


@pytest.fixture
def data_dir(tmp_path):
    (tmp_path / "universities" / "sg").mkdir(parents=True)
    (tmp_path / "universities" / "sg" / "testu.json").write_text(json.dumps(UNI))
    shutil.copytree(Path(__file__).parents[2] / "data" / "countries", tmp_path / "countries")
    return tmp_path


def fixture_fetch(url, parser):
    return html_to_text((FIXTURES / "sample_fees.html").read_text())


def read_uni(data_dir):
    return json.loads((data_dir / "universities" / "sg" / "testu.json").read_text())


def test_html_to_text_drops_scripts_and_nbsp():
    text = fixture_fetch("", "html")
    assert "99,999" not in text
    assert "S$ 9,000" in text


def test_extract_helpers():
    assert extract_amount("Fee: £39,750 per year", r"Fee: £([\d,]+)") == 39750
    assert extract_amount("nothing here", r"Fee: £([\d,]+)") is None
    assert extract_year("AY2025/26 and AY2026/27", r"AY(\d{4})/\d{2}") == 2026
    assert extract_amount("Tuition $7,000 Supplement $15,000", r"Tuition \$([\d,]+) Supplement \$([\d,]+)") == 22000


def test_updates_fees_and_rolls_year_into_history(data_dir):
    report = run(registry(), data_dir, TODAY, fetch=fixture_fetch, with_fx=False)
    p = read_uni(data_dir)["programmes"][0]

    assert p["feeYear"] == 2026
    assert p["fees"]["citizen"] == {"annualTuition": 9000, "annualCompulsoryFees": 520, "oneOffFees": 0}
    assert p["fees"]["pr"]["annualTuition"] == 12600
    assert p["fees"]["international"]["annualTuition"] == 31500
    assert p["lastVerified"] == "2026-09-23"
    assert {
        "feeYear": 2025,
        "tier": "international",
        "annualTuition": 30000,
        "annualCompulsoryFees": 500,
        "oneOffFees": 0,
        "sourceUrl": "https://example.edu/fees",
    } in p["feeHistory"]
    assert len(report.changes) == 4
    assert not report.problems


def test_updates_monthly_living_costs(data_dir):
    uni = json.loads((data_dir / "universities" / "sg" / "testu.json").read_text())
    uni["livingCosts"] = {
        "year": 2026, "months": 12,
        "monthly": {"housing": 1000, "food": 400, "transport": 100, "personal": 200},
        "sourceUrl": "https://example.edu/living", "lastVerified": "2025-01-01",
    }
    (data_dir / "universities" / "sg" / "testu.json").write_text(json.dumps(uni))
    reg = registry(targets=[{"key": "living.transport", "pattern": r"Student services fee: S\$ ?([\d,]+)",
                             "multiplier": 0.5}])
    report = run(reg, data_dir, TODAY, fetch=fixture_fetch, with_fx=False)
    living = read_uni(data_dir)["livingCosts"]
    assert living["monthly"]["transport"] == 260
    assert living["lastVerified"] == "2026-09-23"
    assert report.changes[0].what == "monthly transport"


def test_missing_pattern_keeps_old_value(data_dir):
    reg = registry(targets=[{"tier": "citizen", "pattern": r"Law S\$ ?([\d,]+)"}])
    report = run(reg, data_dir, TODAY, fetch=fixture_fetch, with_fx=False)
    assert read_uni(data_dir)["programmes"][0]["fees"]["citizen"]["annualTuition"] == 8500
    assert any("pattern not found" in p for p in report.problems)


def test_fetch_failure_is_reported(data_dir):
    def broken(url, parser):
        raise ConnectionError("boom")

    report = run(registry(), data_dir, TODAY, fetch=broken, with_fx=False)
    assert any("could not fetch" in p for p in report.problems)
    assert read_uni(data_dir)["programmes"][0]["feeYear"] == 2025


def test_large_changes_are_flagged(data_dir):
    reg = registry(targets=[{"tier": "citizen", "pattern": r"Computing S\$ ?[\d,]+ S\$ ?[\d,]+ S\$ ?([\d,]+)"}])
    report = run(reg, data_dir, TODAY, fetch=fixture_fetch, with_fx=False)
    assert report.changes[0].flagged
    assert "Large changes" in summarise(report)


def test_dry_run_writes_nothing(data_dir):
    before = read_uni(data_dir)
    run(registry(), data_dir, TODAY, fetch=fixture_fetch, dry_run=True, with_fx=False)
    assert read_uni(data_dir) == before


def test_stale_entries_listed_for_manual_check(data_dir):
    report = run(registry(manual=True), data_dir, date(2026, 12, 1), fetch=fixture_fetch, with_fx=False)
    assert report.manual and "Test University" in report.manual[0]


def test_every_fee_source_is_registered():
    """Each programme's current source page is either scraped or listed for a manual check,
    so no university's fees silently stop being checked."""
    from scrapers.run import DATA_DIR, REGISTRY_PATH, load_universities
    import yaml

    reg = Registry.model_validate(yaml.safe_load(REGISTRY_PATH.read_text()))
    registered = {(s.university, str(s.url)) for s in reg.sources}
    for uni_id, (_, uni) in load_universities(DATA_DIR).items():
        for p in uni.programmes:
            url = str(p.sourceUrl)
            assert (uni_id, url) in registered, f"{uni_id}: {p.name} source {url} not in registry"
        if uni.livingCosts:
            url = str(uni.livingCosts.sourceUrl)
            assert (uni_id, url) in registered, f"{uni_id}: living-cost source {url} not in registry"


def test_committed_registry_and_data_are_valid():
    from scrapers.run import DATA_DIR, REGISTRY_PATH, load_universities
    import yaml

    reg = Registry.model_validate(yaml.safe_load(REGISTRY_PATH.read_text()))
    unis = load_universities(DATA_DIR)
    for s in reg.sources:
        assert s.university in unis, s.university
        assert unis[s.university][1].country == s.country
