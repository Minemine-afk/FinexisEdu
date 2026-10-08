import { describe, expect, it } from "vitest";
import fallback from "@/data/fx-fallback.json";
import { loadCountries, loadUniversities } from "./data";
import { FX_CURRENCIES } from "./fx";
import { COUNTRY_CODES, FxRates } from "./schema";

// Guards the committed data, including every scraper PR.
describe("committed data", () => {
  const universities = loadUniversities();
  const countries = loadCountries();

  it("passes schema validation", () => {
    expect(universities.length).toBeGreaterThan(0);
    expect(countries.map((c) => c.code).sort()).toEqual([...COUNTRY_CODES].sort());
  });

  it("describes every university and why it is included", () => {
    for (const u of universities) {
      expect(u.website, u.id).toBeTruthy();
      expect(u.description, u.id).toBeTruthy();
      expect(u.whyIncluded, u.id).toBeTruthy();
    }
  });

  it("gives every fee and living-cost estimate a short plain-English summary", () => {
    const banned = /https?:|capture|proxy|jina|wayback|crawl|CC-MAIN|—/i;
    for (const u of universities) {
      for (const p of u.programmes) {
        const id = `${u.id}: ${p.name}`;
        expect(p.summary, id).toBeTruthy();
        expect(p.summary!.length, id).toBeLessThanOrEqual(240);
        expect(p.summary, id).not.toMatch(banned);
      }
      if (u.livingCosts) {
        expect(u.livingCosts.summary, u.id).toBeTruthy();
        expect(u.livingCosts.summary, u.id).not.toMatch(banned);
      }
    }
  });

  it("says whether every law and medicine degree is on the SILE or SMC list", () => {
    for (const u of universities) {
      for (const p of u.programmes) {
        const id = `${u.id}: ${p.name}`;
        if (p.field === "law") expect(p.sgRecognition?.body, id).toBe("SILE");
        else if (p.field === "medicine") expect(p.sgRecognition?.body, id).toBe("SMC");
        else expect(p.sgRecognition, id).toBeUndefined();
      }
    }
  });

  it("names a known partner on every programme of a university with partners", () => {
    for (const u of universities) {
      const ids = new Set((u.partners ?? []).map((p) => p.id));
      expect(ids.size, u.id).toBe((u.partners ?? []).length);
      for (const p of u.programmes) {
        const id = `${u.id}: ${p.name}`;
        if (u.partners) expect(ids.has(p.partner ?? ""), id).toBe(true);
        else expect(p.partner, id).toBeUndefined();
      }
      for (const partner of u.partners ?? []) {
        expect(u.programmes.some((p) => p.partner === partner.id), `${u.id}: ${partner.id} has no programmes`).toBe(true);
      }
    }
  });

  it("lists majors as a non-empty set of distinct names", () => {
    for (const u of universities) {
      for (const p of u.programmes) {
        if (!p.majors) continue;
        const id = `${u.id}: ${p.name}`;
        expect(p.majors.length, id).toBeGreaterThan(0);
        expect(new Set(p.majors).size, id).toBe(p.majors.length);
      }
    }
  });

  it("has unique university ids", () => {
    const ids = universities.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("quotes fees in the country's currency", () => {
    const currency = new Map(countries.map((c) => [c.code, c.currency]));
    for (const u of universities) expect(u.currency, u.id).toBe(currency.get(u.country));
  });

  it("only has citizen and PR rates at Singapore universities", () => {
    for (const u of universities.filter((u) => u.country !== "sg")) {
      for (const p of u.programmes) expect(p.fees.citizen ?? p.fees.pr, `${u.id}: ${p.name}`).toBeUndefined();
    }
  });

  it("has at most one history entry per year and tier, all before the current fee year", () => {
    for (const u of universities) {
      for (const p of u.programmes) {
        const seen = new Set<string>();
        for (const h of p.feeHistory) {
          const key = `${h.feeYear}:${h.tier}`;
          expect(seen.has(key), `${u.id}: ${p.name} duplicate ${key}`).toBe(false);
          seen.add(key);
          expect(h.feeYear, `${u.id}: ${p.name}`).toBeLessThan(p.feeYear);
          if (u.country !== "sg") expect(h.tier, `${u.id}: ${p.name}`).toBe("international");
        }
      }
    }
  });

  it("has a fallback rate for every currency", () => {
    const fx = FxRates.parse(fallback);
    for (const c of FX_CURRENCIES) expect(fx.rates[c], c).toBeGreaterThan(0);
  });
});
