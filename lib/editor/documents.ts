import type { z } from "zod";
import { Country, CoursesFile, RationaleFile, University } from "@/lib/schema";
import { Settings } from "@/lib/settings";
import { checkUniversity, type Problem } from "./checks";
import { COUNTRY, COURSES, rationaleSpec, settingsSpec, UNIVERSITY, type FieldSpec } from "./spec";

export type { Problem };

/** Names the form needs for keys it shows (country codes, "country/id" keys). */
export interface Names {
  countries: { value: string; label: string }[];
  universities: { value: string; label: string }[];
}

export interface DocumentKind {
  /** What the file is, for headings and change titles. */
  describe: (names: Names) => string;
  spec: (names: Names) => FieldSpec;
  schema: z.ZodType;
  /** Rules beyond the schema (the same ones the data tests apply). */
  extraChecks?: (data: unknown) => Problem[];
}

const root = (fields: FieldSpec[]): FieldSpec => ({ key: "", label: "", kind: "object", fields });
const nameOf = (list: { value: string; label: string }[], value: string) => list.find((x) => x.value === value)?.label ?? value;

const UNIVERSITY_PATH = /^data\/universities\/([a-z]{2})\/([a-z0-9-]+)\.json$/;
const COUNTRY_PATH = /^data\/countries\/([a-z]{2})\.json$/;

export function universityPath(country: string, id: string) {
  return `data/universities/${country}/${id}.json`;
}

export function countryPath(code: string) {
  return `data/countries/${code}.json`;
}

export function documentKind(path: string): DocumentKind | undefined {
  let m = UNIVERSITY_PATH.exec(path);
  if (m) {
    const [, country, id] = m;
    return {
      describe: (names) => nameOf(names.universities, `${country}/${id}`),
      spec: () => root(UNIVERSITY),
      schema: University,
      extraChecks: (data) => {
        const u = data as z.infer<typeof University>;
        const own: Problem[] = u.country !== country || u.id !== id ? [{ at: [], message: "The id and country must match the file name." }] : [];
        return [...own, ...checkUniversity(u)];
      },
    };
  }
  m = COUNTRY_PATH.exec(path);
  if (m) {
    const [, code] = m;
    return {
      describe: (names) => nameOf(names.countries, code),
      spec: () => root(COUNTRY),
      schema: Country,
      extraChecks: (data) => ((data as { code?: string }).code === code ? [] : [{ at: [], message: "The code must match the file name." }]),
    };
  }
  switch (path) {
    case "data/settings.json":
      return { describe: () => "Site settings", spec: (n) => root(settingsSpec(n.countries)), schema: Settings };
    case "data/courses.json":
      return { describe: () => "Why these courses?", spec: () => COURSES[0], schema: CoursesFile };
    case "data/rationale.json":
      return { describe: () => "Shortlist places", spec: (n) => rationaleSpec(n.universities)[0], schema: RationaleFile };
  }
  return undefined;
}

/** Problems that stop a file from being sent for approval. */
export function validateDocument(path: string, data: unknown): Problem[] {
  const kind = documentKind(path);
  if (!kind) return [{ at: [], message: `${path} cannot be edited here.` }];
  const parsed = kind.schema.safeParse(data);
  if (!parsed.success) return parsed.error.issues.map((i) => ({ at: i.path as (string | number)[], message: i.message }));
  return kind.extraChecks?.(parsed.data) ?? [];
}

/** A problem's location in form labels, e.g. "Programmes › BSc Computing (Bachelor's) › Summary". */
export function describeLocation(root: FieldSpec, data: unknown, at: (string | number)[]): string {
  const labels: string[] = [];
  let spec: FieldSpec | undefined = root;
  let value: unknown = data;
  for (const step of at) {
    if (!spec) {
      labels.push(String(step));
      continue;
    }
    const v = value as Record<string | number, unknown> | undefined;
    if (spec.kind === "object") {
      const f: FieldSpec | undefined = spec.fields.find((x) => x.key === step);
      labels.push(f?.label ?? String(step));
      spec = f;
    } else if (spec.kind === "list") {
      const item = v?.[step] as Record<string, unknown> | undefined;
      labels.push(item ? spec.title(item) : `${spec.itemLabel} ${Number(step) + 1}`);
      spec = { key: "", label: "", kind: "object", fields: spec.fields };
    } else if (spec.kind === "record") {
      labels.push(spec.keyLabel(String(step)));
      spec = spec.value;
    } else {
      labels.push(String(step));
      spec = undefined;
    }
    value = v?.[step];
  }
  return labels.filter(Boolean).join(" › ");
}

/** The file's text as the repository stores it. */
export function serialize(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

/** The editor page for a file. */
export function editPageFor(path: string): string | undefined {
  const u = UNIVERSITY_PATH.exec(path);
  if (u) return `/admin/universities/${u[1]}/${u[2]}/edit`;
  const c = COUNTRY_PATH.exec(path);
  if (c) return `/admin/countries/${c[1]}/edit`;
  if (path === "data/settings.json") return "/admin/settings/edit";
  if (path === "data/courses.json" || path === "data/rationale.json") return "/admin/reasons/edit";
  return undefined;
}
