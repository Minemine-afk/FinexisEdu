import type { Country, Programme, Tier, University } from "./schema";

/** How a university's yearly fee increase was arrived at. */
export interface IncreaseEstimate {
  /** Yearly compound increase, e.g. 0.045 for 4.5%. */
  rate: number;
  /** Where the rate came from. */
  basis: "partner" | "university" | "country";
  /** Number of distinct fee series the university figure rests on. */
  series: number;
  /** Earliest and latest published fee years used. */
  from?: number;
  to?: number;
}

const MIN_RATE = 0;
const MAX_RATE = 0.15;
const MIN_SERIES = 2;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** The published tuition series for one programme and tier, oldest first. */
function tuitionSeries(p: Programme, tier: Tier): [number, number][] {
  const points = new Map<number, number>();
  for (const h of p.feeHistory)
    if (h.tier === tier) points.set(h.feeYear, h.annualTuition);
  const current = p.fees[tier];
  if (current) points.set(p.feeYear, current.annualTuition);
  return [...points.entries()].sort((a, b) => a[0] - b[0]);
}

/**
 * A university's own yearly fee increase for a tier: the median compound
 * growth of each of its published tuition series (one per programme, identical
 * series counted once) from the earliest to the latest published year. Mirrors
 * the scraper's country-level estimator, applied to one university.
 *
 * Falls back to the country's typical rate when the university has fewer than
 * two distinct series with two or more years for that tier, so a single
 * one-off change (a policy jump at one programme) cannot set the rate.
 *
 * For an institution that teaches partner universities' degrees (SIM), pass the
 * partner id: that partner's programmes are tried first, then the whole
 * institution, then the country.
 */
export function universityIncrease(
  university: University,
  tier: Tier,
  country: Country | undefined,
  partner?: string,
): IncreaseEstimate {
  if (partner) {
    const own = programmeIncrease(
      university.programmes.filter((p) => p.partner === partner),
      tier,
    );
    if (own) return { ...own, basis: "partner" };
  }
  const all = programmeIncrease(university.programmes, tier);
  if (all) return all;
  const rate =
    country?.feeIncreaseByTier?.[tier] ?? country?.defaultFeeIncrease ?? 0.03;
  return { rate, basis: "country", series: 0 };
}

function programmeIncrease(
  programmes: Programme[],
  tier: Tier,
): IncreaseEstimate | undefined {
  const seen = new Set<string>();
  const growth: number[] = [];
  let from = Infinity;
  let to = -Infinity;
  for (const p of programmes) {
    const series = tuitionSeries(p, tier);
    if (series.length < 2) continue;
    const key = JSON.stringify(series);
    if (seen.has(key)) continue;
    seen.add(key);
    const [y0, a] = series[0];
    const [y1, b] = series[series.length - 1];
    if (y1 <= y0 || a <= 0) continue;
    growth.push(Math.pow(b / a, 1 / (y1 - y0)) - 1);
    from = Math.min(from, y0);
    to = Math.max(to, y1);
  }
  if (growth.length >= MIN_SERIES) {
    const rate = Math.min(MAX_RATE, Math.max(MIN_RATE, median(growth)));
    return {
      rate: Math.round(rate * 1000) / 1000,
      basis: "university",
      series: growth.length,
      from,
      to,
    };
  }
  return undefined;
}
