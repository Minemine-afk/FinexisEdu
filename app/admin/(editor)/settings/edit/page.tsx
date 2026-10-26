import Link from "next/link";
import { Suspense } from "react";
import EditScreen from "@/components/editor/EditScreen";
import { PageTitle } from "@/components/editor/ui";
import { loadNames } from "@/lib/editor/names";

export default function EditSettings() {
  return (
    <>
      <Link href="/admin/settings" className="text-sm text-accent underline">
        Back to site settings
      </Link>
      <PageTitle title="Edit site settings">
        These change the sums for every university, so check the preview carefully before approving.
      </PageTitle>
      <Suspense>
        <EditScreen paths={["data/settings.json"]} names={loadNames()} backHref="/admin/settings" />
      </Suspense>
    </>
  );
}
