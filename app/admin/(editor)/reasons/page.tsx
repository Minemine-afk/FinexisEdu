import { Cell, ExternalLink, PageTitle, Section, Table } from "@/components/editor/ui";
import { loadCountries, loadCourses, loadRationale, loadUniversities } from "@/lib/data";
import { orderCountries } from "@/lib/settings";

export default function ReasonsScreen() {
  const courses = loadCourses();
  const rationale = loadRationale();
  const universities = loadUniversities();
  const countryName = new Map(loadCountries().map((c) => [c.code, c.name]));
  const ranked = orderCountries(universities.map((u) => u.country)).flatMap((code) =>
    universities
      .filter((u) => u.country === code && rationale[`${u.country}/${u.id}`])
      .map((u) => ({ u, r: rationale[`${u.country}/${u.id}`] }))
      .sort((a, b) => a.u.name.localeCompare(b.u.name)),
  );

  return (
    <>
      <PageTitle title="Reasons" edit="/admin/reasons/edit">
        What visitors read under &quot;Why these courses?&quot; and the shortlist places behind &quot;Why these
        universities?&quot;.
      </PageTitle>

      <Section title="Why these courses?">
        <Table head={["Field", "Shown under the name", "Reason", "Figure", "Source"]}>
          {courses.map((c) => (
            <tr key={c.field}>
              <Cell>{c.field}</Cell>
              <Cell>{c.includes}</Cell>
              <Cell>{c.reason}</Cell>
              <Cell>{c.figure}</Cell>
              <Cell>
                <span className="mr-1">{c.sourceLabel}:</span>
                <ExternalLink href={c.sourceUrl} />
              </Cell>
            </tr>
          ))}
        </Table>
      </Section>

      <Section title="Why these universities?">
        <Table head={["University", "Country", "Shortlist place", "Why it is included", "Source"]}>
          {ranked.map(({ u, r }) => (
            <tr key={`${u.country}/${u.id}`}>
              <Cell>{u.name}</Cell>
              <Cell>{countryName.get(u.country) ?? u.country}</Cell>
              <Cell className="whitespace-nowrap">
                {r.ranks.map((x) => `${x.level === "bachelor" ? "Bachelor's" : "Master's"} #${x.rank}`).join(", ")}
              </Cell>
              <Cell>{u.whyIncluded}</Cell>
              <Cell>
                <ExternalLink href={r.source} />
              </Cell>
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}
