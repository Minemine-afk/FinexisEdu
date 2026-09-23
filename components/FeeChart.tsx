"use client";

import { useState } from "react";
import { formatCompactSgd, formatMoney } from "@/lib/format";
import type { Selection } from "./Calculator";

const SEGMENTS = [
  { key: "tuition", label: "Tuition", color: "bg-series-1" },
  { key: "compulsoryFees", label: "Other compulsory fees", color: "bg-series-2" },
  { key: "oneOffFees", label: "One-off fees", color: "bg-series-3" },
] as const;

/** Stacked horizontal bars of total fees in SGD, one per selected university. */
export default function FeeChart({ selections }: { selections: Selection[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(...selections.map((s) => s.totalSgd), 1);
  const used = SEGMENTS.filter((seg) => selections.some((s) => s.yearsSgd[seg.key] > 0));

  return (
    <figure className="rounded-xl border border-border bg-surface p-5">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-semibold">Total fees in SGD</span>
        {used.length > 1 && (
          <span className="flex flex-wrap gap-3 text-xs text-muted">
            {used.map((seg) => (
              <span key={seg.key} className="flex items-center gap-1.5">
                <span className={`inline-block h-2.5 w-2.5 rounded-sm ${seg.color}`} />
                {seg.label}
              </span>
            ))}
          </span>
        )}
      </figcaption>

      <ul className="mt-4 space-y-3">
        {selections.map((s) => (
          <li
            key={s.key}
            className="relative"
            onMouseEnter={() => setHover(s.key)}
            onMouseLeave={() => setHover(null)}
          >
            <p className="truncate text-sm">{s.university.name}</p>
            <div className="mt-1 flex items-center gap-2">
              <div className="flex h-5 min-w-0 flex-1">
                <div className="flex gap-0.5" style={{ width: `${(s.totalSgd / max) * 100}%` }}>
                  {used.map((seg, i) => {
                    const value = s.yearsSgd[seg.key];
                    if (value <= 0) return null;
                    const last = used.slice(i + 1).every((later) => s.yearsSgd[later.key] <= 0);
                    return (
                      <div
                        key={seg.key}
                        className={`${seg.color} ${last ? "rounded-r" : ""}`}
                        style={{ flexGrow: value, flexBasis: 0, minWidth: 2 }}
                      />
                    );
                  })}
                </div>
              </div>
              <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums">
                {formatCompactSgd(s.totalSgd)}
              </span>
            </div>

            {hover === s.key && (
              <div
                role="tooltip"
                className="absolute left-0 top-full z-10 mt-1 w-64 rounded-lg border border-border bg-surface p-3 text-xs shadow-lg"
              >
                <p className="font-medium">{s.university.name}</p>
                <p className="text-muted">{s.programme.name}</p>
                <dl className="mt-2 space-y-0.5 tabular-nums">
                  {used.map((seg) => (
                    <div key={seg.key} className="flex justify-between gap-2">
                      <dt className="flex items-center gap-1.5 text-muted">
                        <span className={`inline-block h-2 w-2 rounded-sm ${seg.color}`} />
                        {seg.label}
                      </dt>
                      <dd>{formatMoney(s.yearsSgd[seg.key], "SGD")}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-2 border-t border-border pt-1 font-medium">
                    <dt>Total</dt>
                    <dd>{formatMoney(s.totalSgd, "SGD")}</dd>
                  </div>
                </dl>
              </div>
            )}
          </li>
        ))}
      </ul>
    </figure>
  );
}
