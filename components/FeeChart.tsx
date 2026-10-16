"use client";

import { useRef, useState } from "react";
import { PRICE_BASE_YEAR } from "@/lib/calc";
import { formatCompactSgd, formatMoney, programmeLabel } from "@/lib/format";
import type { Selection } from "./useCalculator";
import UniversityName from "./UniversityName";
import { useClampX } from "./useClampX";

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
    label: `Tuition at ${PRICE_BASE_YEAR} prices`,
    color: "bg-series-1",
    value: (s) => s.tuitionAtBaseYearSgd,
  },
  {
    key: "rise",
    label: "Expected price increase",
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

/** The figure over a bar: the amount, or why there is none ("No tuition", living costs "Not included"). */
export function barLabel(s: Selection, category: CompareCategory, compact = true): string {
  const value = valueFor(s, category);
  if (value === 0) {
    if (category === "tuition" || category === "inflation") return "No tuition";
    if (category === "living") return "Not included";
    if (category === "compulsoryFees" || category === "oneOffFees") return "None";
  }
  return compact ? formatCompactSgd(value) : formatMoney(value, "SGD");
}

export function valueFor(s: Selection, category: CompareCategory): number {
  if (category === "total") return s.grandTotalSgd;
  if (category === "inflation") return s.yearsSgd.tuition;
  return s.yearsSgd[category];
}

export function chartTitle(category: CompareCategory, includeLiving: boolean): string {
  if (category === "total") return includeLiving ? "Total cost in SGD" : "Total fees in SGD";
  if (category === "inflation") return `Tuition in SGD: ${PRICE_BASE_YEAR} prices and expected rises`;
  return `${SEGMENTS.find((seg) => seg.key === category)?.label ?? ""} in SGD`;
}

const percent = (x: number) => `${Number((x * 100).toFixed(1))}%`;

/** One line under the Inflation chart saying what the two colours mean. */
export const INFLATION_CAPTION = `Tuition held at ${PRICE_BASE_YEAR} prices, plus the rises expected by each year of study. Rises a university has already published for later years count as rises.`;

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
            are projected to rise {percent(s.feeIncrease)} a year; rises a university has
            already published for years after {PRICE_BASE_YEAR} count as price rises too.
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
  const hoveredAt = selections.findIndex((s) => s.key === hover);
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
      {category === "inflation" && <p className="mt-1 text-xs text-muted">{INFLATION_CAPTION}</p>}

      <div className="relative mt-8">
        {/* Plot: a fixed-height area whose bottom edge is the shared baseline. */}
        <div className={`${row} border-b border-border`}>
          {selections.map((s, i) => {
            const value = valueFor(s, category);
            // The breakdown sits beside its bar: to the right of every bar but the last.
            const side = i === selections.length - 1 && selections.length > 1 ? "right-full mr-2" : "left-full ml-2";
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
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setHover(null);
                    e.currentTarget.blur();
                  }
                }}
              >
                <div
                  className="absolute inset-x-0 bottom-0 flex flex-col-reverse gap-0.5"
                  style={{ height: `${(value / max) * 100}%` }}
                >
                  <span className="absolute inset-x-0 bottom-full mb-1.5 whitespace-nowrap text-center text-sm font-semibold tabular-nums">
                    {barLabel(s, category)}
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
                {hovered && hoveredAt === i && (
                  <BarTip className={side}>
                    <p className="font-medium">{hovered.university.name}</p>
                    <p className="text-muted">
                      {programmeLabel(hovered.university, hovered.programme)}
                    </p>
                    <dl className="mt-2 space-y-0.5 tabular-nums">
                      <Breakdown s={hovered} category={category} used={used} />
                    </dl>
                  </BarTip>
                )}
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
      </div>
    </figure>
  );
}

/** The breakdown card beside a bar, slid sideways when it would run off the screen. */
function BarTip({ className, children }: { className: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useClampX(ref, true);
  return (
    <div
      ref={ref}
      role="tooltip"
      className={`pointer-events-none absolute top-0 z-10 w-60 rounded-lg border border-border bg-surface p-3 text-xs shadow-lg ${className}`}
    >
      {children}
    </div>
  );
}
