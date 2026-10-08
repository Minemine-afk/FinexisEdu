import { describe, expect, it } from "vitest";
import { loadCountries, loadUniversities } from "./data";
import { universityIncrease } from "./increase";
import type { Country, University } from "./schema";

const country: Country = {
  code: "uk",
  name: "United Kingdom",
  currency: "GBP",
  defaultFeeIncrease: 0.05,
};

function uni(programmes: University["programmes"]): University {
  return {
    id: "test",
    name: "Test University",
    country: "uk",
    city: "Testville",
    currency: "GBP",
    website: "https://example.com",
    description: "A university.",
    whyIncluded: "Testing.",
    programmes,
  };
}

const base = {
  level: "bachelor" as const,
  field: "computing" as const,
  durationYears: 3,
  sourceUrl: "https://example.com/fees",
  lastVerified: "2026-10-01",
  sourceType: "official" as const,
  cohortLocked: false,
  internationalEligible: true,
  laterYears: [],
};

describe("universityIncrease", () => {
  it("uses the compound growth of the university's own fee series", () => {
    const u = uni([
      {
        ...base,
        name: "BSc A",
        feeYear: 2026,
        fees: {
          international: {
            annualTuition: 44100,
            annualCompulsoryFees: 0,
            oneOffFees: 0,
          },
        },
        feeHistory: [
          { feeYear: 2024, tier: "international", annualTuition: 40000 },
        ],
      },
      {
        ...base,
        name: "BSc B",
        feeYear: 2026,
        fees: {
          international: {
            annualTuition: 22050,
            annualCompulsoryFees: 0,
            oneOffFees: 0,
          },
        },
        feeHistory: [
          { feeYear: 2024, tier: "international", annualTuition: 20000 },
        ],
      },
    ]);
    const e = universityIncrease(u, "international", country);
    expect(e.basis).toBe("university");
    expect(e.rate).toBeCloseTo(0.05, 3); // 40000 -> 44100 over two years
    expect(e.from).toBe(2024);
    expect(e.to).toBe(2026);
    expect(e.series).toBe(2);
  });

  it("counts identical series once and takes the median across programmes", () => {
    const mk = (name: string, now: number, then: number) => ({
      ...base,
      name,
      feeYear: 2026,
      fees: {
        international: {
          annualTuition: now,
          annualCompulsoryFees: 0,
          oneOffFees: 0,
        },
      },
      feeHistory: [
        { feeYear: 2025, tier: "international" as const, annualTuition: then },
      ],
    });
    const u = uni([
      mk("A", 110, 100),
      mk("A again", 110, 100),
      mk("B", 102, 100),
      mk("C", 104, 100),
    ]);
    const e = universityIncrease(u, "international", country);
    expect(e.series).toBe(3);
    expect(e.rate).toBeCloseTo(0.04, 3);
  });

  it("falls back to the country rate with fewer than two fee series", () => {
    const u = uni([
      {
        ...base,
        name: "BSc A",
        feeYear: 2026,
        fees: {
          international: {
            annualTuition: 44100,
            annualCompulsoryFees: 0,
            oneOffFees: 0,
          },
        },
        feeHistory: [
          { feeYear: 2024, tier: "international", annualTuition: 20000 },
        ],
      },
    ]);
    const e = universityIncrease(u, "international", country);
    expect(e).toEqual({ rate: 0.05, basis: "country", series: 0 });
  });

  it("uses the partner's own series first, then the whole institution", () => {
    const mk = (name: string, partner: string, now: number, then: number) => ({
      ...base,
      name,
      partner,
      feeYear: 2026,
      fees: {
        international: {
          annualTuition: now,
          annualCompulsoryFees: 0,
          oneOffFees: 0,
        },
      },
      feeHistory: [
        { feeYear: 2025, tier: "international" as const, annualTuition: then },
      ],
    });
    const u = uni([
      mk("A1", "a", 110, 100),
      mk("A2", "a", 112, 100),
      mk("B1", "b", 102, 100),
      mk("B2", "b", 104, 100),
      mk("C1", "c", 101, 100),
    ]);
    const a = universityIncrease(u, "international", country, "a");
    expect(a.basis).toBe("partner");
    expect(a.rate).toBeCloseTo(0.11, 3);
    // Partner "c" has one series, so the whole institution's median is used.
    const c = universityIncrease(u, "international", country, "c");
    expect(c.basis).toBe("university");
    expect(c.rate).toBeCloseTo(0.04, 3);
  });

  it("produces a sane rate for every university in the data", () => {
    const countries = new Map(loadCountries().map((c) => [c.code, c]));
    for (const u of loadUniversities()) {
      const e = universityIncrease(
        u,
        "international",
        countries.get(u.country),
      );
      expect(e.rate, u.id).toBeGreaterThanOrEqual(0);
      expect(e.rate, u.id).toBeLessThanOrEqual(0.15);
    }
  });
});
