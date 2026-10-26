import { Cell, Facts, PageTitle, percent, Section, Table } from "@/components/editor/ui";
import { loadCountries } from "@/lib/data";
import { SETTINGS } from "@/lib/settings";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function SettingsScreen() {
  const countryName = new Map(loadCountries().map((c) => [c.code, c.name]));
  const s = SETTINGS;

  return (
    <>
      <PageTitle title="Site settings">The calculator&apos;s fixed assumptions and the hover explanations.</PageTitle>

      <Facts
        rows={[
          ["Highest yearly fee increase", percent(s.maxFeeIncrease)],
          ["Fee increase when nothing else is known", percent(s.fallbackFeeIncrease)],
          ["Living-cost increase when a country has none", percent(s.fallbackLivingCostIncrease)],
          ["Latest start year", s.maxStartYear],
          ["Frugal lifestyle", `${s.lifestyleMultiplier.frugal} x the university's estimate`],
          ["Moderate lifestyle", `${s.lifestyleMultiplier.moderate} x the university's estimate`],
          ["Comfortable lifestyle", `${s.lifestyleMultiplier.comfortable} x the university's estimate`],
          ["Country order", s.countryOrder.map((c) => countryName.get(c) ?? c).join(", ")],
          ["Usual intake month", `${MONTHS[s.defaultIntakeMonth]}, except ${Object.entries(s.intakeMonth)
            .map(([c, m]) => `${countryName.get(c) ?? c} (${MONTHS[m]})`)
            .join(", ")}`],
        ]}
      />

      <Section title="Hover explanations">
        <Table head={["Term", "Explanation"]}>
          {Object.entries(s.glossary).map(([term, text]) => (
            <tr key={term}>
              <Cell className="whitespace-nowrap font-medium">{term}</Cell>
              <Cell>{text}</Cell>
            </tr>
          ))}
        </Table>
      </Section>
    </>
  );
}
