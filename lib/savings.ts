/**
 * Time-value-of-money maths for the savings planner: how much to save, or set
 * aside, to pay a university's projected costs, saving at a fixed low rate
 * compared with investing at a chosen return. Interest compounds monthly on a
 * nominal yearly rate, as on a financial calculator; deposits come at the end
 * of each month unless `startOfMonth` is set.
 */

/** The fixed "Saving at" rate, % a year: a typical base rate on a Singapore savings account. */
export const SAVING_RATE = 0.05;
/** The default "Investing at" rate, % a year, and the presets offered beside it. */
export const DEFAULT_INVEST_RATE = 4;
export const INVEST_PRESETS: [number, string][] = [
  [4, "Balanced"],
  [6, "Growth"],
];

/** Month the first fees fall due (0 = January): August in Singapore and the US, otherwise each country's usual intake. */
const INTAKE_MONTH: Record<string, number> = {
  sg: 7,
  us: 7,
  au: 1,
  nz: 1,
  jp: 3,
  de: 9,
};
export function defaultIntakeMonth(country: string): number {
  return INTAKE_MONTH[country] ?? 8;
}

export const monthlyRate = (ratePct: number) => ratePct / 100 / 12;
const growth = (i: number, n: number) => Math.pow(1 + i, n);
/** What 1 a month grows to after n months. */
function annuity(i: number, n: number, startOfMonth = false): number {
  if (i === 0) return n;
  return ((growth(i, n) - 1) / i) * (startOfMonth ? 1 + i : 1);
}

/** Whole months from one (year, month) to another; never negative. */
export function monthsBetween(
  from: { year: number; month: number },
  to: { year: number; month: number },
): number {
  return Math.max(0, (to.year - from.year) * 12 + (to.month - from.month));
}

export type Timing = "yearly" | "start";

/**
 * What must be saved by the day the first fees fall due. "yearly": each year's
 * costs are paid as they fall due, and what isn't spent yet keeps earning;
 * "start": the whole amount is needed on day one.
 */
export function neededAtStart(
  yearCosts: number[],
  ratePct: number,
  timing: Timing,
): number {
  const i = monthlyRate(ratePct);
  return yearCosts.reduce(
    (sum, cost, k) => sum + (timing === "start" ? cost : cost / growth(i, 12 * k)),
    0,
  );
}

/** The monthly saving that, on top of `saved`, reaches `target` in `months`. */
export function monthlySaving(
  target: number,
  saved: number,
  ratePct: number,
  months: number,
): number {
  const i = monthlyRate(ratePct);
  const short = target - saved * growth(i, months);
  if (short <= 0) return 0;
  if (months === 0) return Infinity;
  return short / annuity(i, months);
}

/** The one-off amount to set aside today, on top of `saved`, to reach `target`. */
export function lumpSum(
  target: number,
  saved: number,
  ratePct: number,
  months: number,
): number {
  return Math.max(0, target / growth(monthlyRate(ratePct), months) - saved);
}

/** What `saved` plus `monthly` each month grows to after `months`. */
export function growTo(
  saved: number,
  monthly: number,
  ratePct: number,
  months: number,
): number {
  const i = monthlyRate(ratePct);
  return saved * growth(i, months) + monthly * annuity(i, months);
}

/** The five boxes of "Work out any one". */
export interface Tvm {
  /** Number of months to save. */
  months: number;
  /** Interest earned, % a year. */
  rate: number;
  /** Starting amount. */
  start: number;
  /** Amount saved each month. */
  monthly: number;
  /** Amount needed at the end. */
  end: number;
  startOfMonth: boolean;
}
export type TvmField = "months" | "rate" | "start" | "monthly" | "end";

/**
 * Fills in `field` from the other four. Returns NaN when no answer exists, and
 * 0 for a month count, starting amount or monthly saving when what's there
 * already covers the end amount (a negative answer would mean taking money out).
 */
export function solveTvm(t: Tvm, field: TvmField): number {
  const i = monthlyRate(t.rate);
  const A = (n: number, r = i) => annuity(r, n, t.startOfMonth);
  const atLeastZero = (v: number) => (Number.isNaN(v) ? v : Math.max(0, v));
  switch (field) {
    case "end":
      return t.start * growth(i, t.months) + t.monthly * A(t.months);
    case "monthly": {
      const a = A(t.months);
      const short = t.end - t.start * growth(i, t.months);
      if (short <= 0) return 0;
      return a === 0 ? NaN : short / a;
    }
    case "start":
      return atLeastZero((t.end - t.monthly * A(t.months)) / growth(i, t.months));
    case "months": {
      if (t.end <= t.start) return 0;
      // Nothing coming in can never reach the end amount.
      if (t.start <= 0 && t.monthly <= 0) return NaN;
      if (i === 0) return t.monthly > 0 ? (t.end - t.start) / t.monthly : NaN;
      const c = (t.monthly * (t.startOfMonth ? 1 + i : 1)) / i;
      const ratio = (t.end + c) / (t.start + c);
      return ratio > 0 ? atLeastZero(Math.log(ratio) / Math.log(1 + i)) : NaN;
    }
    case "rate": {
      // The end amount rises with the rate, so bisect between 0% and 60% a year;
      // when 0% already reaches it, no interest is needed.
      const f = (r: number) =>
        t.start * growth(r, t.months) + t.monthly * A(t.months, r) - t.end;
      let lo = 0;
      let hi = 0.05;
      // Nothing put in, or no time: no rate makes a difference.
      if ((t.start === 0 && t.monthly === 0) || t.months <= 0) return NaN;
      if (f(lo) >= 0) return 0;
      if (f(hi) < 0) return NaN;
      for (let k = 0; k < 200; k++) {
        const mid = (lo + hi) / 2;
        if (f(mid) > 0) hi = mid;
        else lo = mid;
      }
      return ((lo + hi) / 2) * 1200;
    }
  }
}

export interface PlanPoint {
  /** Months from today. */
  month: number;
  /** Money put in so far. */
  paidIn: number;
  balance: number;
}
export interface PlanYear {
  year: number;
  paidIn: number;
  interest: number;
  costs: number;
  balance: number;
}
export interface Plan {
  points: PlanPoint[];
  years: PlanYear[];
  paidIn: number;
  interest: number;
}

/**
 * Month by month: `start` today, `monthly` each month for `months`, then each
 * year's costs come out when they fall due (all at once for "start"). The
 * balance keeps earning throughout. `today` is the (year, month) saving starts.
 */
export function simulate({
  start,
  monthly,
  months,
  ratePct,
  startOfMonth = false,
  yearCosts = [],
  timing = "yearly",
  today,
}: {
  start: number;
  monthly: number;
  months: number;
  ratePct: number;
  startOfMonth?: boolean;
  yearCosts?: number[];
  timing?: Timing;
  today: { year: number; month: number };
}): Plan {
  const i = monthlyRate(ratePct);
  const costs =
    timing === "start"
      ? [yearCosts.reduce((a, b) => a + b, 0)]
      : yearCosts;
  const last = months + 12 * Math.max(0, costs.length - 1);
  let balance = start;
  let paidIn = start;
  let interest = 0;
  const points: PlanPoint[] = [{ month: 0, paidIn, balance }];
  const years = new Map<number, PlanYear>();
  const yearOf = (m: number) => {
    const year = today.year + Math.floor((today.month + m) / 12);
    let row = years.get(year);
    if (!row) {
      row = { year, paidIn: 0, interest: 0, costs: 0, balance: 0 };
      years.set(year, row);
    }
    return row;
  };
  yearOf(0).paidIn += start;
  yearOf(0).balance = balance;
  // Fees due straight away (no months to save) come out of today's balance.
  if (months === 0 && costs.length > 0) {
    balance -= costs[0];
    yearOf(0).costs += costs[0];
    yearOf(0).balance = balance;
    points[0].balance = balance;
  }
  for (let m = 1; m <= last; m++) {
    const row = yearOf(m);
    const deposit = m <= months ? monthly : 0;
    if (startOfMonth) balance += deposit;
    const earned = balance * i;
    balance += earned;
    if (!startOfMonth) balance += deposit;
    paidIn += deposit;
    interest += earned;
    row.paidIn += deposit;
    row.interest += earned;
    if (m >= months && (m - months) % 12 === 0 && costs.length > 0) {
      const due = costs[(m - months) / 12] ?? 0;
      balance -= due;
      row.costs += due;
    }
    row.balance = balance;
    points.push({ month: m, paidIn, balance });
  }
  return { points, years: [...years.values()], paidIn, interest };
}
