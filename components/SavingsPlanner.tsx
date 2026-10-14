"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatCompactSgd, formatMoney, programmeLabel } from "@/lib/format";
import {
  DEFAULT_INVEST_RATE,
  defaultIntakeMonth,
  growTo,
  INVEST_PRESETS,
  lumpSum,
  monthlySaving,
  monthsBetween,
  neededAtStart,
  SAVING_RATE,
  simulate,
  solveTvm,
  type Plan,
  type Timing,
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

type Mode = "monthly" | "lump" | "check" | "tvm";
const MODES: [Mode, string][] = [
  ["monthly", "Monthly saving"],
  ["lump", "Lump sum today"],
  ["check", "Check my plan"],
  ["tvm", "Work out any one"],
];
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

  const [mode, setMode] = useState<Mode>("monthly");
  const [target, setTarget] = useState<number | null>(null);
  const [timing, setTiming] = useState<Timing>("yearly");
  const [intake, setIntake] = useState(defaultIntakeMonth(s.university.country));
  const [saved, setSaved] = useState(0);
  const [monthly, setMonthly] = useState(2500);
  const [rate, setRate] = useState(DEFAULT_INVEST_RATE);
  const [view, setView] = useState<"split" | "time">("split");
  const [tvmEdits, setTvmEdits] = useState<Tvm | null>(null);
  const [tvmField, setTvmField] = useState<TvmField>("monthly");
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

  // A typed total scales every year's cost alike.
  const costs = target === null ? projected : projected.map((c) => (c * target) / (projectedTotal || 1));
  const costTotal = costs.reduce((a, b) => a + b, 0);
  const months = monthsBetween(now, { year: firstYear, month: intake });
  const startLabel = `${MONTHS[intake]} ${firstYear}`;
  const need = neededAtStart(costs, rate, timing);
  const needSaving = neededAtStart(costs, SAVING_RATE, timing);
  const plan = (start: number, perMonth: number, r: number) =>
    simulate({ start, monthly: perMonth, months, ratePct: r, yearCosts: costs, timing, today: now });
  const resetTvm = () => setTvmEdits(null);

  let answer: React.ReactNode;
  let compare: [string, string] | null = null;
  let mine: Plan;
  let other: Plan | null;
  // Null when the numbers give nothing worth drawing (no time to save, no answer).
  let bars: Bars | null;
  /** How a cost is met: your money up to the cost, interest for the rest. */
  const covered = (paidIn: number, cost: number): Side => ({
    paidIn: Math.min(paidIn, cost),
    interest: Math.max(0, cost - paidIn),
  });
  /** "S$X less" when investing needs less than saving, "S$X more" when the rate is below the saving rate. */
  const lessOrMore = (diff: number, suffix: string) =>
    Math.abs(diff) < 0.5
      ? `about the same as`
      : `${sgd(Math.abs(diff))}${suffix} ${diff > 0 ? "less" : "more"} than`;

  if (mode === "monthly" || mode === "lump") {
    const lump = mode === "lump";
    const amount = lump ? lumpSum(need, saved, rate, months) : monthlySaving(need, saved, rate, months);
    const amountSaving = lump
      ? lumpSum(needSaving, saved, SAVING_RATE, months)
      : monthlySaving(needSaving, saved, SAVING_RATE, months);
    const tooLate = !Number.isFinite(amount) || !Number.isFinite(amountSaving);
    mine = lump ? plan(saved + amount, 0, rate) : plan(saved, tooLate ? 0 : amount, rate);
    other = lump ? plan(saved + amountSaving, 0, SAVING_RATE) : plan(saved, tooLate ? 0 : amountSaving, SAVING_RATE);
    const unit = lump ? " once" : " a month";
    answer = tooLate ? (
      <Answer
        question={`First fees are due ${startLabel}`}
        value="No time to save"
        note="Pick a later start year or first-fees month to plan monthly saving."
      />
    ) : (
      <Answer
        question={lump ? "Set aside today, on top of what you've saved" : `Save each month from ${MONTHS[now.month]} ${now.year} to ${startLabel}`}
        value={sgd(amount)}
        unit={unit}
        note={
          amount === 0
            ? "What you've saved already covers it."
            : lump
              ? `Investing at ${pct(rate)} needs ${lessOrMore(amountSaving - amount, "")} saving at ${pct(SAVING_RATE)}.`
              : `Investing at ${pct(rate)} means ${lessOrMore(amountSaving - amount, " a month")} saving at ${pct(SAVING_RATE)}.`
        }
      />
    );
    if (!tooLate) compare = [sgd(amountSaving) + (lump ? "" : " /mo"), sgd(amount) + (lump ? "" : " /mo")];
    bars = tooLate
      ? null
      : {
          saving: covered(other.paidIn, costTotal),
          investing: covered(mine.paidIn, costTotal),
          target: costTotal,
          targetLabel: "Total cost",
          rate,
        };
  } else if (mode === "check") {
    mine = plan(saved, monthly, rate);
    other = plan(saved, monthly, SAVING_RATE);
    const reached = growTo(saved, monthly, rate, months);
    const reachedSaving = growTo(saved, monthly, SAVING_RATE, months);
    const gap = need - reached;
    const extra = monthlySaving(gap, 0, rate, months);
    const share = (got: number, needed: number) =>
      needed > 0 ? `${Math.round((got / needed) * 100)}% of what's needed` : "more than enough";
    answer = (
      <Answer
        question={`Investing at ${pct(rate)}, by ${startLabel} your savings grow to`}
        value={sgd(reached)}
        status={
          gap <= 0
            ? { good: true, text: `Covers the cost, with ${sgd(Math.max(0, -gap))} to spare` }
            : { good: false, text: `Covers ${Math.round((reached / need) * 100)}%, short by ${sgd(gap)}` }
        }
        note={`${gap > 0 && Number.isFinite(extra) ? `Saving another ${sgd(extra)} a month closes the gap. ` : ""}Saving at ${pct(SAVING_RATE)}, the same plan reaches ${sgd(reachedSaving)}, ${share(reachedSaving, needSaving)}.`}
      />
    );
    compare = [sgd(reachedSaving), sgd(reached)];
    bars = {
      saving: { paidIn: mine.paidIn, interest: reachedSaving - mine.paidIn },
      investing: { paidIn: mine.paidIn, interest: reached - mine.paidIn },
      target: need,
      targetLabel: `Needed by ${startLabel}`,
      rate,
      sameMoney: true,
    };
  } else {
    const seed: Tvm = { months, rate, start: saved, monthly: 0, end: need, startOfMonth };
    const t: Tvm = { ...(tvmEdits ?? seed), startOfMonth };
    const solved = solveTvm(t, tvmField);
    const full: Tvm = { ...t, [tvmField]: solved };
    const ok = Number.isFinite(solved);
    // Only a real answer is simulated, and never beyond a century of months.
    const n = ok ? Math.min(MAX_MONTHS, Math.max(0, Math.round(full.months))) : 0;
    mine = simulate({ start: full.start, monthly: full.monthly, months: n, ratePct: full.rate, startOfMonth, today: now });
    other = null;
    let savingSide: Side | null = null;
    if (ok && tvmField !== "rate") {
      const s0: Tvm = { ...t, rate: SAVING_RATE, end: tvmEdits ? t.end : needSaving };
      const v = solveTvm(s0, tvmField);
      if (Number.isFinite(v)) {
        const f = { ...s0, [tvmField]: v };
        other = simulate({ start: f.start, monthly: f.monthly, months: Math.min(MAX_MONTHS, Math.max(0, Math.round(f.months))), ratePct: SAVING_RATE, startOfMonth, today: now });
        savingSide = { paidIn: f.start + f.monthly * f.months, interest: f.end - f.start - f.monthly * f.months };
        compare = [show(f, tvmField), show(full, tvmField)];
      }
    }
    answer = (
      <Answer
        question={TVM_FIELDS.find(([k]) => k === tvmField)![2]}
        value={ok ? show(full, tvmField) : "Not possible"}
        note={
          ok
            ? `"Amount needed at the end" starts as what's needed by ${startLabel}, ${sgd(need)}. Change any four boxes and tap "Work this out" on the one you want.`
            : "No answer fits these numbers. Check the four boxes you filled in."
        }
      />
    );
    const paid = full.start + full.monthly * full.months;
    bars = ok
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
    // A box with no answer ("Not possible") is kept as 0 when it becomes an input again.
    const edit = (k: TvmField, v: number) => setTvmEdits({ ...full, [tvmField]: ok ? solved : 0, [k]: clamp(k, v) });
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
                  setTvmEdits({ ...full, [tvmField]: ok ? solved : 0 });
                  setTvmField(k);
                }}
                className={`min-h-11 shrink-0 whitespace-nowrap rounded-lg border px-2.5 text-xs${FOCUS} ${tvmField === k ? "border-accent-fill bg-accent-fill text-on-accent" : "border-border bg-surface text-muted hover:bg-chip"}`}
              >
                {tvmField === k ? "Worked out" : "Work this out"}
              </button>
            </div>
            <NumberField
              id={`tvm-${k}`}
              value={full[k]}
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
          Interest is added monthly. {months} months until {startLabel}.
        </p>
      </div>
    );
    return frame(<Group title="Fill in four, work out the fifth">{tvmBoxes}</Group>);
  }

  return frame(
      <Group title="Your savings">
        <Field label="Already saved" htmlFor="sp-saved">
          <NumberField id="sp-saved" value={saved} prefix="S$" onValue={(v) => setSaved(Math.max(0, v))} />
        </Field>
        {mode === "check" && (
          <Field label="You save each month" htmlFor="sp-monthly">
            <NumberField id="sp-monthly" value={monthly} prefix="S$" onValue={(v) => setMonthly(Math.max(0, v))} />
          </Field>
        )}
        <Field label="Investing at" htmlFor="sp-rate">
          <NumberField
            id="sp-rate"
            value={rate}
            decimals={2}
            suffix="% a year"
            onValue={(v) => v >= 0 && v <= 20 && setRate(v)}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {INVEST_PRESETS.map(([r, name]) => (
              <button
                key={r}
                type="button"
                aria-pressed={rate === r}
                onClick={() => setRate(r)}
                className={`min-h-11 rounded-full border px-3 text-xs${FOCUS} ${rate === r ? "border-accent font-medium text-accent" : "border-border bg-surface text-muted hover:bg-chip"}`}
              >
                {name} {r}%
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Compared with saving at a fixed {pct(SAVING_RATE)} a year.</p>
        </Field>
      </Group>,
  );

  function show(v: Tvm, k: TvmField): string {
    if (k === "months") return `${Math.round(v.months)} months`;
    if (k === "rate") return `${v.rate.toFixed(2)}% a year`;
    return sgd(v[k]);
  }

  /** The pop-up around the mode-specific inputs: header, modes, cost, results. */
  function frame(children: React.ReactNode) {
    return (
      <div className="fixed inset-0 z-50">
        <button
          type="button"
          aria-label="Close"
          tabIndex={-1}
          onClick={onClose}
          className="absolute inset-0 bg-foreground/50"
        />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={`absolute flex flex-col overflow-hidden bg-surface shadow-2xl ${
            sheet
              ? "inset-x-0 bottom-0 max-h-[92vh] rounded-t-3xl"
              : "left-1/2 top-1/2 max-h-[90vh] w-[min(56rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border"
          }`}
        >
          {sheet && <div aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border" />}
          <div className="flex shrink-0 items-start gap-3 border-b border-border px-4 pb-3 pt-3 sm:px-6 sm:pt-4">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-lg font-semibold">
                Plan your savings
              </h2>
              <p className="text-sm text-muted">
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

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-5 pt-4 sm:px-6">
            <div
              role="radiogroup"
              aria-label="What do you want to work out?"
              className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0"
            >
              {MODES.map(([m, text]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={`min-h-11 shrink-0 rounded-full border px-3.5 text-sm${FOCUS} ${
                    mode === m
                      ? "border-accent-fill bg-accent-fill font-medium text-on-accent"
                      : "border-border bg-surface text-muted hover:bg-chip"
                  }`}
                >
                  {text}
                </button>
              ))}
            </div>

            <div className="grid items-start gap-5 md:grid-cols-[18rem_minmax(0,1fr)]">
              <div className="min-w-0 space-y-4">
                <Group title="The cost">
                  <Field label="Projected total cost" htmlFor="sp-target">
                    <NumberField
                      id="sp-target"
                      value={costTotal}
                      prefix="S$"
                      onValue={(v) => {
                        setTarget(Math.max(0, v));
                        resetTvm();
                      }}
                    />
                    <p className="mt-1 text-xs text-muted">
                      {target === null ? (
                        `From Compare · ${projected.length} ${projected.length === 1 ? "year" : "years"}${s.living ? ", fees and living costs" : " of fees"}`
                      ) : (
                        <>
                          You changed this. Compare says {sgd(projectedTotal)}.{" "}
                          <button
                            type="button"
                            onClick={() => {
                              setTarget(null);
                              resetTvm();
                            }}
                            className={`text-accent underline underline-offset-2${FOCUS}`}
                          >
                            Reset
                          </button>
                        </>
                      )}
                    </p>
                  </Field>
                  <Field label="Money is needed">
                    <TwoWay
                      label="Money is needed"
                      options={[
                        ["yearly", "Year by year, as fees fall due"],
                        ["start", "All of it at the start"],
                      ]}
                      value={timing}
                      onChange={(v) => {
                        setTiming(v);
                        resetTvm();
                      }}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Field label="First fees due" htmlFor="sp-intake">
                      <div className="flex h-11 items-center rounded-lg border border-border bg-surface pr-3 focus-within:border-accent">
                        <select
                          id="sp-intake"
                          value={intake}
                          onChange={(e) => {
                            setIntake(Number(e.target.value));
                            resetTvm();
                          }}
                          className="h-full min-w-0 flex-1 bg-transparent pl-3 outline-none"
                        >
                          {MONTHS.map((m, i) => (
                            <option key={m} value={i}>
                              {m}
                            </option>
                          ))}
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
                      <Compared label={`Investing at ${pct(bars?.rate ?? rate)}`} value={compare[1]} color="var(--series-1)" />
                    </dl>
                  )}
                </div>
                {bars && (
                  <Chart bars={bars} mine={mine} other={other} today={now} startMonth={mode === "tvm" ? null : months} startLabel={startLabel} view={view} setView={setView} />
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
                          <th className="px-2 font-medium">Costs paid</th>
                          <th className="pl-2 font-medium">Balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mine.years.map((y) => (
                          <tr key={y.year} className="border-t border-border">
                            <td className="py-1.5 pr-2 text-left">{y.year}</td>
                            <td className="px-2">{y.paidIn ? sgd(y.paidIn) : "–"}</td>
                            <td className="px-2">{sgd(y.interest)}</td>
                            <td className="px-2">{y.costs ? sgd(y.costs) : "–"}</td>
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
          </div>

          <div className={`flex shrink-0 items-center gap-3 border-t border-border px-4 pt-3 sm:px-6 ${sheet ? "pb-[max(0.75rem,env(safe-area-inset-bottom))]" : "pb-3"}`}>
            <p className="min-w-0 flex-1 text-xs text-muted">
              An estimate, not financial advice. Returns are not guaranteed; costs after the published year are projections.
            </p>
            <button
              type="button"
              onClick={onClose}
              className={`min-h-11 rounded-lg bg-accent-fill px-5 font-medium text-on-accent${FOCUS}`}
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
    : "–";
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
          const v = parseFloat(e.target.value.replace(/[^0-9.-]/g, ""));
          if (Number.isFinite(v)) onValue(v);
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
}: {
  bars: Bars;
  mine: Plan;
  other: Plan | null;
  today: { year: number; month: number };
  startMonth: number | null;
  startLabel: string;
  view: "split" | "time";
  setView: (v: "split" | "time") => void;
}) {
  const { saving, investing } = bars;
  const r = pct(bars.rate);
  const showTime = view === "time" && saving && other && !bars.sameMoney;
  const headline = !saving ? (
    <>
      At {r}, interest covers <em className="not-italic text-series-4">{sgd(investing.interest)}</em>.
    </>
  ) : bars.sameMoney ? (
    <>
      Investing at {r} grows the same plan to{" "}
      <em className="not-italic text-series-4">{sgd(investing.interest - saving.interest)} more</em> than saving at {pct(SAVING_RATE)}.
    </>
  ) : Math.abs(saving.paidIn - investing.paidIn) < 0.5 ? (
    <>
      Investing at {r} takes <em className="not-italic text-series-4">the same money</em> as saving at {pct(SAVING_RATE)}.
    </>
  ) : (
    <>
      Investing at {r} means{" "}
      <em className="not-italic text-series-4">
        {sgd(Math.abs(saving.paidIn - investing.paidIn))} {saving.paidIn > investing.paidIn ? "less" : "more"}
      </em>{" "}
      of your own money than saving at {pct(SAVING_RATE)}.
    </>
  );
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Saving vs investing</h3>
        {saving && other && !bars.sameMoney && (
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
                className={`min-h-10 rounded-md px-2.5${FOCUS} ${view === v ? "bg-accent-fill font-medium text-on-accent" : "text-muted"}`}
              >
                {text}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="mt-2 text-[15px] font-semibold leading-snug text-balance">{headline}</p>
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
    years.push([yr, m]);
  }
  const labelM = Math.round((startMonth ?? maxM) * 0.8);
  const labelPt = investing.points.find((q) => q.month === labelM);
  // Labels sit on a halo of the background so the lines don't cut through them;
  // the "Fees start" label flips to the right of its line when the line is near the left edge.
  const halo = { paintOrder: "stroke" as const, stroke: "var(--surface)", strokeWidth: 4, strokeLinejoin: "round" as const };
  const startX = startMonth !== null ? x(startMonth) : 0;
  const startLeft = startX < (pad.l + W) / 2;
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
          <text key={yr} x={x(m)} y={H - 6} textAnchor="middle" fill="var(--muted)">
            {yr}
          </text>
        ))}
        <path d={`${path(saving)}${back}Z`} fill="var(--series-4)" fillOpacity={0.22} />
        {startMonth !== null && startMonth <= maxM && (
          <g>
            <line x1={x(startMonth)} x2={x(startMonth)} y1={pad.t} y2={H - pad.b} stroke="var(--muted)" strokeDasharray="3 3" />
            <text
              x={startLeft ? startX + 5 : startX - 5}
              y={pad.t + 10}
              textAnchor={startLeft ? "start" : "end"}
              fill="var(--foreground)"
              style={halo}
            >
              Fees start · {startLabel}
            </text>
          </g>
        )}
        <path d={path(saving)} fill="none" stroke="var(--you)" strokeWidth={2.4} />
        <path d={path(investing)} fill="none" stroke="var(--series-1)" strokeWidth={2.4} />
        {gap > 0 && labelPt && (
          <text x={x(labelM)} y={y(labelPt.paidIn) + 18} textAnchor="middle" fill="var(--series-4)" fontWeight={600} style={halo}>
            Interest covers {formatCompactSgd(gap)}
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
