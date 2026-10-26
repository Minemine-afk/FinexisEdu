import Link from "next/link";
import { NewCountryForm } from "@/components/editor/StructureActions";
import { PageTitle } from "@/components/editor/ui";
import { SETTINGS } from "@/lib/settings";

export default function NewCountry() {
  return (
    <>
      <Link href="/admin/countries" className="text-sm text-accent underline">
        Back to countries
      </Link>
      <PageTitle title="Add a country">
        The country goes at the end of the calculator&apos;s country order (change it in Site settings). It shows in the
        calculator once it has a university.
      </PageTitle>
      <NewCountryForm defaultIntakeMonth={SETTINGS.defaultIntakeMonth} />
    </>
  );
}
