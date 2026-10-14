import UniversityName from "@/components/UniversityName";
import { COUNTRY_ORDER, type Country, type Level, type ShortlistRationale, type University } from "@/lib/schema";

const FOCUS = " outline-none focus-visible:ring-2 focus-visible:ring-accent";
const LEVEL_LABEL: Record<Level, string> = { bachelor: "Bachelor's", master: "Master's" };

/**
 * A collapsed section at the foot of the page listing, country by country, why
 * each university is in the calculator (its `whyIncluded` note, written for a
 * Singaporean reader) and its place on the October 2026 shortlist, if any.
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
            The overseas countries are the nine where Singaporeans most often study, by UNESCO&apos;s counts of
            Singaporean students abroad. Within them, {shortlisted} universities come from an October 2026 shortlist
            of the top 10 for bachelor&apos;s and for master&apos;s degrees, chosen for popularity with international
            students, ease of entry and affordability. Each reason below says what links the university to
            Singapore.
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

  return (
    <tr>
      <td className="w-[38%] py-2.5 pr-3 sm:w-1/4">
        <UniversityName university={u} className="font-medium" />
        <span className="mt-0.5 block text-xs text-muted sm:hidden">{rank}</span>
      </td>
      <td className="hidden w-1/6 py-2.5 pr-3 text-muted sm:table-cell">{rank}</td>
      <td className="py-2.5">
        {u.whyIncluded}
        {r?.source && (
          <>
            {" "}
            <a
              href={r.source}
              target="_blank"
              rel="noreferrer"
              className={`whitespace-nowrap text-xs text-accent underline-offset-4 hover:underline${FOCUS}`}
            >
              Source ↗
            </a>
          </>
        )}
      </td>
    </tr>
  );
}
