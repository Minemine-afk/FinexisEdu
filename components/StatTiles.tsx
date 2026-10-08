"use client";

import { formatMoney, programmeLabel } from "@/lib/format";
import type { Country } from "@/lib/schema";
import UniversityName from "./UniversityName";
import InfoTip from "./InfoTip";
import { noTuition } from "./ResultDetail";
import type { Selection } from "./useCalculator";

/** One headline tile per university: the total, and how it compares with the cheapest. */
export default function StatTiles({
  selections,
  countryByCode,
  only,
}: {
  selections: Selection[];
  countryByCode: Map<string, Country>;
  /** Show just this one of the selections (for a swipeable carousel), still compared with the cheapest. */
  only?: number;
}) {
  // Selections are sorted by total, so the first is the cheapest.
  const cheapest = selections[0];
  const cols =
    selections.length === 3
      ? "sm:grid-cols-3"
      : selections.length === 2
        ? "sm:grid-cols-2"
        : "";
  return (
    <div className={`grid gap-4 ${cols}`}>
      {selections.map((s, i) => {
        if (only !== undefined && i !== only) return null;
        const diff = s.grandTotalSgd - cheapest.grandTotalSgd;
        return (
          <div
            key={s.key}
            className="rounded-xl border border-border border-t-4 border-t-accent bg-surface p-5"
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
            <p className="mt-2 text-3xl font-semibold text-accent tabular-nums">
              {formatMoney(s.grandTotalSgd, "SGD")}
            </p>
            <p className="mt-1 text-sm tabular-nums">
              <InfoTip term="perYear">
                ≈ {formatMoney(s.grandTotalSgd / s.result.durationYears, "SGD")}{" "}
                a year ·{" "}
                {formatMoney(
                  s.grandTotalSgd / s.result.durationYears / 12,
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
          </div>
        );
      })}
    </div>
  );
}
