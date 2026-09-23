import { describe, expect, it } from "vitest";
import fallback from "@/data/fx-fallback.json";
import { loadCountries, loadUniversities } from "./data";
import { FX_CURRENCIES } from "./fx";
import { FxRates } from "./schema";

// Guards the committed data, including every scraper PR.
describe("committed data", () => {
  const universities = loadUniversities();
  const countries = loadCountries();

  it("passes schema validation", () => {
    expect(universities.length).toBeGreaterThan(0);
    expect(countries).toHaveLength(7);
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

  it("has a fallback rate for every currency", () => {
    const fx = FxRates.parse(fallback);
    for (const c of FX_CURRENCIES) expect(fx.rates[c], c).toBeGreaterThan(0);
  });
});
