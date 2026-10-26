import { Cell, PageTitle, percent, Table } from "@/components/editor/ui";
import { loadCountries, loadUniversities } from "@/lib/data";
import { orderCountries, SETTINGS } from "@/lib/settings";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default function CountriesScreen() {
  const countries = loadCountries();
  const universities = loadUniversities();
  const byCode = new Map(countries.map((c) => [c.code, c]));

  return (
    <>
      <PageTitle title="Countries">
        Each country&apos;s currency, typical yearly fee increase (used when a university has too little fee history) and
        living-cost inflation, in the order the calculator lists them.
      </PageTitle>
      <Table
        head={[
          "Country",
          "Code",
          "Currency",
          "Universities",
          "Typical fee increase",
          "By tier",
          "Living-cost increase",
          "Usual intake month",
        ]}
      >
        {orderCountries(countries.map((c) => c.code)).map((code) => {
          const c = byCode.get(code)!;
          const tiers = Object.entries(c.feeIncreaseByTier ?? {})
            .map(([t, r]) => `${t === "pr" ? "PR" : t}: ${percent(r)}`)
            .join(", ");
          const month = SETTINGS.intakeMonth[code] ?? SETTINGS.defaultIntakeMonth;
          return (
            <tr key={code}>
              <Cell>{c.name}</Cell>
              <Cell>{c.code}</Cell>
              <Cell>{c.currency}</Cell>
              <Cell>{universities.filter((u) => u.country === code).length}</Cell>
              <Cell>{percent(c.defaultFeeIncrease)}</Cell>
              <Cell>{tiers || <span className="text-muted">-</span>}</Cell>
              <Cell>{c.livingCostIncrease === undefined ? <span className="text-muted">Site default</span> : percent(c.livingCostIncrease)}</Cell>
              <Cell>{MONTHS[month]}</Cell>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
