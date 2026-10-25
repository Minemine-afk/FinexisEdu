import Link from "next/link";
import NewUniversityScreen from "@/components/editor/NewUniversityScreen";
import { PageTitle } from "@/components/editor/ui";
import { loadCountries } from "@/lib/data";

export default function NewUniversity() {
  const countries = loadCountries()
    .map((c) => ({ value: c.code, label: c.name, currency: c.currency }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return (
    <>
      <Link href="/admin" className="text-sm text-accent underline">
        All universities
      </Link>
      <PageTitle title="Add a university">
        Fill in the university and at least one programme. Its fee pages are added to the monthly check as pages to check by
        hand. Nothing reaches the calculator until someone else approves it.
      </PageTitle>
      <NewUniversityScreen countries={countries} />
    </>
  );
}
