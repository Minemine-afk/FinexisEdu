import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import EditScreen from "@/components/editor/EditScreen";
import { PageTitle } from "@/components/editor/ui";
import { loadUniversities } from "@/lib/data";
import { universityPath } from "@/lib/editor/documents";
import { loadNames } from "@/lib/editor/names";

export const dynamicParams = false;

export function generateStaticParams() {
  return loadUniversities().map((u) => ({ country: u.country, id: u.id }));
}

export default async function EditUniversity({ params }: { params: Promise<{ country: string; id: string }> }) {
  const { country, id } = await params;
  const u = loadUniversities().find((x) => x.country === country && x.id === id);
  if (!u) notFound();
  const back = `/admin/universities/${country}/${id}`;
  return (
    <>
      <Link href={back} className="text-sm text-accent underline">
        Back to {u.name}
      </Link>
      <PageTitle title={`Edit ${u.name}`}>
        Changes are checked as you type. Nothing reaches the calculator until someone else approves it.
      </PageTitle>
      <Suspense>
        <EditScreen paths={[universityPath(country, id)]} names={loadNames()} backHref={back} />
      </Suspense>
    </>
  );
}
