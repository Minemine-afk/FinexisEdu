import Link from "next/link";
import { Suspense } from "react";
import EditScreen from "@/components/editor/EditScreen";
import { PageTitle } from "@/components/editor/ui";
import { loadNames } from "@/lib/editor/names";

export default function EditReasons() {
  return (
    <>
      <Link href="/admin/reasons" className="text-sm text-accent underline">
        Back to reasons
      </Link>
      <PageTitle title="Edit reasons">
        The reason, figure and source for each field of study, and each university&apos;s shortlist places. Each
        university&apos;s &quot;Why it is included&quot; text is on its own edit page.
      </PageTitle>
      <Suspense>
        <EditScreen paths={["data/courses.json", "data/rationale.json"]} names={loadNames()} backHref="/admin/reasons" />
      </Suspense>
    </>
  );
}
