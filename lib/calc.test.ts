import { describe, expect, it } from "vitest";
import { calculate, feesForYear, hasRateFor, isStale, laterYearFee, pickTier, toSgd } from "./calc";
import { Programme } from "./schema";

const nus = Programme.parse({
  level: "bachelor",
  field: "computing",
  name: "Bachelor of Computing",
  durationYears: 4,
  feeYear: 2025,
  fees: {
    citizen: { annualTuition: 10000, annualCompulsoryFees: 500 },
    pr: { annualTuition: 14000, annualCompulsoryFees: 500 },
    international: { annualTuition: 30000, annualCompulsoryFees: 500 },
  },
  sourceUrl: "https://example.edu/fees",
  lastVerified: "2026-01-01",
  cohortLocked: true,
});

const ucl = Programme.parse({
  level: "bachelor",
  field: "computing",
  name: "BSc Computer Science",
  durationYears: 3,
  feeYear: 2026,
  fees: { international: { annualTuition: 40000 } },
  sourceUrl: "https://example.ac.uk/fees",
  lastVerified: "2026-01-01",
});

const fx = { base: "SGD" as const, date: "2026-09-01", rates: { GBP: 0.5, JPY: 100 } };

describe("pickTier", () => {
  it("uses citizen and PR rates when the university has them", () => {
    expect(pickTier(nus, "citizen").fees.annualTuition).toBe(10000);
    expect(pickTier(nus, "pr").fees.annualTuition).toBe(14000);
  });

  it("falls back to the international rate abroad", () => {
    expect(pickTier(ucl, "citizen")).toMatchObject({ tier: "international" });
  });
});

describe("hasRateFor", () => {
  const intlOnly = Programme.parse({ ...nus, fees: { international: nus.fees.international } });

  it("requires citizen and PR rates at Singapore universities", () => {
    expect(hasRateFor("sg", nus, "citizen")).toBe(true);
    expect(hasRateFor("sg", intlOnly, "citizen")).toBe(false);
    expect(hasRateFor("sg", intlOnly, "international")).toBe(true);
  });

  it("uses international rates abroad", () => {
    expect(hasRateFor("uk", ucl, "citizen")).toBe(true);
  });
});

describe("calculate", () => {
  it("sums a 4-year Singapore degree at published fees", () => {
    const r = calculate({ programme: nus, currency: "SGD", residency: "citizen", startYear: 2025, feeIncrease: 0.05 });
    expect(r.years).toHaveLength(4);
    expect(r.totalLocal).toBe(4 * 10500);
    expect(r.projected).toBe(false);
  });

  it("locks the fee for the cohort once enrolled", () => {
    const r = calculate({ programme: nus, currency: "SGD", residency: "citizen", startYear: 2027, feeIncrease: 0.1 });
    const yearly = 10500 * 1.1 ** 2;
    r.years.forEach((y) => expect(y.total).toBeCloseTo(yearly));
    expect(r.projected).toBe(true);
  });

  it("raises fees every year when not cohort-locked", () => {
    const r = calculate({ programme: ucl, currency: "GBP", residency: "citizen", startYear: 2026, feeIncrease: 0.1 });
    expect(r.years.map((y) => y.total)).toEqual([40000, 44000, 40000 * 1.1 ** 2].map((n) => expect.closeTo(n)));
  });

  it("never estimates a past year that has no published fee", () => {
    const r = calculate({ programme: ucl, currency: "GBP", residency: "citizen", startYear: 2024, feeIncrease: 0.1 });
    expect(r.missingYears).toEqual([2024, 2025]);
    expect(r.years.map((y) => y.academicYear)).toEqual([2026]);
  });

  it("charges a partial final year for fractional durations", () => {
    const r = calculate({ programme: ucl, currency: "GBP", residency: "citizen", startYear: 2026, feeIncrease: 0, durationYears: 1.5 });
    expect(r.years.map((y) => y.fraction)).toEqual([1, 0.5]);
    expect(r.totalLocal).toBe(60000);
  });

  it("charges one-off fees only in the first year", () => {
    const jp = Programme.parse({ ...ucl, fees: { international: { annualTuition: 535800, oneOffFees: 282000 } } });
    const r = calculate({ programme: jp, currency: "JPY", residency: "international", startYear: 2026, feeIncrease: 0 });
    expect(r.years[0].oneOffFees).toBe(282000);
    expect(r.years[1].oneOffFees).toBe(0);
    expect(r.totalLocal).toBe(3 * 535800 + 282000);
  });
});

describe("later years of study with their own fee", () => {
  const mbchb = Programme.parse({
    ...ucl,
    name: "MBChB",
    durationYears: 6,
    feeYear: 2026,
    cohortLocked: false,
    fees: { international: { annualTuition: 32100, annualCompulsoryFees: 849 } },
    laterYears: [{ fromYear: 2, annualTuition: 86561 }],
  });

  it("charges each year of study its own published fee", () => {
    const r = calculate({ programme: mbchb, currency: "NZD", residency: "international", startYear: 2026, feeIncrease: 0 });
    expect(r.years.map((y) => y.tuition)).toEqual([32100, 86561, 86561, 86561, 86561, 86561]);
    expect(r.years.map((y) => y.compulsoryFees)).toEqual([849, 849, 849, 849, 849, 849]);
    expect(r.years.map((y) => y.laterYear)).toEqual([false, true, true, true, true, true]);
    expect(r.laterYearFees).toBe(true);
    expect(r.laterYearsEstimated).toBe(false);
  });

  it("projects later-year fees from the same fee year as the first year", () => {
    const r = calculate({ programme: mbchb, currency: "NZD", residency: "international", startYear: 2027, feeIncrease: 0.1 });
    expect(r.years[0].tuition).toBeCloseTo(32100 * 1.1);
    expect(r.years[1].tuition).toBeCloseTo(86561 * 1.21);
  });

  it("takes the latest entry at or before the year of study, per tier", () => {
    const p = Programme.parse({
      ...mbchb,
      laterYears: [
        { fromYear: 2, annualTuition: 40000 },
        { fromYear: 4, annualTuition: 60000, annualCompulsoryFees: 1000, estimate: true },
        { fromYear: 3, tier: "citizen", annualTuition: 1 },
      ],
    });
    const r = calculate({ programme: p, currency: "NZD", residency: "international", startYear: 2026, feeIncrease: 0 });
    expect(r.years.map((y) => y.tuition)).toEqual([32100, 40000, 40000, 60000, 60000, 60000]);
    expect(r.years[3].compulsoryFees).toBe(1000);
    expect(r.laterYearsEstimated).toBe(true);
  });

  it("prefers an entry for the student's tier over one for every tier in the same year", () => {
    const p = Programme.parse({
      ...mbchb,
      laterYears: [
        { fromYear: 2, annualTuition: 23020.8 },
        { fromYear: 2, tier: "citizen", annualTuition: 21582 },
        { fromYear: 2, tier: "pr", annualTuition: 21582 },
      ],
    });
    expect(laterYearFee(p, "citizen", 2)?.annualTuition).toBe(21582);
    expect(laterYearFee(p, "pr", 3)?.annualTuition).toBe(21582);
    expect(laterYearFee(p, "international", 2)?.annualTuition).toBe(23020.8);
  });

  it("reports no later-year fees for an ordinary programme", () => {
    const r = calculate({ programme: ucl, currency: "GBP", residency: "international", startYear: 2026, feeIncrease: 0 });
    expect(r.laterYearFees).toBe(false);
    expect(r.years.every((y) => !y.laterYear)).toBe(true);
  });
});

describe("past start years", () => {
  const nusWithHistory = Programme.parse({
    ...nus,
    feeYear: 2026,
    feeHistory: [
      { feeYear: 2024, tier: "citizen", annualTuition: 9000, annualCompulsoryFees: 450 },
      { feeYear: 2025, tier: "citizen", annualTuition: 9500 },
    ],
  });
  const uclWithHistory = Programme.parse({
    ...ucl,
    feeHistory: [{ feeYear: 2025, tier: "international", annualTuition: 38000 }],
  });

  it("charges a cohort-locked 2024 start its published 2024 fee for every year", () => {
    const r = calculate({ programme: nusWithHistory, currency: "SGD", residency: "citizen", startYear: 2024, feeIncrease: 0.1 });
    expect(r.missingYears).toEqual([]);
    expect(r.years.map((y) => y.total)).toEqual([9450, 9450, 9450, 9450]);
    expect(r.years.every((y) => y.basis === "history")).toBe(true);
    expect(r.projected).toBe(false);
  });

  it("uses current other fees when history only has tuition, and says so", () => {
    const r = calculate({ programme: nusWithHistory, currency: "SGD", residency: "citizen", startYear: 2025, feeIncrease: 0 });
    expect(r.years[0].total).toBe(9500 + 500);
    expect(r.otherFeesFromCurrent).toBe(true);
  });

  it("mixes published history, current and projected years when fees are not locked", () => {
    const r = calculate({ programme: uclWithHistory, currency: "GBP", residency: "international", startYear: 2025, feeIncrease: 0.1 });
    expect(r.years.map((y) => y.basis)).toEqual(["history", "current", "projected"]);
    expect(r.years.map((y) => y.total)).toEqual([38000, 40000, expect.closeTo(44000)]);
  });

  it("with strictTier, uses a Singapore citizen's history but never the international rate", () => {
    const intlNow = Programme.parse({
      ...nus,
      feeYear: 2026,
      fees: { international: nus.fees.international },
      feeHistory: [{ feeYear: 2025, tier: "citizen", annualTuition: 8250 }],
    });
    const past = calculate({ programme: intlNow, currency: "SGD", residency: "citizen", startYear: 2025, feeIncrease: 0, strictTier: true });
    expect(past.missingYears).toEqual([]);
    expect(past.years[0].tuition).toBe(8250);
    const now = calculate({ programme: intlNow, currency: "SGD", residency: "citizen", startYear: 2026, feeIncrease: 0, strictTier: true });
    expect(now.missingYears).toEqual([2026]);
  });

  it("looks history up by tier", () => {
    expect(feesForYear(nusWithHistory, "pr", 2024)).toBeNull();
    expect(feesForYear(nusWithHistory, "citizen", 2024)?.fees.annualTuition).toBe(9000);
  });
});

describe("toSgd", () => {
  it("converts using units-per-SGD rates", () => {
    expect(toSgd(100, "GBP", fx)).toBe(200);
    expect(toSgd(100, "SGD", fx)).toBe(100);
  });

  it("throws for a missing currency", () => {
    expect(() => toSgd(1, "EUR", fx)).toThrow(/EUR/);
  });
});

describe("isStale", () => {
  it("flags entries older than a year", () => {
    const today = new Date("2026-09-23");
    expect(isStale("2025-09-01", today)).toBe(true);
    expect(isStale("2026-01-01", today)).toBe(false);
  });
});
