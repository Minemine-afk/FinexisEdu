import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import EditScreen from "@/components/editor/EditScreen";
import { PageTitle } from "@/components/editor/ui";
import { loadCountries } from "@/lib/data";
import { countryPath } from "@/lib/editor/documents";
import { loadNames } from "@/lib/editor/names";

export const dynamicParams = false;

export function generateStaticParams() {
  return loadCountries().map((c) => ({ code: c.code }));
}

export default async function EditCountry({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const c = loadCountries().find((x) => x.code === code);
  if (!c) notFound();
  return (
    <>
      <Link href="/admin/countries" className="text-sm text-accent underline">
        Back to countries
      </Link>
      <PageTitle title={`Edit ${c.name}`}>Nothing reaches the calculator until someone else approves it.</PageTitle>
      <Suspense>
        <EditScreen paths={[countryPath(code)]} names={loadNames()} backHref="/admin/countries" />
      </Suspense>
    </>
  );
}
