"use client";

import { useMemo, useState } from "react";
import { calculate, hasRateFor, isStale, toSgd, type CalcResult, type Residency } from "@/lib/calc";
import type { FxResult } from "@/lib/fx";
import {
  FIELD_LABELS,
  LEVEL_LABELS,
  RESIDENCY_LABELS,
  formatMoney,
} from "@/lib/format";
import { FIELDS, LEVELS, type Country, type Field, type Level, type Programme, type University } from "@/lib/schema";
import FeeChart from "./FeeChart";

interface Props {
  universities: University[];
  countries: Country[];
  fx: FxResult;
  today: string;
}

interface Option {
  key: string;
  university: University;
  programme: Programme;
}

export interface Selection extends Option {
  result: CalcResult;
  feeIncrease: number;
  fxRate: number;
  totalSgd: number;
  yearsSgd: { tuition: number; compulsoryFees: number; oneOffFees: number };
}

const MAX_SELECTED = 4;
// Start years offered. Earlier years use published fee history only.
const START_YEARS = [2024, 2025, 2026, 2027, 2028];
const COUNTRY_ORDER = ["sg", "uk", "au", "us", "ca", "nz", "jp"];

function optionsFor(universities: University[], level: Level, field: Field): Option[] {
  return universities.flatMap((university) =>
    university.programmes
      .map((programme, i) => ({ key: `${university.id}:${i}`, university, programme }))
      .filter((o) => o.programme.level === level && o.programme.field === field),
  );
}

/**
 * Why a programme can't be priced for this student, or null if it can: Singapore
 * universities need the student's own Citizen/PR rate, and past start years need
 * published fees for every year charged.
 */
function unavailableReason(o: Option, residency: Residency, startYear: number): string | null {
  const { missingYears } = calculate({
    programme: o.programme,
    currency: o.university.currency,
    residency,
    startYear,
    feeIncrease: 0,
    strictTier: o.university.country === "sg",
  });
  if (missingYears.length === 0) return null;
  // Missing years from the current fee year onwards mean the tier itself is absent.
  if (!hasRateFor(o.university.country, o.programme, residency) && missingYears.some((y) => y >= o.programme.feeYear)) {
    return `No ${RESIDENCY_LABELS[residency]} rate on file yet`;
  }
  return `No published ${missingYears.join(", ")} fee on file`;
}

/** Keeps the chosen universities when level or field changes, else picks one per country. */
function reselect(allOptions: Option[], previous: string[], isAvailable: (o: Option) => boolean): string[] {
  const options = allOptions.filter(isAvailable);
  const prevUnis = new Set(previous.map((k) => k.split(":")[0]));
  const kept: string[] = [];
  for (const o of options) {
    if (prevUnis.has(o.university.id) && !kept.some((k) => k.startsWith(`${o.university.id}:`))) kept.push(o.key);
  }
  if (kept.length > 0) return kept.slice(0, MAX_SELECTED);
  const picks: string[] = [];
  for (const country of ["sg", "uk", "au", "us"]) {
    const o = options.find((opt) => opt.university.country === country);
    if (o) picks.push(o.key);
  }
  return picks.length > 0 ? picks : options.slice(0, 2).map((o) => o.key);
}

export default function Calculator({ universities, countries, fx, today }: Props) {
  const thisYear = Number(today.slice(0, 4));
  const countryByCode = useMemo(() => new Map(countries.map((c) => [c.code, c])), [countries]);

  const [level, setLevel] = useState<Level>("bachelor");
  const [field, setField] = useState<Field>("computing");
  const [residency, setResidency] = useState<Residency>("citizen");
  const [startYear, setStartYear] = useState(
    Math.min(Math.max(thisYear + 1, START_YEARS[0]), START_YEARS[START_YEARS.length - 1]),
  );
  const [customIncrease, setCustomIncrease] = useState<number | null>(null);
  const options = useMemo(() => optionsFor(universities, level, field), [universities, level, field]);
  const [selected, setSelected] = useState<string[]>(() =>
    reselect(options, [], (o) => unavailableReason(o, residency, startYear) === null),
  );

  const available = (o: Option) => unavailableReason(o, residency, startYear) === null;

  function changeCourse(nextLevel: Level, nextField: Field) {
    setLevel(nextLevel);
    setField(nextField);
    setSelected((prev) => reselect(optionsFor(universities, nextLevel, nextField), prev, available));
  }

  function toggle(key: string) {
    setSelected((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      // Selections hidden by the residency choice don't use up a slot.
      const active = prev.filter((k) => options.some((o) => o.key === k && available(o)));
      return active.length < MAX_SELECTED ? [...active, key] : prev;
    });
  }

  const selections: Selection[] = options
    .filter((o) => selected.includes(o.key) && available(o))
    .map((o) => {
      const feeIncrease = customIncrease ?? countryByCode.get(o.university.country)?.defaultFeeIncrease ?? 0.03;
      const result = calculate({
        programme: o.programme,
        currency: o.university.currency,
        residency,
        startYear,
        feeIncrease,
        strictTier: o.university.country === "sg",
      });
      const sgd = (n: number) => toSgd(n, o.university.currency, fx);
      const sum = (pick: (y: CalcResult["years"][number]) => number) =>
        sgd(result.years.reduce((s, y) => s + pick(y), 0));
      return {
        ...o,
        result,
        feeIncrease,
        fxRate: o.university.currency === "SGD" ? 1 : fx.rates[o.university.currency],
        totalSgd: sgd(result.totalLocal),
        yearsSgd: {
          tuition: sum((y) => y.tuition),
          compulsoryFees: sum((y) => y.compulsoryFees),
          oneOffFees: sum((y) => y.oneOffFees),
        },
      };
    })
    .sort((a, b) => a.totalSgd - b.totalSgd);

  const grouped = COUNTRY_ORDER.map((code) => ({
    country: countryByCode.get(code as Country["code"]),
    options: options.filter((o) => o.university.country === code),
  })).filter((g) => g.options.length > 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      <aside className="space-y-5 rounded-xl border border-border bg-surface p-5 lg:self-start">
        <Segmented label="Level" value={level} options={LEVELS.map((l) => [l, LEVEL_LABELS[l]])} onChange={(l) => changeCourse(l, field)} />

        <label className="block">
          <span className="text-sm font-medium">Field of study</span>
          <select
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2"
            value={field}
            onChange={(e) => changeCourse(level, e.target.value as Field)}
          >
            {FIELDS.map((f) => (
              <option key={f} value={f}>
                {FIELD_LABELS[f]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-medium">Residency</span>
          <select
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2"
            value={residency}
            onChange={(e) => setResidency(e.target.value as Residency)}
          >
            {(Object.keys(RESIDENCY_LABELS) as Residency[]).map((r) => (
              <option key={r} value={r}>
                {RESIDENCY_LABELS[r]}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted">Only changes Singapore university fees. Abroad, you pay international rates.</span>
        </label>

        <label className="block">
          <span className="text-sm font-medium">Start year</span>
          <select
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2"
            value={startYear}
            onChange={(e) => setStartYear(Number(e.target.value))}
          >
            {START_YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {startYear <= thisYear && (
            <span className="mt-1 block text-xs text-muted">
              Past and current intakes use published fees only. Programmes without them are greyed out.
            </span>
          )}
        </label>

        <fieldset>
          <legend className="text-sm font-medium">Yearly fee increase</legend>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <input
              id="custom-increase"
              type="checkbox"
              checked={customIncrease !== null}
              onChange={(e) => setCustomIncrease(e.target.checked ? 0.03 : null)}
            />
            <label htmlFor="custom-increase">Set my own rate</label>
            {customIncrease !== null && (
              <span className="ml-auto flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={20}
                  step={0.5}
                  aria-label="Yearly fee increase in percent"
                  className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-right"
                  value={+(customIncrease * 100).toFixed(1)}
                  onChange={(e) => setCustomIncrease(Math.max(0, Number(e.target.value)) / 100)}
                />
                %
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">
            {customIncrease === null ? "Using each country's typical increase." : "Applied to every university."} Used
            only for years after the published fee year.
          </p>
        </fieldset>

        <div>
          <p className="text-sm font-medium">
            Universities <span className="font-normal text-muted">(up to {MAX_SELECTED})</span>
          </p>
          {grouped.length === 0 && <p className="mt-2 text-sm text-muted">No fee data for this course yet.</p>}
          <div className="mt-2 space-y-3">
            {grouped.map(({ country, options: opts }) => (
              <div key={country?.code}>
                <p className="text-xs font-medium uppercase tracking-wide text-muted">{country?.name}</p>
                <ul className="mt-1 space-y-1">
                  {opts.map((o) => {
                    const reason = unavailableReason(o, residency, startYear);
                    const hasRate = reason === null;
                    const checked = hasRate && selected.includes(o.key);
                    return (
                      <li key={o.key}>
                        <label className={`flex items-start gap-2 text-sm ${hasRate ? "cursor-pointer" : "text-muted"}`}>
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={checked}
                            disabled={!hasRate || (!checked && selections.length >= MAX_SELECTED)}
                            onChange={() => toggle(o.key)}
                          />
                          <span>
                            {o.university.name}
                            {opts.filter((x) => x.university.id === o.university.id).length > 1 && (
                              <span className="block text-xs text-muted">{o.programme.name}</span>
                            )}
                            {reason && <span className="block text-xs">{reason}</span>}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <section className="min-w-0 space-y-6">
        {selections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted">
            Pick at least one university to see its total fees.
          </div>
        ) : (
          <>
            <FeeChart selections={selections} />
            <div className="grid gap-4 xl:grid-cols-2">
              {selections.map((s) => (
                <ResultCard key={s.key} s={s} today={today} country={countryByCode.get(s.university.country)} />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <span className="text-sm font-medium">{label}</span>
      <div role="radiogroup" aria-label={label} className="mt-1 grid grid-cols-2 gap-1 rounded-md border border-border p-1">
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={`rounded px-3 py-1.5 text-sm ${value === v ? "bg-accent font-medium text-white" : "text-muted hover:bg-border/50"}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultCard({ s, today, country }: { s: Selection; today: string; country?: Country }) {
  const { university: u, programme: p, result } = s;
  const cur = u.currency;
  const stale = isStale(p.lastVerified, new Date(today));
  const hasCompulsory = result.years.some((y) => y.compulsoryFees > 0);
  const hasOneOff = result.years.some((y) => y.oneOffFees > 0);
  // Cohort-locked programmes are priced at the start year's fee throughout.
  const historyYears = new Set(
    result.years
      .filter((y) => y.basis === "history")
      .map((y) => (p.cohortLocked ? result.years[0].academicYear : y.academicYear)),
  );
  const historySources = p.feeHistory
    .filter((h) => h.tier === result.tier && historyYears.has(h.feeYear) && h.sourceUrl && h.sourceUrl !== p.sourceUrl)
    .map((h) => ({ year: h.feeYear, url: h.sourceUrl! }));

  return (
    <article className="rounded-xl border border-border bg-surface p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">
        {country?.name} · {u.city}
      </p>
      <h2 className="mt-1 text-lg font-semibold leading-snug">{u.name}</h2>
      <p className="text-sm text-muted">
        {p.name} · {result.durationYears} {result.durationYears === 1 ? "year" : "years"}
      </p>

      <p className="mt-4 text-3xl font-semibold tabular-nums">{formatMoney(s.totalSgd, "SGD")}</p>
      {cur !== "SGD" && (
        <p className="text-sm text-muted tabular-nums">
          {formatMoney(result.totalLocal, cur)} at S$1 = {s.fxRate.toLocaleString("en-SG", { maximumFractionDigits: 4 })} {cur}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        <Badge>{result.tier === "international" ? "International rate" : `${result.tier === "citizen" ? "Citizen" : "PR"} rate`}</Badge>
        {p.cohortLocked && <Badge>Fee fixed for your cohort</Badge>}
        {result.projected && <Badge>Includes projected {(s.feeIncrease * 100).toFixed(1)}%/yr increase</Badge>}
        {result.otherFeesFromCurrent && <Badge>Other fees use current rates</Badge>}
        {p.sourceType === "secondary" && <Badge warn>Unofficial source</Badge>}
        {stale && <Badge warn>Data may be outdated</Badge>}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">Fees by year in {cur}</caption>
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1 font-medium">Year</th>
              <th className="py-1 text-right font-medium">Tuition</th>
              {hasCompulsory && <th className="py-1 text-right font-medium">Other fees</th>}
              {hasOneOff && <th className="py-1 text-right font-medium">One-off</th>}
              <th className="py-1 text-right font-medium">Total ({cur})</th>
            </tr>
          </thead>
          <tbody>
            {result.years.map((y) => (
              <tr key={y.academicYear} className="border-t border-border">
                <td className="py-1">
                  {y.academicYear}
                  {y.fraction < 1 && <span className="text-muted"> (½)</span>}
                  {y.basis !== "current" && <span className="text-xs text-muted"> · {y.basis === "history" ? "published" : "projected"}</span>}
                </td>
                <td className="py-1 text-right">{formatMoney(y.tuition, cur)}</td>
                {hasCompulsory && <td className="py-1 text-right">{formatMoney(y.compulsoryFees, cur)}</td>}
                {hasOneOff && <td className="py-1 text-right">{formatMoney(y.oneOffFees, cur)}</td>}
                <td className="py-1 text-right font-medium">{formatMoney(y.total, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {p.notes && <p className="mt-3 text-xs text-muted">{p.notes}</p>}
      <p className="mt-3 text-xs text-muted">
        {p.feeYear}/{String((p.feeYear + 1) % 100).padStart(2, "0")} fees ·{" "}
        <a className="underline hover:text-foreground" href={p.sourceUrl} target="_blank" rel="noreferrer">
          source
        </a>{" "}
        · checked {p.lastVerified}
        {historySources.map((h) => (
          <span key={h.year}>
            {" · "}
            <a className="underline hover:text-foreground" href={h.url} target="_blank" rel="noreferrer">
              {h.year} source
            </a>
          </span>
        ))}
      </p>
    </article>
  );
}

function Badge({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <span className={`rounded-full px-2 py-0.5 ${warn ? "bg-warn-bg text-warn-fg" : "bg-border/60 text-muted"}`}>
      {children}
    </span>
  );
}
