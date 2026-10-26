import Calculator from "@/components/Calculator";
import CourseRationale from "@/components/CourseRationale";
import UniversityRationale from "@/components/UniversityRationale";
import { forSite, loadCountries, loadCourses, loadRationale, loadUniversities } from "@/lib/data";
import { fxCurrencies, getFxRates } from "@/lib/fx";
import { Settings, SETTINGS } from "@/lib/settings";
import { singaporeToday } from "@/lib/today";

// Re-render daily so exchange rates stay fresh; fee data changes on redeploy.
export const revalidate = 86400;

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
            {/* The editor link: desktop-only, and kept faint so visitors do not notice it. */}
            <a
              href="/admin"
              aria-label="Editor login"
              className="hidden rounded px-1.5 py-1 text-on-accent-muted opacity-30 transition-opacity hover:opacity-100 focus-visible:opacity-100 lg:pointer-fine:inline-block"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true">
                <rect x="1" y="1" width="2" height="12" rx="1" />
                <rect x="6" y="1" width="2" height="12" rx="1" />
                <rect x="11" y="1" width="2" height="12" rx="1" />
              </svg>
            </a>
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
            Exchange rates{fx.source === "live" ? ": European Central Bank via Frankfurter," : ""} as of {fx.date}.
          </p>
        </div>
      </footer>
    </>
  );
}
