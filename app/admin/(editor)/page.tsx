import { PageTitle } from "@/components/editor/ui";
import UniversityList from "@/components/editor/UniversityList";
import { loadCountries, loadUniversities } from "@/lib/data";
import { orderCountries } from "@/lib/settings";

export default function UniversitiesScreen() {
  const universities = loadUniversities();
  const countries = new Map(loadCountries().map((c) => [c.code, c.name]));
  const programmes = universities.reduce((n, u) => n + u.programmes.length, 0);
  const groups = orderCountries(universities.map((u) => u.country)).map((code) => ({
    code,
    name: countries.get(code) ?? code,
    universities: universities
      .filter((u) => u.country === code)
      .map((u) => ({
        id: u.id,
        name: u.name,
        city: u.city,
        programmes: u.programmes.length,
        hasLiving: u.livingCosts !== undefined,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));

  return (
    <>
      <PageTitle title="Universities">
        {universities.length} universities and {programmes.toLocaleString("en-GB")} programmes in {groups.length} countries.
        Open a university to see its programmes, fees, fee history and living costs.
      </PageTitle>
      <UniversityList groups={groups} />
    </>
  );
}
