import { z } from "zod";
import raw from "@/data/settings.json";

// Site-wide settings kept in data/settings.json so they can be changed without touching code.
// The file is bundled at build time; the build parses it (see app/page.tsx) so a bad value fails
// the build rather than reaching visitors.

/** Every hover term the components look up. Adding or removing one is a code change. */
export const GLOSSARY_TERMS = [
  "residency", "citizenRate", "prRate", "internationalRate", "startYear", "published", "projected",
  "feeIncrease", "universityIncrease", "statedIncrease", "noTuition", "cohortLocked", "compulsoryFees",
  "oneOffFees", "laterYears", "laterYearsEstimated", "sileListed", "sileNotListed", "smcListed",
  "smcNotListed", "otherFeesCurrent", "unofficialSource", "unofficialHistory", "outdated", "livingCosts",
  "lifestyle", "perYear", "totalSgd",
] as const;
export type GlossaryTerm = (typeof GLOSSARY_TERMS)[number];
const month = z.number().int().min(0).max(11);

/** Where rates come from for currencies the European Central Bank doesn't publish. */
export const OTHER_RATES_SOURCES = ["frankfurter", "imf"] as const;
export type OtherRatesSource = (typeof OTHER_RATES_SOURCES)[number];

export const Settings = z.strictObject({
  /** Countries in the order the pickers list them; countries not listed follow alphabetically. */
  countryOrder: z.array(z.string().regex(/^[a-z]{2}$/)).refine((xs) => new Set(xs).size === xs.length, "duplicate country"),
  /** Month the first fees fall due (0 = January), per country; others use defaultIntakeMonth. */
  intakeMonth: z.record(z.string().regex(/^[a-z]{2}$/), month),
  defaultIntakeMonth: month,
  /** How each lifestyle scales a university's own (moderate) living-cost estimate. */
  lifestyleMultiplier: z.strictObject({
    frugal: z.number().min(0.3).max(1),
    moderate: z.number().min(0.5).max(2),
    comfortable: z.number().min(1).max(3),
  }),
  /** Highest yearly fee increase the calculator will derive from a university's fee history. */
  maxFeeIncrease: z.number().min(0).max(0.5),
  /** Yearly fee increase used when neither the university nor its country gives one. */
  fallbackFeeIncrease: z.number().min(0).max(0.5),
  /** Yearly living-cost increase used when the country gives none. */
  fallbackLivingCostIncrease: z.number().min(0).max(0.5),
  /** Exchange rates for currencies the ECB lacks: central banks through Frankfurter (daily) or the IMF (month-end). */
  otherExchangeRates: z.enum(OTHER_RATES_SOURCES),
  /** Latest start year a visitor can pick. */
  maxStartYear: z.number().int().min(2030).max(2200),
  /** Hover explanations. The terms are fixed by the code; only the wording can change. */
  glossary: z.strictObject(
    Object.fromEntries(GLOSSARY_TERMS.map((k) => [k, z.string().trim().min(1).max(1000)])) as Record<
      GlossaryTerm,
      z.ZodString
    >,
  ),
});

export type Settings = z.infer<typeof Settings>;
/** The settings as committed. Typed from the schema; parsed for real by the build and the data tests. */
export const SETTINGS = raw as Settings;

/** Orders country codes as the pickers show them: the configured order first, then any others alphabetically. */
export function orderCountries<T extends string>(codes: Iterable<T>): T[] {
  const present = new Set(codes);
  const listed = SETTINGS.countryOrder.filter((c): c is T => present.has(c as T));
  const rest = [...present].filter((c) => !SETTINGS.countryOrder.includes(c)).sort();
  return [...listed, ...rest];
}
