import type { FeeTier, FxRates, Programme, Tier } from "./schema";

export type Residency = "citizen" | "pr" | "international";

export interface CalcInput {
  programme: Programme;
  currency: string;
  residency: Residency;
  startYear: number;
  /** Yearly fee increase as a fraction, e.g. 0.03 for 3%. */
  feeIncrease: number;
  durationYears?: number;
}

export interface YearBreakdown {
  /** Calendar year the academic year starts in. */
  academicYear: number;
  /** Share of a full year charged, below 1 only for a final partial year. */
  fraction: number;
  tuition: number;
  compulsoryFees: number;
  oneOffFees: number;
  total: number;
}

export interface CalcResult {
  tier: Tier;
  durationYears: number;
  /** True when any year uses a projected (not yet published) fee. */
  projected: boolean;
  years: YearBreakdown[];
  totalLocal: number;
}

/**
 * Picks the fee tier for a student. Citizen and PR rates only exist at
 * Singapore universities; everywhere else a Singaporean pays the
 * international rate.
 */
export function pickTier(programme: Programme, residency: Residency): { tier: Tier; fees: FeeTier } {
  const fees = programme.fees[residency];
  if (fees) return { tier: residency, fees };
  return { tier: "international", fees: programme.fees.international };
}

/**
 * Whether the data has the right rate for this student. Singapore universities
 * charge Citizens and PRs subsidised rates, so the international rate must not
 * stand in for a missing one there.
 */
export function hasRateFor(country: string, programme: Programme, residency: Residency): boolean {
  return country !== "sg" || residency === "international" || programme.fees[residency] !== undefined;
}

/**
 * Total university fees for a programme, in the university's own currency.
 *
 * Fees published for `feeYear` are grown by `feeIncrease` per year to reach
 * the student's start year. When the programme is cohort-locked, the fee
 * stays fixed from the start year onwards; otherwise it keeps growing each
 * year of study.
 */
export function calculate(input: CalcInput): CalcResult {
  const { programme, residency, startYear, feeIncrease } = input;
  const durationYears = input.durationYears ?? programme.durationYears;
  const { tier, fees } = pickTier(programme, residency);

  const years: YearBreakdown[] = [];
  let projected = false;
  for (let y = 0; y < Math.ceil(durationYears); y++) {
    const academicYear = startYear + y;
    const yearsAhead = programme.cohortLocked
      ? startYear - programme.feeYear
      : academicYear - programme.feeYear;
    const growth = Math.pow(1 + feeIncrease, Math.max(0, yearsAhead));
    if (yearsAhead > 0) projected = true;

    const fraction = Math.min(1, durationYears - y);
    const tuition = fees.annualTuition * fraction * growth;
    const compulsoryFees = fees.annualCompulsoryFees * fraction * growth;
    const oneOffFees = y === 0 ? fees.oneOffFees * growth : 0;
    years.push({
      academicYear,
      fraction,
      tuition,
      compulsoryFees,
      oneOffFees,
      total: tuition + compulsoryFees + oneOffFees,
    });
  }

  return {
    tier,
    durationYears,
    projected,
    years,
    totalLocal: years.reduce((sum, y) => sum + y.total, 0),
  };
}

/** Converts an amount in `currency` to SGD. Rates are units of currency per 1 SGD. */
export function toSgd(amount: number, currency: string, fx: FxRates): number {
  if (currency === "SGD") return amount;
  const rate = fx.rates[currency];
  if (!rate) throw new Error(`No exchange rate for ${currency}`);
  return amount / rate;
}

/** True when a fee entry has not been checked for more than `maxAgeDays`. */
export function isStale(lastVerified: string, today: Date, maxAgeDays = 365): boolean {
  const ageMs = today.getTime() - new Date(lastVerified).getTime();
  return ageMs > maxAgeDays * 24 * 60 * 60 * 1000;
}
