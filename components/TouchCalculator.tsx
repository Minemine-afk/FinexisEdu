"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { Residency } from "@/lib/calc";
import {
  FIELD_LABELS,
  LEVEL_LABELS,
  RESIDENCY_LABELS,
  formatCompactSgd,
  OWN,
  institutionLabel,
  partnerChoices,
  partnerPickerLabel,
  programmeLabel,
  recognitionTag,
} from "@/lib/format";
import { FIELDS, LEVELS, type Field, type Partner } from "@/lib/schema";
import type { Lifestyle } from "@/lib/living";
import { Breakdown, INFLATION_CAPTION, barLabel, chartParts, valueFor, type CompareCategory } from "./FeeChart";
import InfoTip from "./InfoTip";
import RateInput from "./RateInput";
import ResultDetail, { FOCUS } from "./ResultDetail";
import SavingsPlanner from "./SavingsPlanner";
import StatTiles, { EmptyResults } from "./StatTiles";
import {
  increaseBasisNote,
  LIFESTYLE_LABELS,
  MAX_SELECTED,
  MIN_START_YEAR,
  pickProgramme,
  unavailableHint,
  type CalculatorState,
  type Option,
  type Selection,
} from "./useCalculator";
import type { Layout } from "./useLayout";

/**
 * The calculator for touch screens. Phones get two tabs behind a bottom tab
 * bar: Details (the assumptions, then the universities to compare) first and
 * Compare second; tablets keep the settings in a sidebar beside the results. Both pick a
 * university from a sheet instead of a stack of dropdowns, and every control
 * is at least 44px tall.
 */
export default function TouchCalculator({
  state,
  layout,
  today,
}: {
  state: CalculatorState;
  layout: Exclude<Layout, "desktop">;
  today: string;
}) {
  const { selections, chosen, selected, addSlot, grouped } = state;
  const [tab, setTab] = useState<Tab>("settings");
  // Each tab keeps its own scroll position, so Compare → Details → Compare returns to the same place.
  const tabScroll = useRef<Record<Tab, number>>({ settings: 0, compare: 0 });
  // A settings chip opens Details at the control it names.
  const jumpTo = useRef<string | null>(null);
  const changeTab = (next: Tab, top = false) => {
    tabScroll.current[tab] = window.scrollY;
    if (top) {
      tabScroll.current[next] = 0;
      // "View results" lands on the results themselves, below the page header.
      if (next === "compare") jumpTo.current = "touch-compare";
    }
    setTab(next);
  };
  useEffect(() => {
    if (layout === "tablet") return;
    const target = jumpTo.current && document.getElementById(jumpTo.current);
    jumpTo.current = null;
    if (target) target.scrollIntoView({ block: "start" });
    else window.scrollTo({ top: tabScroll.current[tab] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  // On a phone a focused box (or one the keyboard pushes up) stops above the fixed tab bar.
  useEffect(() => {
    if (layout === "tablet") return;
    const html = document.documentElement.style;
    html.scrollPaddingBottom = "calc(7.5rem + env(safe-area-inset-bottom))";
    return () => {
      html.scrollPaddingBottom = "";
    };
  }, [layout]);
  // The comparison slot open in the picker sheet, if any.
  const [editing, setEditing] = useState<number | null>(null);
  const closeSheet = useCallback(() => setEditing(null), []);
  // The savings planner lives here, not in the tiles, so it survives a phone
  // turning into a tablet (and back) mid-plan.
  const [planKey, setPlanKey] = useState<string | null>(null);
  const closePlanner = useCallback(() => setPlanKey(null), []);
  const planning = selections.find((s) => s.key === planKey);

  function addAndEdit() {
    const i = selected.length;
    addSlot();
    setEditing(i);
  }

  const universities = (
    <div className="space-y-3">
      <p className="flex items-baseline justify-between text-sm">
        <span className="font-medium">
          {chosen.length > 1 ? "Universities" : "University"}
        </span>
        <span className="text-muted">compare up to {MAX_SELECTED}</span>
      </p>
      {grouped.length === 0 && (
        <p className="text-sm text-muted">No fee data for this level yet.</p>
      )}
      {chosen.map((o, i) => (
        <SlotRow
          key={i}
          index={i}
          option={o}
          reason={state.reasonFor(o)}
          duplicate={chosen.some((x, j) => j !== i && x.key === o.key)}
          onOpen={() => setEditing(i)}
          onRemove={i > 0 ? () => state.removeSlot(i) : undefined}
        />
      ))}
      {grouped.length > 0 && selected.length < MAX_SELECTED && (
        <button
          type="button"
          onClick={addAndEdit}
          className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-accent px-3 text-sm font-medium text-accent hover:bg-chip${FOCUS}`}
        >
          <span aria-hidden>+</span> Compare{" "}
          {selected.length === 0 ? "a" : "another"} university
        </button>
      )}
    </div>
  );

  const sheet = editing !== null && chosen[editing] && (
    <PickerSheet
      index={editing}
      current={chosen[editing]}
      others={chosen.filter((_, j) => j !== editing)}
      state={state}
      centered={layout === "tablet"}
      onClose={closeSheet}
    />
  );

  // One tree for both layouts, so switching between them (a phone turned
  // sideways) keeps every component's state. A tablet shows the settings in a
  // sidebar beside the results; a phone keeps both tabs mounted and hides one,
  // so an expanded detail or a half-typed budget survives a trip to the other tab.
  const tablet = layout === "tablet";
  return (
    <div className={tablet ? "grid gap-6 min-[600px]:grid-cols-[17rem_1fr] md:grid-cols-[19rem_1fr] lg:grid-cols-[21rem_1fr]" : ""}>
      <aside
        className={
          tablet
            ? "space-y-6 rounded-xl border border-border bg-sidebar p-4 min-[600px]:self-start"
            : tab === "settings"
              ? "space-y-6"
              : "hidden"
        }
      >
        <Assumptions state={state} />
        <div className={tablet ? "" : "border-t border-border pt-6"}>{universities}</div>
      </aside>
      <div id="touch-compare" className={tablet ? "min-w-0" : tab === "compare" ? "scroll-mt-4 space-y-4" : "hidden"}>
        {!tablet && (
          <SettingsChips
            state={state}
            onOpen={(id) => {
              jumpTo.current = id;
              changeTab("settings");
            }}
          />
        )}
        <Results state={state} today={today} layout={layout} onPlan={setPlanKey} />
      </div>
      {!tablet && (
        <TabBar
          tab={tab}
          onChange={changeTab}
          count={selections.length}
          cheapest={selections[0]?.grandTotalSgd}
          includeLiving={selections.some((s) => s.living !== null)}
        />
      )}
      {planning && (
        <SavingsPlanner
          key={planning.key}
          selection={planning}
          today={today}
          sheet={!tablet}
          onClose={closePlanner}
        />
      )}
      {sheet}
    </div>
  );
}

type Tab = "settings" | "compare";

const BIG_BUTTON = `min-h-11 rounded-lg px-3 text-sm${FOCUS}`;

/** The current settings as a row of chips above the results; tapping one opens the Details tab. */
function SettingsChips({
  state,
  onOpen,
}: {
  state: CalculatorState;
  /** Opens the Details tab at the control with this id. */
  onOpen: (id: string) => void;
}) {
  const chips: [string, string][] = [
    [LEVEL_LABELS[state.level], "touch-level"],
    [RESIDENCY_LABELS[state.residency].replace(" student", ""), "touch-residency"],
    [`Starts ${state.startYear}`, "touch-start-year-section"],
    ...(state.customIncrease !== null
      ? [[`Your rate ${(state.customIncrease * 100).toFixed(1)}%/yr`, "touch-rate"] as [string, string]]
      : []),
    [state.includeLiving ? `${LIFESTYLE_LABELS[state.lifestyle]} living costs` : "Fees only", "touch-living"],
  ];
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {chips.map(([text, id]) => (
        <button
          key={text}
          type="button"
          onClick={() => onOpen(id)}
          className={`shrink-0 whitespace-nowrap rounded-full border border-border bg-surface px-3.5 font-medium ${BIG_BUTTON}`}
        >
          {text} <span aria-hidden className="text-xs text-muted">▾</span>
        </button>
      ))}
    </div>
  );
}

function Results({
  state,
  today,
  layout,
  onPlan,
}: {
  state: CalculatorState;
  today: string;
  layout: Exclude<Layout, "desktop">;
  onPlan: (key: string) => void;
}) {
  const { selections, countryByCode, categories, category, setCompare } =
    state;
  // Which university's year-by-year detail a tablet shows.
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const detail =
    selections.find((s) => s.key === detailKey) ?? selections[0];

  if (selections.length === 0) {
    return (
      <EmptyResults
        chosen={state.chosen}
        reasonFor={state.reasonFor}
        includeLiving={state.includeLiving}
      />
    );
  }

  return (
    <section id="results" className="min-w-0 space-y-4">
      {layout === "phone" && selections.length > 1 ? (
        <Carousel
          selections={selections}
          countryByCode={countryByCode}
          today={today}
          onPlan={onPlan}
        />
      ) : (
        <StatTiles
          selections={selections}
          countryByCode={countryByCode}
          planner={{ today, sheet: layout === "phone" }}
          onPlan={onPlan}
        />
      )}

      <div className="rounded-xl border border-border bg-surface p-4">
        {categories.length > 1 && (
          <TouchSegmented
            label="Compare"
            value={category}
            options={categories}
            onChange={setCompare}
          />
        )}
        <Bars selections={selections} category={category} />
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
          Details (in SGD)
        </h2>
        {layout === "tablet" && selections.length > 1 ? (
          <div className="mt-3 space-y-4">
            <TouchSegmented
              label="University"
              value={detail.key}
              options={selections.map((s) => [
                s.key,
                shortLabel(s, selections),
                `${s.university.name} · ${programmeLabel(s.university, s.programme)}`,
              ])}
              onChange={setDetailKey}
            />
            <ResultDetail
              key={detail.key}
              s={detail}
              today={today}
              country={countryByCode.get(detail.university.country)}
              lifestyle={state.lifestyle}
              className=""
              onCustomLiving={(m) =>
                state.setCustomLivingFor(detail.university.id, m)
              }
            />
          </div>
        ) : (
          <div className="mt-2 divide-y divide-border">
            {selections.map((s) => (
              <details key={s.key} open={selections.length === 1}>
                <summary
                  className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-2 text-sm [&::-webkit-details-marker]:hidden${FOCUS} rounded`}
                >
                  <span className="min-w-0 truncate font-medium">
                    {shortLabel(s, selections)}
                  </span>
                  <span className="shrink-0 text-muted tabular-nums">
                    {formatCompactSgd(s.grandTotalSgd)}{" "}
                    <span aria-hidden>▾</span>
                  </span>
                </summary>
                <div className="pb-4">
                  <ResultDetail
                    s={s}
                    today={today}
                    country={countryByCode.get(s.university.country)}
                    lifestyle={state.lifestyle}
                    className=""
                    onCustomLiving={(m) =>
                      state.setCustomLivingFor(s.university.id, m)
                    }
                  />
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** The headline tiles as swipeable cards, one per screen width. */
function Carousel({
  selections,
  countryByCode,
  today,
  onPlan,
}: {
  selections: Selection[];
  countryByCode: CalculatorState["countryByCode"];
  today: string;
  onPlan: (key: string) => void;
}) {
  const [rawPage, setPage] = useState(0);
  const page = Math.min(rawPage, selections.length - 1);
  return (
    <div>
      <div
        className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
        onScroll={(e) => {
          const el = e.currentTarget;
          const first = el.firstElementChild as HTMLElement | null;
          if (!first) return;
          const step = first.offsetWidth + 12;
          setPage(Math.round(el.scrollLeft / step));
        }}
      >
        {selections.map((s, i) => (
          <div
            key={s.key}
            className="w-[85%] shrink-0 snap-center [&>div]:grid-cols-1"
          >
            <StatTiles
              selections={selections}
              countryByCode={countryByCode}
              only={i}
              planner={{ today, sheet: true }}
              onPlan={onPlan}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
        {selections.map((s, i) => (
          <span
            key={s.key}
            className={`h-1.5 rounded-full transition-all ${i === page ? "w-4 bg-accent" : "w-1.5 bg-border"}`}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * A one-line name for a selection: the awarding partner and institution, plus
 * the programme only when another selection is at the same institution.
 */
function shortLabel(s: Selection, selections: Selection[]): string {
  const base = institutionLabel(s.university, s.programme);
  const clash = selections.some(
    (x) => x.key !== s.key && institutionLabel(x.university, x.programme) === base,
  );
  return clash ? `${base} · ${s.programme.name}` : base;
}

/** Horizontal bars, one per university, on a shared scale. */
function Bars({
  selections,
  category,
}: {
  selections: Selection[];
  category: CompareCategory;
}) {
  const { used, segments } = chartParts(selections, category);
  const max = Math.max(...selections.map((s) => valueFor(s, category)), 1);
  // Tapping a bar shows what it is made of, as hovering does on desktop.
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="mt-4 space-y-3">
      {selections.map((s) => {
        const breakdownId = `bar-${s.key.replace(/[^a-z0-9]/gi, "-")}`;
        return (
          <div key={s.key}>
            <button
              type="button"
              aria-expanded={open === s.key}
              aria-controls={breakdownId}
              onClick={() => setOpen(open === s.key ? null : s.key)}
              className={`flex min-h-11 w-full items-baseline justify-between gap-3 text-left text-sm${FOCUS} rounded`}
            >
              <span className="min-w-0 truncate font-medium">
                {shortLabel(s, selections)}
              </span>
              <span className="shrink-0 tabular-nums">
                {barLabel(s, category, false)}
              </span>
            </button>
            <div
              className="mt-1 flex h-4 overflow-hidden rounded bg-chip"
              role="img"
              aria-label={`${shortLabel(s, selections)}: ${barLabel(s, category, false)}`}
            >
              {segments.map((seg) => {
                const part = seg.value(s);
                if (part <= 0) return null;
                return (
                  <div
                    key={seg.key}
                    className={seg.color}
                    style={{ width: `${(part / max) * 100}%` }}
                  />
                );
              })}
            </div>
            <dl
              id={breakdownId}
              className={`mt-2 space-y-0.5 rounded-lg bg-chip/60 px-3 py-2 text-xs tabular-nums ${open === s.key ? "" : "hidden"}`}
            >
              <Breakdown s={s} category={category} used={used} />
            </dl>
          </div>
        );
      })}
      {segments.length > 1 && (
        <p className="flex flex-wrap gap-3 text-xs text-muted">
          {segments.map((seg) => (
            <span key={seg.key} className="flex items-center gap-1.5">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-sm ${seg.color}`}
              />
              {seg.label}
            </span>
          ))}
        </p>
      )}
      {category === "inflation" && <p className="text-xs text-muted">{INFLATION_CAPTION}</p>}
    </div>
  );
}

/** Level, residency, start year, fee increase and living costs, with touch-sized controls. */
function Assumptions({ state }: { state: CalculatorState }) {
  const {
    level,
    changeLevel,
    residency,
    setResidency,
    startYear,
    maxStartYear,
    startYearInput,
    startYearError,
    typeStartYear,
    stepStartYear,
    customIncrease,
    setCustomIncrease,
    includeLiving,
    setIncludeLiving,
    lifestyle,
    setLifestyle,
    selections,
    baseYearLabel,
  } = state;
  return (
    <div className="space-y-6">
      <TouchSegmented
        id="touch-level"
        label="Level"
        value={level}
        options={LEVELS.map((l) => [l, LEVEL_LABELS[l]])}
        onChange={changeLevel}
      />

      <fieldset id="touch-residency" className="scroll-mt-4">
        <legend className="mb-2 text-sm font-medium">
          <InfoTip term="residency">Residency</InfoTip>
        </legend>
        <div role="radiogroup" aria-label="Residency" className="space-y-2">
          {(Object.keys(RESIDENCY_LABELS) as Residency[]).map((r) => (
            <ChoiceRow
              key={r}
              checked={residency === r}
              onClick={() => setResidency(r)}
            >
              {RESIDENCY_LABELS[r]}
            </ChoiceRow>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted">
          Changes Singapore fees only; abroad you pay international rates.
        </p>
      </fieldset>

      <div id="touch-start-year-section" className="scroll-mt-4">
        <p className="text-sm font-medium">
          <InfoTip term="startYear">Start year</InfoTip>
        </p>
        <div
          className={`mt-2 flex items-center gap-1.5 rounded-xl border bg-surface p-1.5 ${startYearError ? "border-warn-fg" : "border-border"}`}
        >
          <button
            type="button"
            aria-label="One year earlier"
            disabled={startYear <= MIN_START_YEAR}
            onClick={() => stepStartYear(-1)}
            className={`h-11 w-14 shrink-0 rounded-lg bg-chip text-2xl text-accent disabled:opacity-40${FOCUS}`}
          >
            −
          </button>
          <input
            id="touch-start-year"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            placeholder={String(MIN_START_YEAR)}
            aria-label="Start year"
            aria-invalid={startYearError !== null}
            aria-describedby="touch-start-year-hint"
            className={`h-11 min-w-0 flex-1 rounded-lg bg-transparent text-center text-2xl font-semibold tabular-nums${FOCUS}`}
            value={startYearInput}
            onChange={(e) => typeStartYear(e.target.value)}
          />
          <button
            type="button"
            aria-label="One year later"
            disabled={startYear >= maxStartYear}
            onClick={() => stepStartYear(1)}
            className={`h-11 w-14 shrink-0 rounded-lg bg-chip text-2xl text-accent disabled:opacity-40${FOCUS}`}
          >
            +
          </button>
        </div>
        <p
          id="touch-start-year-hint"
          className={`mt-1 text-xs ${startYearError ? "text-warn-fg" : "text-muted"}`}
        >
          {startYearError ?? (
            <InfoTip term="feeIncrease">
              Rates based on {baseYearLabel} figures
            </InfoTip>
          )}
        </p>
      </div>

      <div id="touch-rate" className="scroll-mt-4">
        <p className="text-sm font-medium">Yearly fee increase</p>
        <ul className="mt-2 divide-y divide-border rounded-xl border border-border bg-surface px-3 text-sm">
          {selections.length === 0 && (
            <li className="py-2.5 text-muted">
              Pick a university to see its rate.
            </li>
          )}
          {selections.map((s) => (
            <li
              key={s.key}
              className="flex min-h-10 items-center justify-between gap-3"
            >
              <span className="min-w-0 truncate text-muted">
                {institutionLabel(s.university, s.programme)}
              </span>
              <span className="shrink-0 tabular-nums">
                <InfoTip term="universityIncrease" align="right">
                  {customIncrease !== null && (
                    <span className="text-muted line-through">
                      {(s.increase.rate * 100).toFixed(1)}%{" "}
                    </span>
                  )}
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
        <SwitchRow
          className="mt-2"
          checked={customIncrease !== null}
          onChange={(on) => setCustomIncrease(on ? 0.03 : null)}
        >
          Use my own rate instead
        </SwitchRow>
        {customIncrease !== null && (
          <label className="mt-2 flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 text-sm">
            <span>Yearly increase</span>
            <span className="flex items-center gap-1">
              <RateInput
                value={customIncrease}
                onChange={setCustomIncrease}
                className="h-11 w-20"
              />
              %
            </span>
          </label>
        )}
      </div>

      <div id="touch-living" className="scroll-mt-4">
        <p className="text-sm font-medium">
          <InfoTip term="livingCosts">Living costs</InfoTip>
        </p>
        <SwitchRow
          className="mt-2"
          checked={includeLiving}
          onChange={setIncludeLiving}
          hint={
            includeLiving
              ? undefined
              : "Each university's own estimate; not for Singapore universities."
          }
        >
          Include living costs
        </SwitchRow>
        {includeLiving && (
          <div className="mt-3">
            <TouchSegmented
              label="Lifestyle"
              value={lifestyle}
              options={(Object.keys(LIFESTYLE_LABELS) as Lifestyle[]).map(
                (l) => [l, LIFESTYLE_LABELS[l]],
              )}
              onChange={setLifestyle}
              tip="lifestyle"
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** Initials of a name, minus small words: "National University of Singapore" gives "nus". */
function initialsOf(name: string): string {
  return name
    .split(/[\s-]+/)
    .filter((w) => w.length > 2 && !["and", "the", "for", "der", "des"].includes(w.toLowerCase()))
    .map((w) => w[0])
    .join("")
    .toLowerCase();
}

const wordStart = (text: string, q: string) =>
  text.toLowerCase().split(/[\s-]+/).some((w) => w.startsWith(q));

/**
 * How well a university matches a typed search, lower is better, or null for
 * no match: its initials ("NUS", "ETH") first, then the start of a word in its
 * name, then its city or country, then any part of its name for longer searches.
 */
function searchRank(name: string, city: string, country: string, q: string): number | null {
  const initials = initialsOf(name);
  if (initials === q) return 0;
  if (initials.startsWith(q)) return 1;
  if (name.toLowerCase().startsWith(q)) return 2;
  if (wordStart(name, q)) return 3;
  if (wordStart(city, q) || wordStart(country, q) || initialsOf(country) === q) return 4;
  if (q.length >= 4 && name.toLowerCase().includes(q)) return 5;
  return null;
}

/** One comparison slot as a tappable row. */
function SlotRow({
  index,
  option: o,
  reason,
  duplicate,
  onOpen,
  onRemove,
}: {
  index: number;
  option: Option;
  reason: string | null;
  duplicate: boolean;
  onOpen: () => void;
  onRemove?: () => void;
}) {
  const warn = reason
    ? `${reason}. ${unavailableHint(reason)}`
    : duplicate
      ? "Same programme as another slot; pick a different one to compare."
      : null;
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center">
        <button
          type="button"
          onClick={onOpen}
          className={`flex min-h-16 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left${FOCUS} rounded-xl`}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-fill text-sm font-semibold text-on-accent">
            {index + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">
              {o.university.name}
            </span>
            <span className="block truncate text-xs text-muted">
              {programmeLabel(o.university, o.programme)} ·{" "}
              {o.programme.durationYears}{" "}
              {o.programme.durationYears === 1 ? "year" : "years"}
            </span>
          </span>
          <span aria-hidden className="text-muted">
            ›
          </span>
        </button>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove university ${index + 1} from the comparison`}
            className={`mr-1 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-lg text-muted hover:text-accent${FOCUS}`}
          >
            ×
          </button>
        )}
      </div>
      {warn && <p className="px-3 pb-2 text-xs text-warn-fg">{warn}</p>}
    </div>
  );
}

/**
 * The university picker for one slot: country, university, (partner,) field
 * and programme, as tappable lists in a sheet that slides up from the bottom
 * on phones and sits in the middle on tablets. Every tap applies at once.
 */
function PickerSheet({
  index,
  current,
  others,
  state,
  centered,
  onClose,
}: {
  index: number;
  current: Option;
  others: Option[];
  state: CalculatorState;
  centered: boolean;
  onClose: () => void;
}) {
  const { grouped, reasonFor, setSlot } = state;
  const titleId = useId();
  const [query, setQuery] = useState("");

  const dialogRef = useRef<HTMLDivElement>(null);
  // Keep the page behind the sheet still (position: fixed also holds on iOS
  // Safari, where overflow: hidden alone does not), move focus into the sheet
  // and keep Tab inside it, give focus back on close, and let Escape close it.
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
          'button, input, [tabindex]:not([tabindex="-1"])',
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

  const group = grouped.find(
    (g) => g.country?.code === current.university.country,
  );
  const inCountry = group?.options ?? [];
  const universities = inCountry.filter(
    (o, i, arr) =>
      arr.findIndex((x) => x.university.id === o.university.id) === i,
  );
  const atUniversity = inCountry.filter(
    (o) => o.university.id === current.university.id,
  );
  const partners = partnerChoices(current.university, atUniversity);
  const atPartner = partners.length
    ? atUniversity.filter(
        (o) => o.programme.partner === current.programme.partner,
      )
    : atUniversity;
  const fields = FIELDS.filter((f) =>
    atPartner.some((o) => o.programme.field === f),
  );
  const programmes = atPartner.filter(
    (o) => o.programme.field === current.programme.field,
  );
  const taken = new Set(others.map((o) => o.key));
  const pick = (candidates: Option[], field: Field = current.programme.field) =>
    setSlot(index, pickProgramme(candidates, field, reasonFor, taken).key);

  // A typed search looks across every country, by name, initials ("NUS"), city or country.
  const q = query.trim().toLowerCase();
  const matches = q
    ? grouped
        .flatMap((g) =>
          g.options.map((o) => ({ o, country: g.country?.name ?? "" })),
        )
        .filter(
          ({ o }, i, arr) =>
            arr.findIndex((x) => x.o.university.id === o.university.id) === i,
        )
        .flatMap(({ o, country }) => [
          {
            o,
            partner: undefined as Partner | undefined,
            rank: searchRank(o.university.name, o.university.city, country, q),
          },
          // A partner or institute (NIE at NTU, SIM's awarding universities) is found by its own name too.
          ...(o.university.partners ?? [])
            .filter((pt) => o.university.programmes.some((p) => p.partner === pt.id))
            .map((partner) => ({
            o,
            partner,
            rank: searchRank(partner.name, o.university.city, country, q),
          })),
        ])
        .filter(
          (m): m is { o: Option; partner: Partner | undefined; rank: number } =>
            m.rank !== null,
        )
        .sort((a, b) => a.rank - b.rank)
    : [];

  const priced = (universityId: string) =>
    inCountry.some(
      (o) => o.university.id === universityId && reasonFor(o) === null,
    ) ||
    grouped.some((g) =>
      g.options.some(
        (o) => o.university.id === universityId && reasonFor(o) === null,
      ),
    );

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-backdrop"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`absolute flex flex-col bg-surface shadow-2xl ${
          centered
            ? "left-1/2 top-1/2 h-[min(44rem,90dvh)] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl"
            : "inset-x-0 bottom-0 h-[88dvh] rounded-t-3xl pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
        }`}
      >
        {!centered && (
          <div
            aria-hidden
            className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border"
          />
        )}
        <div className="flex shrink-0 items-center justify-between px-4 pt-3">
          <h2 id={titleId} className="text-lg font-semibold">
            University {index + 1}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={`-mr-2 min-h-11 rounded-lg px-3 font-medium text-accent${FOCUS}`}
          >
            Done
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-6 pt-3">
          <input
            type="search"
            placeholder="Search universities"
            aria-label="Search universities"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`h-11 w-full rounded-xl border border-border bg-chip px-3${FOCUS}`}
          />
          {q ? (
            <List
              label="Matches"
              items={matches.map(({ o, partner }) => ({
                key: partner ? `${o.university.id}:${partner.id}` : o.university.id,
                text: partner
                  ? `${partner.name} (${o.university.name})`
                  : `${o.university.name}${priced(o.university.id) ? "" : " (no published fee)"}`,
                sub: grouped.find(
                  (g) => g.country?.code === o.university.country,
                )?.country?.name,
                selected:
                  o.university.id === current.university.id &&
                  (!partner || current.programme.partner === partner.id),
                onSelect: () => {
                  pick(
                    (grouped.find(
                      (g) => g.country?.code === o.university.country,
                    )?.options ?? []).filter(
                      (x) =>
                        x.university.id === o.university.id &&
                        (!partner || x.programme.partner === partner.id),
                    ),
                  );
                  setQuery("");
                },
              }))}
              empty="No university by that name."
            />
          ) : (
            <>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                  Country
                </p>
                <div
                  role="radiogroup"
                  aria-label="Country"
                  className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
                >
                  {grouped.map((g) => (
                    <Chip
                      key={g.country?.code}
                      on={g.country?.code === current.university.country}
                      onClick={() => pick(g.options)}
                    >
                      {g.country?.name}
                    </Chip>
                  ))}
                </div>
              </div>
              <List
                label="University"
                items={universities.map((u) => ({
                  key: u.university.id,
                  text: `${u.university.name}${priced(u.university.id) ? "" : " (no published fee)"}`,
                  selected: u.university.id === current.university.id,
                  onSelect: () =>
                    pick(
                      inCountry.filter(
                        (o) => o.university.id === u.university.id,
                      ),
                    ),
                }))}
              />
              {partners.length > 0 && (
                <List
                  label={partnerPickerLabel(current.university)}
                  items={partners.map((p) => ({
                    key: p.id,
                    text: p.name,
                    selected: p.id === (current.programme.partner ?? OWN),
                    onSelect: () =>
                      pick(
                        atUniversity.filter(
                          (o) => (o.programme.partner ?? OWN) === p.id,
                        ),
                      ),
                  }))}
                />
              )}
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                  Field of study
                </p>
                <div role="radiogroup" aria-label="Field of study" className="flex flex-wrap gap-2">
                  {fields.map((f) => (
                    <Chip
                      key={f}
                      on={f === current.programme.field}
                      onClick={() =>
                        pick(
                          atPartner.filter((o) => o.programme.field === f),
                          f,
                        )
                      }
                    >
                      {FIELD_LABELS[f]}
                    </Chip>
                  ))}
                </div>
              </div>
              {programmes.length > 1 ? (
                <List
                  label="Programme"
                  items={programmes.map((o) => ({
                    key: o.key,
                    text: `${o.programme.name}${o.programme.majors ? ` (${o.programme.majors.length} majors)` : ""}${reasonFor(o) ? " (no published fee)" : ""}${recognitionTag(o.programme)}`,
                    selected: o.key === current.key,
                    onSelect: () => setSlot(index, o.key),
                  }))}
                />
              ) : (
                <p className="text-sm text-muted">{current.programme.name}</p>
              )}
              {current.programme.majors && (
                <p className="text-xs text-muted">
                  Majors: {current.programme.majors.join(", ")}
                </p>
              )}
              {reasonFor(current) && (
                <p className="text-xs text-warn-fg">
                  {reasonFor(current)}. {unavailableHint(reasonFor(current)!)}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function List({
  label,
  items,
  empty,
}: {
  label: string;
  items: {
    key: string;
    text: string;
    sub?: string;
    selected: boolean;
    onSelect: () => void;
  }[];
  empty?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label}>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </p>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {items.length === 0 && (
          <p className="px-3 py-3 text-sm text-muted">{empty}</p>
        )}
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            role="radio"
            aria-checked={it.selected}
            onClick={it.onSelect}
            className={`flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm${FOCUS} ${it.selected ? "bg-chip font-medium" : "hover:bg-chip/60"}`}
          >
            <span className="min-w-0">
              <span className="block">{it.text}</span>
              {it.sub && (
                <span className="block text-xs text-muted">{it.sub}</span>
              )}
            </span>
            {it.selected && (
              <span aria-hidden className="shrink-0 font-bold text-accent">
                ✓
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`min-h-11 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium${FOCUS} ${on ? "border-accent-fill bg-accent-fill text-on-accent" : "border-border bg-surface"}`}
    >
      {children}
    </button>
  );
}

/** A radio group as a row of equal, touch-sized buttons. */
function TouchSegmented<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  tip,
}: {
  id?: string;
  label: string;
  value: T;
  /** Value, label and, when the label may be clipped, the full text for `title` and the accessible name. */
  options: [T, string, string?][];
  onChange: (v: T) => void;
  tip?: "lifestyle";
}) {
  // Up to four choices share one row. More fill two rows evenly (3 + 2, 3 + 3)
  // on a 12-column grid, so no row has an odd gap at its end.
  const n = options.length;
  const firstRow = n > 4 ? Math.ceil(n / 2) : n;
  const span = (i: number) =>
    n > 4 ? 12 / (i < firstRow ? firstRow : n - firstRow) : 1;
  return (
    <div id={id} className="scroll-mt-4">
      <span className="text-sm font-medium">
        {tip ? (
          <InfoTip term={tip}>{label}</InfoTip>
        ) : (
          label
        )}
      </span>
      <div
        role="radiogroup"
        aria-label={label}
        className="mt-2 grid gap-1 rounded-xl border border-border bg-chip p-1"
        style={{
          gridTemplateColumns: `repeat(${n > 4 ? 12 : n}, minmax(0, 1fr))`,
        }}
      >
        {options.map(([v, text, full], i) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            aria-label={full}
            title={full}
            onClick={() => onChange(v)}
            style={{ gridColumn: `span ${span(i)}` }}
            className={`min-h-11 rounded-lg px-0 py-1 text-xs leading-tight${FOCUS} ${value === v ? "bg-surface font-semibold shadow-sm" : "text-muted"}`}
          >
            <span className="line-clamp-2 [overflow-wrap:normal]">{text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** A radio option as a full-width row with a round marker. */
function ChoiceRow({
  checked,
  onClick,
  hint,
  children,
}: {
  checked: boolean;
  onClick: () => void;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={`flex min-h-12 w-full items-center gap-3 rounded-xl border bg-surface px-3 py-2 text-left text-sm${FOCUS} ${checked ? "border-accent ring-1 ring-accent" : "border-border"}`}
    >
      <span
        aria-hidden
        className={`h-5 w-5 shrink-0 rounded-full border-2 ${checked ? "border-[6px] border-accent" : "border-border"}`}
      />
      <span>
        <span className="block">{children}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </button>
  );
}

function SwitchRow({
  checked,
  onChange,
  hint,
  className = "",
  children,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-left text-sm${FOCUS} ${className}`}
    >
      <span>
        <span className="block">{children}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <span
        aria-hidden
        className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors ${checked ? "bg-accent-fill" : "bg-border"}`}
      >
        <span
          className={`absolute top-0.5 h-[27px] w-[27px] rounded-full bg-white shadow transition-[left] ${checked ? "left-[22px]" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}

/** The bottom tab bar on phones, with the cheapest total as a reminder on the Compare tab. */
function TabBar({
  tab,
  onChange,
  count,
  cheapest,
  includeLiving,
}: {
  tab: Tab;
  onChange: (t: Tab, top?: boolean) => void;
  count: number;
  cheapest?: number;
  includeLiving: boolean;
}) {
  const tabs: [Tab, string, React.ReactNode][] = [
    [
      "settings",
      "Details",
      <svg key="s" viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
        <circle cx="16" cy="6" r="2" />
        <circle cx="10" cy="12" r="2" />
        <circle cx="18" cy="18" r="2" />
      </svg>,
    ],
    [
      "compare",
      "Compare",
      <svg key="c" viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
        <rect x="3" y="12" width="4" height="8" rx="1" />
        <rect x="10" y="7" width="4" height="13" rx="1" />
        <rect x="17" y="3" width="4" height="17" rx="1" />
      </svg>,
    ],
  ];
  return (
    <nav
      aria-label="Calculator sections"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      {tab !== "compare" && count > 0 && cheapest !== undefined && (
        <button
          type="button"
          onClick={() => onChange("compare", true)}
          className={`flex min-h-11 w-full items-center justify-between gap-3 border-b border-border px-4 py-1 text-left text-xs${FOCUS}`}
        >
          <span className="text-muted">
            {count} {count === 1 ? "university" : "universities"} · from{" "}
            <span className="font-medium text-foreground tabular-nums">
              {formatCompactSgd(cheapest)}
            </span>{" "}
            {includeLiving ? "incl. living costs" : "in fees"}
          </span>
          <span className="font-medium text-accent">View results</span>
        </button>
      )}
      <div className="grid grid-cols-2">
        {tabs.map(([t, text, icon]) => (
          <button
            key={t}
            type="button"
            aria-current={tab === t ? "page" : undefined}
            onClick={() => onChange(t)}
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium${FOCUS} ${tab === t ? "text-accent" : "text-muted"}`}
          >
            {icon}
            {text}
          </button>
        ))}
      </div>
    </nav>
  );
}
