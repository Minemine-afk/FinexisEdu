import Calculator from "@/components/Calculator";
import CourseRationale from "@/components/CourseRationale";
import UniversityRationale from "@/components/UniversityRationale";
import { forSite, loadCountries, loadCourses, loadRationale, loadUniversities } from "@/lib/data";
import { getFxRates } from "@/lib/fx";

// Re-render daily so exchange rates stay fresh; fee data changes on redeploy.
export const revalidate = 86400;

export default async function Home() {
  const universities = forSite(loadUniversities());
  const countries = loadCountries();
  const rationale = loadRationale();
  const courses = loadCourses();
  const fx = await getFxRates();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <header className="bg-accent-strong text-on-accent">
        <div className="safe-x mx-auto max-w-6xl pt-[calc(env(safe-area-inset-top)+2.5rem)] pb-10 sm:pt-[calc(env(safe-area-inset-top)+3.5rem)] sm:pb-14">
          <p className="text-sm font-semibold uppercase tracking-widest text-on-accent-muted">FinexisEdu</p>
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
            The fees are retrieved from each university&apos;s published fee pages and are refreshed by an automated
            monthly check. The information you see on this page may contain inaccuracies, omissions or outdated
            information. Please verify the latest fees directly with the relevant university. Future education costs
            are illustrative estimates based on the indicated inflation rates and assumptions. Actual costs may vary.
          </p>
          <p className="mt-2">
            This calculator is for general planning purposes only and does not constitute financial advice. Please
            consult your Financial Consultant before making any financial decisions.
          </p>
          <p className="mt-2">
            Exchange rates{fx.source === "live" ? ": European Central Bank via Frankfurter," : ""} as of {fx.date}.
          </p>
        </div>
      </footer>
    </>
  );
}
