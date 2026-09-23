import { describe, expect, it } from "vitest";
import { livingCostsByYear, monthlyTotal } from "./living";
import { LivingCosts } from "./schema";

const living = LivingCosts.parse({
  year: 2026,
  months: 9,
  monthly: { housing: 1000, food: 400, transport: 100, personal: 200 },
  sourceUrl: "https://example.edu/cost",
  lastVerified: "2026-09-01",
});
const years = [
  { academicYear: 2026, fraction: 1 },
  { academicYear: 2027, fraction: 1 },
  { academicYear: 2028, fraction: 0.5 },
];

describe("livingCostsByYear", () => {
  it("multiplies the monthly budget by the months covered", () => {
    const r = livingCostsByYear({ living, years, lifestyle: "moderate", increase: 0 });
    expect(r.map((y) => y.amount)).toEqual([1700 * 9, 1700 * 9, 1700 * 9 * 0.5]);
  });

  it("scales by lifestyle", () => {
    const [frugal] = livingCostsByYear({ living, years, lifestyle: "frugal", increase: 0 });
    const [comfy] = livingCostsByYear({ living, years, lifestyle: "comfortable", increase: 0 });
    expect(frugal.amount).toBeCloseTo(1700 * 9 * 0.8);
    expect(comfy.amount).toBeCloseTo(1700 * 9 * 1.3);
  });

  it("grows costs after the estimate year only", () => {
    const r = livingCostsByYear({ living, years, lifestyle: "moderate", increase: 0.1 });
    expect(r[0]).toMatchObject({ amount: 15300, projected: false });
    expect(r[1].amount).toBeCloseTo(15300 * 1.1);
    expect(r[1].projected).toBe(true);
    const earlier = livingCostsByYear({ living, years: [{ academicYear: 2024, fraction: 1 }], lifestyle: "moderate", increase: 0.1 });
    expect(earlier[0]).toMatchObject({ amount: 15300, projected: false });
  });

  it("uses the student's own amounts without lifestyle scaling", () => {
    const custom = { housing: 500, food: 300, transport: 50, personal: 50 };
    const [y] = livingCostsByYear({ living, years, lifestyle: "comfortable", increase: 0, custom });
    expect(y.amount).toBe(monthlyTotal(custom) * 9);
  });
});
