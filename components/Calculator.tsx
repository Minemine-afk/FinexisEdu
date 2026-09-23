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
import FeeChart from "./FeeChart";

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

const MAX_SELECTED = 4;
const FOCUS = " outline-none focus-visible:ring-2 focus-visible:ring-accent";
// Start years offered. Earlier years use published fee history only.
const START_YEARS = [2024, 2025, 2026, 2027, 2028];
const COUNTRY_ORDER = ["sg", "uk", "au", "us", "ca", "nz", "jp"];
const LIFESTYLE_LABELS: Record<Lifestyle, string> = { frugal: "Frugal", moderate: "Moderate", comfortable: "Comfortable" };
export const LIVING_LABELS: Record<LivingCategory, string> = {
  housing: "Housing",
  food: "Food",
  transport: "Transport",
  personal: "Personal & books",
};

function optionsFor(universities: University[], level: Level, field: Field): Option[] {
  return universities.flatMap((university) =>
    university.programmes
      .map((programme, i) => ({ key: `${university.id}:${i}`, university, programme }))
      .filter((o) => o.programme.level === level && o.programme.field === field),
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

/** Keeps the chosen universities when level or field changes, else picks one per country. */
function reselect(allOptions: Option[], previous: string[], isAvailable: (o: Option) => boolean): string[] {
  const options = allOptions.filter(isAvailable);
  const prevUnis = new Set(previous.map((k) => k.split(":")[0]));
  const kept: string[] = [];
  for (const o of options) {
    if (prevUnis.has(o.university.id) && !kept.some((k) => k.startsWith(`${o.university.id}:`))) kept.push(o.key);
  }
  if (kept.length > 0) return kept.slice(0, MAX_SELECTED);
  const picks: string[] = [];
  for (const country of ["sg", "uk", "au", "us"]) {
    const o = options.find((opt) => opt.university.country === country);
    if (o) picks.push(o.key);
  }
  return picks.length > 0 ? picks : options.slice(0, 2).map((o) => o.key);
}

export default function Calculator({ universities, countries, fx, today }: Props) {
  const thisYear = Number(today.slice(0, 4));
  const countryByCode = useMemo(() => new Map(countries.map((c) => [c.code, c])), [countries]);

  const [level, setLevel] = useState<Level>("bachelor");
  const [field, setField] = useState<Field>("computing");
  const [residency, setResidency] = useState<Residency>("citizen");
  const [startYear, setStartYear] = useState(
    Math.min(Math.max(thisYear + 1, START_YEARS[0]), START_YEARS[START_YEARS.length - 1]),
  );
  const [customIncrease, setCustomIncrease] = useState<number | null>(null);
  const [includeLiving, setIncludeLiving] = useState(false);
  const [lifestyle, setLifestyle] = useState<Lifestyle>("moderate");
  // The student's own monthly living budget, per university.
  const [customLiving, setCustomLiving] = useState<Record<string, MonthlyLiving>>({});
  const options = useMemo(() => optionsFor(universities, level, field), [universities, level, field]);
  const [selected, setSelected] = useState<string[]>(() =>
    reselect(options, [], (o) => unavailableReason(o, residency, startYear) === null),
  );

  const available = (o: Option) => unavailableReason(o, residency, startYear) === null;

  function changeCourse(nextLevel: Level, nextField: Field) {
    setLevel(nextLevel);
    setField(nextField);
    setSelected((prev) => reselect(optionsFor(universities, nextLevel, nextField), prev, available));
  }

  function toggle(key: string) {
    setSelected((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      // Selections hidden by the residency choice don't use up a slot.
      const active = prev.filter((k) => options.some((o) => o.key === k && available(o)));
      return active.length < MAX_SELECTED ? [...active, key] : prev;
    });
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

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      <aside className="space-y-5 rounded-xl border border-border bg-sidebar p-5 lg:self-start">
        <Segmented label="Level" value={level} options={LEVELS.map((l) => [l, LEVEL_LABELS[l]])} onChange={(l) => changeCourse(l, field)} />

        <label className="block">
          <span className="text-sm font-medium">Field of study</span>
          <select
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-accent"
            value={field}
            onChange={(e) => changeCourse(level, e.target.value as Field)}
          >
            {FIELDS.map((f) => (
              <option key={f} value={f}>
                {FIELD_LABELS[f]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium">Residency</span>
          <select
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-accent"
            value={residency}
            onChange={(e) => setResidency(e.target.value as Residency)}
          >
            {(Object.keys(RESIDENCY_LABELS) as Residency[]).map((r) => (
              <option key={r} value={r}>
                {RESIDENCY_LABELS[r]}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted">Only changes Singapore university fees. Abroad, you pay international rates.</span>
        </label>

        <label className="block">
          <span className="text-sm font-medium">Start year</span>
          <select
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-accent"
            value={startYear}
            onChange={(e) => setStartYear(Number(e.target.value))}
          >
            {START_YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {startYear <= thisYear && (
            <span className="mt-1 block text-xs text-muted">
              Past and current intakes use published fees only. Programmes without them are greyed out.
            </span>
          )}
        </label>

        <fieldset>
          <legend className="text-sm font-medium">Yearly fee increase</legend>
          <div className="mt-1 flex min-h-10 items-center gap-2 text-sm">
            <input
              id="custom-increase"
              type="checkbox"
              checked={customIncrease !== null}
              onChange={(e) => setCustomIncrease(e.target.checked ? 0.03 : null)}
            />
            <label htmlFor="custom-increase">Set my own rate</label>
            {customIncrease !== null && (
              <span className="ml-auto flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={20}
                  step={0.5}
                  aria-label="Yearly fee increase in percent"
                  className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-right outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  value={+(customIncrease * 100).toFixed(1)}
                  onChange={(e) => setCustomIncrease(Math.max(0, Number(e.target.value)) / 100)}
                />
                %
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">
            {customIncrease === null ? "Using each country's typical increase." : "Applied to every university."} Used
            only for years after the published fee year.
          </p>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Living costs</legend>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={includeLiving} onChange={(e) => setIncludeLiving(e.target.checked)} />
            Include living costs
          </label>
          {includeLiving && (
            <>
              <Segmented
                label="Lifestyle"
                value={lifestyle}
                options={(Object.keys(LIFESTYLE_LABELS) as Lifestyle[]).map((l) => [l, LIFESTYLE_LABELS[l]])}
                onChange={setLifestyle}
              />
              <p className="text-xs text-muted">
                Based on each university&apos;s own estimate (Moderate); Frugal is 20% less, Comfortable 30% more. Adjust
                any university&apos;s budget on its card. Not included for Singapore universities.
              </p>
            </>
          )}
        </fieldset>

        <div>
          <p className="text-sm font-medium">
            Universities <span className="font-normal text-muted">(up to {MAX_SELECTED})</span>
          </p>
          {grouped.length === 0 && <p className="mt-2 text-sm text-muted">No fee data for this course yet.</p>}
          <div className="mt-2 space-y-3">
            {grouped.map(({ country, options: opts }) => (
              <div key={country?.code}>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">{country?.name}</p>
                <ul className="mt-1 space-y-1">
                  {opts.map((o) => {
                    const reason = unavailableReason(o, residency, startYear);
                    const hasRate = reason === null;
                    const checked = hasRate && selected.includes(o.key);
                    return (
                      <li key={o.key}>
                        <label
                          className={`flex min-h-11 items-start gap-2 py-2.5 text-sm sm:min-h-0 sm:py-0.5 ${hasRate ? "cursor-pointer" : "text-muted"}`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={checked}
                            disabled={!hasRate || (!checked && selections.length >= MAX_SELECTED)}
                            onChange={() => toggle(o.key)}
                          />
                          <span>
                            {o.university.name}
                            {opts.filter((x) => x.university.id === o.university.id).length > 1 && (
                              <span className="block text-xs text-muted">{o.programme.name}</span>
                            )}
                            {reason && <span className="block text-xs">{reason}</span>}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <section id="results" ref={resultsRef} className="min-w-0 scroll-mt-4 space-y-6">
        {selections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted">
            Pick at least one university to see its total {includeLiving ? "cost" : "fees"}.
          </div>
        ) : (
          <>
            <FeeChart selections={selections} includeLiving={includeLiving} />
            <div className="grid gap-4 xl:grid-cols-2">
              {selections.map((s) => (
                <ResultCard
                  key={s.key}
                  s={s}
                  today={today}
                  country={countryByCode.get(s.university.country)}
                  lifestyle={lifestyle}
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

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <span className="text-sm font-medium">{label}</span>
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
            className={`rounded px-2 py-2.5 text-sm sm:py-1.5${FOCUS} ${value === v ? "bg-accent-fill font-medium text-on-accent" : "text-muted hover:bg-chip"}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultCard({
  s,
  today,
  country,
  lifestyle,
  onCustomLiving,
}: {
  s: Selection;
  today: string;
  country?: Country;
  lifestyle: Lifestyle;
  onCustomLiving: (m: MonthlyLiving | null) => void;
}) {
  const { university: u, programme: p, result } = s;
  const cur = u.currency;
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
    <article className="rounded-xl border border-border border-t-4 border-t-accent bg-surface p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {country?.name} · {u.city}
      </p>
      <h2 className="mt-1 text-lg font-semibold leading-snug">{u.name}</h2>
      <p className="text-sm text-muted">
        {p.name} · {result.durationYears} {result.durationYears === 1 ? "year" : "years"}
      </p>

      <p className="mt-4 text-3xl font-semibold text-accent tabular-nums">{formatMoney(s.grandTotalSgd, "SGD")}</p>
      {s.living && (
        <p className="text-sm tabular-nums">
          Fees {formatMoney(s.totalSgd, "SGD")} + living {formatMoney(s.living.totalSgd, "SGD")}
        </p>
      )}
      {cur !== "SGD" && (
        <p className="text-sm text-muted tabular-nums">
          {formatMoney(result.totalLocal + (s.living?.totalLocal ?? 0), cur)} at S$1 ={" "}
          {s.fxRate.toLocaleString("en-SG", { maximumFractionDigits: 4 })} {cur}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        <Badge>{result.tier === "international" ? "International rate" : `${result.tier === "citizen" ? "Citizen" : "PR"} rate`}</Badge>
        {p.cohortLocked && <Badge>Fee fixed for your cohort</Badge>}
        {result.projected &&
          (s.feeIncrease > 0 ? (
            <Badge>Includes projected {(s.feeIncrease * 100).toFixed(1)}%/yr increase</Badge>
          ) : (
            <Badge>Future years assume no increase</Badge>
          ))}
        {result.otherFeesFromCurrent && <Badge>Other fees use current rates</Badge>}
        {p.sourceType === "secondary" && <Badge warn>Unofficial source</Badge>}
        {stale && <Badge warn>Data may be outdated</Badge>}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className={`w-full tabular-nums ${hasCompulsory && hasOneOff ? "text-xs" : "text-sm"}`}>
          <caption className="sr-only">University fees by year in {cur}</caption>
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1 pr-2 font-medium">Year</th>
              <th className={num}>Tuition</th>
              {hasCompulsory && <th className={num}>Other fees</th>}
              {hasOneOff && <th className={num}>One-off</th>}
              <th className={num}>Fees ({cur})</th>
            </tr>
          </thead>
          <tbody>
            {result.years.map((y) => (
              <tr key={y.academicYear} className="border-t border-border align-top">
                <td className="py-1 pr-2">
                  {y.academicYear}
                  {y.fraction < 1 && <span className="text-muted"> (½)</span>}
                  {y.basis !== "current" && (
                    <span className="block text-xs text-muted">{y.basis === "history" ? "published" : "projected"}</span>
                  )}
                </td>
                <td className={num}>{formatMoney(y.tuition, cur)}</td>
                {hasCompulsory && <td className={num}>{formatMoney(y.compulsoryFees, cur)}</td>}
                {hasOneOff && <td className={num}>{formatMoney(y.oneOffFees, cur)}</td>}
                <td className={`${num} font-medium`}>{formatMoney(y.total, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {s.living && <LivingSection living={s.living} currency={cur} lifestyle={lifestyle} today={today} onCustom={onCustomLiving} />}
      {s.livingNote && <p className="mt-4 rounded-md bg-chip px-3 py-2 text-xs text-muted">{s.livingNote}</p>}

      {p.notes && <p className="mt-3 text-xs text-muted">{p.notes}</p>}
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

function Badge({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 ${warn ? "bg-warn-bg text-warn-fg" : "bg-chip text-muted"}`}>
      {children}
    </span>
  );
}

function LivingSection({
  living,
  currency: cur,
  lifestyle,
  today,
  onCustom,
}: {
  living: LivingResult;
  currency: string;
  lifestyle: Lifestyle;
  today: string;
  onCustom: (m: MonthlyLiving | null) => void;
}) {
  const e = living.estimate;
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
        <span className="text-sm font-medium tabular-nums">{formatMoney(living.totalLocal, cur)}</span>
      </div>
      <p className="mt-0.5 text-xs text-muted">
        {living.customised ? "Your own budget" : `${lifestyle[0].toUpperCase()}${lifestyle.slice(1)} lifestyle`} ·{" "}
        {formatMoney(monthlyTotal(living.monthly), cur)} a month × {e.months} months a year
        {projected && ` · later years +${(living.increase * 100).toFixed(1)}%/yr inflation`}
      </p>
      {breakdown ? (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs tabular-nums">
          {LIVING_CATEGORIES.map((c) => (
            <div key={c} className="flex justify-between gap-2">
              <dt className="text-muted">{LIVING_LABELS[c]}</dt>
              <dd>{formatMoney(living.monthly[c], cur)}/mo</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-xs text-muted">This estimate is a single total, not split by category.</p>
      )}
      <p className="mt-2 text-xs text-muted tabular-nums">
        {living.years.map((y) => `${y.academicYear}: ${formatMoney(y.amount, cur)}`).join(" · ")}
      </p>

      <details className="mt-2 text-sm">
        <summary className="cursor-pointer py-2 text-xs font-medium text-accent sm:py-0">Customise this budget</summary>
        <CustomLiving key={JSON.stringify(living.monthly)} initial={living.monthly} currency={cur} onSave={onCustom} customised={living.customised} />
      </details>

      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        {e.sourceType === "secondary" && <Badge warn>Unofficial source</Badge>}
        {stale && <Badge warn>Estimate may be outdated</Badge>}
      </div>
      {e.notes && <p className="mt-1 text-xs text-muted">{e.notes}</p>}
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
              {LIVING_LABELS[c]} ({currency}/month)
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
