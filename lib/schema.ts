import { z } from "zod";

// Mirrors scrapers/models.py. Keep the two in sync; see data/SCHEMA.md.

export const COUNTRY_CODES = ["sg", "uk", "au", "us", "ca", "nz", "jp"] as const;
export const LEVELS = ["bachelor", "master"] as const;
export const FIELDS = ["engineering", "computing", "business", "sciences", "arts"] as const;
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

export const Programme = z.object({
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
  notes: z.string().optional(),
  feeHistory: z.array(FeeHistoryEntry).default([]),
});

export const University = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  country: CountryCode,
  city: z.string().min(1),
  currency: z.string().length(3),
  website: z.url().optional(),
  programmes: z.array(Programme),
});

export const Country = z.object({
  code: CountryCode,
  name: z.string(),
  currency: z.string().length(3),
  defaultFeeIncrease: z.number().min(0).max(0.5),
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
export type Programme = z.infer<typeof Programme>;
export type University = z.infer<typeof University>;
export type Country = z.infer<typeof Country>;
export type FxRates = z.infer<typeof FxRates>;
