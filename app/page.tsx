import Calculator from "@/components/Calculator";
import { loadCountries, loadUniversities } from "@/lib/data";
import { getFxRates } from "@/lib/fx";

// Re-render daily so exchange rates stay fresh; fee data changes on redeploy.
export const revalidate = 86400;

export default async function Home() {
  const universities = loadUniversities();
  const countries = loadCountries();
  const fx = await getFxRates();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <header className="bg-accent-strong text-on-accent">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
          <p className="text-sm font-semibold uppercase tracking-widest text-on-accent-muted">FinexisEdu</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">University fee calculator</h1>
          <p className="mt-3 max-w-2xl text-on-accent-muted">
            Total tuition and compulsory university fees, in Singapore dollars, for a Bachelor&apos;s or Master&apos;s
            degree in Singapore and abroad, with the option to add living costs for studying overseas.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
        <Calculator universities={universities} countries={countries} fx={fx} today={today} />
      </main>

      <footer className="mx-auto max-w-6xl border-t-2 border-accent px-4 pt-6 pb-10 text-sm text-muted">
        <p>
          Fees come from each university&apos;s published fee pages and are refreshed by an automated monthly check.
          Future years are projections. Always confirm with the university before making decisions.
        </p>
        <p className="mt-2">
          Exchange rates: {fx.source === "live" ? "European Central Bank via Frankfurter" : "stored fallback rates"}, as
          of {fx.date}.
        </p>
      </footer>
    </>
  );
}
