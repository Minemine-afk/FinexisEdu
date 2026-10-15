"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatCompactSgd, formatMoney, programmeLabel } from "@/lib/format";
import {
  DEFAULT_INVEST_RATE,
  defaultIntakeMonth,
  monthsBetween,
  SAVING_RATE,
  simulate,
  solveTvm,
  type Plan,
  type Tvm,
  type TvmField,
} from "@/lib/savings";
import { FOCUS } from "./ResultDetail";
import type { Selection } from "./useCalculator";

/** The most months the planner will simulate or accept: 100 years. */
const MAX_MONTHS = 1200;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const sgd = (n: number) => formatMoney(n, "SGD");
const pct = (r: number) => `${+r.toFixed(2)}%`;

const TVM_FIELDS: [TvmField, string, string][] = [
  ["months", "Number of months to save", "Number of months to save"],
  ["rate", "Interest earned (% a year)", "Interest you'd need to earn"],
  ["start", "Starting amount", "Starting amount you'd need"],
  ["monthly", "Amount saved each month", "Amount to save each month"],
  ["end", "Amount needed at the end", "Amount you'd have at the end"],
];

/** Each year's costs (fees plus any living costs) in SGD, in order of study. */
function yearCostsSgd(s: Selection): number[] {
  const rate = s.university.currency === "SGD" ? 1 : s.fxRate;
  return s.result.years.map(
    (y, k) => (y.total + (s.living?.years[k]?.amount ?? 0)) / rate,
  );
}

/** One side of the comparison: what you put in and what interest adds. */
interface Side {
  paidIn: number;
  interest: number;
}
interface Bars {
  saving: Side | null;
  investing: Side;
  target: number;
  targetLabel: string;
  rate: number;
  sameMoney?: boolean;
}

/**
 * The savings planner: a pop-up from a university's tile that works out how to
 * pay its projected cost, saving at 0.05% compared with investing at a chosen
 * rate. Centred on desktop and tablets, a bottom sheet on phones.
 */
export default function SavingsPlanner({
  selection: s,
  today,
  sheet,
  onClose,
}: {
  selection: Selection;
  /** ISO date the page was built for. */
  today: string;
  sheet: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const now = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 };
  const firstYear = s.result.years[0]?.academicYear ?? now.year + 1;
  const projected = yearCostsSgd(s);
  const projectedTotal = projected.reduce((a, b) => a + b, 0);
  // Months of the first year that have already passed are not offered as "First fees due".
  const firstMonth = firstYear === now.year ? now.month : 0;
  const bodyRef = useRef<HTMLDivElement>(null);

  const [target, setTarget] = useState<number | null>(null);
  const [intake, setIntake] = useState(() => Math.max(firstMonth, defaultIntakeMonth(s.university.country)));
  const [view, setView] = useState<"split" | "time">("split");
  const [tvmEdits, setTvmEdits] = useState<Tvm | null>(null);
  // With no time to save (fees due now) the question is what to set aside today.
  const seedField: TvmField = monthsBetween(now, { year: firstYear, month: intake }) === 0 ? "start" : "monthly";
  const [tvmField, setTvmField] = useState<TvmField>(seedField);
  const [startOfMonth, setStartOfMonth] = useState(false);

  // Keep the page behind still (position: fixed also holds on iOS Safari),
  // move focus in, keep Tab inside, give focus back on close, Escape closes.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const scrollY = window.scrollY;
    const body = document.body.style;
    const prev = { position: body.position, top: body.top, width: body.width };
    body.position = "fixed";
    body.top = `-${scrollY}px`;
    body.width = "100%";
    const focusable = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, input, select, summary, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => !el.hasAttribute("disabled"));
    focusable()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab") return;
      const els = focusable();
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      body.position = prev.position;
      body.top = prev.top;
      body.width = prev.width;
      window.scrollTo(0, scrollY);
      opener?.focus();
    };
  }, [onClose]);

  // The whole cost is needed when the first fees fall due.
  const costTotal = target ?? projectedTotal;
  const months = monthsBetween(now, { year: firstYear, month: intake });
  const startLabel = `${MONTHS[intake]} ${firstYear}`;

  /** How a cost is met: your money up to the cost, interest for the rest. */
  const covered = (paidIn: number, cost: number): Side => ({
    paidIn: Math.min(paidIn, cost),
    interest: Math.max(0, cost - paidIn),
  });

  const seed: Tvm = { months, rate: DEFAULT_INVEST_RATE, start: 0, monthly: 0, end: costTotal, startOfMonth };
  const t: Tvm = { ...(tvmEdits ?? seed), startOfMonth };
  const solved = solveTvm(t, tvmField);
  const full: Tvm = { ...t, [tvmField]: solved };
  // A month count past a century is no plan at all.
  const tooLong = tvmField === "months" && solved > MAX_MONTHS;
  const ok = Number.isFinite(solved) && !tooLong;
  // With zero months typed there is no time for monthly saving or interest to do anything.
  const noTime = !ok && t.months === 0 && (tvmField === "monthly" || tvmField === "rate");
  // "Clear form" leaves boxes empty (NaN) until they are filled in again.
  const blanks = TVM_FIELDS.filter(([k]) => k !== tvmField && !Number.isFinite(t[k])).length;
  // Only a real answer is simulated, and never beyond a century of months.
  const n = ok ? Math.min(MAX_MONTHS, Math.max(0, Math.round(full.months))) : 0;
  // Fees fall due now: there is no time to save, so the whole amount is your own money.
  const dueNow = ok && n === 0;
  const mine: Plan = simulate({ start: full.start, monthly: full.monthly, months: n, ratePct: full.rate, startOfMonth, today: now });
  let other: Plan | null = null;
  let compare: [string, string] | null = null;
  let savingSide: Side | null = null;
  if (ok && tvmField !== "rate") {
    const s0: Tvm = { ...t, rate: SAVING_RATE };
    const v = solveTvm(s0, tvmField);
    if (Number.isFinite(v)) {
      const f = { ...s0, [tvmField]: v };
      compare = [show(f, tvmField), show(full, tvmField)];
      // Saving at 0.05% that takes over a century is shown as such, not drawn.
      if (f.months <= MAX_MONTHS) {
        other = simulate({ start: f.start, monthly: f.monthly, months: Math.max(0, Math.round(f.months)), ratePct: SAVING_RATE, startOfMonth, today: now });
        savingSide = { paidIn: f.start + f.monthly * f.months, interest: f.end - f.start - f.monthly * f.months };
      }
    }
  }
  const answer = (
    <Answer
      question={TVM_FIELDS.find(([k]) => k === tvmField)![2]}
      value={ok ? show(full, tvmField) : blanks ? "Fill in the boxes" : tooLong ? "Over 100 years" : noTime ? "No time to save" : "Not possible"}
      note={
        dueNow
          ? `Fees are due now, so the whole ${sgd(full.end)} is needed today and there is no time for interest to build. Change any four boxes and tap "Solve" on the one you want.`
          : ok
            ? `"Amount needed at the end" starts as the whole cost, ${sgd(costTotal)}, needed by ${startLabel}. Change any four boxes and tap "Solve" on the one you want.`
            : blanks
              ? `Fill in the ${blanks === 1 ? "empty box" : `${blanks} empty boxes`}, then tap "Solve" on the one you want.`
              : tooLong
                ? `That would take more than ${MAX_MONTHS.toLocaleString("en-SG")} months. Start with more, save more each month or earn more interest.`
                : noTime
                  ? 'With 0 months the whole amount is needed today. Tap "Solve" on "Amount to start with", or give it some months.'
                  : "No answer fits these numbers. Check the four boxes you filled in."
      }
    />
  );
  const paid = full.start + full.monthly * full.months;
  // Null when the numbers give nothing worth drawing.
  const bars: Bars | null = ok
    ? {
        saving: savingSide && covered(savingSide.paidIn, savingSide.paidIn + savingSide.interest),
        investing: covered(paid, full.end),
        target: full.end,
        targetLabel: "Amount needed at the end",
        rate: full.rate,
      }
    : null;
  // Months and money can't go below zero; months stop at a century, a rate at 20% a year.
  const clamp = (k: TvmField, v: number) =>
    k === "rate" ? Math.min(20, Math.max(0, v)) : k === "months" ? Math.min(MAX_MONTHS, Math.max(0, v)) : Math.max(0, v);
  // The box being solved keeps its answer (within the box's limits) when it becomes an input again; with no answer it starts empty.
  const current = (): Tvm => ({ ...full, [tvmField]: ok ? clamp(tvmField, solved) : NaN });
  const edit = (k: TvmField, v: number) => setTvmEdits({ ...current(), [k]: clamp(k, v) });
  /** Empties every number; the projected cost and defaults come back with "Reset" or by reopening. */
  const clearForm = () => {
    setTarget(NaN);
    setTvmEdits({ months: NaN, rate: NaN, start: NaN, monthly: NaN, end: NaN, startOfMonth });
    // The answer panel says what to fill in; bring it back into view.
    bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };
  /** Back to the projected cost, the seed in every box and the field the planner opened on. */
  const reset = () => {
    setTarget(null);
    setTvmEdits(null);
    setTvmField(seedField);
  };
  const tvmBoxes = (
    <div className="space-y-3">
      {TVM_FIELDS.map(([k, label]) => (
        <div key={k}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <label htmlFor={`tvm-${k}`} className="text-sm font-medium">
              {label}
            </label>
            <button
              type="button"
              aria-pressed={tvmField === k}
              onClick={() => {
                setTvmEdits(current());
                setTvmField(k);
              }}
              className={`min-h-11 shrink-0 whitespace-nowrap rounded-lg border px-2.5 text-xs${FOCUS} ${tvmField === k ? "border-accent-fill bg-accent-fill text-on-accent" : "border-border bg-surface text-muted hover:bg-chip"}`}
            >
              {tvmField === k ? "Solved" : "Solve"}
            </button>
          </div>
          <NumberField
            id={`tvm-${k}`}
            // A month count past a century is no answer, so its box stays blank.
            value={k === "months" && tooLong ? NaN : full[k]}
            decimals={k === "rate" ? 2 : 0}
            prefix={k === "months" || k === "rate" ? undefined : "S$"}
            suffix={k === "months" ? "months" : k === "rate" ? "% a year" : undefined}
            readOnly={tvmField === k}
            onValue={(v) => edit(k, v)}
          />
        </div>
      ))}
      <Field label="When you save each month">
        <TwoWay
          label="When you save each month"
          options={[
            [false, "End of the month"],
            [true, "Start of the month"],
          ]}
          value={startOfMonth}
          onChange={setStartOfMonth}
        />
      </Field>
      <p className="text-xs text-muted">
        Interest is added monthly.{" "}
        {months === 0 ? `Fees are due now (${startLabel}).` : `${months.toLocaleString("en-SG")} ${months === 1 ? "month" : "months"} until ${startLabel}.`}
      </p>
    </div>
  );
  return frame(<Group title="Fill in four, solve for the fifth">{tvmBoxes}</Group>);

  function show(v: Tvm, k: TvmField): string {
    if (k === "months")
      return v.months > MAX_MONTHS ? `Over ${MAX_MONTHS.toLocaleString("en-SG")} months` : `${Math.round(v.months).toLocaleString("en-SG")} months`;
    if (k === "rate") return v.rate > 20 ? "Over 20% a year" : `${v.rate.toFixed(2)}% a year`;
    return sgd(v[k]);
  }

  /** The pop-up around the inputs: header, cost, results. */
  function frame(children: React.ReactNode) {
    // A sheet in landscape keeps clear of the notch; a centred dialog has the page's own margins.
    const padX = sheet ? "safe-x" : "px-4 sm:px-6";
    return (
      <div className="fixed inset-0 z-50">
        <button
          type="button"
          aria-label="Close"
          tabIndex={-1}
          onClick={onClose}
          className="absolute inset-0 bg-backdrop"
        />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={`absolute flex flex-col overflow-hidden bg-surface shadow-2xl ${
            sheet
              ? "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-3xl [@media(max-height:500px)]:max-h-full [@media(max-height:500px)]:rounded-none"
              : "left-1/2 top-1/2 max-h-[90dvh] w-[min(56rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border"
          }`}
        >
          {sheet && <div aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border [@media(max-height:500px)]:hidden" />}
          <div className={`flex shrink-0 items-start gap-3 border-b border-border pb-3 pt-3 sm:pt-4 [@media(max-height:500px)]:pb-2 [@media(max-height:500px)]:pt-2 ${padX}`}>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-lg font-semibold">
                Time Value of Money calculator
              </h2>
              <p className="truncate text-sm text-muted [@media(max-height:500px)]:hidden" title={`${s.university.name} · ${programmeLabel(s.university, s.programme)}`}>
                {s.university.name} · {programmeLabel(s.university, s.programme)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className={`-mr-2 grid size-11 shrink-0 place-items-center rounded-lg text-muted hover:bg-chip${FOCUS}`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          <div ref={bodyRef} className={`min-h-0 flex-1 space-y-4 overflow-y-auto pb-5 pt-4 ${padX}`}>
            <div className="grid items-start gap-5 md:grid-cols-[18rem_minmax(0,1fr)]">
              <div className="min-w-0 space-y-4">
                <Group title="The cost">
                  <Field label="Projected total cost" htmlFor="sp-target">
                    <NumberField
                      id="sp-target"
                      value={costTotal}
                      prefix="S$"
                        onValue={(v) => {
                        const cost = Math.max(0, v);
                        setTarget(cost);
                        if (tvmEdits) setTvmEdits({ ...current(), end: cost });
                      }}
                    />
                    <p className="mt-1 text-xs text-muted">
                      {target === null ? (
                        `From Compare · ${projected.length} ${projected.length === 1 ? "year" : "years"}${s.living ? ", fees and living costs" : " of fees"}, all needed at the start`
                      ) : (
                        <>
                          {Number.isNaN(target) ? "Cleared." : "You changed this."} Compare says {sgd(projectedTotal)}.{" "}
                          <button
                            type="button"
                            onClick={reset}
                            className={`-my-3.5 -mx-1 inline-block min-h-11 px-1 py-3.5 align-middle text-accent underline underline-offset-2${FOCUS}`}
                          >
                            Reset
                          </button>
                        </>
                      )}
                    </p>
                  </Field>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Field label="First fees due" htmlFor="sp-intake">
                      <div className="flex h-11 items-center rounded-lg border border-border bg-surface pr-3 focus-within:border-accent">
                        <select
                          id="sp-intake"
                          value={intake}
                          onChange={(e) => {
                            const m = Number(e.target.value);
                            setIntake(m);
                            if (tvmEdits) setTvmEdits({ ...current(), months: monthsBetween(now, { year: firstYear, month: m }) });
                          }}
                          className="h-full min-w-0 flex-1 bg-transparent pl-3 outline-none"
                        >
                          {MONTHS.map((m, i) =>
                            i < firstMonth ? null : (
                              <option key={m} value={i}>
                                {m}
                              </option>
                            ),
                          )}
                        </select>
                        <span className="text-sm text-muted tabular-nums">{firstYear}</span>
                      </div>
                    </Field>
                    <Field label="Saving from">
                      <div className="flex h-11 items-center rounded-lg border border-border bg-chip/40 px-3 text-muted tabular-nums">
                        {MONTHS[now.month]} {now.year}
                      </div>
                    </Field>
                  </div>
                </Group>
                {children}
              </div>

              <div className="order-first min-w-0 space-y-4 md:order-none">
                <div className="space-y-2 rounded-xl bg-chip p-4" aria-live="polite">
                  {answer}
                  {compare && (
                    <dl className="grid grid-cols-2 gap-2.5 pt-1">
                      <Compared label={`Saving at ${pct(SAVING_RATE)}`} value={compare[0]} color="var(--you)" />
                      <Compared label={`Investing at ${pct(full.rate)}`} value={compare[1]} color="var(--series-1)" />
                    </dl>
                  )}
                </div>
                {bars && (
                  <Chart bars={bars} mine={mine} other={other} today={now} startMonth={null} startLabel={startLabel} view={view} setView={setView} dueNow={dueNow} />
                )}
                {bars && (
                <details className="rounded-xl border border-border">
                  <summary className={`cursor-pointer rounded-xl px-4 py-3 text-sm font-medium${FOCUS}`}>
                    Year by year (investing at {pct(bars.rate)})
                  </summary>
                  <div className="overflow-x-auto px-4 pb-3">
                    <table className="w-full text-right text-xs tabular-nums sm:text-sm">
                      <thead className="text-muted">
                        <tr>
                          <th className="py-1.5 pr-2 text-left font-medium">Year</th>
                          <th className="px-2 font-medium">Paid in</th>
                          <th className="px-2 font-medium">Interest</th>
                          <th className="pl-2 font-medium">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mine.years.map((y) => (
                          <tr key={y.year} className="border-t border-border">
                            <td className="py-1.5 pr-2 text-left">{y.year}</td>
                            <td className="px-2">{y.paidIn ? sgd(y.paidIn) : "–"}</td>
                            <td className="px-2">{sgd(y.interest)}</td>
                            <td className={`pl-2 ${y.balance < -0.5 ? "text-warn-fg" : ""}`}>
                              {sgd(Math.abs(y.balance) < 0.5 ? 0 : y.balance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
                )}
              </div>
            </div>
            <p className="text-xs text-muted">
              An estimate, not financial advice. Returns are not guaranteed; costs after the published year are projections.
            </p>
          </div>

          <div className={`flex shrink-0 items-center justify-end gap-3 border-t border-border pt-3 ${padX} ${sheet ? "pb-[max(0.75rem,env(safe-area-inset-bottom))]" : "pb-3"}`}>
            <button
              type="button"
              onClick={clearForm}
              className={`min-h-11 shrink-0 rounded-lg border border-border bg-surface px-4 text-sm text-muted hover:bg-chip${FOCUS}`}
            >
              Clear form
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`min-h-11 shrink-0 rounded-lg bg-accent-fill px-5 font-medium text-on-accent${FOCUS}`}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }
}

function Answer({
  question,
  value,
  unit,
  note,
  status,
}: {
  question: string;
  value: string;
  unit?: string;
  note: string;
  status?: { good: boolean; text: string };
}) {
  return (
    <>
      <p className="text-sm text-muted">{question}</p>
      <p className="text-3xl font-semibold leading-tight text-accent tabular-nums sm:text-4xl">
        {value}
        {unit && <span className="text-base font-medium text-foreground">{unit}</span>}
      </p>
      {status && (
        <p
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${status.good ? "bg-good-bg text-good-fg" : "bg-warn-bg text-warn-fg"}`}
        >
          {status.text}
        </p>
      )}
      <p className="text-sm">{note}</p>
    </>
  );
}

function Compared({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="min-w-0 rounded-lg border-l-4 bg-surface px-3 py-2" style={{ borderLeftColor: color }}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0 space-y-3 rounded-xl border border-border bg-sidebar p-3.5">
      <legend className="sr-only">{title}</legend>
      <p aria-hidden className="text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </p>
      {children}
    </fieldset>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      {htmlFor ? (
        <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">
          {label}
        </label>
      ) : (
        <p className="mb-1 text-sm font-medium">{label}</p>
      )}
      {children}
    </div>
  );
}

function TwoWay<T extends string | boolean>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-surface">
      {options.map(([v, text]) => (
        <button
          key={String(v)}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`min-h-11 px-2 py-1.5 text-xs leading-tight${FOCUS} ${value === v ? "bg-accent-fill font-medium text-on-accent" : "text-muted hover:bg-chip"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** A number box that shows "12,345" at rest and takes plain digits while typing. */
function NumberField({
  id,
  value,
  onValue,
  prefix,
  suffix,
  decimals = 0,
  readOnly,
}: {
  id: string;
  value: number;
  onValue: (v: number) => void;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = Number.isFinite(value)
    ? value.toLocaleString("en-SG", { maximumFractionDigits: decimals, minimumFractionDigits: decimals })
    : readOnly
      ? "–"
      : "";
  return (
    <div
      className={`flex h-11 items-center rounded-lg border ${readOnly ? "border-dashed border-accent bg-chip" : "border-border bg-surface focus-within:border-accent"}`}
    >
      {prefix && <span className="pl-3 text-sm text-muted">{prefix}</span>}
      <input
        id={id}
        inputMode="decimal"
        readOnly={readOnly}
        value={draft ?? shown}
        onFocus={(e) => {
          if (readOnly) return;
          setDraft(Number.isFinite(value) ? String(+value.toFixed(decimals)) : "");
          // The re-render drops the browser's select-all, so select the plain number again.
          const el = e.currentTarget;
          requestAnimationFrame(() => el.select());
        }}
        onBlur={() => setDraft(null)}
        onChange={(e) => {
          setDraft(e.target.value);
          // Thousands separators and spaces are ignored; anything else must read as a number.
          const v = Number(e.target.value.replace(/[,\s]/g, ""));
          if (e.target.value.trim() !== "" && Number.isFinite(v)) onValue(v);
        }}
        className="h-full min-w-0 flex-1 bg-transparent px-3 tabular-nums outline-none"
      />
      {suffix && <span className="whitespace-nowrap pr-3 text-sm text-muted">{suffix}</span>}
    </div>
  );
}

/** "Your money vs interest" bars for both rates, or the money put in over time. */
function Chart({
  bars,
  mine,
  other,
  today,
  startMonth,
  startLabel,
  view,
  setView,
  dueNow,
}: {
  bars: Bars;
  mine: Plan;
  other: Plan | null;
  today: { year: number; month: number };
  startMonth: number | null;
  startLabel: string;
  view: "split" | "time";
  setView: (v: "split" | "time") => void;
  /** No months to save: the whole amount is due today, so there is nothing to draw over time. */
  dueNow: boolean;
}) {
  const { saving, investing } = bars;
  const r = pct(bars.rate);
  const canTime = Boolean(saving && other && !bars.sameMoney && !dueNow);
  const showTime = view === "time" && canTime;
  const headline = !saving ? (
    <>
      At {r}, interest covers <em className="not-italic text-interest-text">{sgd(investing.interest)}</em>.
    </>
  ) : bars.sameMoney ? (
    <>
      Investing at {r} grows the same plan to{" "}
      <em className="not-italic text-interest-text">{sgd(investing.interest - saving.interest)} more</em> than saving at {pct(SAVING_RATE)}.
    </>
  ) : Math.abs(saving.paidIn - investing.paidIn) < 0.5 ? (
    <>
      Investing at {r} takes <em className="not-italic text-interest-text">the same money</em> as saving at {pct(SAVING_RATE)}.
    </>
  ) : (
    <>
      Investing at {r} means{" "}
      <em className="not-italic text-interest-text">
        {sgd(Math.abs(saving.paidIn - investing.paidIn))} {saving.paidIn > investing.paidIn ? "less" : "more"}
      </em>{" "}
      of your own money than saving at {pct(SAVING_RATE)}.
    </>
  );
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Saving vs investing</h3>
        {canTime && (
          <div role="group" aria-label="Chart view" className="flex rounded-lg border border-border p-0.5 text-xs">
            {(
              [
                ["split", "Your money vs interest"],
                ["time", "Over time"],
              ] as const
            ).map(([v, text]) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`min-h-11 rounded-md px-2.5${FOCUS} ${view === v ? "bg-accent-fill font-medium text-on-accent" : "text-muted"}`}
              >
                {text}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="mt-2 text-[15px] font-semibold leading-snug text-balance">
        {dueNow ? <>Fees are due now, so there is no time for interest to build: the whole {sgd(investing.paidIn)} is your own money.</> : headline}
      </p>
      {showTime ? (
        <OverTime saving={other!} investing={mine} today={today} startMonth={startMonth} startLabel={startLabel} rate={r} gap={saving!.paidIn - investing.paidIn} />
      ) : (
        <Split bars={bars} />
      )}
    </div>
  );
}

function Split({ bars }: { bars: Bars }) {
  const rows: [string, Side][] = [
    ...(bars.saving ? [[`Saving at ${pct(SAVING_RATE)}`, bars.saving] as [string, Side]] : []),
    [`Investing at ${pct(bars.rate)}`, bars.investing],
  ];
  const max = Math.max(bars.target, ...rows.map(([, s]) => s.paidIn + s.interest)) * 1.02 || 1;
  const w = (v: number) => `${Math.max(0, (v / max) * 100)}%`;
  return (
    <div className="mt-3 space-y-4">
      {rows.map(([name, side]) => (
        <div key={name}>
          <div className="mb-1.5 flex justify-between gap-2 text-sm">
            <span>{name}</span>
            <b className="font-semibold tabular-nums">{sgd(side.paidIn + side.interest)}</b>
          </div>
          <div
            role="img"
            aria-label={`${name}: your money ${sgd(side.paidIn)}, interest ${sgd(side.interest)}`}
            className="relative flex h-7 rounded-md bg-sidebar"
          >
            <span className="h-full rounded-l-md bg-you" style={{ width: w(side.paidIn) }} />
            <span className="h-full rounded-r-md bg-series-4" style={{ width: w(side.interest) }} />
            <i className="absolute -bottom-1 -top-1 border-l-2 border-dashed border-foreground" style={{ left: w(bars.target) }} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted tabular-nums">
            <span>
              <i className="mr-1.5 inline-block size-2.5 rounded-sm bg-you align-[-1px]" />
              Your money <b className="font-semibold text-foreground">{sgd(side.paidIn)}</b>
            </span>
            <span>
              <i className="mr-1.5 inline-block size-2.5 rounded-sm bg-series-4 align-[-1px]" />
              Interest <b className="font-semibold text-foreground">{sgd(side.interest)}</b>
            </span>
          </div>
        </div>
      ))}
      <p className="text-xs text-muted">
        Dashed line: {bars.targetLabel[0].toLowerCase() + bars.targetLabel.slice(1)}, {sgd(bars.target)}.
      </p>
    </div>
  );
}

function OverTime({
  saving,
  investing,
  today,
  startMonth,
  startLabel,
  rate,
  gap,
}: {
  saving: Plan;
  investing: Plan;
  today: { year: number; month: number };
  startMonth: number | null;
  startLabel: string;
  rate: string;
  gap: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [W, setW] = useState(480);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 210;
  const pad = { l: 52, r: 8, t: 14, b: 22 };
  const all = [...saving.points, ...investing.points];
  const maxM = Math.max(1, ...all.map((p) => p.month));
  const hiRaw = Math.max(1, ...all.map((p) => p.paidIn));
  const step = niceStep(hiRaw / 4);
  const hi = Math.ceil(hiRaw / step) * step;
  const x = (m: number) => pad.l + (m / maxM) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / hi) * (H - pad.t - pad.b);
  const path = (p: Plan) => p.points.map((q, k) => `${k ? "L" : "M"}${x(q.month).toFixed(1)},${y(q.paidIn).toFixed(1)}`).join("");
  const back = [...investing.points].reverse().map((q) => `L${x(q.month).toFixed(1)},${y(q.paidIn).toFixed(1)}`).join("");
  const ticks: number[] = [];
  for (let v = 0; v <= hi + 1e-6; v += step) ticks.push(v);
  // Calendar years along the bottom, every 1, 2 or 4 years.
  const every = maxM > 168 ? 4 : maxM > 84 ? 2 : 1;
  const years: [number, number][] = [];
  for (let yr = today.year + 1; ; yr += every) {
    const m = (yr - today.year) * 12 - today.month;
    if (m > maxM) break;
    // A year that lands under the "S$0" axis label is skipped.
    if (x(m) >= pad.l + 14) years.push([yr, m]);
  }
  const labelM = Math.round((startMonth ?? maxM) * 0.8);
  const labelPt = investing.points.find((q) => q.month === labelM);
  // Labels sit on a halo of the background so the lines don't cut through them;
  // the "Fees start" label flips to the right of its line when the line is near the left edge.
  const halo = { paintOrder: "stroke" as const, stroke: "var(--surface)", strokeWidth: 4, strokeLinejoin: "round" as const };
  const startX = startMonth !== null ? x(startMonth) : 0;
  // Roughly 5.6px a character at 11px; used to keep labels inside the chart.
  const textW = (t: string) => t.length * 5.6;
  const startText = `Fees start · ${startLabel}`;
  // The label sits to the right of its line when it fits there, else to the left,
  // and against the chart's right edge on a narrow chart where neither fits.
  const fitsRight = startX + 5 + textW(startText) <= W - pad.r;
  const fitsLeft = startX - 5 - textW(startText) >= pad.l;
  const startLabelX = fitsRight ? startX + 5 : fitsLeft ? startX - 5 : W - pad.r;
  const gapText = `Interest covers ${formatCompactSgd(gap)}`;
  const gapHalf = textW(gapText) / 2;
  const gapX = Math.min(W - pad.r - gapHalf, Math.max(pad.l + gapHalf, x(labelM)));
  // The label sits between the two lines where the gap is wide enough across its whole width,
  // else under the lower (investing) line, else above the upper (saving) line, never across either.
  // Sampled a little past the estimated text width, since the real glyphs may run wider.
  const under = (p: Plan) => p.points.filter((q) => Math.abs(x(q.month) - gapX) <= gapHalf + 14).map((q) => y(q.paidIn));
  const sY = under(saving);
  const iY = under(investing);
  // An 11px label's box runs from 11px above its baseline to 3px below it.
  const ascent = 11;
  const descent = 3;
  const clear = 4;
  let gapY = y(labelPt?.paidIn ?? 0) + 18;
  if (sY.length && iY.length) {
    const top = Math.max(...sY); // lowest point of the saving line over the label
    const bottom = Math.min(...iY); // highest point of the investing line over the label
    const between = (top + bottom) / 2 + (ascent - descent) / 2;
    const below = Math.max(...iY) + clear + ascent;
    const above = Math.min(...sY) - clear - descent;
    if (bottom - top >= ascent + descent + 2 * clear) gapY = between;
    else if (below + descent <= H - pad.b - 2) gapY = below;
    else if (above - ascent >= pad.t) gapY = above;
    else gapY = between;
  }
  return (
    <figure className="mt-3">
      <svg ref={ref} width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Money put in over time: saving at ${pct(SAVING_RATE)} compared with investing at ${rate}`} className="block text-[11px]">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--border)" />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fill="var(--muted)">
              {formatCompactSgd(v)}
            </text>
          </g>
        ))}
        {years.map(([yr, m]) => (
          // The last year's label is pulled in so it is not cut off at the right edge.
          <text key={yr} x={Math.min(x(m), W - textW(String(yr)) / 2)} y={H - 6} textAnchor="middle" fill="var(--muted)">
            {yr}
          </text>
        ))}
        <path d={`${path(saving)}${back}Z`} fill="var(--series-4)" fillOpacity={0.22} />
        {startMonth !== null && startMonth <= maxM && (
          <g>
            <line x1={x(startMonth)} x2={x(startMonth)} y1={pad.t} y2={H - pad.b} stroke="var(--muted)" strokeDasharray="3 3" />
            <text
              x={startLabelX}
              y={pad.t + 10}
              textAnchor={fitsRight ? "start" : "end"}
              fill="var(--foreground)"
              style={halo}
            >
              {startText}
            </text>
          </g>
        )}
        <path d={path(saving)} fill="none" stroke="var(--you)" strokeWidth={2.4} />
        <path d={path(investing)} fill="none" stroke="var(--series-1)" strokeWidth={2.4} />
        {gap > 0 && labelPt && (
          <text x={gapX} y={gapY} textAnchor="middle" fill="var(--interest-text)" fontWeight={600} style={halo}>
            {gapText}
          </text>
        )}
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        <span>
          <i className="mr-1.5 inline-block h-0.5 w-3 bg-you align-middle" />
          Saving at {pct(SAVING_RATE)}: your money in
        </span>
        <span>
          <i className="mr-1.5 inline-block h-0.5 w-3 bg-series-1 align-middle" />
          Investing at {rate}: your money in
        </span>
        <span>
          <i className="mr-1.5 inline-block size-2.5 rounded-sm bg-series-4/40 align-[-1px]" />
          Gap: paid by interest
        </span>
      </figcaption>
    </figure>
  );
}

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
