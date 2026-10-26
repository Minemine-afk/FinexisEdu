import { Suspense } from "react";
import ApprovalsScreen from "@/components/editor/ApprovalsScreen";
import { PageTitle } from "@/components/editor/ui";
import { loadNames } from "@/lib/editor/names";

export default function Approvals() {
  return (
    <>
      <PageTitle title="Approvals">
        Changes waiting to go live. Everything one person edits in a sign-in is gathered into one change, so one approval
        covers it all. Check what it changes and open its preview before approving.
      </PageTitle>
      <Suspense>
        <ApprovalsScreen names={loadNames()} />
      </Suspense>
    </>
  );
}
