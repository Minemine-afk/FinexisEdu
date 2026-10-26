import type { Country, Programme, Tier, University } from "./schema";
import { SETTINGS } from "./settings";

/** How a university's yearly fee increase was arrived at. */
export interface IncreaseEstimate {
  /** Yearly compound increase, e.g. 0.045 for 4.5%. */
  rate: number;
  /** Where the rate came from: "stated" is a rate set by hand in the university file. */
  basis: "partner" | "university" | "country" | "stated";
  /** Number of distinct fee series the university figure rests on. */
  series: number;
  /** Earliest and latest published fee years used. */
  from?: number;
  to?: number;
  /** Why a "stated" rate was set by hand. */
  reason?: string;
}

const MIN_RATE = 0;
const MAX_RATE = SETTINGS.maxFeeIncrease;
const MIN_SERIES = 2;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function tierPoints(p: Programme, tier: Tier): Map<number, number> {
  const points = new Map<number, number>();
  for (const h of p.feeHistory)
    if (h.tier === tier) points.set(h.feeYear, h.annualTuition);
  const current = p.fees[tier];
  if (current) points.set(p.feeYear, current.annualTuition);
  return points;
}

/**
 * The published tuition series for one programme and tier, oldest first.
 *
 * A citizen or PR fee is often the international fee less a subsidy. When that
 * subsidy was cut by a twentieth of the fee or more and has held steady since
 * (NIE's self-financed master's in 2025), the cut is a one-off rather than a
 * yearly trend, so only the years since are kept. A cut in the latest fee year
 * leaves that year alone, too short to show a trend, so the series is skipped.
 */
function tuitionSeries(p: Programme, tier: Tier): [number, number][] {
  const points = tierPoints(p, tier);
  if (tier !== "international") {
    const intl = tierPoints(p, "international");
    const gap = (y: number) => (intl.get(y) ?? NaN) - (points.get(y) ?? NaN);
    const now = gap(p.feeYear);
    if (Number.isFinite(now)) {
      const years = [...points.keys()].filter((y) => intl.has(y)).sort((a, b) => b - a);
      let from = p.feeYear;
      let changed = false;
      for (const y of years) {
        if (Math.abs(gap(y) - now) > 1) {
          // Only a subsidy cut of a twentieth of the fee or more counts as a one-off.
          changed = gap(y) - now > 0.05 * (intl.get(p.feeYear) ?? Infinity);
          break;
        }
        from = y;
      }
      if (changed && from <= p.feeYear)
        for (const y of [...points.keys()]) if (y < from) points.delete(y);
    }
  }
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
  if (university.feeIncrease)
    return { rate: university.feeIncrease.rate, basis: "stated", series: 0, reason: university.feeIncrease.reason };
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
    country?.feeIncreaseByTier?.[tier] ?? country?.defaultFeeIncrease ?? SETTINGS.fallbackFeeIncrease;
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
