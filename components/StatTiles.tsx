"use client";

import { useCallback, useState } from "react";
import { formatMoney, programmeLabel } from "@/lib/format";
import type { Country } from "@/lib/schema";
import UniversityName from "./UniversityName";
import InfoTip from "./InfoTip";
import { FOCUS, noTuition } from "./ResultDetail";
import SavingsPlanner from "./SavingsPlanner";
import type { Selection } from "./useCalculator";

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
  /** Adds a "Plan savings" button that opens the savings planner, as a bottom sheet when `sheet`. */
  planner?: { today: string; sheet: boolean };
  /** When given, "Plan savings" calls this and the caller shows the planner (so it can outlive a layout change). */
  onPlan?: (key: string) => void;
}) {
  const [planKey, setPlanKey] = useState<string | null>(null);
  const closePlanner = useCallback(() => setPlanKey(null), []);
  const planning = onPlan ? undefined : selections.find((s) => s.key === planKey);
  const openPlanner = onPlan ?? setPlanKey;
  // Selections are sorted by total, so the first is the cheapest.
  const cheapest = selections[0];
  // Three tiles only fit side by side from lg up; a tablet in portrait gets two columns.
  const cols =
    selections.length === 3
      ? "sm:grid-cols-2 lg:grid-cols-3"
      : selections.length === 2
        ? "sm:grid-cols-2"
        : "";
  return (
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
            className="min-w-0 rounded-xl border border-border border-t-4 border-t-accent bg-surface p-5"
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
              className={`mt-2 font-semibold text-accent tabular-nums ${totalSize(formatMoney(s.grandTotalSgd, "SGD"))}`}
            >
              {formatMoney(s.grandTotalSgd, "SGD")}
            </p>
            <p className="mt-1 text-sm tabular-nums">
              <InfoTip term="perYear">
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
                    ? `Same as ${cheapest.university.name}`
                    : `${formatMoney(diff, "SGD")} more than ${cheapest.university.name}`}
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
                Plan savings
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Smaller type for long totals (far-off start years), so they stay inside a narrow tile. */
function totalSize(text: string): string {
  if (text.length <= 11) return "text-3xl"; // up to S$9,999,999
  if (text.length <= 13) return "text-2xl"; // up to S$999,999,999
  return "text-xl break-all";
}
