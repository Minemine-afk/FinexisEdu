"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { calculate, hasRateFor, isStale, toSgd, type CalcResult, type Residency } from "@/lib/calc";
import type { FxResult } from "@/lib/fx";
import {
  FIELD_LABELS,
  LEVEL_LABELS,
  RESIDENCY_LABELS,
  formatCompactSgd,
  formatMoney,
} from "@/lib/format";
import {
  FIELDS,
  LEVELS,
  LIVING_CATEGORIES,
  TIERS,
  type Country,
  type Field,
  type Level,
  type LivingCategory,
  type LivingCosts,
  type Programme,
  type University,
} from "@/lib/schema";
import {
  LIFESTYLE_MULTIPLIER,
  livingCostsByYear,
  monthlyTotal,
  type Lifestyle,
  type LivingYear,
  type MonthlyLiving,
} from "@/lib/living";
import FeeChart, { SEGMENTS, type CompareCategory } from "./FeeChart";
import UniversityName from "./UniversityName";
import InfoTip from "./InfoTip";
import type { GlossaryTerm } from "@/lib/glossary";

interface Props {
  universities: University[];
  countries: Country[];
  fx: FxResult;
  today: string;
}

interface Option {
  key: string;
  university: University;
  programme: Programme;
}

export interface LivingResult {
  estimate: LivingCosts;
  monthly: MonthlyLiving;
  customised: boolean;
  increase: number;
  years: LivingYear[];
  totalLocal: number;
  totalSgd: number;
}

export interface Selection extends Option {
  result: CalcResult;
  feeIncrease: number;
  fxRate: number;
  /** University fees only. */
  totalSgd: number;
  /** Fees plus living costs when they are included. */
  grandTotalSgd: number;
  yearsSgd: { tuition: number; compulsoryFees: number; oneOffFees: number; living: number };
  /** Living costs, when included and the university has an estimate. */
  living: LivingResult | null;
  /** Why living costs are missing when they were asked for. */
  livingNote: string | null;
}

// Up to three universities compare as bars side by side.
const MAX_SELECTED = 3;
const FOCUS = " outline-none focus-visible:ring-2 focus-visible:ring-accent";
// Start years offered. Earlier years use published fee history only.
const START_YEARS = [2024, 2025, 2026, 2027, 2028];
// Singapore first, then destinations in order of how many Singaporeans study there (UNESCO UIS).
const COUNTRY_ORDER = ["sg", "au", "uk", "us", "de", "ca", "nz", "ch", "jp", "ie"];
const LIFESTYLE_LABELS: Record<Lifestyle, string> = { frugal: "Frugal", moderate: "Moderate", comfortable: "Comfortable" };
export const LIVING_LABELS: Record<LivingCategory, string> = {
  housing: "Housing",
  food: "Food",
  transport: "Transport",
  personal: "Personal & books",
};

function optionsFor(universities: University[], level: Level): Option[] {
  return universities.flatMap((university) =>
    university.programmes
      .map((programme, i) => ({ key: `${university.id}:${i}`, university, programme }))
      .filter((o) => o.programme.level === level),
  );
}

/**
 * Why a programme can't be priced for this student, or null if it can: Singapore
 * universities need the student's own Citizen/PR rate, and past start years need
 * published fees for every year charged.
 */
function unavailableReason(o: Option, residency: Residency, startYear: number): string | null {
  const { missingYears } = calculate({
    programme: o.programme,
    currency: o.university.currency,
    residency,
    startYear,
    feeIncrease: 0,
    strictTier: o.university.country === "sg",
  });
  if (missingYears.length === 0) return null;
  // A Singapore programme with no rate for this tier in any year is missing the tier, not a year.
  const tierEverPublished = o.programme.feeHistory.some((h) => h.tier === residency);
  if (!hasRateFor(o.university.country, o.programme, residency) && !tierEverPublished) {
    return `No ${RESIDENCY_LABELS[residency]} rate on file yet`;
  }
  return `No published ${missingYears.join(", ")} fee on file`;
}

/**
 * A sensible programme for a new slot: priced for this student, at a university not
 * already chosen, in a country not already chosen where possible, in the same field
 * as the slot before it (computing by default).
 */
function defaultPick(
  options: Option[],
  isAvailable: (o: Option) => boolean,
  taken: Option[],
  preferField: Field = "computing",
): Option | undefined {
  const takenKeys = new Set(taken.map((o) => o.key));
  const takenUnis = new Set(taken.map((o) => o.university.id));
  const takenCountries = new Set<string>(taken.map((o) => o.university.country));
  const usable = options.filter((o) => isAvailable(o) && !takenKeys.has(o.key));
  const byField = (list: Option[]) =>
    list.find((o) => o.programme.field === preferField) ?? list.find((o) => o.programme.field === "computing") ?? list[0];
  for (const skipTakenCountries of [true, false]) {
    for (const country of COUNTRY_ORDER) {
      if (skipTakenCountries && takenCountries.has(country)) continue;
      const o = byField(usable.filter((x) => x.university.country === country && !takenUnis.has(x.university.id)));
      if (o) return o;
    }
  }
  return usable[0];
}

/** When the level changes, keep each slot's university and field where the new level offers them. */
function reselect(
  prevKeys: string[],
  prevOptions: Option[],
  nextOptions: Option[],
  isAvailable: (o: Option) => boolean,
): string[] {
  const next: string[] = [];
  for (const key of prevKeys) {
    const prev = prevOptions.find((o) => o.key === key);
    if (!prev) continue;
    const same = nextOptions.filter((o) => o.university.id === prev.university.id && !next.includes(o.key));
    const o =
      same.find((x) => x.programme.field === prev.programme.field && isAvailable(x)) ?? same.find(isAvailable) ?? same[0];
    if (o) next.push(o.key);
  }
  if (next.length === 0) {
    const o = defaultPick(nextOptions, isAvailable, []);
    if (o) next.push(o.key);
  }
  return next;
}

export default function Calculator({ universities, countries, fx, today }: Props) {
  const thisYear = Number(today.slice(0, 4));
  const countryByCode = useMemo(() => new Map(countries.map((c) => [c.code, c])), [countries]);

  const [level, setLevel] = useState<Level>("bachelor");
  const [residency, setResidency] = useState<Residency>("citizen");
  const [startYear, setStartYear] = useState(
    Math.min(Math.max(thisYear + 1, START_YEARS[0]), START_YEARS[START_YEARS.length - 1]),
  );
  const [customIncrease, setCustomIncrease] = useState<number | null>(null);
  const [includeLiving, setIncludeLiving] = useState(false);
  const [lifestyle, setLifestyle] = useState<Lifestyle>("moderate");
  // The student's own monthly living budget, per university.
  const [customLiving, setCustomLiving] = useState<Record<string, MonthlyLiving>>({});
  // Which part of the cost the bars compare.
  const [compare, setCompare] = useState<CompareCategory>("total");
  const options = useMemo(() => optionsFor(universities, level), [universities, level]);
  const available = (o: Option) => unavailableReason(o, residency, startYear) === null;
  // One university to start with; "Compare another university" adds up to two more.
  const [selected, setSelected] = useState<string[]>(() => {
    const o = defaultPick(options, (x) => unavailableReason(x, residency, startYear) === null, []);
    return o ? [o.key] : [];
  });
  const chosen = selected.map((k) => options.find((o) => o.key === k)).filter((o): o is Option => !!o);

  function changeLevel(nextLevel: Level) {
    setLevel(nextLevel);
    setSelected((prev) => reselect(prev, options, optionsFor(universities, nextLevel), available));
  }

  /** Puts a programme in comparison slot `i`. */
  function setSlot(i: number, key: string) {
    setSelected((prev) => {
      const next = prev.slice(0, MAX_SELECTED);
      next[i] = key;
      return next;
    });
  }

  function addSlot() {
    setSelected((prev) => {
      if (prev.length >= MAX_SELECTED) return prev;
      const taken = prev.map((k) => options.find((o) => o.key === k)).filter((o): o is Option => !!o);
      const o = defaultPick(options, available, taken, taken[taken.length - 1]?.programme.field);
      return o ? [...prev, o.key] : prev;
    });
  }

  function removeSlot(i: number) {
    setSelected((prev) => prev.filter((_, j) => j !== i));
  }

  const selections: Selection[] = options
    .filter((o) => selected.includes(o.key) && available(o))
    .map((o) => {
      const country = countryByCode.get(o.university.country);
      const tier = o.university.country === "sg" ? residency : "international";
      const feeIncrease = customIncrease ?? country?.feeIncreaseByTier?.[tier] ?? country?.defaultFeeIncrease ?? 0.03;
      const result = calculate({
        programme: o.programme,
        currency: o.university.currency,
        residency,
        startYear,
        feeIncrease,
        strictTier: o.university.country === "sg",
      });
      const sgd = (n: number) => toSgd(n, o.university.currency, fx);
      const sum = (pick: (y: CalcResult["years"][number]) => number) =>
        sgd(result.years.reduce((s, y) => s + pick(y), 0));

      let living: LivingResult | null = null;
      let livingNote: string | null = null;
      const estimate = o.university.livingCosts;
      if (includeLiving) {
        if (o.university.country === "sg") livingNote = "Living costs are not included for Singapore universities.";
        else if (!estimate) livingNote = "No living-cost estimate from this university yet.";
        else {
          const custom = customLiving[o.university.id];
          const increase = country?.livingCostIncrease ?? 0.03;
          const years = livingCostsByYear({ living: estimate, years: result.years, lifestyle, increase, custom });
          const totalLocal = years.reduce((t, y) => t + y.amount, 0);
          const scale = custom ? 1 : LIFESTYLE_MULTIPLIER[lifestyle];
          const monthly =
            custom ??
            (Object.fromEntries(LIVING_CATEGORIES.map((c) => [c, estimate.monthly[c] * scale])) as MonthlyLiving);
          living = { estimate, monthly, customised: !!custom, increase, years, totalLocal, totalSgd: sgd(totalLocal) };
        }
      }

      const totalSgd = sgd(result.totalLocal);
      return {
        ...o,
        result,
        feeIncrease,
        fxRate: o.university.currency === "SGD" ? 1 : fx.rates[o.university.currency],
        totalSgd,
        grandTotalSgd: totalSgd + (living?.totalSgd ?? 0),
        yearsSgd: {
          tuition: sum((y) => y.tuition),
          compulsoryFees: sum((y) => y.compulsoryFees),
          oneOffFees: sum((y) => y.oneOffFees),
          living: living?.totalSgd ?? 0,
        },
        living,
        livingNote,
      };
    })
    .sort((a, b) => a.grandTotalSgd - b.grandTotalSgd);

  // Only cost parts that are present can be compared on their own.
  const categories: [CompareCategory, string][] = [
    ["total", "Total"],
    ...SEGMENTS.filter((seg) => selections.some((s) => s.yearsSgd[seg.key] > 0)).map(
      (seg) => [seg.key, seg.key === "compulsoryFees" ? "Other fees" : seg.key === "oneOffFees" ? "One-off" : seg.label] as [CompareCategory, string],
    ),
  ];
  const category = categories.some(([c]) => c === compare) ? compare : "total";

  // On phones the options panel comes first, so a bottom bar links to the results.
  const resultsRef = useRef<HTMLElement>(null);
  const [resultsInView, setResultsInView] = useState(false);
  useEffect(() => {
    const el = resultsRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setResultsInView(entry.isIntersecting), { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const grouped = COUNTRY_ORDER.map((code) => ({
    country: countryByCode.get(code as Country["code"]),
    options: options.filter((o) => o.university.country === code),
  })).filter((g) => g.options.length > 0);

  const select = `mt-1 w-full rounded-md border border-border bg-surface px-3 py-2${FOCUS}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <aside className="space-y-5 rounded-xl border border-border bg-sidebar p-5 lg:self-start">
        <Segmented label="Level" value={level} options={LEVELS.map((l) => [l, LEVEL_LABELS[l]])} onChange={changeLevel} />

        <label className="block">
          <span className="text-sm font-medium">
            <InfoTip term="residency">Residency</InfoTip>
          </span>
          <select className={select} value={residency} onChange={(e) => setResidency(e.target.value as Residency)}>
            {(Object.keys(RESIDENCY_LABELS) as Residency[]).map((r) => (
              <option key={r} value={r}>
                {RESIDENCY_LABELS[r]}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted">Changes Singapore fees only; abroad you pay international rates.</span>
        </label>

        <label className="block">
          <span className="text-sm font-medium">
            <InfoTip term="startYear">Start year</InfoTip>
          </span>
          <select className={select} value={startYear} onChange={(e) => setStartYear(Number(e.target.value))}>
            {START_YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {startYear <= thisYear && (
            <span className="mt-1 block text-xs text-muted">Past intakes use published fees only.</span>
          )}
        </label>

        <fieldset>
          <legend className="text-sm font-medium">
            <InfoTip term="feeIncrease">Yearly fee increase</InfoTip>
          </legend>
          <div className="mt-1 flex min-h-10 items-center gap-2 text-sm">
            <input
              id="custom-increase"
              type="checkbox"
              checked={customIncrease !== null}
              onChange={(e) => setCustomIncrease(e.target.checked ? 0.03 : null)}
            />
            <label htmlFor="custom-increase">My own rate</label>
            {customIncrease !== null && (
              <span className="ml-auto flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={20}
                  step={0.5}
                  aria-label="Yearly fee increase in percent"
                  className={`w-16 rounded-md border border-border bg-surface px-2 py-1 text-right${FOCUS}`}
                  value={+(customIncrease * 100).toFixed(1)}
                  onChange={(e) => setCustomIncrease(Math.max(0, Number(e.target.value)) / 100)}
                />
                %
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">
            {customIncrease === null ? "Each country's typical increase" : "Applied to every university"}, for years
            after the published fee year.
          </p>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium">
            <InfoTip term="livingCosts">Living costs</InfoTip>
          </legend>
          <label className="mt-1 flex min-h-10 cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={includeLiving} onChange={(e) => setIncludeLiving(e.target.checked)} />
            Include living costs
          </label>
          {includeLiving ? (
            <Segmented
              label="Lifestyle"
              value={lifestyle}
              options={(Object.keys(LIFESTYLE_LABELS) as Lifestyle[]).map((l) => [l, LIFESTYLE_LABELS[l]])}
              onChange={setLifestyle}
              small
              tip="lifestyle"
            />
          ) : (
            <p className="mt-1 text-xs text-muted">Each university&apos;s own estimate; not for Singapore universities.</p>
          )}
        </fieldset>

        <div className="space-y-3">
          <p className="text-sm font-medium">
            {selected.length > 1 ? "Universities" : "University"}{" "}
            <span className="font-normal text-muted">(compare up to {MAX_SELECTED})</span>
          </p>
          {grouped.length === 0 && <p className="text-sm text-muted">No fee data for this level yet.</p>}
          {chosen.map((o, i) => (
            <UniversityPicker
              key={i}
              index={i}
              current={o}
              others={chosen.filter((_, j) => j !== i)}
              grouped={grouped}
              reasonFor={(x) => unavailableReason(x, residency, startYear)}
              onChange={(key) => setSlot(i, key)}
              onRemove={i > 0 ? () => removeSlot(i) : undefined}
            />
          ))}
          {grouped.length > 0 && selected.length < MAX_SELECTED && (
            <button
              type="button"
              onClick={addSlot}
              className={`flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-accent px-3 py-2.5 text-sm font-medium text-accent hover:bg-chip${FOCUS}`}
            >
              <span aria-hidden>+</span> Compare {selected.length === 0 ? "a" : "another"} university
            </button>
          )}
        </div>
      </aside>

      <section id="results" ref={resultsRef} className="min-w-0 scroll-mt-4 space-y-6">
        {selections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted">
            Pick a university to see its total {includeLiving ? "cost" : "fees"}.
          </div>
        ) : (
          <>
            <StatTiles selections={selections} countryByCode={countryByCode} />

            <div className="space-y-3">
              {categories.length > 1 && (
                <div role="radiogroup" aria-label="Compare" className="flex flex-wrap items-center gap-1.5 text-sm">
                  <span className="mr-1 text-muted">Compare:</span>
                  {categories.map(([c, text]) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={category === c}
                      onClick={() => setCompare(c)}
                      className={`rounded-full border px-3 py-1.5 sm:py-1${FOCUS} ${
                        category === c
                          ? "border-accent-fill bg-accent-fill font-medium text-on-accent"
                          : "border-border bg-surface text-muted hover:bg-chip"
                      }`}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              )}
              <FeeChart selections={selections} category={category} includeLiving={includeLiving} />
            </div>

            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Details (in SGD)</h2>
              <div
                className={`mt-3 grid gap-8 md:gap-0 md:divide-x md:divide-border ${selections.length === 3 ? "md:grid-cols-3" : selections.length === 2 ? "md:grid-cols-2" : ""}`}
              >
                {selections.map((s, i) => (
                  <ResultDetail
                    key={s.key}
                    s={s}
                    today={today}
                    country={countryByCode.get(s.university.country)}
                    lifestyle={lifestyle}
                    residency={residency}
                    className={
                      selections.length === 1 ? "" : i === 0 ? "md:pr-4" : i === selections.length - 1 ? "md:pl-4" : "md:px-4"
                    }
                    onCustomLiving={(m) =>
                      setCustomLiving((prev) => {
                        const next = { ...prev };
                        if (m) next[s.university.id] = m;
                        else delete next[s.university.id];
                        return next;
                      })
                    }
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      {selections.length > 0 && !resultsInView && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden">
          <div className="safe-x mx-auto flex max-w-6xl items-center justify-between gap-3 py-2.5">
            <p className="min-w-0 text-sm">
              <span className="font-medium">
                {selections.length} {selections.length === 1 ? "university" : "universities"}
              </span>
              <span className="block truncate text-xs text-muted">
                From {formatCompactSgd(selections[0].grandTotalSgd)} {includeLiving ? "incl. living costs" : "in fees"}
              </span>
            </p>
            <a
              href="#results"
              className={`shrink-0 rounded-md bg-accent-fill px-4 py-2.5 text-sm font-medium text-on-accent${FOCUS}`}
            >
              View results ↓
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

interface CountryGroup {
  country?: Country;
  options: Option[];
}

/** One comparison slot: country, university, field of study and (if several) programme. */
function UniversityPicker({
  index,
  current,
  others,
  grouped,
  reasonFor,
  onChange,
  onRemove,
}: {
  index: number;
  current: Option;
  /** What the other slots hold, so the same programme isn't picked twice. */
  others: Option[];
  grouped: CountryGroup[];
  reasonFor: (o: Option) => string | null;
  onChange: (key: string) => void;
  onRemove?: () => void;
}) {
  const select = `mt-1 w-full rounded-md border border-border bg-surface px-3 py-2${FOCUS}`;
  const group = grouped.find((g) => g.country?.code === current.university.country);
  const inCountry = group?.options ?? [];
  // One entry per university in the chosen country.
  const universities = inCountry.filter((o, i, arr) => arr.findIndex((x) => x.university.id === o.university.id) === i);
  const atUniversity = inCountry.filter((o) => o.university.id === current.university.id);
  const fields = FIELDS.filter((f) => atUniversity.some((o) => o.programme.field === f));
  const programmes = atUniversity.filter((o) => o.programme.field === current.programme.field);
  const reason = reasonFor(current);

  // Prefer a programme that can be priced for this student, in the same field as now; avoid duplicating another slot.
  const taken = new Set(others.map((o) => o.key));
  const pick = (candidates: Option[], field: Field = current.programme.field) => {
    const ok = candidates.filter((o) => reasonFor(o) === null && !taken.has(o.key));
    return (
      ok.find((o) => o.programme.field === field) ??
      ok[0] ??
      candidates.find((o) => o.programme.field === field) ??
      candidates[0]
    );
  };

  return (
    <fieldset className="rounded-md border border-border bg-surface/60 p-3">
      <legend className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wide text-muted">
        University {index + 1}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove university ${index + 1} from the comparison`}
            className={`rounded px-1 normal-case tracking-normal text-muted hover:text-accent${FOCUS}`}
          >
            remove
          </button>
        )}
      </legend>
      <label className="block">
        <span className="text-sm">Country</span>
        <select
          className={select}
          value={current.university.country}
          onChange={(e) => {
            const g = grouped.find((x) => x.country?.code === e.target.value);
            if (g) onChange(pick(g.options).key);
          }}
        >
          {grouped.map((g) => (
            <option key={g.country?.code} value={g.country?.code}>
              {g.country?.name}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-2 block">
        <span className="text-sm">University</span>
        <select
          className={select}
          value={current.university.id}
          onChange={(e) => onChange(pick(inCountry.filter((o) => o.university.id === e.target.value)).key)}
        >
          {universities.map((u) => {
            const priced = inCountry.some((o) => o.university.id === u.university.id && reasonFor(o) === null);
            return (
              <option key={u.university.id} value={u.university.id}>
                {u.university.name}
                {!priced ? " (no published fee)" : ""}
              </option>
            );
          })}
        </select>
      </label>
      <label className="mt-2 block">
        <span className="text-sm">Field of study</span>
        <select
          className={select}
          value={current.programme.field}
          onChange={(e) => {
            const field = e.target.value as Field;
            onChange(pick(atUniversity.filter((o) => o.programme.field === field), field).key);
          }}
        >
          {fields.map((f) => (
            <option key={f} value={f}>
              {FIELD_LABELS[f]}
            </option>
          ))}
        </select>
      </label>
      {programmes.length > 1 ? (
        <label className="mt-2 block">
          <span className="text-sm">Programme</span>
          <select className={select} value={current.key} onChange={(e) => onChange(e.target.value)}>
            {programmes.map((o) => (
              <option key={o.key} value={o.key}>
                {o.programme.name}
                {reasonFor(o) ? " (no published fee)" : ""}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="mt-1 text-xs text-muted">{current.programme.name}</p>
      )}
      {reason && <p className="mt-1 text-xs text-warn-fg">{reason}. Change the start year or residency to price it.</p>}
      {taken.has(current.key) && (
        <p className="mt-1 text-xs text-warn-fg">Same programme as another slot; pick a different one to compare.</p>
      )}
    </fieldset>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  small,
  tip,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  /** Compact buttons for a secondary control. */
  small?: boolean;
  /** Glossary entry explaining the control. */
  tip?: GlossaryTerm;
}) {
  return (
    <div>
      <span className={small ? "text-xs text-muted" : "text-sm font-medium"}>
        {tip ? <InfoTip term={tip} align="right">{label}</InfoTip> : label}
      </span>
      <div
        role="radiogroup"
        aria-label={label}
        className="mt-1 grid gap-1 rounded-md border border-border bg-surface p-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      >
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={`rounded px-1 ${small ? "py-1.5 text-xs" : "py-2.5 text-sm sm:py-1.5"}${FOCUS} ${value === v ? "bg-accent-fill font-medium text-on-accent" : "text-muted hover:bg-chip"}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One headline tile per university: the total, and how it compares with the cheapest. */
function StatTiles({
  selections,
  countryByCode,
}: {
  selections: Selection[];
  countryByCode: Map<string, Country>;
}) {
  // Selections are sorted by total, so the first is the cheapest.
  const cheapest = selections[0];
  const cols = selections.length === 3 ? "sm:grid-cols-3" : selections.length === 2 ? "sm:grid-cols-2" : "";
  return (
    <div className={`grid gap-4 ${cols}`}>
      {selections.map((s, i) => {
        const diff = s.grandTotalSgd - cheapest.grandTotalSgd;
        return (
          <div key={s.key} className="rounded-xl border border-border border-t-4 border-t-accent bg-surface p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {countryByCode.get(s.university.country)?.name} · {s.university.city}
            </p>
            <h2 className="mt-1 font-semibold leading-snug">
              <UniversityName university={s.university} />
            </h2>
            <p className="mt-0.5 text-sm text-muted">{s.programme.name}</p>
            <p className="mt-2 text-3xl font-semibold text-accent tabular-nums">{formatMoney(s.grandTotalSgd, "SGD")}</p>
            <p className="mt-1 text-sm tabular-nums">
              <InfoTip term="perYear">
                ≈ {formatMoney(s.grandTotalSgd / s.result.durationYears, "SGD")} a year ·{" "}
                {formatMoney(s.grandTotalSgd / s.result.durationYears / 12, "SGD")} a month
              </InfoTip>
            </p>
            {s.living && (
              <p className="mt-1 text-sm text-muted tabular-nums">
                Fees {formatMoney(s.totalSgd, "SGD")} + living {formatMoney(s.living.totalSgd, "SGD")}
              </p>
            )}
            {selections.length > 1 && (
              <p className="mt-1 text-sm tabular-nums">
                {i === 0
                  ? `Cheapest of the ${selections.length === 3 ? "three" : "two"}`
                  : diff === 0
                    ? `Same as ${cheapest.university.name}`
                    : `${formatMoney(diff, "SGD")} more than ${cheapest.university.name}`}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Citizen / PR / international annual fees for a Singapore programme, so the subsidy gap is visible. */
function ResidencyFees({ p, residency }: { p: Programme; residency: Residency }) {
  const tiers = TIERS.filter((t) => p.fees[t]);
  if (tiers.length < 2) return null;
  return (
    <p className="mt-2 text-xs text-muted tabular-nums">
      <InfoTip term="residency">Per year by residency</InfoTip>:{" "}
      {tiers.map((t, i) => (
        <span key={t}>
          {i > 0 && " · "}
          <span className={t === residency ? "font-semibold text-foreground" : ""}>
            {RESIDENCY_LABELS[t]} {formatMoney(p.fees[t]!.annualTuition + p.fees[t]!.annualCompulsoryFees, "SGD")}
          </span>
        </span>
      ))}
    </p>
  );
}

/** Year-by-year fees, living costs and sources for one university. */
function ResultDetail({
  s,
  today,
  country,
  lifestyle,
  residency,
  className,
  onCustomLiving,
}: {
  s: Selection;
  today: string;
  country?: Country;
  lifestyle: Lifestyle;
  residency: Residency;
  className: string;
  onCustomLiving: (m: MonthlyLiving | null) => void;
}) {
  const { university: u, programme: p, result } = s;
  const cur = u.currency;
  // Units of the local currency per S$1, so local ÷ rate = SGD.
  const sgd = (n: number) => n / s.fxRate;
  const stale = isStale(p.lastVerified, new Date(today));
  const hasCompulsory = result.years.some((y) => y.compulsoryFees > 0);
  const hasOneOff = result.years.some((y) => y.oneOffFees > 0);
  const num = `whitespace-nowrap py-1 text-right font-normal ${hasCompulsory && hasOneOff ? "pl-2" : "pl-3"}`;
  // Cohort-locked programmes are priced at the start year's fee throughout.
  const historyYears = new Set(
    result.years
      .filter((y) => y.basis === "history")
      .map((y) => (p.cohortLocked ? result.years[0].academicYear : y.academicYear)),
  );
  const historySources = p.feeHistory
    .filter((h) => h.tier === result.tier && historyYears.has(h.feeYear) && h.sourceUrl && h.sourceUrl !== p.sourceUrl)
    .map((h) => ({ year: h.feeYear, url: h.sourceUrl! }));

  return (
    <article className={`min-w-0 ${className}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {country?.name} · {u.city}
      </p>
      <h3 className="mt-1 font-semibold leading-snug">
        <UniversityName university={u} />
      </h3>
      <p className="text-sm text-muted">
        {p.name} · {result.durationYears} {result.durationYears === 1 ? "year" : "years"}
      </p>
      <p className="mt-2 text-sm tabular-nums">
        {formatMoney(s.grandTotalSgd, "SGD")}
        {cur !== "SGD" && (
          <span className="text-muted">
            {" "}
            = {formatMoney(result.totalLocal + (s.living?.totalLocal ?? 0), cur)} at S$1 ={" "}
            {s.fxRate.toLocaleString("en-SG", { maximumFractionDigits: 4 })} {cur}
          </span>
        )}
      </p>
      {u.country === "sg" && <ResidencyFees p={p} residency={residency} />}

      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        <Badge term={result.tier === "international" ? "internationalRate" : result.tier === "citizen" ? "citizenRate" : "prRate"}>
          {result.tier === "international" ? "International rate" : `${result.tier === "citizen" ? "Citizen" : "PR"} rate`}
        </Badge>
        {p.cohortLocked && <Badge term="cohortLocked">Fee fixed for your cohort</Badge>}
        {result.projected &&
          (s.feeIncrease > 0 ? (
            <Badge term="projected">Includes projected {(s.feeIncrease * 100).toFixed(1)}%/yr increase</Badge>
          ) : (
            <Badge term="projected">Future years assume no increase</Badge>
          ))}
        {result.otherFeesFromCurrent && <Badge term="otherFeesCurrent">Other fees use current rates</Badge>}
        {p.sourceType === "secondary" && <Badge warn term="unofficialSource">Unofficial source</Badge>}
        {stale && <Badge warn term="outdated">Data may be outdated</Badge>}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className={`w-full tabular-nums ${(hasCompulsory && hasOneOff) || className ? "text-xs" : "text-sm"}`}>
          <caption className="sr-only">University fees by year in SGD</caption>
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1 pr-2 font-medium">Year</th>
              <th className={num}>Tuition</th>
              {hasCompulsory && (
                <th className={num}>
                  <InfoTip term="compulsoryFees" align="right">Other fees</InfoTip>
                </th>
              )}
              {hasOneOff && (
                <th className={num}>
                  <InfoTip term="oneOffFees" align="right">One-off</InfoTip>
                </th>
              )}
              <th className={num}>Fees (SGD)</th>
            </tr>
          </thead>
          <tbody>
            {result.years.map((y, i) => (
              <tr key={y.academicYear} className="border-t border-border align-top">
                <td className="py-1 pr-2">
                  {y.academicYear}
                  {y.fraction < 1 && <span className="text-muted"> (½)</span>}
                  {y.basis !== "current" && (
                    <span className="block text-xs text-muted">
                      {i === 0 || result.years[i - 1].basis !== y.basis ? (
                        // Explain the term once per run of years, not on every row.
                        <InfoTip term={y.basis === "history" ? "published" : "projected"}>
                          {y.basis === "history" ? "published" : "projected"}
                        </InfoTip>
                      ) : y.basis === "history" ? (
                        "published"
                      ) : (
                        "projected"
                      )}
                    </span>
                  )}
                </td>
                <td className={num}>{formatMoney(sgd(y.tuition), "SGD")}</td>
                {hasCompulsory && <td className={num}>{formatMoney(sgd(y.compulsoryFees), "SGD")}</td>}
                {hasOneOff && <td className={num}>{formatMoney(sgd(y.oneOffFees), "SGD")}</td>}
                <td className={`${num} font-medium`}>{formatMoney(sgd(y.total), "SGD")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {s.living && (
        <LivingSection living={s.living} currency={cur} fxRate={s.fxRate} lifestyle={lifestyle} today={today} onCustom={onCustomLiving} />
      )}
      {s.livingNote && <p className="mt-4 rounded-md bg-chip px-3 py-2 text-xs text-muted">{s.livingNote}</p>}

      {p.notes && <MoreNotes label="Show more about this fee">{p.notes}</MoreNotes>}
      <p className="mt-3 text-xs text-muted">
        {p.feeYear}/{String((p.feeYear + 1) % 100).padStart(2, "0")} fees ·{" "}
        <a className="text-accent underline hover:text-foreground" href={p.sourceUrl} target="_blank" rel="noreferrer">
          source
        </a>{" "}
        · checked {p.lastVerified}
        {historySources.map((h) => (
          <span key={h.year}>
            {" · "}
            <a className="text-accent underline hover:text-foreground" href={h.url} target="_blank" rel="noreferrer">
              {h.year} source
            </a>
          </span>
        ))}
      </p>
    </article>
  );
}

/** Long source notes, collapsed behind a "Show more" toggle. */
function MoreNotes({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="mt-2 text-xs">
      <summary className={`cursor-pointer py-1.5 font-medium text-accent sm:py-0.5${FOCUS} rounded`}>{label}</summary>
      <p className="mt-1 text-muted">{children}</p>
    </details>
  );
}

function Badge({ children, warn, term }: { children: React.ReactNode; warn?: boolean; term?: GlossaryTerm }) {
  return (
    <span className={`rounded-full px-2 py-0.5 ${warn ? "bg-warn-bg text-warn-fg" : "bg-chip text-muted"}`}>
      {term ? <InfoTip term={term}>{children}</InfoTip> : children}
    </span>
  );
}

function LivingSection({
  living,
  currency: cur,
  fxRate,
  lifestyle,
  today,
  onCustom,
}: {
  living: LivingResult;
  currency: string;
  /** Units of `currency` per S$1. */
  fxRate: number;
  lifestyle: Lifestyle;
  today: string;
  onCustom: (m: MonthlyLiving | null) => void;
}) {
  const e = living.estimate;
  const sgd = (n: number) => n / fxRate;
  const stale = isStale(e.lastVerified, new Date(today));
  const projected = living.years.some((y) => y.projected);
  // Some sources (e.g. a visa minimum) give one total, stored under housing.
  const breakdown = living.customised || e.monthly.food + e.monthly.transport + e.monthly.personal > 0;
  return (
    <section className="mt-5 border-t border-border pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">
          <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-series-4" aria-hidden />
          Living costs
        </h3>
        <span className="text-sm font-medium tabular-nums">{formatMoney(living.totalSgd, "SGD")}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted">
        {living.customised ? "Your own budget" : `${lifestyle[0].toUpperCase()}${lifestyle.slice(1)} lifestyle`} ·{" "}
        {formatMoney(sgd(monthlyTotal(living.monthly)), "SGD")} a month ({formatMoney(monthlyTotal(living.monthly), cur)}) × {e.months} months a year
        {projected && ` · later years +${(living.increase * 100).toFixed(1)}%/yr inflation`}
      </p>
      {breakdown ? (
        <dl className="mt-2 grid gap-x-4 gap-y-0.5 text-xs tabular-nums sm:grid-cols-2 lg:grid-cols-1">
          {LIVING_CATEGORIES.map((c) => (
            <div key={c} className="flex justify-between gap-2">
              <dt className="text-muted">{LIVING_LABELS[c]}</dt>
              <dd>{formatMoney(sgd(living.monthly[c]), "SGD")}/mo</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-xs text-muted">This estimate is a single total, not split by category.</p>
      )}
      <p className="mt-2 text-xs text-muted tabular-nums">
        {living.years.map((y) => `${y.academicYear}: ${formatMoney(sgd(y.amount), "SGD")}`).join(" · ")}
      </p>

      <details className="mt-2 text-sm">
        <summary className="cursor-pointer py-2 text-xs font-medium text-accent sm:py-0">Customise this budget</summary>
        <CustomLiving key={JSON.stringify(living.monthly)} initial={living.monthly} currency={cur} onSave={onCustom} customised={living.customised} />
      </details>

      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        {e.sourceType === "secondary" && <Badge warn term="unofficialSource">Unofficial source</Badge>}
        {stale && <Badge warn term="outdated">Estimate may be outdated</Badge>}
      </div>
      {e.notes && <MoreNotes label="Show more about this estimate">{e.notes}</MoreNotes>}
      <p className="mt-1 text-xs text-muted">
        {e.year} estimate ·{" "}
        <a className="text-accent underline hover:text-foreground" href={e.sourceUrl} target="_blank" rel="noreferrer">
          source
        </a>{" "}
        · checked {e.lastVerified}
      </p>
    </section>
  );
}

function CustomLiving({
  initial,
  currency,
  customised,
  onSave,
}: {
  initial: MonthlyLiving;
  currency: string;
  customised: boolean;
  onSave: (m: MonthlyLiving | null) => void;
}) {
  const [draft, setDraft] = useState<MonthlyLiving>(() =>
    Object.fromEntries(LIVING_CATEGORIES.map((c) => [c, Math.round(initial[c])])) as MonthlyLiving,
  );
  return (
    <form
      className="mt-2 space-y-2"
      onSubmit={(ev) => {
        ev.preventDefault();
        onSave(draft);
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        {LIVING_CATEGORIES.map((c) => (
          <label key={c} className="text-xs">
            <span className="text-muted">
              {LIVING_LABELS[c]} ({currency} a month)
            </span>
            <input
              type="number"
              min={0}
              step="any"
              className={`mt-0.5 w-full rounded-md border border-border bg-surface px-2 py-1 text-right tabular-nums${FOCUS}`}
              value={draft[c]}
              onChange={(ev) => setDraft({ ...draft, [c]: Math.max(0, Number(ev.target.value)) })}
            />
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="submit" className={`rounded-md bg-accent-fill px-3 py-1 text-xs font-medium text-on-accent${FOCUS}`}>
          Use my budget
        </button>
        {customised && (
          <button
            type="button"
            className={`rounded-md border border-border px-3 py-1 text-xs${FOCUS}`}
            onClick={() => onSave(null)}
          >
            Reset to university estimate
          </button>
        )}
      </div>
    </form>
  );
}
