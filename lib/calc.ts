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
  /** "history": an earlier year's published fee; "current": the latest published fee; "projected": grown from it. */
  basis: "history" | "current" | "projected";
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
  /** True when an earlier year's tuition was published without its other fees, so current ones were used. */
  otherFeesFromCurrent: boolean;
  /**
   * Years whose fee is needed but not on file (only possible before the current
   * fee year). When non-empty, `years` and `totalLocal` are incomplete and must
   * not be shown as a total.
   */
  missingYears: number[];
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

export interface YearFees {
  fees: FeeTier;
  /** Years after the latest published fee year; above 0 means the fee must be projected. */
  yearsAhead: number;
  fromHistory: boolean;
  otherFeesFromCurrent: boolean;
}

/**
 * The fee for `year`: the current published fee (years ahead of it are
 * projected by the caller), or for earlier years the published history entry.
 * Returns null when an earlier year has no published figure; the calculator
 * never estimates the past.
 */
export function feesForYear(programme: Programme, tier: Tier, year: number): YearFees | null {
  const current = programme.fees[tier] ?? programme.fees.international;
  if (year >= programme.feeYear) {
    return { fees: current, yearsAhead: year - programme.feeYear, fromHistory: false, otherFeesFromCurrent: false };
  }
  const h = programme.feeHistory.find((e) => e.feeYear === year && e.tier === tier);
  if (!h) return null;
  const otherFeesFromCurrent =
    (h.annualCompulsoryFees === undefined && current.annualCompulsoryFees > 0) ||
    (h.oneOffFees === undefined && current.oneOffFees > 0);
  return {
    fees: {
      annualTuition: h.annualTuition,
      annualCompulsoryFees: h.annualCompulsoryFees ?? current.annualCompulsoryFees,
      oneOffFees: h.oneOffFees ?? current.oneOffFees,
    },
    yearsAhead: 0,
    fromHistory: true,
    otherFeesFromCurrent,
  };
}

/**
 * Total university fees for a programme, in the university's own currency.
 *
 * Cohort-locked programmes charge the start year's fee for the whole degree;
 * others charge each academic year's fee. Years up to the latest published fee
 * year use published figures (current or `feeHistory`); later years grow the
 * latest fee by `feeIncrease` per year.
 */
export function calculate(input: CalcInput): CalcResult {
  const { programme, residency, startYear, feeIncrease } = input;
  const durationYears = input.durationYears ?? programme.durationYears;
  const { tier } = pickTier(programme, residency);

  const years: YearBreakdown[] = [];
  const missingYears: number[] = [];
  let projected = false;
  let otherFeesFromCurrent = false;
  for (let y = 0; y < Math.ceil(durationYears); y++) {
    const academicYear = startYear + y;
    const pricedYear = programme.cohortLocked ? startYear : academicYear;
    const yf = feesForYear(programme, tier, pricedYear);
    if (!yf) {
      missingYears.push(academicYear);
      continue;
    }
    const growth = Math.pow(1 + feeIncrease, yf.yearsAhead);
    if (yf.yearsAhead > 0) projected = true;
    if (yf.otherFeesFromCurrent && (yf.fees.annualCompulsoryFees > 0 || (y === 0 && yf.fees.oneOffFees > 0))) {
      otherFeesFromCurrent = true;
    }

    const fraction = Math.min(1, durationYears - y);
    const tuition = yf.fees.annualTuition * fraction * growth;
    const compulsoryFees = yf.fees.annualCompulsoryFees * fraction * growth;
    const oneOffFees = y === 0 ? yf.fees.oneOffFees * growth : 0;
    years.push({
      academicYear,
      fraction,
      basis: yf.fromHistory ? "history" : yf.yearsAhead > 0 ? "projected" : "current",
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
    otherFeesFromCurrent,
    missingYears,
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
