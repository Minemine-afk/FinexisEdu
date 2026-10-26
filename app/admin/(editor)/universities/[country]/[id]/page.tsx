import { editPageFor } from "@/lib/editor/documents";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RemoveUniversity } from "@/components/editor/StructureActions";
import { Cell, ExternalLink, Facts, money, PageTitle, percent, Section, Table } from "@/components/editor/ui";
import { loadCountries, loadRationale, loadUniversities } from "@/lib/data";
import { TIERS, type FeeTier, type LaterYearFee, type Programme } from "@/lib/schema";

export const dynamicParams = false;

export function generateStaticParams() {
  return loadUniversities().map((u) => ({ country: u.country, id: u.id }));
}

const TIER_LABEL = { citizen: "Citizen", pr: "PR", international: "International" } as const;

function FeeRows({ fees }: { fees: Programme["fees"] }) {
  return (
    <Table head={["Tier", "Yearly tuition", "Yearly compulsory fees", "One-off fees"]}>
      {TIERS.filter((t) => fees[t]).map((t) => {
        const f = fees[t] as FeeTier;
        return (
          <tr key={t}>
            <Cell>{TIER_LABEL[t]}</Cell>
            <Cell>{money(f.annualTuition)}</Cell>
            <Cell>{money(f.annualCompulsoryFees)}</Cell>
            <Cell>{money(f.oneOffFees)}</Cell>
          </tr>
        );
      })}
    </Table>
  );
}

function LaterYears({ rows }: { rows: LaterYearFee[] }) {
  return (
    <Table head={["From year of study", "Tier", "Yearly tuition", "Yearly compulsory fees", "Worked out from a total"]}>
      {rows.map((l, i) => (
        <tr key={i}>
          <Cell>{l.fromYear}</Cell>
          <Cell>{l.tier ? TIER_LABEL[l.tier] : "All"}</Cell>
          <Cell>{money(l.annualTuition)}</Cell>
          <Cell>{money(l.annualCompulsoryFees)}</Cell>
          <Cell>{l.estimate ? "Yes" : "No"}</Cell>
        </tr>
      ))}
    </Table>
  );
}

function ProgrammeCard({ p, partnerName }: { p: Programme; partnerName?: string }) {
  return (
    <details className="rounded-lg border border-border bg-surface">
      <summary className="cursor-pointer px-4 py-3">
        <span className="font-medium">{p.name}</span>
        <span className="ml-2 text-sm text-muted">
          {p.level === "bachelor" ? "Bachelor's" : "Master's"} · {p.field} · {p.durationYears} years · {p.feeYear} fees ·
          international {money(p.fees.international.annualTuition)} a year
        </span>
      </summary>
      <div className="space-y-4 border-t border-border p-4">
        <Facts
          rows={[
            ["Awarded by", partnerName],
            ["Level", p.level === "bachelor" ? "Bachelor's" : "Master's"],
            ["Field", p.field],
            ["Majors", p.majors?.join(", ")],
            ["Length (years)", p.durationYears],
            ["Fee year", p.feeYear],
            ["Fee source", <ExternalLink key="s" href={p.sourceUrl} />],
            ["Source type", p.sourceType === "secondary" ? "Unofficial source" : "University's own page"],
            ["Last checked", p.lastVerified],
            ["Fee fixed for the whole course", p.cohortLocked ? "Yes" : "No"],
            ["Open to international students", p.internationalEligible ? "Yes" : "No"],
            [
              "Singapore recognition",
              p.sgRecognition &&
                `${p.sgRecognition.body}: ${p.sgRecognition.listed ? "listed" : "not listed"}${p.sgRecognition.note ? ` (${p.sgRecognition.note})` : ""}`,
            ],
            ["Summary (shown to visitors)", p.summary],
            ["How this fee was worked out (shown to visitors)", p.feeChoice],
            ["Fee basis (maintainers only)", p.feeBasis],
            ["Notes (maintainers only)", p.notes && <span className="whitespace-pre-wrap">{p.notes}</span>],
          ]}
        />
        <div>
          <h4 className="mb-2 text-sm font-semibold">Fees ({p.feeYear})</h4>
          <FeeRows fees={p.fees} />
        </div>
        {p.laterYears.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-semibold">Different fees in later years of study</h4>
            <LaterYears rows={p.laterYears} />
          </div>
        )}
        <div>
          <h4 className="mb-2 text-sm font-semibold">Fee history</h4>
          {p.feeHistory.length === 0 ? (
            <p className="text-sm text-muted">No earlier years recorded.</p>
          ) : (
            <Table head={["Year", "Tier", "Yearly tuition", "Yearly compulsory fees", "One-off fees", "Source"]}>
              {[...p.feeHistory]
                .sort((a, b) => b.feeYear - a.feeYear || a.tier.localeCompare(b.tier))
                .map((h) => (
                  <tr key={`${h.feeYear}-${h.tier}`}>
                    <Cell>{h.feeYear}</Cell>
                    <Cell>{TIER_LABEL[h.tier]}</Cell>
                    <Cell>{money(h.annualTuition)}</Cell>
                    <Cell>{money(h.annualCompulsoryFees)}</Cell>
                    <Cell>{money(h.oneOffFees)}</Cell>
                    <Cell>
                      {h.sourceType === "secondary" && <span className="mr-1 text-muted">(unofficial)</span>}
                      <ExternalLink href={h.sourceUrl} />
                    </Cell>
                  </tr>
                ))}
            </Table>
          )}
        </div>
      </div>
    </details>
  );
}

export default async function UniversityScreen({ params }: { params: Promise<{ country: string; id: string }> }) {
  const { country, id } = await params;
  const u = loadUniversities().find((x) => x.country === country && x.id === id);
  if (!u) notFound();
  const countryName = loadCountries().find((c) => c.code === u.country)?.name ?? u.country;
  const rationale = loadRationale()[`${u.country}/${u.id}`];
  const partners = new Map((u.partners ?? []).map((p) => [p.id, p.name]));
  const living = u.livingCosts;
  const programmes = [...u.programmes].sort(
    (a, b) => a.level.localeCompare(b.level) || a.field.localeCompare(b.field) || a.name.localeCompare(b.name),
  );

  return (
    <>
      <Link href="/admin" className="text-sm text-accent underline">
        All universities
      </Link>
      <PageTitle title={u.name} edit={editPageFor(`data/universities/${u.country}/${u.id}.json`)}>
        {u.city}, {countryName}. Fees are in {u.currency}.
      </PageTitle>

      <Facts
        rows={[
          ["File name", `${u.country}/${u.id}.json`],
          ["City", u.city],
          ["Currency", u.currency],
          ["Website", <ExternalLink key="w" href={u.website} />],
          ["Description (shown on hover)", u.description],
          ["Why it is included", u.whyIncluded],
          ["How it prices degrees (maintainers only)", u.feeMethod],
          [
            "Yearly fee increase set by hand",
            u.feeIncrease && `${percent(u.feeIncrease.rate)}: ${u.feeIncrease.reason}`,
          ],
          [
            "Shortlist place",
            rationale?.ranks
              .map((r) => `${r.level === "bachelor" ? "Bachelor's" : "Master's"} #${r.rank}`)
              .join(", "),
          ],
          ["Shortlist source", <ExternalLink key="r" href={rationale?.source} />],
        ]}
      />

      <Section title="Living costs">
        {living ? (
          <Facts
            rows={[
              ["Year of the estimate", living.year],
              ["Months a year", living.months],
              ["Housing a month", money(living.monthly.housing)],
              ["Food a month", money(living.monthly.food)],
              ["Transport a month", money(living.monthly.transport)],
              ["Personal a month", money(living.monthly.personal)],
              ["Source", <ExternalLink key="l" href={living.sourceUrl} />],
              ["Source type", living.sourceType === "secondary" ? "Unofficial source" : "University's own page"],
              ["Last checked", living.lastVerified],
              ["Summary (shown to visitors)", living.summary],
              ["Notes (maintainers only)", living.notes],
            ]}
          />
        ) : (
          <p className="text-sm text-muted">No living-cost estimate.</p>
        )}
      </Section>

      {u.partners && u.partners.length > 0 && (
        <Section title="Partner universities">
          <Table head={["Partner", "Country", "Website", "How it prices degrees"]}>
            {u.partners.map((p) => (
              <tr key={p.id}>
                <Cell>{p.name}</Cell>
                <Cell>{p.country}</Cell>
                <Cell>
                  <ExternalLink href={p.website} />
                </Cell>
                <Cell>{p.feeMethod}</Cell>
              </tr>
            ))}
          </Table>
        </Section>
      )}

      <Section title={`Programmes (${programmes.length})`}>
        <div className="space-y-2">
          {programmes.map((p, i) => (
            <ProgrammeCard key={i} p={p} partnerName={p.partner ? partners.get(p.partner) : undefined} />
          ))}
        </div>
      </Section>

      <div className="mt-10">
        <RemoveUniversity country={u.country} id={u.id} name={u.name} />
      </div>
    </>
  );
}
