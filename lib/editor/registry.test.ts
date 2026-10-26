import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { loadUniversities } from "@/lib/data";
import { MAIN_REGISTRY, normaliseUrl, parseSources, registeredUrls, registryFile, sourceUrls, withManualSources, withoutUniversity } from "./registry";

const read = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);

describe("scraper registry helpers", () => {
  it("find every source page the scraper tests require, in the committed files", () => {
    const main = read(MAIN_REGISTRY);
    for (const u of loadUniversities()) {
      const registered = registeredUrls([main, read(registryFile(u.id))], u.id);
      for (const url of sourceUrls(u)) expect(registered.has(normaliseUrl(url)), `${u.id}: ${url}`).toBe(true);
    }
  });

  it("adds check-by-hand entries that read back as registered", () => {
    const u = { id: "newuni", name: "New University", country: "au" };
    const created = withManualSources(null, u, ["https://example.edu/fees: 2026", "https://example.edu/living"]);
    expect(registeredUrls([created], "newuni")).toEqual(new Set(["https://example.edu/fees:%202026", "https://example.edu/living"].map(normaliseUrl)));
    const existing = read(registryFile("anu"))!;
    const appended = withManualSources(existing, { ...u, id: "anu" }, ["https://example.edu/x"]);
    expect(appended.startsWith(existing.trimEnd())).toBe(true);
    expect(parseSources(appended)).toHaveLength(parseSources(existing).length + 1);
  });

  it("removes one university's blocks from the main registry and nothing else", () => {
    const main = read(MAIN_REGISTRY)!;
    const before = parseSources(main);
    const after = withoutUniversity(main, "ntu");
    const left = parseSources(after);
    expect(left.some((b) => b.university === "ntu")).toBe(false);
    expect(left.map((b) => `${b.university} ${b.url}`)).toEqual(before.filter((b) => b.university !== "ntu").map((b) => `${b.university} ${b.url}`));
    expect(after).toContain("sources:");
  });
});
