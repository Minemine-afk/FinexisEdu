"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatMoney, programmeLabel } from "@/lib/format";
import {
  DEFAULT_INVEST_RATE,
  defaultIntakeMonth,
  monthsBetween,
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

const TVM_FIELDS: [TvmField, string, string][] = [
  ["months", "Number of months", "Number of months"],
  ["rate", "Interest (% a year)", "Interest you'd need"],
  ["start", "Starting amount", "Starting amount you'd need"],
  ["monthly", "Monthly deposit", "Monthly deposit"],
  ["end", "Amount needed at the end", "Amount you'd have at the end"],
];

/** Each year's costs (fees plus any living costs) in SGD, in order of study. */
function yearCostsSgd(s: Selection): number[] {
  const rate = s.university.currency === "SGD" ? 1 : s.fxRate;
  return s.result.years.map(
    (y, k) => (y.total + (s.living?.years[k]?.amount ?? 0)) / rate,
  );
}

/** What you put in and what interest adds. */
interface Side {
  paidIn: number;
  interest: number;
}
interface Bars {
  investing: Side;
  target: number;
  targetLabel: string;
}

/**
 * The savings planner: a pop-up from a university's tile that works out how to
 * pay its projected cost when investing at a chosen rate. Centred on desktop and tablets, a bottom sheet on phones.
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
  const answerRef = useRef<HTMLDivElement>(null);

  const [target, setTarget] = useState<number | null>(null);
  const [intake, setIntake] = useState(() => Math.max(firstMonth, defaultIntakeMonth(s.university.country)));
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

  const seed: Tvm = { months, rate: DEFAULT_INVEST_RATE, start: 0, monthly: 0, end: costTotal, startOfMonth };
  const t: Tvm = { ...(tvmEdits ?? seed), startOfMonth };
  const solved = solveTvm(t, tvmField);
  // A solved month count is rounded up to whole months, so the plan reaches
  // the end amount rather than falling a little short of it.
  // Never below zero: Math.ceil of a hair under 0 is -0.
  const wholeMonths = (m: number) => Math.max(0, Math.ceil(m - 1e-9));
  const full: Tvm = { ...t, [tvmField]: tvmField === "months" && Number.isFinite(solved) ? wholeMonths(solved) : solved };
  // A month count past a century is no plan at all.
  const tooLong = tvmField === "months" && solved > MAX_MONTHS;
  // The rate box stops at 20% a year, so a higher answer is shown as out of reach rather than drawn.
  const tooHigh = tvmField === "rate" && solved > 20;
  const ok = Number.isFinite(solved) && !tooLong && !tooHigh;
  // With zero months typed there is no time for monthly saving or interest to do anything.
  const noTime = !ok && t.months === 0 && (tvmField === "monthly" || tvmField === "rate");
  // "Clear form" leaves boxes empty (NaN) until they are filled in again.
  const blanks = TVM_FIELDS.filter(([k]) => k !== tvmField && !Number.isFinite(t[k])).length;
  // Only a real answer is simulated, and never beyond a century of months.
  const n = ok ? Math.min(MAX_MONTHS, Math.max(0, Math.round(full.months))) : 0;
  // The answer is zero because the other boxes already reach the end amount.
  const coveredAlready = ok && solved === 0 && (tvmField === "months" || tvmField === "monthly" || tvmField === "start");
  // No months in the plan: the whole amount is your own money, set aside today.
  const noMonths = ok && n === 0 && !coveredAlready;
  // Only "due now" when the fees really fall due this month, not when 0 months was typed.
  const dueNow = noMonths && months === 0;
  // The plan's own end: the solved or typed month count, which can differ from the months until the fees fall due.
  const planMonths = Number.isFinite(full.months) ? Math.min(MAX_MONTHS, Math.max(0, Math.round(full.months))) : months;
  const endAt = new Date(Date.UTC(now.year, now.month + planMonths, 1));
  const endLabel = `${MONTHS[endAt.getUTCMonth()]} ${endAt.getUTCFullYear()}`;
  const plan: Plan = simulate({ start: full.start, monthly: full.monthly, months: n, ratePct: full.rate, startOfMonth, today: now });
  // What the plan really ends with: above the end amount once months are rounded up, or an answer was held at zero.
  const reached = ok ? solveTvm(full, "end") : full.end;
  const overshoot = ok && reached > full.end + 0.5 ? reached - full.end : 0;
  const answer = (
    <Answer
      question={TVM_FIELDS.find(([k]) => k === tvmField)![2]}
      value={ok ? show(full, tvmField) : blanks ? "Fill in the boxes" : tooLong ? "Over 100 years" : tooHigh ? "Over 20% a year" : noTime ? "No time to save" : "Not possible"}
      note={
        noMonths
          ? `${dueNow ? "Fees are due now, so" : "With 0 months to save,"} the whole ${sgd(full.end)} is needed today and there is no time for interest to build. Change any four boxes and tap "Calculate" on the one you want.`
          : coveredAlready
            ? `Nothing more is needed: the other boxes already reach the ${sgd(full.end)} needed at the end. Change any four boxes and tap "Calculate" on the one you want.`
            : ok
            ? ""
            : blanks
              ? `Fill in the ${blanks === 1 ? "empty box" : `${blanks} empty boxes`}, then tap "Calculate" on the one you want.`
              : tooLong
                ? `That would take more than ${MAX_MONTHS.toLocaleString("en-SG")} months. Start with more, save more each month or earn more interest.`
                : tooHigh
                  ? "That would need more than 20% a year. Start with more, save more each month or give it more months."
                  : noTime
                  ? 'With 0 months the whole amount is needed today. Tap "Calculate" on "Starting amount", or give it some months.'
                  : "No answer fits these numbers. Check the four boxes you filled in."
      }
    />
  );
  const paid = full.start + full.monthly * full.months;
  // Null when the numbers give nothing worth drawing.
  const bars: Bars | null = ok
    ? {
        investing: { paidIn: Math.min(paid, reached), interest: Math.max(0, reached - paid) },
        target: full.end,
        targetLabel: "Amount needed at the end",
      }
    : null;
  // Months and money can't go below zero; months are whole and stop at a century, a rate at 20% a year.
  const clamp = (k: TvmField, v: number) =>
    k === "rate" ? Math.min(20, Math.max(0, v)) : k === "months" ? Math.min(MAX_MONTHS, Math.max(0, Math.round(v))) : Math.max(0, v);
  // The box being solved keeps its answer (within the box's limits) when it becomes an input again.
  // With no answer it starts empty while other boxes are blank too, and at 0 when the numbers simply had no answer.
  // It keeps the answer as shown (a solved month count already rounded up), not the unrounded value.
  const current = (): Tvm => ({ ...full, [tvmField]: ok || tooLong || tooHigh ? clamp(tvmField, full[tvmField]) : blanks ? NaN : 0 });
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
                // On a phone the answer sits above the boxes; bring it into view.
                answerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
              }}
              className={`min-h-11 shrink-0 whitespace-nowrap rounded-lg border px-2.5 text-xs${FOCUS} ${tvmField === k ? "border-accent-fill bg-accent-fill text-on-accent" : "border-border bg-surface text-muted hover:bg-chip"}`}
            >
              Calculate
            </button>
          </div>
          <NumberField
            id={`tvm-${k}`}
            // A month count past a century is no answer, so its box stays blank.
            // Likewise a rate above the box's 20% limit.
            value={(k === "months" && tooLong) || (k === "rate" && tooHigh) ? NaN : full[k]}
            decimals={k === "rate" ? 2 : 0}
            prefix={k === "months" || k === "rate" ? undefined : "S$"}
            suffix={k === "months" ? "months" : k === "rate" ? "% a year" : undefined}
            readOnly={tvmField === k}
            limit={(v) => clamp(k, v)}
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
        {ok ? ` The projection runs to ${endLabel}.` : ""}
        {overshoot
          ? ` ${tvmField === "months" && solved > 0 && full.months > solved + 1e-9 ? "Rounded up to whole months, so the projection" : "The projection"} ends ${sgd(overshoot)} above the amount needed.`
          : ""}
      </p>
    </div>
  );
  return frame(<Group title="Time Value of Money Calculator">{tvmBoxes}</Group>);

  function show(v: Tvm, k: TvmField): string {
    if (k === "months")
      return v.months > MAX_MONTHS ? `Over ${MAX_MONTHS.toLocaleString("en-SG")} months` : `${wholeMonths(v.months).toLocaleString("en-SG")} months`;
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
                Time Value of Money Calculator
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
                        // A new cost is the amount needed, so stop working that box out and solve the default one instead.
                        if (tvmField === "end") setTvmField(seedField);
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
                <div ref={answerRef} className="scroll-mt-4 space-y-2 rounded-xl bg-chip p-4" aria-live="polite">
                  {answer}
                </div>
                {bars && (
                  <Chart
                    bars={bars}
                    still={
                      noMonths
                        ? `${dueNow ? "Fees are due now, so" : "With 0 months to save,"} there is no time for interest to build: the whole ${sgd(full.end)} is your own money.`
                        : coveredAlready
                          ? `Nothing more is needed: what goes in already reaches ${sgd(full.end)}.`
                          : null
                    }
                  />
                )}
                {bars && (
                <details className="rounded-xl border border-border">
                  <summary className={`cursor-pointer rounded-xl px-4 py-3 text-sm font-medium${FOCUS}`}>
                    Year by year
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
                        {plan.years.map((y) => (
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
      {note && <p className="text-sm">{note}</p>}
    </>
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
  limit,
}: {
  id: string;
  value: number;
  onValue: (v: number) => void;
  /** The box's limits; a typed value outside them is shown as the value used. */
  limit?: (v: number) => number;
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
          if (e.target.value.trim() !== "" && Number.isFinite(v)) {
            const used = limit ? limit(v) : v;
            if (used !== v) setDraft(String(+used.toFixed(decimals)));
            onValue(used);
          }
        }}
        className="h-full min-w-0 flex-1 bg-transparent px-3 tabular-nums outline-none"
      />
      {suffix && <span className="whitespace-nowrap pr-3 text-sm text-muted">{suffix}</span>}
    </div>
  );
}

/** "Your money vs interest" for the plan. */
function Chart({
  bars,
  still,
}: {
  bars: Bars;
  /** A headline in place of the usual one when interest has nothing to do (fees due today, or nothing more needed). */
  still: string | null;
}) {
  return (
    <div className="rounded-xl border border-border p-4">
      <h3 className="text-sm font-semibold">Your money vs interest</h3>
      <p className="mt-2 text-[15px] font-semibold leading-snug text-balance">
        {still ?? (
          <>
            Interest covers <em className="not-italic text-interest-text">{sgd(bars.investing.interest)}</em>.
          </>
        )}
      </p>
      <Split bars={bars} />
    </div>
  );
}

function Split({ bars }: { bars: Bars }) {
  const side = bars.investing;
  const name = "Investing";
  const max = Math.max(bars.target, side.paidIn + side.interest) * 1.02 || 1;
  const w = (v: number) => `${Math.max(0, (v / max) * 100)}%`;
  return (
    <div className="mt-3 space-y-4">
      <div>
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
      <p className="text-xs text-muted">
        Dashed line: {bars.targetLabel[0].toLowerCase() + bars.targetLabel.slice(1)}, {sgd(bars.target)}.
      </p>
    </div>
  );
}
