import Calculator from "@/components/Calculator";
import CourseRationale from "@/components/CourseRationale";
import EditorLink from "@/components/EditorLink";
import UniversityRationale from "@/components/UniversityRationale";
import { forSite, loadCountries, loadCourses, loadRationale, loadUniversities } from "@/lib/data";
import { fxCurrencies, getFxRates, monthEnd } from "@/lib/fx";
import { Settings, SETTINGS } from "@/lib/settings";
import { singaporeToday } from "@/lib/today";

// Re-render at most hourly, on the next visit, so exchange rates stay fresh; fee data changes on redeploy.
// .github/workflows/refresh-rates.yml visits daily after the ECB publishes, so a quiet day still gets new rates.
export const revalidate = 3600;

export default async function Home() {
  // A bad value in data/settings.json fails the build, so visitors keep the last good version.
  Settings.parse(SETTINGS);
  const universities = forSite(loadUniversities());
  const countries = loadCountries();
  const rationale = loadRationale();
  const courses = loadCourses();
  const fx = await getFxRates(fxCurrencies(countries));
  // The browser works out its own date again; this is only the first guess.
  const today = singaporeToday();

  return (
    <>
      <header className="bg-accent-strong text-on-accent">
        <div className="safe-x mx-auto max-w-6xl pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-10 sm:pt-[calc(env(safe-area-inset-top)+3.5rem)] sm:pb-14">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-sm font-semibold uppercase tracking-widest text-on-accent-muted">FinexisEdu</p>
            <EditorLink />
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">University fee calculator</h1>
          <p className="mt-3 max-w-2xl text-on-accent-muted">
            Total tuition and compulsory university fees, in Singapore dollars, for a Bachelor&apos;s or Master&apos;s
            degree in Singapore and abroad, with the option to add living costs for studying overseas.
          </p>
        </div>
      </header>

      <main className="safe-x mx-auto max-w-6xl py-8 sm:py-10">
        <Calculator universities={universities} countries={countries} fx={fx} today={today} />
      </main>

      <CourseRationale courses={courses} />
      <UniversityRationale universities={universities} countries={countries} rationale={rationale} />

      <footer className="safe-x mx-auto max-w-6xl pb-[calc(env(safe-area-inset-bottom)+6rem)] text-sm text-muted lg:pb-10">
        {/* The rule sits inside the side padding, so it is exactly as wide as the content above it. */}
        <div className="border-t-2 border-accent pt-6">
          <p>
            The fees are retrieved from each university&apos;s published fee pages and are based on 2026 figures.
            The information you see on this page may contain inaccuracies, omissions or outdated information. Please
            verify the latest fees directly with the relevant university. Future education costs are illustrative
            estimates based on the indicated inflation rates and assumptions. Actual costs may vary.
          </p>
          <p className="mt-2">
            This calculator is for general planning purposes only and does not constitute financial advice. Please
            consult your Financial Consultant before making any financial decisions.
          </p>
          <p className="mt-2">
            The information in this publication or any dissemination of information in any form is not intended to be
            and does not constitute financial advice, insurance advice or any other advice or recommendation of any sort
            offered or endorsed by finexis advisory Pte Ltd (“finexis”). The information is not to be relied on as
            investment, legal, tax or other advice as it does not take into account the investment objectives, financial
            situation or particular needs of any specific investor. The information provided and / or this advertisement
            has not been reviewed by the Monetary Authority of Singapore.
          </p>
          <p className="mt-2">
            Exchange rates: European Central Bank, as of {fx.date}
            {fx.monthEnd &&
              `; International Monetary Fund month-end rates for ${Object.entries(fx.monthEnd)
                .map(([c, m]) => `${c} (as of ${monthEnd(m)})`)
                .join(", ")}`}
            {fx.sources &&
              Object.entries(fx.sources)
                .map(([c, s]) => `; ${s.name} for ${c} (as of ${s.date})`)
                .join("")}
            .
          </p>
        </div>
      </footer>
    </>
  );
}
