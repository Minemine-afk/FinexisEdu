import { MONTHS, type FieldSpec } from "./spec";

/** One changed value, named by the form labels that lead to it. */
export interface ChangeRow {
  path: string[];
  before: string;
  after: string;
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const empty = (v: unknown) => v === undefined || v === null || v === "";

/** A value as the editor shows it: percentages as %, months by name, lists one per line. */
export function formatValue(spec: FieldSpec, v: unknown): string {
  if (empty(v)) return "";
  switch (spec.kind) {
    case "percent":
      return `${+(Number(v) * 100).toFixed(4)}%`;
    case "money":
      return Number(v).toLocaleString("en-GB", { maximumFractionDigits: 2 });
    case "bool":
      return v ? "Yes" : "No";
    case "month":
      return MONTHS[Number(v)] ?? String(v);
    case "select":
      return spec.options.find((o) => o.value === v)?.label ?? String(v);
    case "strings":
      return Array.isArray(v) ? v.join(", ") : String(v);
    case "object":
      return spec.fields
        .filter((f) => !empty((v as Obj)[f.key]) && !["object", "list", "record"].includes(f.kind))
        .map((f) => `${f.label}: ${formatValue(f, (v as Obj)[f.key])}`)
        .join("; ");
    case "list":
      return Array.isArray(v) ? v.map((i) => spec.title(i as Obj)).join(", ") : "";
    case "record":
      return isObj(v) ? Object.keys(v).map(spec.keyLabel).join(", ") : "";
    default:
      return String(v);
  }
}

/** The value a field effectively has, so a missing default and its explicit value are not a change. */
function effective(spec: FieldSpec, v: unknown): unknown {
  if (spec.kind === "bool" && v === undefined) return spec.defaultValue;
  if ((spec.kind === "list" || spec.kind === "strings") && Array.isArray(v) && v.length === 0) return undefined;
  return v;
}

function walk(spec: FieldSpec, before: unknown, after: unknown, path: string[], out: ChangeRow[]) {
  before = effective(spec, before);
  after = effective(spec, after);
  if (JSON.stringify(before) === JSON.stringify(after)) return;

  if (spec.kind === "object" && isObj(before) && isObj(after)) {
    for (const f of spec.fields) walk(f, before[f.key], after[f.key], [...path, f.label], out);
    // Anything the form does not show (ids, codes) still counts.
    const known = new Set(spec.fields.map((f) => f.key));
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (known.has(k) || JSON.stringify(before[k]) === JSON.stringify(after[k])) continue;
      const text = (v: unknown) => (v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v));
      out.push({ path: [...path, k], before: text(before[k]), after: text(after[k]) });
    }
    return;
  }
  if (spec.kind === "list" && Array.isArray(before) && Array.isArray(after)) {
    const id = spec.identity ?? ((_: Obj, i: number) => String(i));
    const keyed = (items: unknown[]) => new Map(items.map((item, i) => [id(item as Obj, i), item as Obj]));
    const b = keyed(before);
    const a = keyed(after);
    for (const [k, item] of b) {
      const next = a.get(k);
      const label = spec.title(item);
      if (!next) out.push({ path: [...path, `Removed ${spec.itemLabel}`], before: label, after: "" });
      else for (const f of spec.fields) walk(f, item[f.key], next[f.key], [...path, label, f.label], out);
    }
    for (const [k, item] of a) {
      if (!b.has(k)) out.push({ path: [...path, `Added ${spec.itemLabel}`], before: "", after: spec.title(item) });
    }
    return;
  }
  if (spec.kind === "record" && isObj(before) && isObj(after)) {
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
      walk(spec.value, before[k], after[k], [...path, spec.keyLabel(k)], out);
    }
    return;
  }
  out.push({ path, before: formatValue(spec, before), after: formatValue(spec, after) });
}

/** Every value that differs between two versions of a file, in form order. */
export function diffDocument(root: FieldSpec, before: unknown, after: unknown): ChangeRow[] {
  const out: ChangeRow[] = [];
  walk(root, before, after, [], out);
  return out;
}
