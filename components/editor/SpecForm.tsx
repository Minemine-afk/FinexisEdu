"use client";

import { useState } from "react";
import type { Problem } from "@/lib/editor/checks";
import { MONTHS, type FieldSpec } from "@/lib/editor/spec";

type Obj = Record<string, unknown>;
type Path = (string | number)[];

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const keyOf = (path: Path) => path.join(".");

/** Problems at or below a path. */
function problemsUnder(problems: Problem[], path: Path) {
  const k = keyOf(path);
  return problems.filter((p) => {
    const pk = keyOf(p.at);
    return pk === k || pk.startsWith(`${k}.`) || k === "";
  });
}

const inputClass =
  "w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none";

function Messages({ problems, path }: { problems: Problem[]; path: Path }) {
  const own = problems.filter((p) => keyOf(p.at) === keyOf(path));
  if (own.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-warn-fg">
      {own.map((p, i) => (
        <li key={i}>{p.message}</li>
      ))}
    </ul>
  );
}

function Label({ spec }: { spec: FieldSpec }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <span className="text-sm font-medium">{spec.label}</span>
      {spec.audience === "visitors" && <span className="text-xs text-muted">shown to visitors</span>}
      {spec.audience === "maintainers" && <span className="text-xs text-muted">maintainers only</span>}
      {spec.optional && <span className="text-xs text-muted">optional</span>}
    </span>
  );
}

function Help({ spec }: { spec: FieldSpec }) {
  return spec.help ? <span className="mt-0.5 block text-xs text-muted">{spec.help}</span> : null;
}

function emptyValue(spec: FieldSpec) {
  return spec.nullable ? null : undefined;
}

function ScalarInput({ spec, value, onChange }: { spec: FieldSpec; value: unknown; onChange: (v: unknown) => void }) {
  const fromText = (text: string) => (text === "" ? emptyValue(spec) : text);
  switch (spec.kind) {
    case "longtext": {
      const text = (value as string) ?? "";
      return (
        <>
          <textarea
            className={inputClass}
            rows={Math.min(8, Math.max(2, Math.ceil(text.length / 90)))}
            value={text}
            onChange={(e) => onChange(fromText(e.target.value))}
          />
          {spec.maxLength && (
            <span className={`block text-right text-xs ${text.length > spec.maxLength ? "text-warn-fg" : "text-muted"}`}>
              {text.length}/{spec.maxLength}
            </span>
          )}
        </>
      );
    }
    case "text":
    case "url":
      return (
        <input
          className={inputClass}
          type={spec.kind === "url" ? "url" : "text"}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(fromText(e.target.value))}
        />
      );
    case "date":
      return <input className={inputClass} type="date" value={(value as string) ?? ""} onChange={(e) => onChange(fromText(e.target.value))} />;
    case "int":
    case "number":
    case "money":
      return (
        <input
          className={inputClass}
          type="number"
          step={spec.kind === "int" ? 1 : "any"}
          value={value === undefined || value === null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? emptyValue(spec) : Number(e.target.value))}
        />
      );
    case "percent":
      return (
        <span className="flex items-center gap-1">
          <input
            className={inputClass}
            type="number"
            step="any"
            value={value === undefined || value === null ? "" : String(+(Number(value) * 100).toFixed(6))}
            onChange={(e) => onChange(e.target.value === "" ? emptyValue(spec) : +(Number(e.target.value) / 100).toFixed(8))}
          />
          <span className="text-sm text-muted">%</span>
        </span>
      );
    case "bool":
      return (
        <input
          type="checkbox"
          checked={value === undefined ? spec.defaultValue : Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case "select":
      return (
        <select className={inputClass} value={(value as string) ?? ""} onChange={(e) => onChange(fromText(e.target.value))}>
          {(spec.optional || value === undefined) && <option value="">{spec.optional ? "(none)" : "Choose…"}</option>}
          {spec.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "month":
      return (
        <select className={inputClass} value={value === undefined ? "" : String(value)} onChange={(e) => onChange(Number(e.target.value))}>
          {MONTHS.map((m, i) => (
            <option key={m} value={i}>
              {m}
            </option>
          ))}
        </select>
      );
    case "strings":
      return <StringsInput spec={spec} value={value} onChange={onChange} />;
    default:
      return null;
  }
}

/** One item per line; the text is kept as typed and the saved list drops blank lines. */
function StringsInput({ spec, value, onChange }: { spec: Extract<FieldSpec, { kind: "strings" }>; value: unknown; onChange: (v: unknown) => void }) {
  const list = Array.isArray(value) ? (value as string[]) : [];
  const [text, setText] = useState(list.join("\n"));
  return (
    <>
      <textarea
        className={inputClass}
        rows={Math.min(10, Math.max(2, list.length + 1))}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const items = e.target.value.split("\n").map((l) => l.trim()).filter(Boolean);
          onChange(items.length === 0 && spec.optional ? undefined : items);
        }}
      />
      <span className="block text-xs text-muted">One {spec.itemLabel} per line.</span>
    </>
  );
}

interface FieldProps {
  spec: FieldSpec;
  value: unknown;
  onChange: (v: unknown) => void;
  path: Path;
  problems: Problem[];
}

/** One field of a form, drawn from its spec; objects, lists and records draw their children. */
export function Field({ spec, value, onChange, path, problems }: FieldProps) {
  if (spec.kind === "object") return <ObjectField spec={spec} value={value} onChange={onChange} path={path} problems={problems} />;
  if (spec.kind === "list") return <ListField spec={spec} value={value} onChange={onChange} path={path} problems={problems} />;
  if (spec.kind === "record") return <RecordField spec={spec} value={value} onChange={onChange} path={path} problems={problems} />;
  const wide = spec.kind === "longtext" || spec.kind === "strings" || spec.kind === "url";
  const own = problems.some((p) => keyOf(p.at) === keyOf(path));
  return (
    <label className={`block ${wide ? "col-span-full" : ""} ${spec.kind === "bool" ? "flex items-center gap-2" : ""}`}>
      {spec.kind === "bool" ? (
        <>
          <ScalarInput spec={spec} value={value} onChange={onChange} />
          <Label spec={spec} />
        </>
      ) : (
        <>
          <Label spec={spec} />
          <span className={`mt-1 block ${own ? "rounded-md ring-2 ring-warn-fg/50" : ""}`}>
            <ScalarInput spec={spec} value={value} onChange={onChange} />
          </span>
          <Help spec={spec} />
        </>
      )}
      <Messages problems={problems} path={path} />
    </label>
  );
}

function setKey(obj: Obj, key: string, v: unknown): Obj {
  const copy = { ...obj };
  if (v === undefined) delete copy[key];
  else copy[key] = v;
  return copy;
}

function blankFor(fields: FieldSpec[]): Obj {
  const out: Obj = {};
  for (const f of fields) {
    if (f.optional) continue;
    if (f.kind === "object") out[f.key] = blankFor(f.fields);
    else if (f.kind === "money" || f.kind === "number" || f.kind === "int" || f.kind === "percent" || f.kind === "month") out[f.key] = 0;
    else if (f.kind === "bool") out[f.key] = f.defaultValue;
    else if (f.kind === "list" || f.kind === "strings") out[f.key] = [];
    else if (f.kind === "record") out[f.key] = {};
    else if (f.kind === "select") out[f.key] = f.options[0]?.value;
    else out[f.key] = f.nullable ? null : "";
  }
  return out;
}

/** The fields of an object in a two-column grid; nested groups take the full width. */
export function Fields({ fields, value, onChange, path, problems }: { fields: FieldSpec[]; value: Obj; onChange: (v: Obj) => void; path: Path; problems: Problem[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-4">
      {fields.map((f) => (
        <div key={f.key} className={["object", "list", "record", "longtext", "strings", "url"].includes(f.kind) ? "col-span-full" : ""}>
          <Field spec={f} value={value[f.key]} onChange={(v) => onChange(setKey(value, f.key, v))} path={[...path, f.key]} problems={problems} />
        </div>
      ))}
    </div>
  );
}

function Group({ title, count, actions, children }: { title: React.ReactNode; count?: number; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-border p-4">
      <legend className="flex items-center gap-3 px-1 text-sm font-semibold">
        {title}
        {count ? <span className="rounded-full bg-warn-bg px-2 text-xs font-medium text-warn-fg">{count} to fix</span> : null}
        {actions}
      </legend>
      {children}
    </fieldset>
  );
}

const smallButton = "rounded border border-border px-2 py-0.5 text-xs font-normal text-accent hover:bg-sidebar";

function ObjectField({ spec, value, onChange, path, problems }: FieldProps & { spec: Extract<FieldSpec, { kind: "object" }> }) {
  if (!spec.label) {
    return <Fields fields={spec.fields} value={isObj(value) ? value : {}} onChange={onChange} path={path} problems={problems} />;
  }
  if (!isObj(value)) {
    return (
      <div>
        <button type="button" className={smallButton} onClick={() => onChange(blankFor(spec.fields))}>
          Add {spec.label.toLowerCase()}
        </button>
        <Help spec={spec} />
        <Messages problems={problems} path={path} />
      </div>
    );
  }
  return (
    <Group
      title={spec.label}
      count={problemsUnder(problems, path).length}
      actions={
        spec.optional && (
          <button type="button" className={smallButton} onClick={() => onChange(undefined)}>
            Remove
          </button>
        )
      }
    >
      <Help spec={spec} />
      <Messages problems={problems} path={path} />
      <Fields fields={spec.fields} value={value} onChange={onChange} path={path} problems={problems} />
    </Group>
  );
}

function ListItem({
  title,
  problemCount,
  startOpen,
  onRemove,
  onCopy,
  children,
}: {
  title: string;
  problemCount: number;
  startOpen: boolean;
  onRemove?: () => void;
  onCopy?: () => void;
  children: () => React.ReactNode;
}) {
  // Long lists (SIM has hundreds of programmes) only draw the items that are open.
  const [open, setOpen] = useState(startOpen);
  return (
    <div className="rounded-md border border-border">
      <div className="flex items-center gap-3 px-3 py-2">
        <button type="button" className="flex-1 text-left text-sm" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="mr-2 inline-block w-3 text-muted">{open ? "▾" : "▸"}</span>
          {title}
          {problemCount > 0 && <span className="ml-2 rounded-full bg-warn-bg px-2 text-xs text-warn-fg">{problemCount} to fix</span>}
        </button>
        {onCopy && (
          <button type="button" className={smallButton} onClick={onCopy}>
            Copy
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            className={smallButton}
            onClick={() => {
              if (confirm(`Remove ${title}?`)) onRemove();
            }}
          >
            Remove
          </button>
        )}
      </div>
      {open && <div className="border-t border-border p-3">{children()}</div>}
    </div>
  );
}

function ListField({ spec, value, onChange, path, problems }: FieldProps & { spec: Extract<FieldSpec, { kind: "list" }> }) {
  const items = Array.isArray(value) ? (value as Obj[]) : [];
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const shown = items.map((item, i) => ({ item, i })).filter(({ item }) => !q || spec.title(item).toLowerCase().includes(q));
  const update = (next: Obj[]) => onChange(next.length === 0 && spec.optional ? undefined : next);
  const body = (
    <>
      <Help spec={spec} />
      <Messages problems={problems} path={path} />
      {items.length > 8 && (
        <input
          type="search"
          className={`${inputClass} mb-3 max-w-sm`}
          placeholder={`Find a ${spec.itemLabel}`}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      )}
      <div className="space-y-2">
        {shown.map(({ item, i }) => (
          <ListItem
            // By position: an identity key would change (and close the item) while its name is typed.
            key={i}
            title={spec.title(item)}
            problemCount={problemsUnder(problems, [...path, i]).length}
            startOpen={(!spec.collapsed && items.length <= 3) || (i === items.length - 1 && spec.title(item).startsWith("New"))}
            onRemove={spec.addRemove ? () => update(items.filter((_, j) => j !== i)) : undefined}
            onCopy={
              spec.copyable
                ? () => update([...items.slice(0, i + 1), { ...structuredClone(item), name: `${item.name ?? ""} (copy)` }, ...items.slice(i + 1)])
                : undefined
            }
          >
            {() => (
              <Fields
                fields={spec.fields}
                value={item}
                onChange={(v) => update(items.map((x, j) => (j === i ? v : x)))}
                path={[...path, i]}
                problems={problems}
              />
            )}
          </ListItem>
        ))}
      </div>
      {spec.addRemove && (
        <button type="button" className={`${smallButton} mt-3`} onClick={() => update([...items, spec.blank ? spec.blank() : blankFor(spec.fields)])}>
          Add {spec.itemLabel}
        </button>
      )}
    </>
  );
  if (!spec.label) return body;
  return (
    <Group title={`${spec.label} (${items.length})`} count={problemsUnder(problems, path).length}>
      {body}
    </Group>
  );
}

function RecordField({ spec, value, onChange, path, problems }: FieldProps & { spec: Extract<FieldSpec, { kind: "record" }> }) {
  const record = isObj(value) ? value : {};
  const keys = Object.keys(record);
  const [adding, setAdding] = useState("");
  const free = (spec.keyOptions?.() ?? []).filter((o) => !keys.includes(o.value));
  const update = (next: Obj) => onChange(Object.keys(next).length === 0 && spec.optional ? undefined : next);
  const nested = ["object", "list", "record"].includes(spec.value.kind);
  const body = (
    <>
      <Help spec={spec} />
      <Messages problems={problems} path={path} />
      <div className={nested ? "space-y-2" : "grid grid-cols-[minmax(10rem,auto)_1fr_auto] items-start gap-x-4 gap-y-3"}>
        {keys.map((k) =>
          nested ? (
            <ListItem
              key={k}
              title={spec.keyLabel(k)}
              problemCount={problemsUnder(problems, [...path, k]).length}
              startOpen={false}
              onRemove={spec.addRemove ? () => update(setKey(record, k, undefined)) : undefined}
            >
              {() => (
                <Field spec={{ ...spec.value, label: "" }} value={record[k]} onChange={(v) => update(setKey(record, k, v))} path={[...path, k]} problems={problems} />
              )}
            </ListItem>
          ) : (
            <div key={k} className="contents">
              <span className="pt-1.5 text-sm font-medium">{spec.keyLabel(k)}</span>
              <span>
                <ScalarInput spec={spec.value} value={record[k]} onChange={(v) => update(setKey(record, k, v ?? (spec.value.kind === "longtext" ? "" : 0)))} />
                <Messages problems={problems} path={[...path, k]} />
              </span>
              {spec.addRemove ? (
                <button type="button" className={`${smallButton} mt-1.5`} onClick={() => update(setKey(record, k, undefined))}>
                  Remove
                </button>
              ) : (
                <span />
              )}
            </div>
          ),
        )}
      </div>
      {spec.addRemove && free.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <select className={`${inputClass} max-w-xs`} value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">Add…</option>
            {free.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={smallButton}
            disabled={!adding}
            onClick={() => {
              const v = spec.value;
              const start = v.kind === "object" ? blankFor(v.fields) : v.kind === "longtext" || v.kind === "text" ? "" : 0;
              update({ ...record, [adding]: start });
              setAdding("");
            }}
          >
            Add
          </button>
        </div>
      )}
    </>
  );
  if (!spec.label) return body;
  return (
    <Group title={spec.label} count={problemsUnder(problems, path).length}>
      {body}
    </Group>
  );
}
