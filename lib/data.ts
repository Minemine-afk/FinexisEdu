import fs from "node:fs";
import path from "node:path";
import { Country, University } from "./schema";

const DATA_DIR = path.join(process.cwd(), "data");

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** Loads and validates every university file. Throws on invalid data so a bad scrape fails the build. */
export function loadUniversities(dataDir = DATA_DIR): University[] {
  const root = path.join(dataDir, "universities");
  const universities: University[] = [];
  for (const country of fs.readdirSync(root).sort()) {
    const dir = path.join(root, country);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
      const full = path.join(dir, file);
      const parsed = University.safeParse(readJson(full));
      if (!parsed.success) {
        throw new Error(`Invalid fee data in ${full}:\n${parsed.error.message}`);
      }
      if (parsed.data.country !== country || `${parsed.data.id}.json` !== file) {
        throw new Error(`${full}: id/country do not match its path`);
      }
      universities.push(parsed.data);
    }
  }
  return universities;
}

export function loadCountries(dataDir = DATA_DIR): Country[] {
  const dir = path.join(dataDir, "countries");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => Country.parse(readJson(path.join(dir, f))));
}
