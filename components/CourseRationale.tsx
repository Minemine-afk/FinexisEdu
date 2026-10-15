import { FIELD_LABELS } from "@/lib/format";
import type { CourseRationale as Course } from "@/lib/schema";

const FOCUS = " outline-none focus-visible:ring-2 focus-visible:ring-accent";

/**
 * A collapsed section at the foot of the page saying why each field of study is
 * in the calculator: one reason, one Singapore figure and its source per field
 * (data/courses.json). The universities' section sits directly below it.
 */
export default function CourseRationale({ courses }: { courses: Course[] }) {
  return (
    <section aria-label="Why these courses" className="safe-x mx-auto max-w-6xl pb-4">
      <details className="group rounded-xl border border-border bg-surface">
        <summary
          className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-5 py-3 [&::-webkit-details-marker]:hidden${FOCUS}`}
        >
          <span>
            <span className="block font-semibold">Why these courses?</span>
            <span className="block text-sm text-muted">
              How the {courses.length} fields of study in this calculator were chosen
            </span>
          </span>
          <span aria-hidden className="shrink-0 text-muted transition-transform group-open:rotate-180">
            ▾
          </span>
        </summary>

        <div className="space-y-3 border-t border-border px-5 pt-4 pb-5 text-sm">
          <p>
            The calculator covers the fields Singaporeans most often study, at home and abroad: together they match
            about 93% of first-year places at Singapore&apos;s six autonomous universities (2024). In each field it
            follows the main bachelor&apos;s and master&apos;s degrees at every university that teaches them. No
            agency publishes what Singaporeans study overseas by subject, so each reason below pairs a Singapore
            figure with what international students choose in the same countries.
          </p>

          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-left text-sm">
              <thead className="hidden text-xs text-muted sm:table-header-group">
                <tr className="border-b border-border">
                  <th scope="col" className="w-1/5 px-3 py-2 font-medium">Field</th>
                  <th scope="col" className="px-3 py-2 font-medium">Why it&apos;s here</th>
                  <th scope="col" className="w-[30%] px-3 py-2 font-medium">Key figure</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {courses.map((c) => (
                  <tr key={c.field} className="block px-3 py-3 align-top sm:table-row sm:px-0 sm:py-0">
                    <td className="block font-medium sm:table-cell sm:px-3 sm:py-2.5">
                      {FIELD_LABELS[c.field]}
                      {c.includes && <span className="block text-xs font-normal text-muted">{c.includes}</span>}
                    </td>
                    <td className="mt-0.5 block sm:mt-0 sm:table-cell sm:px-3 sm:py-2.5">{c.reason}</td>
                    <td className="mt-1.5 block sm:mt-0 sm:table-cell sm:px-3 sm:py-2.5">
                      {c.figure}
                      <a
                        href={c.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className={`flex min-h-11 w-fit items-center text-xs text-accent underline-offset-4 hover:underline pointer-fine:sm:min-h-0 pointer-fine:sm:pt-1${FOCUS}`}
                      >
                        {c.sourceLabel} ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-muted">
            Not covered: architecture, dentistry and mass communication. Education degrees (NTU&apos;s National
            Institute of Education) are listed under Arts and Sciences. Degrees in law and medicine are labelled by
            whether they lead to practice in Singapore.
          </p>
        </div>
      </details>
    </section>
  );
}
