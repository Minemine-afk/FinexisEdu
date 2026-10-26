import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { diffDocument } from "./diff";
import { countryPath, describeLocation, documentKind, editPageFor, serialize, universityPath, validateDocument, type Names } from "./documents";

const names: Names = {
  countries: [{ value: "sg", label: "Singapore" }],
  universities: [{ value: "sg/nus", label: "National University of Singapore" }],
};
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), p), "utf8"));

function editableFiles(): string[] {
  const out = ["data/settings.json", "data/courses.json", "data/rationale.json"];
  for (const c of fs.readdirSync("data/countries")) out.push(`data/countries/${c}`);
  for (const c of fs.readdirSync("data/universities")) {
    for (const f of fs.readdirSync(`data/universities/${c}`)) out.push(`data/universities/${c}/${f}`);
  }
  return out;
}

describe("editor documents", () => {
  it("accepts every committed file as it is, so editors start from a clean form", () => {
    for (const file of editableFiles()) {
      expect(documentKind(file), file).toBeDefined();
      expect(validateDocument(file, read(file)), file).toEqual([]);
      expect(editPageFor(file), file).toBeDefined();
    }
  });

  it("finds no changes between a file and itself", () => {
    for (const file of editableFiles()) {
      const data = read(file);
      expect(diffDocument(documentKind(file)!.spec(names), data, structuredClone(data)), file).toEqual([]);
    }
  });

  it("names changed values by their form labels", () => {
    const file = universityPath("sg", "nus");
    const before = read(file);
    const after = structuredClone(before);
    const p = after.programmes[0];
    p.fees.international.annualTuition += 1000;
    p.feeHistory.push({ feeYear: 2015, tier: "international", annualTuition: 1 });
    after.livingCosts = undefined;
    const rows = diffDocument(documentKind(file)!.spec(names), before, after);
    const label = `${p.name} (${p.level === "bachelor" ? "Bachelor's" : "Master's"})`;
    expect(rows).toContainEqual(expect.objectContaining({ path: ["Programmes", label, "Fees", "International", "Yearly tuition"] }));
    expect(rows).toContainEqual({ path: ["Programmes", label, "Fee history", "Added past year"], before: "", after: "2015 International" });
  });

  it("does not count a default written out as a change", () => {
    const file = universityPath("sg", "nus");
    const before = read(file);
    const after = structuredClone(before);
    after.programmes[0].cohortLocked = before.programmes[0].cohortLocked ?? false;
    expect(diffDocument(documentKind(file)!.spec(names), before, after)).toEqual([]);
  });

  it("reports schema problems and data-test rules with readable locations", () => {
    const file = universityPath("sg", "nus");
    const spec = documentKind(file)!.spec(names);
    const data = read(file);
    data.programmes[0].feeChoice = "costs S$5,000";
    data.programmes[0].fees.international.annualTuition = -1;
    const problems = validateDocument(file, data);
    expect(problems.length).toBeGreaterThan(0);
    const where = problems.map((p) => describeLocation(spec, data, p.at));
    expect(where.some((w) => w.endsWith("Fees › International › Yearly tuition"))).toBe(true);
  });

  it("catches rules from the data tests once the schema passes", () => {
    const file = universityPath("sg", "nus");
    const data = read(file);
    data.programmes[0].feeChoice = "costs S$5,000";
    expect(validateDocument(file, data).map((p) => p.message)).toContain("No amounts, currencies, years or links here.");
    const uk = read("data/universities/uk/lse.json");
    uk.programmes[0].fees.citizen = { annualTuition: 1 };
    expect(validateDocument("data/universities/uk/lse.json", uk).length).toBeGreaterThan(0);
    const country = read(countryPath("sg"));
    expect(validateDocument(countryPath("au"), country)).toEqual([{ at: [], message: "The code must match the file name." }]);
  });

  it("writes files the way the repository stores them", () => {
    const text = fs.readFileSync("data/universities/sg/nus.json", "utf8");
    expect(serialize(JSON.parse(text))).toBe(text);
  });

  it("refuses files it does not know", () => {
    expect(documentKind("package.json")).toBeUndefined();
    expect(validateDocument("data/../package.json", {})).toHaveLength(1);
  });
});
