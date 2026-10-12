import UniversityName from "@/components/UniversityName";
import { COUNTRY_ORDER, type Country, type Level, type ShortlistRationale, type University } from "@/lib/schema";

const FOCUS = " outline-none focus-visible:ring-2 focus-visible:ring-accent";
const LEVEL_LABEL: Record<Level, string> = { bachelor: "Bachelor's", master: "Master's" };

/**
 * A collapsed section at the foot of the page listing, country by country, why
 * each university is in the calculator: its place on the October 2026 shortlist
 * with the evidence behind it, or the `whyIncluded` note for universities that
 * were added before the shortlist (and the Singapore ones, the local benchmark).
 */
export default function UniversityRationale({
  universities,
  countries,
  rationale,
}: {
  universities: University[];
  countries: Country[];
  rationale: Record<string, ShortlistRationale>;
}) {
  const countryByCode = new Map(countries.map((c) => [c.code, c]));
  const groups = COUNTRY_ORDER.map((code) => ({
    country: countryByCode.get(code),
    code,
    universities: universities
      .filter((u) => u.country === code)
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.universities.length > 0);
  const shortlisted = universities.filter((u) => rationale[`${u.country}/${u.id}`]).length;

  return (
    <section aria-label="Why these universities" className="safe-x mx-auto max-w-6xl pb-8">
      <details className="group rounded-xl border border-border bg-surface">
        <summary
          className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-5 py-3 [&::-webkit-details-marker]:hidden${FOCUS}`}
        >
          <span>
            <span className="block font-semibold">Why these universities?</span>
            <span className="block text-sm text-muted">
              How the {universities.length} universities in this calculator were chosen
            </span>
          </span>
          <span aria-hidden className="shrink-0 text-muted transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>

        <div className="space-y-3 border-t border-border px-5 pt-4 pb-5 text-sm">
          <p>
            {shortlisted} universities come from a shortlist researched in October 2026: the top 10 for
            bachelor&apos;s and for master&apos;s degrees in each overseas country, scored on popularity with
            international students (50%), ease of entry (25%) and affordability (25%). The figures below are the
            evidence behind each place, as found then; fees here are for one representative programme in the local
            currency, so check the calculator for the programme you want.
          </p>
          <p className="text-muted">
            The other {universities.length - shortlisted} were in the calculator before the shortlist: the Singapore
            universities as the local benchmark, and overseas universities with strong links to Singapore, such as
            many Singaporean students or degrees recognised by the Singapore Medical Council or the Singapore
            Institute of Legal Education.
          </p>

          <div className="divide-y divide-border rounded-md border border-border">
            {groups.map((g) => (
              <details key={g.code} className="group/country">
                <summary
                  className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-3 py-2 font-medium [&::-webkit-details-marker]:hidden${FOCUS}`}
                >
                  <span>{g.country?.name ?? g.code.toUpperCase()}</span>
                  <span className="shrink-0 text-xs font-normal text-muted">
                    {g.universities.length} universities{" "}
                    <span aria-hidden className="inline-block transition-transform group-open/country:rotate-180">
                      ▾
                    </span>
                  </span>
                </summary>
                <div className="overflow-x-auto px-3 pb-3">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs text-muted">
                      <tr className="border-b border-border">
                        <th scope="col" className="py-2 pr-3 font-medium">University</th>
                        <th scope="col" className="hidden py-2 pr-3 font-medium sm:table-cell">Shortlist rank</th>
                        <th scope="col" className="py-2 font-medium">Why it&apos;s here</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border align-top">
                      {g.universities.map((u) => (
                        <Row key={u.id} u={u} r={rationale[`${u.country}/${u.id}`]} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
          </div>
        </div>
      </details>
    </section>
  );
}

function Row({ u, r }: { u: University; r?: ShortlistRationale }) {
  const rank = r
    ? r.ranks.map((x) => `${LEVEL_LABEL[x.level]} #${x.rank}`).join(" · ")
    : u.country === "sg"
      ? "Local benchmark"
      : "Added before the shortlist";
  const levels = r ? r.ranks.map((x) => x.level) : [];

  return (
    <tr>
      <td className="w-[38%] py-2.5 pr-3 sm:w-1/4">
        <UniversityName university={u} className="font-medium" />
        <span className="mt-0.5 block text-xs text-muted sm:hidden">{rank}</span>
      </td>
      <td className="hidden w-1/6 py-2.5 pr-3 text-muted sm:table-cell">{rank}</td>
      <td className="py-2.5">
        {r ? (
          <>
            {r.popularity && <p>{r.popularity}</p>}
            {levels.map((level) => {
              const parts = [r.entry[level], r.fee[level] && `Tuition ${r.fee[level]}`].filter(Boolean);
              return parts.length > 0 ? (
                <p key={level} className="mt-1 text-xs text-muted">
                  <span className="font-medium text-foreground">{LEVEL_LABEL[level]}: </span>
                  {parts.join(". ")}
                </p>
              ) : null;
            })}
            {r.source && (
              <a
                href={r.source}
                target="_blank"
                rel="noreferrer"
                className={`mt-1 inline-block text-xs text-accent underline-offset-4 hover:underline${FOCUS}`}
              >
                Source ↗
              </a>
            )}
          </>
        ) : (
          <p>{u.whyIncluded}</p>
        )}
      </td>
    </tr>
  );
}
