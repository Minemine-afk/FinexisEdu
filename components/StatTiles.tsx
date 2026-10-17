"use client";

import { useCallback, useState } from "react";
import { formatMoney, partnerOf, programmeLabel } from "@/lib/format";
import type { Country } from "@/lib/schema";
import UniversityName from "./UniversityName";
import InfoTip from "./InfoTip";
import { FOCUS, noTuition } from "./ResultDetail";
import SavingsPlanner from "./SavingsPlanner";
import { unavailableHint, type Option, type Selection } from "./useCalculator";

/** One headline tile per university: the total, and how it compares with the cheapest. */
export default function StatTiles({
  selections,
  countryByCode,
  only,
  planner,
  onPlan,
}: {
  selections: Selection[];
  countryByCode: Map<string, Country>;
  /** Show just this one of the selections (for a swipeable carousel), still compared with the cheapest. */
  only?: number;
  /** Adds a "Plan" button that opens the savings planner, as a bottom sheet when `sheet`. */
  planner?: { today: string; sheet: boolean };
  /** When given, "Plan" calls this and the caller shows the planner (so it can outlive a layout change). */
  onPlan?: (key: string) => void;
}) {
  const [planKey, setPlanKey] = useState<string | null>(null);
  const closePlanner = useCallback(() => setPlanKey(null), []);
  const planning = onPlan ? undefined : selections.find((s) => s.key === planKey);
  const openPlanner = onPlan ?? setPlanKey;
  // Selections are sorted by total, so the first is the cheapest.
  const cheapest = selections[0];
  const cheapestName = cheapest ? comparisonName(cheapest, selections) : "";
  // Columns follow the space the tiles have, measured in rem, so larger text
  // settings get fewer, wider tiles instead of words running out of them. At
  // normal text three tiles sit side by side from about 970px wide; a tablet in
  // portrait gets two columns.
  const cols =
    selections.length === 3
      ? "@min-[25rem]:grid-cols-2 @min-[38rem]:grid-cols-3"
      : selections.length === 2
        ? "@min-[25rem]:grid-cols-2"
        : "";
  return (
    <div className="@container">
      <div className={`grid gap-4 ${cols}`}>
        {planning && planner && (
          <SavingsPlanner
            key={planning.key}
            selection={planning}
            today={planner.today}
            sheet={planner.sheet}
            onClose={closePlanner}
          />
        )}
        {selections.map((s, i) => {
          if (only !== undefined && i !== only) return null;
          const diff = s.grandTotalSgd - cheapest.grandTotalSgd;
          return (
            <div
              key={s.key}
              // A word too long for even a single-column tile wraps rather than crossing its edge.
              className="@container min-w-0 rounded-xl border border-border border-t-4 border-t-accent bg-surface p-5 [overflow-wrap:break-word]"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                {countryByCode.get(s.university.country)?.name} ·{" "}
                {s.university.city}
              </p>
              <h2 className="mt-1 font-semibold leading-snug">
                <UniversityName university={s.university} />
              </h2>
              <p className="mt-0.5 text-sm text-muted">
                {programmeLabel(s.university, s.programme)}
              </p>
              <p
                className="mt-2 whitespace-nowrap font-semibold leading-tight text-accent tabular-nums"
                style={{ fontSize: totalSize(formatMoney(s.grandTotalSgd, "SGD")) }}
              >
                {formatMoney(s.grandTotalSgd, "SGD")}
              </p>
              <p className="mt-1 text-sm tabular-nums">
                {/* The last tile sits at the page's right edge, so its tip opens leftwards. */}
                <InfoTip term="perYear" align={i === selections.length - 1 && selections.length > 1 ? "right" : "left"}>
                  ≈ {formatMoney(s.grandTotalSgd / Math.max(1, s.result.durationYears), "SGD")}{" "}
                  a year ·{" "}
                  {formatMoney(
                    s.grandTotalSgd / Math.max(1, s.result.durationYears) / 12,
                    "SGD",
                  )}{" "}
                  a month
                </InfoTip>
              </p>
              {noTuition(s.result) && (
                <p className="mt-1 text-sm text-muted">
                  No tuition: semester contribution only
                </p>
              )}
              {s.living && (
                <p className="mt-1 text-sm text-muted tabular-nums">
                  Fees {formatMoney(s.totalSgd, "SGD")} + living{" "}
                  {formatMoney(s.living.totalSgd, "SGD")}
                </p>
              )}
              {selections.length > 1 && (
                <p className="mt-1 text-sm tabular-nums">
                  {i === 0
                    ? `Cheapest of the ${selections.length === 3 ? "three" : "two"}`
                    : diff === 0
                      ? `Same as ${cheapestName}`
                      : `${formatMoney(diff, "SGD")} more than ${cheapestName}`}
                </p>
              )}
              {planner && (
                <button
                  type="button"
                  onClick={() => openPlanner(s.key)}
                  className={`mt-3 inline-flex min-h-11 items-center justify-center gap-2 justify-self-start rounded-full border border-accent px-4 text-sm font-medium text-accent hover:bg-chip sm:min-h-9${FOCUS}`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                    <path d="M3 17l6-6 4 4 8-8" />
                    <path d="M15 7h6v6" />
                  </svg>
                  Plan
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The total's font size: 1.875rem (text-3xl) when it fits, otherwise shrunk to
 * the tile's width (a two-column tablet tile, a far-off start year). A
 * semibold tabular digit is about 0.62em wide.
 */
function totalSize(text: string): string {
  return `min(1.875rem, ${(100 / (text.length * 0.62)).toFixed(2)}cqi)`;
}

/**
 * How the comparison line names the cheapest choice: its awarding partner or
 * institute where there is one (SIM's partners, NIE), and the programme too when
 * another tile would carry the same name.
 */
function comparisonName(c: Selection, selections: Selection[]): string {
  const name = (x: Selection) => partnerOf(x.university, x.programme)?.name ?? x.university.name;
  const n = name(c);
  return selections.some((x) => x !== c && name(x) === n) ? `${n} (${c.programme.name})` : n;
}

/**
 * Why nothing is priced: every chosen programme's reason (a residency it is not
 * open to, a missing fee year) and what to change, or a prompt to pick one.
 */
export function EmptyResults({
  chosen,
  reasonFor,
  includeLiving,
}: {
  chosen: Option[];
  reasonFor: (o: Option) => string | null;
  includeLiving: boolean;
}) {
  const unpriced = chosen
    .map((o) => ({ o, reason: reasonFor(o) }))
    .filter((x): x is { o: Option; reason: string } => x.reason !== null);
  return (
    <div
      role="status"
      className="rounded-xl border border-dashed border-border p-10 text-center text-muted"
    >
      {unpriced.length === 0 ? (
        <>Pick a university to see its total {includeLiving ? "cost" : "fees"}.</>
      ) : (
        <>
          <p className="font-medium text-foreground">
            {unpriced.length === 1
              ? "This programme can't be priced with these choices."
              : "These programmes can't be priced with these choices."}
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {unpriced.map(({ o, reason }) => (
              <li key={o.key}>
                <span className="text-foreground">
                  {o.university.name} · {o.programme.name}
                </span>
                : {reason}. {unavailableHint(reason)}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * A line above the results naming any chosen university left out because it
 * can't be priced with these choices, so it doesn't just vanish.
 */
export function UnpricedNote({
  chosen,
  reasonFor,
}: {
  chosen: Option[];
  reasonFor: (o: Option) => string | null;
}) {
  const unpriced = chosen
    .map((o) => ({ o, reason: reasonFor(o) }))
    .filter((x): x is { o: Option; reason: string } => x.reason !== null);
  if (unpriced.length === 0) return null;
  return (
    <div role="status" className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted">
      <p className="font-medium text-foreground">Not shown below:</p>
      <ul className="mt-1 space-y-1">
        {unpriced.map(({ o, reason }) => (
          <li key={o.key}>
            <span className="text-foreground">
              {o.university.name} · {o.programme.name}
            </span>
            : {reason}. {unavailableHint(reason)}
          </li>
        ))}
      </ul>
    </div>
  );
}
