import { loadCountries, loadUniversities } from "@/lib/data";
import type { Names } from "./documents";

/** Country and university names for labels, read from the data files when the editor is built. */
export function loadNames(): Names {
  return {
    countries: loadCountries()
      .map((c) => ({ value: c.code, label: c.name }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    universities: loadUniversities()
      .map((u) => ({ value: `${u.country}/${u.id}`, label: u.name }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}
