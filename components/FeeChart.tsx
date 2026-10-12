"use client";

import { useState } from "react";
import { formatCompactSgd, formatMoney, programmeLabel } from "@/lib/format";
import type { Selection } from "./useCalculator";
import UniversityName from "./UniversityName";

export const SEGMENTS = [
  { key: "tuition", label: "Tuition", color: "bg-series-1" },
  { key: "compulsoryFees", label: "Other compulsory fees", color: "bg-series-2" },
  { key: "oneOffFees", label: "One-off fees", color: "bg-series-3" },
  { key: "living", label: "Living costs", color: "bg-series-4" },
] as const;

export type SegmentKey = (typeof SEGMENTS)[number]["key"];
/**
 * What the bars compare: the whole total (stacked), one part of it, or
 * tuition split into its 2026 price and the expected rises since.
 */
export type CompareCategory = "total" | SegmentKey | "inflation";

/** One coloured piece of a bar. */
export interface ChartPart {
  key: string;
  label: string;
  color: string;
  value: (s: Selection) => number;
}

const segmentPart = (seg: (typeof SEGMENTS)[number]): ChartPart => ({
  ...seg,
  value: (s) => s.yearsSgd[seg.key],
});

/** Tuition split for the Inflation comparison. */
export const INFLATION_PARTS: ChartPart[] = [
  {
    key: "base",
    label: "Tuition at 2026 prices",
    color: "bg-series-1",
    value: (s) => s.tuitionAtBaseYearSgd,
  },
  {
    key: "rise",
    label: "Expected price rises",
    color: "bg-series-5",
    value: (s) => Math.max(0, s.yearsSgd.tuition - s.tuitionAtBaseYearSgd),
  },
];

/** The pieces each bar is drawn from, and the cost parts any selection has. */
export function chartParts(selections: Selection[], category: CompareCategory) {
  const used = SEGMENTS.filter((seg) => selections.some((s) => s.yearsSgd[seg.key] > 0)).map(
    segmentPart,
  );
  const segments =
    category === "total"
      ? used
      : category === "inflation"
        ? INFLATION_PARTS
        : SEGMENTS.filter((seg) => seg.key === category).map(segmentPart);
  return { used, segments };
}

export function valueFor(s: Selection, category: CompareCategory): number {
  if (category === "total") return s.grandTotalSgd;
  if (category === "inflation") return s.yearsSgd.tuition;
  return s.yearsSgd[category];
}

export function chartTitle(category: CompareCategory, includeLiving: boolean): string {
  if (category === "total") return includeLiving ? "Total cost in SGD" : "Total fees in SGD";
  if (category === "inflation") return "Tuition in SGD: 2026 prices and expected rises";
  return `${SEGMENTS.find((seg) => seg.key === category)?.label ?? ""} in SGD`;
}

const percent = (x: number) => `${Number((x * 100).toFixed(1))}%`;

/** What one bar is made of, for the hover tooltip and the tap-to-open breakdown. */
export function Breakdown({
  s,
  category,
  used,
}: {
  s: Selection;
  category: CompareCategory;
  used: ChartPart[];
}) {
  const inflation = category === "inflation";
  const rows = inflation ? INFLATION_PARTS : used;
  const rise = INFLATION_PARTS[1].value(s);
  return (
    <>
      {rows.map((part) => (
        <div key={part.key} className="flex justify-between gap-2">
          <dt className="flex items-center gap-1.5 text-muted">
            <span className={`inline-block h-2 w-2 rounded-sm ${part.color}`} />
            {part.label}
          </dt>
          <dd>
            {part.key === "tuition" && s.yearsSgd.tuition === 0
              ? "None"
              : formatMoney(part.value(s), "SGD")}
          </dd>
        </div>
      ))}
      <div className="flex justify-between gap-2 border-t border-border pt-1 font-medium">
        <dt>{inflation ? "Tuition" : "Total"}</dt>
        <dd>
          {formatMoney(inflation ? s.yearsSgd.tuition : s.grandTotalSgd, "SGD")}
        </dd>
      </div>
      {inflation && s.yearsSgd.tuition > 0 && (
        <div className="pt-1 text-muted">
          <dt className="sr-only">Price rises</dt>
          <dd>
            {percent(rise / s.yearsSgd.tuition)} of the tuition is expected price rises. Fees
            are projected to rise {percent(s.feeIncrease)} a year.
          </dd>
        </div>
      )}
    </>
  );
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
  const { used, segments } = chartParts(selections, category);
  const max = Math.max(...selections.map((s) => valueFor(s, category)), 1);
  const title = chartTitle(category, includeLiving);
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
                    {(category === "tuition" || category === "inflation") && value === 0
                      ? "No tuition"
                      : formatCompactSgd(value)}
                  </span>
                  {segments.map((seg, i) => {
                    const part = seg.value(s);
                    if (part <= 0) return null;
                    const top = segments.slice(i + 1).every((later) => later.value(s) <= 0);
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
              <Breakdown s={hovered} category={category} used={used} />
            </dl>
          </div>
        )}
      </div>
    </figure>
  );
}
