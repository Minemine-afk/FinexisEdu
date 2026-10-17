"use client";

import { useMemo, useState } from "react";
import {
  calculate,
  hasRateFor,
  toSgd,
  type CalcResult,
  type Residency,
} from "@/lib/calc";
import type { FxResult } from "@/lib/fx";
import { RESIDENCY_LABELS } from "@/lib/format";
import {
  COUNTRY_ORDER,
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
  type Lifestyle,
  type LivingYear,
  type MonthlyLiving,
} from "@/lib/living";
import { SEGMENTS, type CompareCategory } from "./FeeChart";
import { universityIncrease, type IncreaseEstimate } from "@/lib/increase";

/**
 * The calculator's state and derived results, shared by the desktop layout
 * (`Calculator`) and the phone/tablet layout (`TouchCalculator`).
 */

export interface CalculatorProps {
  universities: University[];
  countries: Country[];
  fx: FxResult;
  today: string;
}

export interface Option {
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
  /** Where the yearly increase came from (the university's own history or the country). */
  increase: IncreaseEstimate;
  fxRate: number;
  /** University fees only. */
  totalSgd: number;
  /** Fees plus living costs when they are included. */
  grandTotalSgd: number;
  yearsSgd: {
    tuition: number;
    compulsoryFees: number;
    oneOffFees: number;
    living: number;
  };
  /** Tuition at 2026 prices; `yearsSgd.tuition` minus this is the expected price rises. */
  tuitionAtBaseYearSgd: number;
  /** Living costs, when included and the university has an estimate. */
  living: LivingResult | null;
  /** Why living costs are missing when they were asked for. */
  livingNote: string | null;
}

export interface CountryGroup {
  country?: Country;
  options: Option[];
}

// Up to three universities compare as bars side by side.
export const MAX_SELECTED = 3;
/** Start years the calculator accepts: typed in, from the first year the current fee tables cover. */
export const MIN_START_YEAR = 2026;
/** The latest start year the calculator accepts. */
export const MAX_START_YEAR = 2090;
export { COUNTRY_ORDER };
export const LIFESTYLE_LABELS: Record<Lifestyle, string> = {
  frugal: "Frugal",
  moderate: "Moderate",
  comfortable: "Comfortable",
};
export const LIVING_LABELS: Record<LivingCategory, string> = {
  housing: "Housing",
  food: "Food",
  transport: "Transport",
  personal: "Personal & books",
};

function optionsFor(universities: University[], level: Level): Option[] {
  return universities.flatMap((university) =>
    university.programmes
      .map((programme, i) => ({
        key: `${university.id}:${i}`,
        university,
        programme,
      }))
      .filter((o) => o.programme.level === level),
  );
}

/**
 * Why a programme can't be priced for this student, or null if it can: Singapore
 * universities need the student's own Citizen/PR rate, and past start years need
 * published fees for every year charged.
 */
export function unavailableReason(
  o: Option,
  residency: Residency,
  startYear: number,
): string | null {
  const { missingYears } = calculate({
    programme: o.programme,
    currency: o.university.currency,
    residency,
    startYear,
    feeIncrease: 0,
    strictTier: o.university.country === "sg",
  });
  if (residency === "international" && !o.programme.internationalEligible) {
    return "Not open to international students";
  }
  if (missingYears.length === 0) return null;
  // A Singapore programme with no rate for this tier in any year is missing the tier, not a year.
  const tierEverPublished = o.programme.feeHistory.some(
    (h) => h.tier === residency,
  );
  if (
    !hasRateFor(o.university.country, o.programme, residency) &&
    !tierEverPublished
  ) {
    return `No ${RESIDENCY_LABELS[residency]} rate on file yet`;
  }
  return `No published ${missingYears.join(", ")} fee on file`;
}

/** The short tag after a programme's name in a list when it cannot be priced. */
export function unavailableTag(reason: string | null): string {
  if (!reason) return "";
  return reason.startsWith("Not open to international")
    ? " (closed to international)"
    : " (no published fee)";
}

/** A start year moved by `delta` years, kept within `min`–`max`. */
export function stepYear(year: number, delta: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, year + delta));
}

/** The tag after a university or field in a list when none of its programmes can be priced. */
export function groupTag(options: Option[], reasonFor: (o: Option) => string | null): string {
  const reasons = options.map(reasonFor);
  if (reasons.length === 0 || reasons.some((r) => r === null)) return "";
  const closed = reasons.filter((r) => r!.startsWith("Not open to international")).length;
  if (closed === reasons.length) return " (closed to international)";
  // Some closed to international students, the rest missing a fee: one tag covers both.
  return closed ? " (can't be priced)" : " (no published fee)";
}

/** What to change so an unavailable programme can be priced, to follow its `unavailableReason`. */
export function unavailableHint(reason: string): string {
  if (reason.startsWith("Not open to international")) {
    return "Change the residency to price it.";
  }
  if (reason.startsWith("No published")) {
    return "Change the start year to price it.";
  }
  return "Change the residency to price it.";
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
  const takenCountries = new Set<string>(
    taken.map((o) => o.university.country),
  );
  const usable = options.filter((o) => isAvailable(o) && !takenKeys.has(o.key));
  const byField = (list: Option[]) =>
    list.find((o) => o.programme.field === preferField) ??
    list.find((o) => o.programme.field === "computing") ??
    list[0];
  for (const skipTakenCountries of [true, false]) {
    for (const country of COUNTRY_ORDER) {
      if (skipTakenCountries && takenCountries.has(country)) continue;
      const o = byField(
        usable.filter(
          (x) =>
            x.university.country === country && !takenUnis.has(x.university.id),
        ),
      );
      if (o) return o;
    }
  }
  return usable[0];
}

/** When the level changes, keep each slot's university and field where the new level offers them. */
// Words that say nothing about a programme's subject.
const GENERIC = new Set(["bachelor", "master", "masters", "science", "sciences", "honours", "applied", "professional", "studies", "degree", "doctor", "programme", "program"]);

/** Whether two programme names share a subject word, compared on its first five letters (Accountancy, Accounting). */
function kin(a: string, b: string): boolean {
  const stems = (n: string) =>
    new Set(
      n
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((w) => w.length >= 5 && !GENERIC.has(w))
        .map((w) => w.slice(0, 5)),
    );
  const sa = stems(a);
  return [...stems(b)].some((w) => sa.has(w));
}

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
    const same = nextOptions.filter(
      (o) => o.university.id === prev.university.id && !next.includes(o.key),
    );
    const samePartner = (x: Option) =>
      x.programme.partner === prev.programme.partner;
    const sameField = (x: Option) =>
      samePartner(x) &&
      x.programme.field === prev.programme.field &&
      isAvailable(x);
    const o =
      // Within a field, a programme sharing a subject word (Accountancy → Professional Accounting) first.
      same.find((x) => sameField(x) && kin(x.programme.name, prev.programme.name)) ??
      same.find(sameField) ??
      same.find((x) => samePartner(x) && isAvailable(x)) ??
      same.find(
        (x) => x.programme.field === prev.programme.field && isAvailable(x),
      ) ??
      same.find(isAvailable) ??
      same[0];
    if (o) next.push(o.key);
  }
  if (next.length === 0) {
    const o = defaultPick(nextOptions, isAvailable, []);
    if (o) next.push(o.key);
  }
  return next;
}

/**
 * The programme to show when a picker changes country, university, partner or
 * field: one that can be priced for this student, in the wanted field, that no
 * other slot already holds.
 */
export function pickProgramme(
  candidates: Option[],
  field: Field,
  reasonFor: (o: Option) => string | null,
  taken: Set<string>,
): Option {
  const ok = candidates.filter(
    (o) => reasonFor(o) === null && !taken.has(o.key),
  );
  return (
    ok.find((o) => o.programme.field === field) ??
    ok[0] ??
    candidates.find((o) => o.programme.field === field) ??
    candidates[0]
  );
}

/** One line saying where the automatic rates come from. */
export function increaseBasisNote(selections: Selection[]): string {
  if (selections.length === 0)
    return "Each university's own past fee rises, applied after its published fee year.";
  const list = (xs: Selection[]) => xs.map((s) => s.university.name).join(", ");
  const own = selections.filter((s) => s.increase.basis === "university" || s.increase.basis === "partner");
  const stated = selections.filter((s) => s.increase.basis === "stated");
  const fallback = selections.filter((s) => s.increase.basis === "country");
  const years = own.flatMap((s) =>
    s.increase.from !== undefined && s.increase.to !== undefined ? [s.increase.from, s.increase.to] : [],
  );
  const span = years.length
    ? `, ${Math.min(...years)}–${Math.max(...years)}`
    : "";
  const parts: string[] = [];
  if (own.length === selections.length)
    return `From each university's published fees${span}; applied to years after the published fee year.`;
  if (own.length) parts.push(`From published fees${span}`);
  if (stated.length)
    parts.push(
      `${list(stated)} ${stated.length > 1 ? "use rates" : "uses a rate"} set by hand after a one-off fee change (see the ⓘ by ${stated.length > 1 ? "their rates" : "its rate"})`,
    );
  if (fallback.length)
    parts.push(
      `${list(fallback)} ${fallback.length > 1 ? "have" : "has"} too little fee history, so the country's typical rate is used`,
    );
  return `${parts.join("; ")}.`;
}

/** The ⓘ text for one university's yearly rate: its own reason when the rate was set by hand. */
export function increaseTip(s: Selection): string | undefined {
  if (s.increase.basis !== "stated") return undefined;
  return s.increase.reason
    ? `This university's yearly fee increase is set by hand rather than worked out from its fee history. ${s.increase.reason}`
    : undefined;
}

export function useCalculator({
  universities,
  countries,
  fx,
  today,
}: CalculatorProps) {
  const thisYear = Number(today.slice(0, 4));
  // A degree can't start in a year that has already gone.
  const minStartYear = Math.max(MIN_START_YEAR, thisYear);
  const countryByCode = useMemo(
    () => new Map(countries.map((c) => [c.code, c])),
    [countries],
  );

  const [level, setLevel] = useState<Level>("bachelor");
  const [residency, setResidency] = useState<Residency>("citizen");
  const [startYear, setStartYear] = useState(
    Math.max(thisYear + 1, minStartYear),
  );
  // What the user has typed; only a year in range is applied.
  const [startYearInput, setStartYearInput] = useState(String(startYear));
  const maxStartYear = MAX_START_YEAR;
  const startYearError = (() => {
    const t = startYearInput.trim();
    const still = `Results still use ${startYear}.`;
    if (!/^\d{4}$/.test(t))
      return `Enter a four-digit year, ${minStartYear} to ${maxStartYear}. ${still}`;
    const y = Number(t);
    if (y < minStartYear)
      return `The earliest start year is ${minStartYear}. Enter ${minStartYear} or a later year. ${still}`;
    if (y > maxStartYear)
      return `Projections stop at ${maxStartYear}. Enter ${maxStartYear} or earlier. ${still}`;
    return null;
  })();
  /** Applies what the user typed in the start-year box when it is a usable year. */
  function typeStartYear(text: string) {
    const t = text.replace(/[^0-9]/g, "").slice(0, 4);
    setStartYearInput(t);
    const y = Number(t);
    if (/^\d{4}$/.test(t) && y >= minStartYear && y <= maxStartYear)
      setStartYear(y);
  }
  /** Moves the start year by whole years (the − / + stepper on touch screens). */
  function stepStartYear(delta: number) {
    const y = stepYear(startYear, delta, minStartYear, maxStartYear);
    setStartYear(y);
    setStartYearInput(String(y));
  }
  const [customIncrease, setCustomIncrease] = useState<number | null>(null);
  const [includeLiving, setIncludeLiving] = useState(false);
  const [lifestyle, setLifestyle] = useState<Lifestyle>("moderate");
  // The student's own monthly living budget, per university.
  const [customLiving, setCustomLiving] = useState<
    Record<string, MonthlyLiving>
  >({});
  // Which part of the cost the bars compare.
  const [compare, setCompare] = useState<CompareCategory>("total");
  const options = useMemo(
    () => optionsFor(universities, level),
    [universities, level],
  );
  const available = (o: Option) =>
    unavailableReason(o, residency, startYear) === null;
  const reasonFor = (o: Option) => unavailableReason(o, residency, startYear);
  // One university to start with; "Compare another university" adds up to two more.
  const [selected, setSelected] = useState<string[]>(() => {
    const o = defaultPick(
      options,
      (x) => unavailableReason(x, residency, startYear) === null,
      [],
    );
    return o ? [o.key] : [];
  });
  const chosen = selected
    .map((k) => options.find((o) => o.key === k))
    .filter((o): o is Option => !!o);

  function changeLevel(nextLevel: Level) {
    // Re-picking the current level must not swap anyone's programme.
    if (nextLevel === level) return;
    setLevel(nextLevel);
    setSelected((prev) =>
      reselect(prev, options, optionsFor(universities, nextLevel), available),
    );
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
      const taken = prev
        .map((k) => options.find((o) => o.key === k))
        .filter((o): o is Option => !!o);
      const o = defaultPick(
        options,
        available,
        taken,
        taken[taken.length - 1]?.programme.field,
      );
      return o ? [...prev, o.key] : prev;
    });
  }

  function removeSlot(i: number) {
    setSelected((prev) => prev.filter((_, j) => j !== i));
  }

  function setCustomLivingFor(universityId: string, m: MonthlyLiving | null) {
    setCustomLiving((prev) => {
      const next = { ...prev };
      if (m) next[universityId] = m;
      else delete next[universityId];
      return next;
    });
  }

  const selections: Selection[] = options
    .filter((o) => selected.includes(o.key) && available(o))
    .map((o) => {
      const country = countryByCode.get(o.university.country);
      const tier = o.university.country === "sg" ? residency : "international";
      const increase = universityIncrease(
        o.university,
        tier,
        country,
        o.programme.partner,
      );
      const feeIncrease = customIncrease ?? increase.rate;
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
        if (o.university.country === "sg")
          livingNote =
            "Living costs are not included for Singapore universities.";
        else if (!estimate)
          livingNote = "No living-cost estimate from this university yet.";
        else {
          const custom = customLiving[o.university.id];
          const increase = country?.livingCostIncrease ?? 0.03;
          const years = livingCostsByYear({
            living: estimate,
            years: result.years,
            lifestyle,
            increase,
            custom,
          });
          const totalLocal = years.reduce((t, y) => t + y.amount, 0);
          const scale = custom ? 1 : LIFESTYLE_MULTIPLIER[lifestyle];
          const monthly =
            custom ??
            (Object.fromEntries(
              LIVING_CATEGORIES.map((c) => [c, estimate.monthly[c] * scale]),
            ) as MonthlyLiving);
          living = {
            estimate,
            monthly,
            customised: !!custom,
            increase,
            years,
            totalLocal,
            totalSgd: sgd(totalLocal),
          };
        }
      }

      const totalSgd = sgd(result.totalLocal);
      return {
        ...o,
        result,
        feeIncrease,
        increase,
        fxRate:
          o.university.currency === "SGD" ? 1 : fx.rates[o.university.currency],
        totalSgd,
        grandTotalSgd: totalSgd + (living?.totalSgd ?? 0),
        yearsSgd: {
          tuition: sum((y) => y.tuition),
          compulsoryFees: sum((y) => y.compulsoryFees),
          oneOffFees: sum((y) => y.oneOffFees),
          living: living?.totalSgd ?? 0,
        },
        tuitionAtBaseYearSgd: sum((y) => y.tuitionAtBaseYear),
        living,
        livingNote,
      };
    })
    .sort((a, b) => a.grandTotalSgd - b.grandTotalSgd);

  // Only cost parts that are present can be compared on their own.
  const categories: [CompareCategory, string][] = [
    ["total", "Total"],
    ...SEGMENTS.filter((seg) =>
      selections.some((s) => s.yearsSgd[seg.key] > 0),
    ).map(
      (seg) =>
        [
          seg.key,
          seg.key === "compulsoryFees"
            ? "Other fees"
            : seg.key === "oneOffFees"
              ? "One-off"
              : seg.label,
        ] as [CompareCategory, string],
    ),
    ...(selections.some((s) => s.yearsSgd.tuition > 0)
      ? [["inflation", "Inflation"] as [CompareCategory, string]]
      : []),
  ];
  const category = categories.some(([c]) => c === compare) ? compare : "total";

  const grouped: CountryGroup[] = COUNTRY_ORDER.map((code) => ({
    country: countryByCode.get(code as Country["code"]),
    options: options.filter((o) => o.university.country === code),
  })).filter((g) => g.options.length > 0);

  // The published fee year(s) the projections start from.
  const baseYears = [
    ...new Set(selections.map((s) => s.programme.feeYear)),
  ].sort();
  const baseYearLabel =
    baseYears.length === 0
      ? String(thisYear)
      : baseYears.length === 1
        ? String(baseYears[0])
        : `${baseYears[0]}–${baseYears[baseYears.length - 1]}`;

  return {
    countryByCode,
    level,
    changeLevel,
    residency,
    setResidency,
    startYear,
    minStartYear,
    maxStartYear,
    startYearInput,
    startYearError,
    typeStartYear,
    stepStartYear,
    customIncrease,
    setCustomIncrease,
    includeLiving,
    setIncludeLiving,
    lifestyle,
    setLifestyle,
    setCustomLivingFor,
    category,
    categories,
    setCompare,
    reasonFor,
    selected,
    chosen,
    setSlot,
    addSlot,
    removeSlot,
    selections,
    grouped,
    baseYearLabel,
  };
}

export type CalculatorState = ReturnType<typeof useCalculator>;
