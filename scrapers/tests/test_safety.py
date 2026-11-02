"""The checks that let a monthly refresh go live without review."""

import copy
import json
import shutil
from pathlib import Path

import pytest

from scrapers.guard import check
from scrapers.models import Registry
from scrapers.run import (
    DATA_DIR,
    extract_amount,
    load_registry,
    load_universities,
    manual_only_urls,
    run,
    save_university,
    target_programmes,
)
from scrapers.tests.test_run import TODAY, UNI, fixture_fetch

HAND_URL = "https://example.edu/hand-entered"


def _programme(name, **extra):
    p = copy.deepcopy(UNI["programmes"][0])
    p.update(name=name, **extra)
    return p


def _registry(*sources):
    base = {
        "university": "testu",
        "country": "sg",
        "url": "https://example.edu/fees",
        "year_pattern": r"AY\s*(\d{4})/\d{2}",
        "targets": [{"level": "bachelor", "field": "computing", "tier": "international",
                     "pattern": r"Computing S\$ ?[\d,]+ S\$ ?[\d,]+ S\$ ?([\d,]+)"}],
    }
    return Registry.model_validate({"sources": [base | s for s in sources] or [base]})


@pytest.fixture
def data_dir(tmp_path):
    uni = copy.deepcopy(UNI)
    uni["partners"] = [{"id": "nie", "name": "NIE", "country": "Singapore"}]
    uni["programmes"] += [
        _programme("Partner Computing", partner="nie"),
        _programme("Hand-entered Computing", sourceUrl=HAND_URL),
    ]
    (tmp_path / "universities" / "sg").mkdir(parents=True)
    (tmp_path / "universities" / "sg" / "testu.json").write_text(json.dumps(uni, indent=2) + "\n")
    shutil.copytree(DATA_DIR / "countries", tmp_path / "countries")
    return tmp_path


def _fees(data_dir):
    uni = json.loads((data_dir / "universities" / "sg" / "testu.json").read_text())
    return {p["name"]: p["fees"]["international"]["annualTuition"] for p in uni["programmes"]}


MANUAL = {"url": HAND_URL, "manual": True, "targets": []}


def test_broad_rule_skips_partner_and_hand_entered_programmes(data_dir):
    run(_registry({}, MANUAL), data_dir, TODAY, fetch=fixture_fetch, with_fx=False)
    assert _fees(data_dir) == {
        "Bachelor of Computing": 31500,
        "Partner Computing": 30000,
        "Hand-entered Computing": 30000,
    }


def test_named_rule_reaches_partner_and_also_covers_reaches_manual_page(data_dir):
    reg = _registry(
        {"also_covers": [HAND_URL]},
        {"targets": [{"programme": "Partner", "pattern": r"Computing S\$ ?[\d,]+ S\$ ?[\d,]+ S\$ ?([\d,]+)"}]},
        MANUAL,
    )
    run(reg, data_dir, TODAY, fetch=fixture_fetch, with_fx=False)
    assert set(_fees(data_dir).values()) == {31500}


def test_no_rule_reaches_a_hand_entered_programme():
    """In the real registry, no scraped rule can change a partner's programme it doesn't name, or a
    programme whose source is a manual page (unless its source lists that page in also_covers)."""
    reg = load_registry()
    hand_entered = manual_only_urls(reg)
    unis = load_universities(DATA_DIR)
    reached: dict[str, set[str]] = {}
    for s in reg.sources:
        if s.manual:
            continue
        covers = {str(u) for u in s.also_covers}
        for t in s.targets:
            if t.key.startswith("living."):
                continue
            for p in target_programmes(s, t, unis[s.university][1], hand_entered.get(s.university, set())):
                assert not p.partner or t.programme, f"{s.university}: {p.name} reached by an unnamed rule"
                url = str(p.sourceUrl)
                assert url not in hand_entered.get(s.university, set()) or url in covers, (
                    f"{s.university}: {p.name} cites a manual page but {s.url} can change it"
                )
                if t.key == "annualTuition":
                    assert url == str(s.url) or url in covers, f"{s.university}: {p.name} tuition from {s.url}"
                reached.setdefault(s.university, set()).add((p.name, str(s.url)))
    # The programmes the 1 November 2026 run overwrote by mistake are only reached from their own page.
    unis_ntu = {p.name: str(p.sourceUrl) for p in unis["ntu"][1].programmes}
    for name, url in reached["ntu"]:
        if name.startswith("Master of Arts") or name == "MSc in Accountancy":
            assert url == unis_ntu[name], name
    assert not any(name == "Master of Professional Accounting" for name, _ in reached["vuw"])
    ntu = {name for name, _ in reached["ntu"]}
    # Fields whose only programme was hand-entered still have their scraped one.
    assert {"Nanyang MBA (full-time)", "MSc in Analytics (School of Physical and Mathematical Sciences)"} <= ntu


def test_also_covers_only_lists_manual_pages():
    reg = load_registry()
    hand_entered = manual_only_urls(reg)
    for s in reg.sources:
        for u in s.also_covers:
            assert str(u) in hand_entered.get(s.university, set()), f"{s.university}: {u} is not a manual page"


def test_galway_medicine_ignores_the_levy_only_cell():
    reg = load_registry()
    pattern = next(t.pattern for s in reg.sources if s.university == "galway" for t in s.targets if t.field == "medicine")
    levy_only = ("GY501 Bachelor of Medicine (MB) of Surgery (BCh) and of Obstetrics (BAO) €7,073 p.a. (including levy) "
                 "2027/28 €6,723 p.a. 2027/28 €2,350 p.a. 2027/28 €350 p.a. 2027/28 €350 p.a. 2027/28")
    assert extract_amount(levy_only, pattern) is None
    priced = levy_only.replace("€350 p.a. 2027/28 €350", "€350 p.a. 2027/28 €57,750")
    assert extract_amount(priced, pattern) == 57750


def test_saving_leaves_unchanged_files_as_they_were(tmp_path):
    """Saving keeps key order, link spelling and fields the scraper doesn't know, so a refresh's
    diff only shows real changes."""
    for uni_id, (path, uni) in load_universities(DATA_DIR).items():
        out = tmp_path / path.name
        shutil.copy(path, out)
        save_university(out, uni)
        before, after = json.loads(path.read_text()), json.loads(out.read_text())
        assert before == after, uni_id
        assert json.dumps(before) == json.dumps(after), f"{uni_id}: key order changed"


# ---------------------------------------------------------------------------
# guard.check
# ---------------------------------------------------------------------------


@pytest.fixture
def before_after(data_dir, tmp_path_factory):
    before = tmp_path_factory.mktemp("before") / "data"
    shutil.copytree(data_dir, before)
    return before, data_dir


def _edit(data_dir, fn):
    path = data_dir / "universities" / "sg" / "testu.json"
    uni = json.loads(path.read_text())
    fn(uni)
    path.write_text(json.dumps(uni, indent=2) + "\n")


def test_guard_passes_a_normal_refresh(before_after):
    before, after = before_after
    run(_registry({}, MANUAL), after, TODAY, fetch=fixture_fetch, with_fx=False)
    assert check(before, after, _registry({}, MANUAL)) == []


def test_guard_holds_a_large_change(before_after):
    before, after = before_after
    _edit(after, lambda u: u["programmes"][0]["fees"]["international"].update(annualTuition=350))
    assert any("-99%" in r for r in check(before, after, _registry({}, MANUAL)))


def test_guard_holds_a_fee_falling_to_zero(before_after):
    before, after = before_after
    _edit(after, lambda u: u["programmes"][0]["fees"]["international"].update(annualTuition=0))
    assert check(before, after, _registry({}, MANUAL))


def test_guard_holds_any_change_to_a_hand_entered_fee(before_after):
    before, after = before_after
    _edit(after, lambda u: u["programmes"][2]["fees"]["international"].update(annualTuition=30100))
    assert any("entered by hand" in r for r in check(before, after, _registry({}, MANUAL)))


def test_guard_holds_changes_the_scraper_never_makes(before_after):
    before, after = before_after
    _edit(after, lambda u: u["programmes"][0].update(summary="Changed"))
    _edit(after, lambda u: u.update(city="Elsewhere"))
    (after / "settings.json").write_text("{}")
    reasons = check(before, after, _registry({}, MANUAL))
    assert any("summary" in r for r in reasons)
    assert any("city" in r for r in reasons)
    assert any("settings.json" in r for r in reasons)


def test_guard_holds_a_fee_year_jump(before_after):
    before, after = before_after
    _edit(after, lambda u: u["programmes"][0].update(feeYear=2028))
    assert any("fee year" in r for r in check(before, after, _registry({}, MANUAL)))


def test_guard_holds_a_subsidised_fee_becoming_the_full_fee(before_after):
    before, after = before_after
    _edit(after, lambda u: u["programmes"][0]["fees"]["citizen"].update(annualTuition=30000))
    assert any("citizen tuition was below" in r for r in check(before, after, _registry({}, MANUAL)))


def test_tuition_only_comes_from_the_programmes_own_page(data_dir):
    """A field-wide rule on one page doesn't set the tuition of a programme citing another page."""
    _edit(data_dir, lambda u: u["programmes"].append(_programme("Other Computing", sourceUrl="https://example.edu/other")))
    run(_registry({}), data_dir, TODAY, fetch=fixture_fetch, with_fx=False)
    assert _fees(data_dir)["Other Computing"] == 30000
    assert _fees(data_dir)["Bachelor of Computing"] == 31500


def test_one_rule_never_covers_programmes_priced_differently():
    """A rule that reaches several programmes sets them all to one figure, so they must all have the
    same fee today. Otherwise it would overwrite one of them with another programme's fee (as the
    Business Analytics rows did to accountancy master's priced differently on the same page)."""
    reg = load_registry()
    hand_entered = manual_only_urls(reg)
    unis = load_universities(DATA_DIR)
    for s in reg.sources:
        if s.manual:
            continue
        for t in s.targets:
            if t.key.startswith("living."):
                continue
            values: dict[float, list[str]] = {}
            for p in target_programmes(s, t, unis[s.university][1], hand_entered.get(s.university, set())):
                if fees := getattr(p.fees, t.tier):
                    values.setdefault(round(getattr(fees, t.key), 2), []).append(p.name)
            assert len(values) <= 1, f"{s.university} {t.tier} {t.key} from {s.url}: {values}"
