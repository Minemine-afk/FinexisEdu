import { describe, expect, it } from "vitest";
import { calculate, feesForYear, hasRateFor, isStale, pickTier, toSgd } from "./calc";
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
