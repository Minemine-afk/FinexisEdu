import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { University } from "@/lib/schema";
import { approveChange, getChange, openForEditing, sendChange, undoLastChange } from "./changes";
import { FakeGitHub } from "./fake-github";
import { parseSources } from "./registry";
import { addCountry, addUniversity, removeCountry, removeUniversity } from "./structure";

const files = (paths: string[]) => Object.fromEntries(paths.map((p) => [p, fs.readFileSync(p, "utf8")]));
let github: FakeGitHub;
const live = (path: string) => github.filesAt("main").get(path);
const json = (path: string) => JSON.parse(live(path)!);

beforeEach(() => {
  github = new FakeGitHub(
    files([
      "data/universities/sg/nus.json",
      "data/universities/sg/ntu.json",
      "data/universities/au/unsw.json",
      "scrapers/registry.d/unsw.yaml",
      "data/countries/sg.json",
      "data/countries/au.json",
      "data/settings.json",
      "data/rationale.json",
      "data/fx-fallback.json",
      "scrapers/registry.yaml",
      "scrapers/registry.d/nus.yaml",
    ]),
  );
  vi.stubEnv("EDITOR_GITHUB_TOKEN", "test-token");
  vi.stubGlobal("fetch", async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    if (url.hostname === "api.frankfurter.dev") return Response.json({ date: "2026-10-26", rates: { AUD: 1.12 } });
    if (url.hostname === "api.imf.org") {
      // Only Hong Kong has a rate; 7.4375 HKD and 1.25 SGD per US dollar make 5.95 HKD per SGD.
      const rows = ["COUNTRY,INDICATOR,TYPE_OF_TRANSFORMATION,FREQUENCY,TIME_PERIOD,OBS_VALUE", "SGP,XDC_USD,EOP_RT,M,2026-M09,1.25"];
      if (url.pathname.includes("+HKG.")) rows.push("HKG,XDC_USD,EOP_RT,M,2026-M09,7.4375");
      return new Response(rows.join("\n"));
    }
    const [status, body] = github.handle(init.method ?? "GET", url, init.body ? JSON.parse(String(init.body)) : {});
    return new Response(status === 204 ? null : JSON.stringify(body), { status });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function newUniversity(): University {
  const nus = JSON.parse(fs.readFileSync("data/universities/sg/nus.json", "utf8"));
  return {
    ...nus,
    id: "new-uni",
    country: "au",
    currency: "SGD", // replaced with the country's currency
    name: "New University",
    city: "Perth",
    livingCosts: { year: 2026, months: 12, monthly: { housing: 1, food: 1, transport: 1, personal: 1 }, sourceUrl: "https://new.edu/living", lastVerified: "2026-10-01", summary: "A simple estimate." },
    programmes: nus.programmes.slice(0, 1).map((p: Record<string, unknown>) => ({
      ...p,
      sourceUrl: "https://new.edu/fees",
      fees: { international: { annualTuition: 30000 } },
      feeHistory: [],
    })),
  };
}

describe("adding and removing", () => {
  it("adds a university with its own check-by-hand scraper entries, and undoing removes them again", async () => {
    const n = await addUniversity("Ana", newUniversity());
    await approveChange(n, "Ben");
    const added = json("data/universities/au/new-uni.json");
    expect(added.currency).toBe("AUD");
    const registry = live("scrapers/registry.d/new-uni.yaml")!;
    expect(parseSources(registry).map((b) => b.url)).toEqual(["https://new.edu/fees", "https://new.edu/living"]);
    expect(registry).toContain("manual: true");

    await approveChange(await undoLastChange("Cat"), "Ben");
    expect(live("data/universities/au/new-uni.json")).toBeUndefined();
    expect(live("scrapers/registry.d/new-uni.yaml")).toBeUndefined();
  });

  it("refuses an id already in use, an unknown country or a university that fails the checks", async () => {
    await expect(addUniversity("Ana", { ...newUniversity(), id: "nus" })).rejects.toThrow(/already used/);
    await expect(addUniversity("Ana", { ...newUniversity(), id: "Bad Id" })).rejects.toThrow(/lower-case/);
    await expect(addUniversity("Ana", { ...newUniversity(), country: "fr" })).rejects.toThrow(/countries in the calculator/);
    await expect(addUniversity("Ana", { ...newUniversity(), name: "" })).rejects.toThrow(/Fix the highlighted problems/);
  });

  it("removes a university with its scraper entries and shortlist place", async () => {
    expect(json("data/rationale.json")["au/unsw"]).toBeDefined();
    const n = await removeUniversity("Ana", "au", "unsw");
    expect((await getChange(n)).files.map((f) => f.path).sort()).toEqual([
      "data/rationale.json",
      "data/universities/au/unsw.json",
      "scrapers/registry.d/unsw.yaml",
      "scrapers/registry.yaml",
    ]);
    await approveChange(n, "Ben");
    expect(live("data/universities/au/unsw.json")).toBeUndefined();
    expect(live("scrapers/registry.d/unsw.yaml")).toBeUndefined();
    expect(json("data/rationale.json")["au/unsw"]).toBeUndefined();
    expect(parseSources(live("scrapers/registry.yaml")!).some((b) => b.university === "unsw")).toBe(false);
    expect(parseSources(live("scrapers/registry.yaml")!).some((b) => b.university === "nus")).toBe(true);
  });

  it("adds a country with a new currency, its place in the order and its intake month", async () => {
    const n = await addCountry("Ana", { code: "HK", name: "Hong Kong", currency: "hkd", defaultFeeIncrease: 0.03, intakeMonth: 8 });
    await approveChange(n, "Ben");
    expect(json("data/countries/hk.json")).toEqual({ code: "hk", name: "Hong Kong", currency: "HKD", defaultFeeIncrease: 0.03 });
    expect(json("data/fx-fallback.json").rates.HKD).toBe(5.95);
    const settings = json("data/settings.json");
    expect(settings.countryOrder.at(-1)).toBe("hk");
    // August is the usual month, so no special entry.
    expect(settings.intakeMonth.hk).toBeUndefined();
  });

  it("refuses a currency neither the ECB nor the IMF has a rate for, or a code in use", async () => {
    await expect(addCountry("Ana", { code: "ar", name: "Argentina", currency: "ARS", defaultFeeIncrease: 0.03 })).rejects.toThrow(/Neither the European Central Bank nor/);
    await expect(addCountry("Ana", { code: "au", name: "Australia", currency: "AUD", defaultFeeIncrease: 0.03 })).rejects.toThrow(/already a country/);
  });

  it("removes a country only once it has no universities", async () => {
    await expect(removeCountry("Ana", "au")).rejects.toThrow(/universities first/);
    await approveChange(await removeUniversity("Ana", "au", "unsw"), "Ben");
    const n = await removeCountry("Ana", "au");
    await approveChange(n, "Ben");
    expect(live("data/countries/au.json")).toBeUndefined();
    const settings = json("data/settings.json");
    expect(settings.countryOrder).not.toContain("au");
    expect(settings.intakeMonth.au).toBeUndefined();
  });

  it("adds to the sign-in's change and keeps its earlier edit of the same file", async () => {
    const SETTINGS = "data/settings.json";
    const { documents } = await openForEditing([SETTINGS], undefined, "a");
    const edited = structuredClone(documents[0].data) as { maxStartYear?: number; defaultIntakeMonth: number };
    edited.defaultIntakeMonth = (edited.defaultIntakeMonth + 1) % 12;
    const n = await sendChange({ author: "Ana", summary: "Change the usual intake month", documents: [{ ...documents[0], data: edited }], session: "a" });

    // Adding a country reads settings.json from the change, not from the live site.
    const added = await addCountry("Ana", { code: "hk", name: "Hong Kong", currency: "HKD", defaultFeeIncrease: 0.03 }, "a");
    expect(added).toBe(n);
    await approveChange(n, "Ana");
    const settings = json(SETTINGS);
    expect(settings.defaultIntakeMonth).toBe(edited.defaultIntakeMonth);
    expect(settings.countryOrder.at(-1)).toBe("hk");
    expect(live("data/countries/hk.json")).toBeDefined();
  });
});
