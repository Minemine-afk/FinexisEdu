import { editPageFor } from "@/lib/editor/documents";
import Link from "next/link";
import { RemoveCountry } from "@/components/editor/StructureActions";
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
      <PageTitle title="Countries" action={{ href: "/admin/countries/new", label: "Add a country" }}>
        Each country&apos;s currency, typical yearly fee increase (used when a university has too little fee history) and
        living-cost inflation, in the order the calculator lists them. Open a country to edit it; the order and intake months are in Site settings.
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
          "",
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
              <Cell>
                <Link href={editPageFor(`data/countries/${code}.json`)!} className="text-accent underline">
                  {c.name}
                </Link>
              </Cell>
              <Cell>{c.code}</Cell>
              <Cell>{c.currency}</Cell>
              <Cell>{universities.filter((u) => u.country === code).length}</Cell>
              <Cell>{percent(c.defaultFeeIncrease)}</Cell>
              <Cell>{tiers || <span className="text-muted">-</span>}</Cell>
              <Cell>{c.livingCostIncrease === undefined ? <span className="text-muted">Site default</span> : percent(c.livingCostIncrease)}</Cell>
              <Cell>{MONTHS[month]}</Cell>
              <Cell>{universities.some((u) => u.country === code) ? null : <RemoveCountry code={code} name={c.name} />}</Cell>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
