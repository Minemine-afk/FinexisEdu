"use client";

import { useEffect, useRef, useState } from "react";
import type { Residency } from "@/lib/calc";
import {
  FIELD_LABELS,
  LEVEL_LABELS,
  RESIDENCY_LABELS,
  formatCompactSgd,
  partnerOf,
  recognitionTag,
} from "@/lib/format";
import { FIELDS, LEVELS, type Field } from "@/lib/schema";
import type { Lifestyle } from "@/lib/living";
import FeeChart from "./FeeChart";
import InfoTip from "./InfoTip";
import type { GlossaryTerm } from "@/lib/glossary";
import ResultDetail, { FOCUS } from "./ResultDetail";
import StatTiles from "./StatTiles";
import TouchCalculator from "./TouchCalculator";
import { useLayout } from "./useLayout";
import {
  increaseBasisNote,
  LIFESTYLE_LABELS,
  MAX_SELECTED,
  MIN_START_YEAR,
  pickProgramme,
  useCalculator,
  type CalculatorProps,
  type CountryGroup,
  type Option,
} from "./useCalculator";

export type { Selection } from "./useCalculator";

/**
 * Picks the layout for the screen: the phone and tablet layouts below `lg`
 * (and on large touch screens such as an iPad in landscape), the desktop
 * layout otherwise. The server renders the desktop layout.
 */
export default function Calculator(props: CalculatorProps) {
  const layout = useLayout();
  const state = useCalculator(props);
  if (layout !== "desktop") {
    return <TouchCalculator state={state} layout={layout} today={props.today} />;
  }
  return <DesktopCalculator state={state} today={props.today} />;
}

function DesktopCalculator({
  state,
  today,
}: {
  state: ReturnType<typeof useCalculator>;
  today: string;
}) {
  const {
    countryByCode,
    level,
    changeLevel,
    residency,
    setResidency,
    startYearInput,
    startYearError,
    typeStartYear,
    customIncrease,
    setCustomIncrease,
    includeLiving,
    setIncludeLiving,
    lifestyle,
    setLifestyle,
    setCustomLivingFor,
    category,
    categories,
    setCompare,
    reasonFor,
    selected,
    chosen,
    setSlot,
    addSlot,
    removeSlot,
    selections,
    grouped,
    baseYearLabel,
  } = state;

  // On phones the options panel comes first, so a bottom bar links to the results.
  const resultsRef = useRef<HTMLElement>(null);
  const [resultsInView, setResultsInView] = useState(false);
  useEffect(() => {
    const el = resultsRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => setResultsInView(entry.isIntersecting),
      { threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const select = `mt-1 w-full rounded-md border border-border bg-surface px-3 py-2${FOCUS}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <aside className="space-y-5 rounded-xl border border-border bg-sidebar p-5 lg:self-start">
        <Segmented
          label="Level"
          value={level}
          options={LEVELS.map((l) => [l, LEVEL_LABELS[l]])}
          onChange={changeLevel}
        />

        <label className="block">
          <span className="text-sm font-medium">
            <InfoTip term="residency">Residency</InfoTip>
          </span>
          <select
            className={select}
            value={residency}
            onChange={(e) => setResidency(e.target.value as Residency)}
          >
            {(Object.keys(RESIDENCY_LABELS) as Residency[]).map((r) => (
              <option key={r} value={r}>
                {RESIDENCY_LABELS[r]}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted">
            Changes Singapore fees only; abroad you pay international rates.
          </span>
        </label>

        <fieldset className="min-w-0 rounded-md border border-border bg-surface/60 p-3">
          <legend className="px-1 text-sm font-medium">
            <InfoTip term="feeIncrease">
              Rates based on {baseYearLabel} figures
            </InfoTip>
          </legend>
          <label className="block">
            <span className="text-sm">
              <InfoTip term="startYear">Start year</InfoTip>
            </span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={4}
              placeholder={String(MIN_START_YEAR)}
              aria-invalid={startYearError !== null}
              aria-describedby="start-year-hint"
              className={`${select} tabular-nums${startYearError ? " border-warn-fg" : ""}`}
              value={startYearInput}
              onChange={(e) => typeStartYear(e.target.value)}
            />
            <span
              id="start-year-hint"
              className={`mt-1 block text-xs ${startYearError ? "text-warn-fg" : "text-muted"}`}
            >
              {startYearError ??
                `Enter the year the degree starts, ${MIN_START_YEAR} or later.`}
            </span>
          </label>
          <div className="mt-3 text-sm">
            <span>% inflation</span>
            <ul className="mt-1 space-y-1 text-xs">
              {selections.length === 0 && (
                <li className="text-muted">
                  Pick a university to see its rate.
                </li>
              )}
              {selections.map((s) => (
                <li
                  key={s.key}
                  className="flex items-baseline justify-between gap-2"
                >
                  <span className="min-w-0 truncate text-muted">
                    {partnerOf(s.university, s.programme)
                      ? `${partnerOf(s.university, s.programme)!.name} · ${s.university.name}`
                      : s.university.name}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    <InfoTip term="universityIncrease" align="right">
                      {customIncrease !== null ? (
                        <span className="text-muted line-through">
                          {(s.increase.rate * 100).toFixed(1)}%
                        </span>
                      ) : null}{" "}
                      <span className="font-medium">
                        {(s.feeIncrease * 100).toFixed(1)}%
                      </span>
                      <span className="text-muted">/yr</span>
                    </InfoTip>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-muted">
              {customIncrease === null
                ? increaseBasisNote(selections)
                : "Your rate, applied to every university."}
            </p>
          </div>
          <div className="mt-2 flex min-h-8 items-center gap-2 text-xs">
            <input
              id="custom-increase"
              type="checkbox"
              checked={customIncrease !== null}
              onChange={(e) =>
                setCustomIncrease(e.target.checked ? 0.03 : null)
              }
            />
            <label htmlFor="custom-increase">Use my own rate instead</label>
            {customIncrease !== null && (
              <span className="ml-auto flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={20}
                  step={0.5}
                  aria-label="Yearly fee increase in percent"
                  className={`w-16 rounded-md border border-border bg-surface px-2 py-1 text-right${FOCUS}`}
                  value={+(customIncrease * 100).toFixed(1)}
                  onChange={(e) =>
                    setCustomIncrease(Math.max(0, Number(e.target.value)) / 100)
                  }
                />
                %
              </span>
            )}
          </div>
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="text-sm font-medium">
            <InfoTip term="livingCosts">Living costs</InfoTip>
          </legend>
          <label className="mt-1 flex min-h-10 cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeLiving}
              onChange={(e) => setIncludeLiving(e.target.checked)}
            />
            Include living costs
          </label>
          {includeLiving ? (
            <Segmented
              label="Lifestyle"
              value={lifestyle}
              options={(Object.keys(LIFESTYLE_LABELS) as Lifestyle[]).map(
                (l) => [l, LIFESTYLE_LABELS[l]],
              )}
              onChange={setLifestyle}
              small
              tip="lifestyle"
            />
          ) : (
            <p className="mt-1 text-xs text-muted">
              Each university&apos;s own estimate; not for Singapore
              universities.
            </p>
          )}
        </fieldset>

        <div className="space-y-3">
          <p className="text-sm font-medium">
            {selected.length > 1 ? "Universities" : "University"}{" "}
            <span className="font-normal text-muted">
              (compare up to {MAX_SELECTED})
            </span>
          </p>
          {grouped.length === 0 && (
            <p className="text-sm text-muted">
              No fee data for this level yet.
            </p>
          )}
          {chosen.map((o, i) => (
            <UniversityPicker
              key={i}
              index={i}
              current={o}
              others={chosen.filter((_, j) => j !== i)}
              grouped={grouped}
              reasonFor={reasonFor}
              onChange={(key) => setSlot(i, key)}
              onRemove={i > 0 ? () => removeSlot(i) : undefined}
            />
          ))}
          {grouped.length > 0 && selected.length < MAX_SELECTED && (
            <button
              type="button"
              onClick={addSlot}
              className={`flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-accent px-3 py-2.5 text-sm font-medium text-accent hover:bg-chip${FOCUS}`}
            >
              <span aria-hidden>+</span> Compare{" "}
              {selected.length === 0 ? "a" : "another"} university
            </button>
          )}
        </div>
      </aside>

      <section
        id="results"
        ref={resultsRef}
        className="min-w-0 scroll-mt-4 space-y-6"
      >
        {selections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted">
            Pick a university to see its total {includeLiving ? "cost" : "fees"}
            .
          </div>
        ) : (
          <>
            <StatTiles selections={selections} countryByCode={countryByCode} />

            <div className="space-y-3">
              {categories.length > 1 && (
                <div
                  role="radiogroup"
                  aria-label="Compare"
                  className="flex flex-wrap items-center gap-1.5 text-sm"
                >
                  <span className="mr-1 text-muted">Compare:</span>
                  {categories.map(([c, text]) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={category === c}
                      onClick={() => setCompare(c)}
                      className={`rounded-full border px-3 py-1.5 sm:py-1${FOCUS} ${
                        category === c
                          ? "border-accent-fill bg-accent-fill font-medium text-on-accent"
                          : "border-border bg-surface text-muted hover:bg-chip"
                      }`}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              )}
              <FeeChart
                selections={selections}
                category={category}
                includeLiving={includeLiving}
              />
            </div>

            <div className="rounded-xl border border-border bg-surface p-5">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
                Details (in SGD)
              </h2>
              <div
                className={`mt-3 grid gap-8 md:gap-0 md:divide-x md:divide-border ${selections.length === 3 ? "md:grid-cols-3" : selections.length === 2 ? "md:grid-cols-2" : ""}`}
              >
                {selections.map((s, i) => (
                  <ResultDetail
                    key={s.key}
                    s={s}
                    today={today}
                    country={countryByCode.get(s.university.country)}
                    lifestyle={lifestyle}
                    className={
                      selections.length === 1
                        ? ""
                        : i === 0
                          ? "md:pr-4"
                          : i === selections.length - 1
                            ? "md:pl-4"
                            : "md:px-4"
                    }
                    onCustomLiving={(m) =>
                      setCustomLivingFor(s.university.id, m)
                    }
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </section>

      {selections.length > 0 && !resultsInView && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur lg:hidden">
          <div className="safe-x mx-auto flex max-w-6xl items-center justify-between gap-3 py-2.5">
            <p className="min-w-0 text-sm">
              <span className="font-medium">
                {selections.length}{" "}
                {selections.length === 1 ? "university" : "universities"}
              </span>
              <span className="block truncate text-xs text-muted">
                From {formatCompactSgd(selections[0].grandTotalSgd)}{" "}
                {includeLiving ? "incl. living costs" : "in fees"}
              </span>
            </p>
            <a
              href="#results"
              className={`shrink-0 rounded-md bg-accent-fill px-4 py-2.5 text-sm font-medium text-on-accent${FOCUS}`}
            >
              View results ↓
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/** One comparison slot: country, university, field of study and (if several) programme. */
function UniversityPicker({
  index,
  current,
  others,
  grouped,
  reasonFor,
  onChange,
  onRemove,
}: {
  index: number;
  current: Option;
  /** What the other slots hold, so the same programme isn't picked twice. */
  others: Option[];
  grouped: CountryGroup[];
  reasonFor: (o: Option) => string | null;
  onChange: (key: string) => void;
  onRemove?: () => void;
}) {
  const select = `mt-1 w-full rounded-md border border-border bg-surface px-3 py-2${FOCUS}`;
  const group = grouped.find(
    (g) => g.country?.code === current.university.country,
  );
  const inCountry = group?.options ?? [];
  // One entry per university in the chosen country.
  const universities = inCountry.filter(
    (o, i, arr) =>
      arr.findIndex((x) => x.university.id === o.university.id) === i,
  );
  const atUniversity = inCountry.filter(
    (o) => o.university.id === current.university.id,
  );
  // Institutions such as SIM teach other universities' degrees: pick the awarding partner next.
  const partners = (current.university.partners ?? []).filter((p) =>
    atUniversity.some((o) => o.programme.partner === p.id),
  );
  const atPartner = partners.length
    ? atUniversity.filter((o) => o.programme.partner === current.programme.partner)
    : atUniversity;
  const fields = FIELDS.filter((f) =>
    atPartner.some((o) => o.programme.field === f),
  );
  const programmes = atPartner.filter(
    (o) => o.programme.field === current.programme.field,
  );
  const reason = reasonFor(current);

  // Prefer a programme that can be priced for this student, in the same field as now; avoid duplicating another slot.
  const taken = new Set(others.map((o) => o.key));
  const pick = (candidates: Option[], field: Field = current.programme.field) =>
    pickProgramme(candidates, field, reasonFor, taken);

  return (
    <fieldset className="min-w-0 rounded-md border border-border bg-surface/60 p-3">
      <legend className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wide text-muted">
        University {index + 1}
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove university ${index + 1} from the comparison`}
            className={`rounded px-1 normal-case tracking-normal text-muted hover:text-accent${FOCUS}`}
          >
            remove
          </button>
        )}
      </legend>
      <label className="block">
        <span className="text-sm">Country</span>
        <select
          className={select}
          value={current.university.country}
          onChange={(e) => {
            const g = grouped.find((x) => x.country?.code === e.target.value);
            if (g) onChange(pick(g.options).key);
          }}
        >
          {grouped.map((g) => (
            <option key={g.country?.code} value={g.country?.code}>
              {g.country?.name}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-2 block">
        <span className="text-sm">University</span>
        <select
          className={select}
          value={current.university.id}
          onChange={(e) =>
            onChange(
              pick(inCountry.filter((o) => o.university.id === e.target.value))
                .key,
            )
          }
        >
          {universities.map((u) => {
            const priced = inCountry.some(
              (o) =>
                o.university.id === u.university.id && reasonFor(o) === null,
            );
            return (
              <option key={u.university.id} value={u.university.id}>
                {u.university.name}
                {!priced ? " (no published fee)" : ""}
              </option>
            );
          })}
        </select>
      </label>
      {partners.length > 0 && (
        <label className="mt-2 block">
          <span className="text-sm">Partner university</span>
          <select
            className={select}
            value={current.programme.partner}
            onChange={(e) =>
              onChange(
                pick(
                  atUniversity.filter(
                    (o) => o.programme.partner === e.target.value,
                  ),
                ).key,
              )
            }
          >
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="mt-2 block">
        <span className="text-sm">Field of study</span>
        <select
          className={select}
          value={current.programme.field}
          onChange={(e) => {
            const field = e.target.value as Field;
            onChange(
              pick(
                atPartner.filter((o) => o.programme.field === field),
                field,
              ).key,
            );
          }}
        >
          {fields.map((f) => (
            <option key={f} value={f}>
              {FIELD_LABELS[f]}
            </option>
          ))}
        </select>
      </label>
      {programmes.length > 1 ? (
        <label className="mt-2 block">
          <span className="text-sm">Programme</span>
          <select
            className={select}
            value={current.key}
            onChange={(e) => onChange(e.target.value)}
          >
            {programmes.map((o) => (
              <option key={o.key} value={o.key}>
                {o.programme.name}
                {o.programme.majors
                  ? ` (${o.programme.majors.length} majors)`
                  : ""}
                {reasonFor(o) ? " (no published fee)" : ""}
                {recognitionTag(o.programme)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="mt-1 text-xs text-muted">{current.programme.name}</p>
      )}
      {current.programme.majors && (
        <p className="mt-1 text-xs text-muted">
          Majors: {current.programme.majors.join(", ")}
        </p>
      )}
      {reason && (
        <p className="mt-1 text-xs text-warn-fg">
          {reason}. Change the start year or residency to price it.
        </p>
      )}
      {taken.has(current.key) && (
        <p className="mt-1 text-xs text-warn-fg">
          Same programme as another slot; pick a different one to compare.
        </p>
      )}
    </fieldset>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  small,
  tip,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  /** Compact buttons for a secondary control. */
  small?: boolean;
  /** Glossary entry explaining the control. */
  tip?: GlossaryTerm;
}) {
  return (
    <div>
      <span className={small ? "text-xs text-muted" : "text-sm font-medium"}>
        {tip ? (
          <InfoTip term={tip} align="right">
            {label}
          </InfoTip>
        ) : (
          label
        )}
      </span>
      <div
        role="radiogroup"
        aria-label={label}
        className="mt-1 grid gap-1 rounded-md border border-border bg-surface p-1"
        style={{
          gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`,
        }}
      >
        {options.map(([v, text]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={`rounded px-1 ${small ? "py-1.5 text-xs" : "py-2.5 text-sm sm:py-1.5"}${FOCUS} ${value === v ? "bg-accent-fill font-medium text-on-accent" : "text-muted hover:bg-chip"}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
