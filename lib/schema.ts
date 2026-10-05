import { z } from "zod";

// Mirrors scrapers/models.py. Keep the two in sync; see data/SCHEMA.md.

export const COUNTRY_CODES = [
  "sg",
  "uk",
  "au",
  "us",
  "de",
  "ca",
  "nz",
  "ch",
  "jp",
  "ie",
] as const;
export const LEVELS = ["bachelor", "master"] as const;
export const FIELDS = [
  "engineering",
  "computing",
  "business",
  "sciences",
  "arts",
  "law",
  "medicine",
  "psychology",
  "nursing",
] as const;
export const TIERS = ["citizen", "pr", "international"] as const;

export const CountryCode = z.enum(COUNTRY_CODES);
export const Level = z.enum(LEVELS);
export const Field = z.enum(FIELDS);
export const Tier = z.enum(TIERS);

const money = z.number().nonnegative();

export const FeeTier = z.object({
  annualTuition: money,
  annualCompulsoryFees: money.default(0),
  oneOffFees: money.default(0),
});

export const FeeHistoryEntry = z.object({
  feeYear: z.number().int(),
  tier: Tier,
  annualTuition: money,
  // Omitted when only tuition was published; the calculator then uses current values.
  annualCompulsoryFees: money.optional(),
  oneOffFees: money.optional(),
  sourceUrl: z.url().optional(),
});

// A university whose degree another institution teaches (e.g. SIM Global Education's partners).
export const Partner = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  country: z.string().min(1),
  website: z.url().optional(),
  description: z.string().min(1).optional(),
});

export const Programme = z.object({
  /** Id of the awarding partner in the university's `partners`, where it has any. */
  partner: z.string().optional(),
  level: Level,
  field: Field,
  name: z.string().min(1),
  durationYears: z.number().positive().max(8),
  feeYear: z.number().int().min(2015).max(2100),
  fees: z.object({
    citizen: FeeTier.optional(),
    pr: FeeTier.optional(),
    international: FeeTier,
  }),
  sourceUrl: z.url(),
  lastVerified: z.iso.date(),
  sourceType: z.enum(["official", "secondary"]).default("official"),
  cohortLocked: z.boolean().default(false),
  /** False when the university does not admit international students to this programme. */
  internationalEligible: z.boolean().default(true),
  /** One or two plain-English sentences for parents: what the fee covers and any caveat. */
  summary: z.string().max(280).optional(),
  /** Detailed source and method notes for maintainers; not shown on the site. */
  notes: z.string().optional(),
  feeHistory: z.array(FeeHistoryEntry).default([]),
});

export const LIVING_CATEGORIES = [
  "housing",
  "food",
  "transport",
  "personal",
] as const;
export const LivingCategory = z.enum(LIVING_CATEGORIES);

// The university's own estimate of a student's living costs, in its currency.
export const LivingCosts = z.object({
  year: z.number().int().min(2015).max(2100),
  // Months per academic year the estimate covers (e.g. 9 for a US academic year).
  months: z.number().positive().max(12),
  monthly: z.object({
    housing: money,
    food: money,
    transport: money,
    personal: money,
  }),
  sourceUrl: z.url(),
  lastVerified: z.iso.date(),
  sourceType: z.enum(["official", "secondary"]).default("official"),
  /** One or two plain-English sentences for parents about the estimate. */
  summary: z.string().max(280).optional(),
  notes: z.string().optional(),
});

export const University = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  country: CountryCode,
  city: z.string().min(1),
  currency: z.string().length(3),
  website: z.url().optional(),
  /** One or two sentences on what the university is (shown on hover over its name). */
  description: z.string().min(1).optional(),
  /** Why it is in the calculator, e.g. evidence of Singaporean enrolment or recognition. */
  whyIncluded: z.string().min(1).optional(),
  livingCosts: LivingCosts.optional(),
  /** Awarding universities, when this institution teaches other universities' degrees. */
  partners: z.array(Partner).optional(),
  programmes: z.array(Programme),
});

export const Country = z.object({
  code: CountryCode,
  name: z.string(),
  currency: z.string().length(3),
  defaultFeeIncrease: z.number().min(0).max(0.5),
  // Observed per-tier rates, where fee history allows (e.g. Singapore Citizen vs international).
  feeIncreaseByTier: z
    .partialRecord(Tier, z.number().min(0).max(0.5))
    .optional(),
  // Yearly growth applied to living costs after their estimate year (latest official CPI inflation).
  livingCostIncrease: z.number().min(0).max(0.5).optional(),
});

export const FxRates = z.object({
  base: z.literal("SGD"),
  date: z.iso.date(),
  // Units of each currency per 1 SGD, as returned by Frankfurter.
  rates: z.record(z.string(), z.number().positive()),
});

export type CountryCode = z.infer<typeof CountryCode>;
export type Level = z.infer<typeof Level>;
export type Field = z.infer<typeof Field>;
export type Tier = z.infer<typeof Tier>;
export type FeeTier = z.infer<typeof FeeTier>;
export type FeeHistoryEntry = z.infer<typeof FeeHistoryEntry>;
export type Partner = z.infer<typeof Partner>;
export type Programme = z.infer<typeof Programme>;
export type LivingCategory = z.infer<typeof LivingCategory>;
export type LivingCosts = z.infer<typeof LivingCosts>;
export type University = z.infer<typeof University>;
export type Country = z.infer<typeof Country>;
export type FxRates = z.infer<typeof FxRates>;
