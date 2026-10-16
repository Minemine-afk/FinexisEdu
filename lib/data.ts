import fs from "node:fs";
import path from "node:path";
import { Country, CoursesFile, RationaleFile, University, type CourseRationale, type ShortlistRationale } from "./schema";

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

/**
 * The data the site needs: maintainer `notes` (and each programme's `feeBasis`)
 * are dropped, which halves the dataset embedded in the page.
 */
export function forSite(universities: University[]): University[] {
  const withoutNotes = <T extends { notes?: string }>(record: T): T => {
    const copy = { ...record };
    delete copy.notes;
    return copy;
  };
  // `feeBasis` is kept in the data for maintainers; the site shows each programme's `feeChoice`.
  const forProgramme = (p: University["programmes"][number]) => {
    const copy = withoutNotes(p) as Partial<typeof p>;
    delete copy.feeBasis;
    return copy as typeof p;
  };
  // `feeMethod` (university and partner) is kept for maintainers too.
  const withoutMethod = <T extends { feeMethod?: string }>(record: T): T => {
    const copy = { ...record };
    delete copy.feeMethod;
    return copy;
  };
  return universities.map((u) => ({
    ...withoutMethod(u),
    partners: u.partners?.map(withoutMethod),
    programmes: u.programmes.map(forProgramme),
    livingCosts: u.livingCosts && withoutNotes(u.livingCosts),
  }));
}

export function loadCountries(dataDir = DATA_DIR): Country[] {
  const dir = path.join(dataDir, "countries");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => Country.parse(readJson(path.join(dir, f))));
}

/** Shortlist evidence per university, keyed "country/id"; universities added before the shortlist have none. */
export function loadRationale(dataDir = DATA_DIR): Record<string, ShortlistRationale> {
  return RationaleFile.parse(readJson(path.join(dataDir, "rationale.json")));
}

/** Why each field of study is in the calculator, in the order shown (data/courses.json). */
export function loadCourses(dataDir = DATA_DIR): CourseRationale[] {
  return CoursesFile.parse(readJson(path.join(dataDir, "courses.json")));
}
