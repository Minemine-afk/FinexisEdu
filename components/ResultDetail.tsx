"use client";

import { useState } from "react";
import { isStale, type CalcResult } from "@/lib/calc";
import { formatMoney, partnerOf, programmeLabel } from "@/lib/format";
import { LIVING_CATEGORIES, type Country, type SgRecognition } from "@/lib/schema";
import { monthlyTotal, type Lifestyle, type MonthlyLiving } from "@/lib/living";
import UniversityName from "./UniversityName";
import InfoTip from "./InfoTip";
import type { GlossaryTerm } from "@/lib/glossary";
import { LIVING_LABELS, type LivingResult, type Selection } from "./useCalculator";

export const FOCUS = " outline-none focus-visible:ring-2 focus-visible:ring-accent";

/** A partial final year as a fraction people recognise, e.g. "½ year" or "40% of a year". */
export function yearShare(fraction: number): string {
  const named: [number, string][] = [
    [0.5, "½"],
    [1 / 3, "⅓"],
    [0.25, "¼"],
    [2 / 3, "⅔"],
    [0.75, "¾"],
  ];
  const hit = named.find(([f]) => Math.abs(f - fraction) < 0.02);
  return hit ? `${hit[1]} year` : `${Math.round(fraction * 100)}% of a year`;
}

/** True when the university charges no tuition at all for this programme (e.g. most German public universities). */
export function noTuition(result: CalcResult): boolean {
  return result.years.length > 0 && result.years.every((y) => y.tuition === 0);
}

/** Year-by-year fees, living costs and sources for one university. */
export default function ResultDetail({
  s,
  today,
  country,
  lifestyle,
  className,
  onCustomLiving,
}: {
  s: Selection;
  today: string;
  country?: Country;
  lifestyle: Lifestyle;
  className: string;
  onCustomLiving: (m: MonthlyLiving | null) => void;
}) {
  const { university: u, programme: p, result } = s;
  const partner = partnerOf(u, p);
  const cur = u.currency;
  // Units of the local currency per S$1, so local ÷ rate = SGD.
  const sgd = (n: number) => n / s.fxRate;
  const stale = isStale(p.lastVerified, new Date(today));
  const hasCompulsory = result.years.some((y) => y.compulsoryFees > 0);
  const hasOneOff = result.years.some((y) => y.oneOffFees > 0);
  const num = `whitespace-nowrap py-1 text-right font-normal ${hasCompulsory && hasOneOff ? "pl-2" : "pl-3"}`;
  // Cohort-locked programmes are priced at the start year's fee throughout.
  const historyYears = new Set(
    result.years
      .filter((y) => y.basis === "history")
      .map((y) =>
        p.cohortLocked ? result.years[0].academicYear : y.academicYear,
      ),
  );
  const historySources = p.feeHistory
    .filter(
      (h) =>
        h.tier === result.tier &&
        historyYears.has(h.feeYear) &&
        h.sourceUrl &&
        h.sourceUrl !== p.sourceUrl,
    )
    .map((h) => ({ year: h.feeYear, url: h.sourceUrl! }));

  return (
    <article
      className={`min-w-0 ${className}${className ? " md:row-span-3 md:grid md:grid-rows-subgrid" : ""}`}
    >
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {country?.name} · {u.city}
        </p>
        <h3 className="mt-1 font-semibold leading-snug">
          <UniversityName university={u} />
        </h3>
        <p className="text-sm text-muted">
          {programmeLabel(u, p)} · {result.durationYears}{" "}
          {result.durationYears === 1 ? "year" : "years"}
        </p>
        {p.majors && (
          <p className="mt-1 text-xs text-muted">
            Majors: {p.majors.join(", ")}
          </p>
        )}
        {partner?.description && (
          <p className="mt-1 text-xs text-muted">{partner.description}</p>
        )}
        <p className="mt-2 text-sm tabular-nums">
          {formatMoney(s.grandTotalSgd, "SGD")}
          {cur !== "SGD" && (
            <span className="text-muted">
              {" "}
              ={" "}
              {formatMoney(
                result.totalLocal + (s.living?.totalLocal ?? 0),
                cur,
              )}{" "}
              at S$1 ={" "}
              {s.fxRate.toLocaleString("en-SG", { maximumFractionDigits: 4 })}{" "}
              {cur}
            </span>
          )}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
          <Badge
            term={
              result.tier === "international"
                ? "internationalRate"
                : result.tier === "citizen"
                  ? "citizenRate"
                  : "prRate"
            }
          >
            {result.tier === "international"
              ? "International rate"
              : `${result.tier === "citizen" ? "Citizen" : "PR"} rate`}
          </Badge>
          {noTuition(result) && (
            <Badge term="noTuition">No tuition fees</Badge>
          )}
          {p.cohortLocked && (
            <Badge term="cohortLocked">Fee fixed for your cohort</Badge>
          )}
          {result.projected &&
            (s.feeIncrease > 0 ? (
              <Badge term="projected">
                {p.cohortLocked
                  ? "Entry-year fee projected at"
                  : "Includes projected"}{" "}
                +{(s.feeIncrease * 100).toFixed(1)}%/yr
              </Badge>
            ) : (
              <Badge term="projected">Future years assume no increase</Badge>
            ))}
          {result.laterYearFees && (
            <Badge term={result.laterYearsEstimated ? "laterYearsEstimated" : "laterYears"}>
              {result.laterYearsEstimated
                ? "Later years estimated from programme total"
                : "Later years priced at their own fee"}
            </Badge>
          )}
          {result.otherFeesFromCurrent && (
            <Badge term="otherFeesCurrent">Other fees use current rates</Badge>
          )}
          {p.sgRecognition && <RecognitionBadge r={p.sgRecognition} />}
          {p.sourceType === "secondary" && (
            <Badge warn term="unofficialSource">
              Unofficial source
            </Badge>
          )}
          {stale && (
            <Badge warn term="outdated">
              Data may be outdated
            </Badge>
          )}
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table
          className={`w-full tabular-nums ${(hasCompulsory && hasOneOff) || className ? "text-xs" : "text-sm"}`}
        >
          <caption className="sr-only">University fees by year in SGD</caption>
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1 pr-2 font-medium">Year</th>
              <th className={num}>Tuition</th>
              {hasCompulsory && (
                <th className={num}>
                  <InfoTip term="compulsoryFees" align="right">
                    Other fees
                  </InfoTip>
                </th>
              )}
              {hasOneOff && (
                <th className={num}>
                  <InfoTip term="oneOffFees" align="right">
                    One-off
                  </InfoTip>
                </th>
              )}
              <th className={num}>Fees (SGD)</th>
            </tr>
          </thead>
          <tbody>
            {result.years.map((y, i) => (
              <tr
                key={y.academicYear}
                className="border-t border-border align-top"
              >
                <td className="py-1 pr-2">
                  {y.academicYear}
                  {y.fraction < 1 && (
                    <span className="text-muted"> ({yearShare(y.fraction)})</span>
                  )}
                  {y.laterYear && (
                    <span className="block text-xs text-muted">
                      year {i + 1} fee
                    </span>
                  )}
                  {y.basis !== "current" && (
                    <span className="block text-xs text-muted">
                      {i === 0 || result.years[i - 1].basis !== y.basis ? (
                        // Explain the term once per run of years, not on every row.
                        <InfoTip
                          term={
                            y.basis === "history" ? "published" : "projected"
                          }
                        >
                          {y.basis === "history" ? "published" : "projected"}
                        </InfoTip>
                      ) : y.basis === "history" ? (
                        "published"
                      ) : (
                        "projected"
                      )}
                    </span>
                  )}
                </td>
                <td className={num}>
                  {y.tuition === 0 ? (
                    <span className="text-muted">None</span>
                  ) : (
                    formatMoney(sgd(y.tuition), "SGD")
                  )}
                </td>
                {hasCompulsory && (
                  <td className={num}>
                    {formatMoney(sgd(y.compulsoryFees), "SGD")}
                  </td>
                )}
                {hasOneOff && (
                  <td className={num}>
                    {formatMoney(sgd(y.oneOffFees), "SGD")}
                  </td>
                )}
                <td className={`${num} font-medium`}>
                  {formatMoney(sgd(y.total), "SGD")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        {s.living && (
          <LivingSection
            living={s.living}
            currency={cur}
            fxRate={s.fxRate}
            lifestyle={lifestyle}
            today={today}
            onCustom={onCustomLiving}
          />
        )}
        {s.livingNote && (
          <p className="mt-4 rounded-md bg-chip px-3 py-2 text-xs text-muted">
            {s.livingNote}
          </p>
        )}

        {p.summary && (
          <MoreNotes label="Show more about this fee" href={p.sourceUrl}>
            {p.summary}
          </MoreNotes>
        )}
        <p className="mt-3 text-xs text-muted">
          {p.feeYear}/{String((p.feeYear + 1) % 100).padStart(2, "0")} fees ·{" "}
          <a
            className="text-accent underline hover:text-foreground"
            href={p.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            source
          </a>{" "}
          · checked {p.lastVerified}
          {historySources.map((h) => (
            <span key={h.year}>
              {" · "}
              <a
                className="text-accent underline hover:text-foreground"
                href={h.url}
                target="_blank"
                rel="noreferrer"
              >
                {h.year} source
              </a>
            </span>
          ))}
        </p>
      </div>
    </article>
  );
}

/** A short plain-English explanation behind a "Show more" toggle, with a link to the source for detail. */
function MoreNotes({
  label,
  href,
  children,
}: {
  label: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <details className="mt-2 text-xs">
      <summary
        className={`cursor-pointer py-1.5 font-medium text-accent${FOCUS} rounded`}
      >
        {label}
      </summary>
      <p className="mt-1 text-muted">{children}</p>
      <a
        className={`mt-1 inline-flex items-center gap-1 rounded font-medium text-accent hover:text-foreground${FOCUS}`}
        href={href}
        target="_blank"
        rel="noreferrer"
      >
        Read more at source <span aria-hidden="true">↗</span>
      </a>
    </details>
  );
}

/** "SILE listed" / "Not on SMC list" label for law and medicine degrees. */
export function RecognitionBadge({ r }: { r: SgRecognition }) {
  const term: GlossaryTerm =
    r.body === "SILE"
      ? r.listed
        ? "sileListed"
        : "sileNotListed"
      : r.listed
        ? "smcListed"
        : "smcNotListed";
  return (
    <Badge warn={!r.listed} term={term}>
      {r.listed ? `${r.body} listed` : `Not on ${r.body} list`}
      {r.note ? ` (${r.note})` : ""}
    </Badge>
  );
}

export function Badge({
  children,
  warn,
  term,
}: {
  children: React.ReactNode;
  warn?: boolean;
  term?: GlossaryTerm;
}) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 ${warn ? "bg-warn-bg text-warn-fg" : "bg-chip text-muted"}`}
    >
      {term ? <InfoTip term={term}>{children}</InfoTip> : children}
    </span>
  );
}

function LivingSection({
  living,
  currency: cur,
  fxRate,
  lifestyle,
  today,
  onCustom,
}: {
  living: LivingResult;
  currency: string;
  /** Units of `currency` per S$1. */
  fxRate: number;
  lifestyle: Lifestyle;
  today: string;
  onCustom: (m: MonthlyLiving | null) => void;
}) {
  const e = living.estimate;
  const sgd = (n: number) => n / fxRate;
  const stale = isStale(e.lastVerified, new Date(today));
  const projected = living.years.some((y) => y.projected);
  // Some sources (e.g. a visa minimum) give one total, stored under housing.
  const breakdown =
    living.customised ||
    e.monthly.food + e.monthly.transport + e.monthly.personal > 0;
  return (
    <section className="mt-5 border-t border-border pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">
          <span
            className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-series-4"
            aria-hidden
          />
          Living costs
        </h3>
        <span className="text-sm font-medium tabular-nums">
          {formatMoney(living.totalSgd, "SGD")}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted">
        {living.customised
          ? "Your own budget"
          : `${lifestyle[0].toUpperCase()}${lifestyle.slice(1)} lifestyle`}{" "}
        · {formatMoney(sgd(monthlyTotal(living.monthly)), "SGD")} a month (
        {formatMoney(monthlyTotal(living.monthly), cur)}) × {e.months} months a
        year
        {projected &&
          ` · later years +${(living.increase * 100).toFixed(1)}%/yr inflation`}
      </p>
      {breakdown ? (
        <dl className="mt-2 grid gap-x-4 gap-y-0.5 text-xs tabular-nums sm:grid-cols-2 lg:grid-cols-1">
          {LIVING_CATEGORIES.map((c) => (
            <div key={c} className="flex justify-between gap-2">
              <dt className="text-muted">{LIVING_LABELS[c]}</dt>
              <dd>{formatMoney(sgd(living.monthly[c]), "SGD")}/mo</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-xs text-muted">
          This estimate is a single total, not split by category.
        </p>
      )}
      <p className="mt-2 text-xs text-muted tabular-nums">
        {living.years
          .map((y) => `${y.academicYear}: ${formatMoney(sgd(y.amount), "SGD")}`)
          .join(" · ")}
      </p>

      <details className="mt-2 text-sm">
        <summary className={`cursor-pointer py-2 text-xs font-medium text-accent${FOCUS} rounded`}>
          Customise this budget
        </summary>
        <CustomLiving
          key={JSON.stringify(living.monthly)}
          initial={living.monthly}
          currency={cur}
          onSave={onCustom}
          customised={living.customised}
        />
      </details>

      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        {e.sourceType === "secondary" && (
          <Badge warn term="unofficialSource">
            Unofficial source
          </Badge>
        )}
        {stale && (
          <Badge warn term="outdated">
            Estimate may be outdated
          </Badge>
        )}
      </div>
      {e.summary && (
        <MoreNotes label="Show more about this estimate" href={e.sourceUrl}>
          {e.summary}
        </MoreNotes>
      )}
      <p className="mt-1 text-xs text-muted">
        {e.year} estimate ·{" "}
        <a
          className="text-accent underline hover:text-foreground"
          href={e.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          source
        </a>{" "}
        · checked {e.lastVerified}
      </p>
    </section>
  );
}

function CustomLiving({
  initial,
  currency,
  customised,
  onSave,
}: {
  initial: MonthlyLiving;
  currency: string;
  customised: boolean;
  onSave: (m: MonthlyLiving | null) => void;
}) {
  const [draft, setDraft] = useState<MonthlyLiving>(
    () =>
      Object.fromEntries(
        LIVING_CATEGORIES.map((c) => [c, Math.round(initial[c])]),
      ) as MonthlyLiving,
  );
  return (
    <form
      className="mt-2 space-y-2"
      onSubmit={(ev) => {
        ev.preventDefault();
        onSave(draft);
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        {LIVING_CATEGORIES.map((c) => (
          <label key={c} className="text-xs">
            <span className="text-muted">
              {LIVING_LABELS[c]} ({currency} a month)
            </span>
            <input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              className={`mt-0.5 h-10 w-full rounded-md border border-border bg-surface px-2 text-right tabular-nums${FOCUS}`}
              value={draft[c]}
              onChange={(ev) =>
                setDraft({
                  ...draft,
                  [c]: Math.max(0, Number(ev.target.value)),
                })
              }
            />
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className={`min-h-10 rounded-md bg-accent-fill px-3 py-1 text-xs font-medium text-on-accent${FOCUS}`}
        >
          Use my budget
        </button>
        {customised && (
          <button
            type="button"
            className={`min-h-10 rounded-md border border-border px-3 py-1 text-xs${FOCUS}`}
            onClick={() => onSave(null)}
          >
            Reset to university estimate
          </button>
        )}
      </div>
    </form>
  );
}
