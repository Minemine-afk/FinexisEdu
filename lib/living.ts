import type { LivingCategory, LivingCosts } from "./schema";

export type Lifestyle = "frugal" | "moderate" | "comfortable";

/** How each lifestyle scales the university's own (moderate) estimate. */
export const LIFESTYLE_MULTIPLIER: Record<Lifestyle, number> = {
  frugal: 0.8,
  moderate: 1,
  comfortable: 1.3,
};

export type MonthlyLiving = Record<LivingCategory, number>;

export interface LivingInput {
  living: LivingCosts;
  /** Academic years of study with the share of each year charged (from the fee calculation). */
  years: { academicYear: number; fraction: number }[];
  lifestyle: Lifestyle;
  /** Yearly growth after the estimate year, e.g. 0.03 for 3%. */
  increase: number;
  /** The student's own monthly amounts. When set, they replace the estimate and the lifestyle scaling. */
  custom?: MonthlyLiving;
}

export interface LivingYear {
  academicYear: number;
  amount: number;
  projected: boolean;
}

export function monthlyTotal(m: MonthlyLiving): number {
  return m.housing + m.food + m.transport + m.personal;
}

/**
 * Living costs for each year of study, in the university's currency: the
 * monthly budget x the months the estimate covers, grown by `increase` for
 * years after the estimate year. Earlier years use the estimate as published.
 */
export function livingCostsByYear({ living, years, lifestyle, increase, custom }: LivingInput): LivingYear[] {
  const perMonth = custom ? monthlyTotal(custom) : monthlyTotal(living.monthly) * LIFESTYLE_MULTIPLIER[lifestyle];
  const perYear = perMonth * living.months;
  return years.map(({ academicYear, fraction }) => {
    const ahead = Math.max(0, academicYear - living.year);
    return {
      academicYear,
      amount: perYear * fraction * Math.pow(1 + increase, ahead),
      projected: ahead > 0,
    };
  });
}
