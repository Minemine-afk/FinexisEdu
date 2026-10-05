"use client";

import { useState } from "react";
import { formatCompactSgd, formatMoney, programmeLabel } from "@/lib/format";
import type { Selection } from "./Calculator";
import UniversityName from "./UniversityName";

export const SEGMENTS = [
  { key: "tuition", label: "Tuition", color: "bg-series-1" },
  { key: "compulsoryFees", label: "Other compulsory fees", color: "bg-series-2" },
  { key: "oneOffFees", label: "One-off fees", color: "bg-series-3" },
  { key: "living", label: "Living costs", color: "bg-series-4" },
] as const;

export type SegmentKey = (typeof SEGMENTS)[number]["key"];
/** What the bars compare: the whole total (stacked) or one part of it. */
export type CompareCategory = "total" | SegmentKey;

export function valueFor(s: Selection, category: CompareCategory): number {
  return category === "total" ? s.grandTotalSgd : s.yearsSgd[category];
}

/**
 * Up to two vertical bars on a common baseline, one per selected university.
 * "Total" stacks the cost parts; any other category shows that part alone.
 */
export default function FeeChart({
  selections,
  category,
  includeLiving,
}: {
  selections: Selection[];
  category: CompareCategory;
  includeLiving: boolean;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const used = SEGMENTS.filter((seg) => selections.some((s) => s.yearsSgd[seg.key] > 0));
  const segments = category === "total" ? used : SEGMENTS.filter((seg) => seg.key === category);
  const max = Math.max(...selections.map((s) => valueFor(s, category)), 1);
  const title =
    category === "total"
      ? includeLiving
        ? "Total cost in SGD"
        : "Total fees in SGD"
      : `${segments[0]?.label ?? ""} in SGD`;
  const hovered = selections.find((s) => s.key === hover);
  const column = "w-full max-w-44 min-w-0";
  const row = selections.length > 2 ? "flex items-end justify-center gap-3 sm:gap-10" : "flex items-end justify-center gap-8 sm:gap-16";

  return (
    <figure className="rounded-xl border border-border bg-surface p-5">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">{title}</span>
        {segments.length > 1 && (
          <span className="flex flex-wrap gap-3 text-xs text-muted">
            {segments.map((seg) => (
              <span key={seg.key} className="flex items-center gap-1.5">
                <span className={`inline-block h-2.5 w-2.5 rounded-sm ${seg.color}`} />
                {seg.label}
              </span>
            ))}
          </span>
        )}
      </figcaption>

      <div className="relative mt-8">
        {/* Plot: a fixed-height area whose bottom edge is the shared baseline. */}
        <div className={`${row} border-b border-border`}>
          {selections.map((s) => {
            const value = valueFor(s, category);
            return (
              <div
                key={s.key}
                className={`relative h-52 cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-accent sm:h-64 ${column}`}
                // Hover on desktop; on touch screens a tap focuses the bar and opens its
                // breakdown, and tapping anywhere else (blur) closes it. Keyboard works the same.
                tabIndex={0}
                onMouseEnter={() => setHover(s.key)}
                onMouseLeave={() => setHover(null)}
                onClick={() => setHover(s.key)}
                onFocus={() => setHover(s.key)}
                onBlur={() => setHover(null)}
              >
                <div
                  className="absolute inset-x-0 bottom-0 flex flex-col-reverse gap-0.5"
                  style={{ height: `${(value / max) * 100}%` }}
                >
                  <span className="absolute inset-x-0 bottom-full mb-1.5 whitespace-nowrap text-center text-sm font-semibold tabular-nums">
                    {category === "tuition" && value === 0
                      ? "No tuition"
                      : formatCompactSgd(value)}
                  </span>
                  {segments.map((seg, i) => {
                    const part = s.yearsSgd[seg.key];
                    if (part <= 0) return null;
                    const top = segments.slice(i + 1).every((later) => s.yearsSgd[later.key] <= 0);
                    return (
                      <div
                        key={seg.key}
                        className={`${seg.color} ${top ? "rounded-t" : ""}`}
                        style={{ flexGrow: part, flexBasis: 0, minHeight: 2 }}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className={`${row} mt-2`}>
          {selections.map((s) => (
            <p key={s.key} className={`text-center text-sm leading-snug ${column}`}>
              <UniversityName university={s.university} />
              <span className="block truncate text-xs text-muted">
                {programmeLabel(s.university, s.programme)}
              </span>
            </p>
          ))}
        </div>

        {hovered && (
          <div
            role="tooltip"
            className="absolute left-0 top-0 z-10 w-60 rounded-lg border border-border bg-surface p-3 text-xs shadow-lg"
          >
            <p className="font-medium">{hovered.university.name}</p>
            <p className="text-muted">
              {programmeLabel(hovered.university, hovered.programme)}
            </p>
            <dl className="mt-2 space-y-0.5 tabular-nums">
              {used.map((seg) => (
                <div key={seg.key} className="flex justify-between gap-2">
                  <dt className="flex items-center gap-1.5 text-muted">
                    <span className={`inline-block h-2 w-2 rounded-sm ${seg.color}`} />
                    {seg.label}
                  </dt>
                  <dd>
                    {seg.key === "tuition" && hovered.yearsSgd.tuition === 0
                      ? "None"
                      : formatMoney(hovered.yearsSgd[seg.key], "SGD")}
                  </dd>
                </div>
              ))}
              <div className="flex justify-between gap-2 border-t border-border pt-1 font-medium">
                <dt>Total</dt>
                <dd>{formatMoney(hovered.grandTotalSgd, "SGD")}</dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </figure>
  );
}
