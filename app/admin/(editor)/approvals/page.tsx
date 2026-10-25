import { Suspense } from "react";
import ApprovalsScreen from "@/components/editor/ApprovalsScreen";
import { PageTitle } from "@/components/editor/ui";
import { loadNames } from "@/lib/editor/names";

export default function Approvals() {
  return (
    <>
      <PageTitle title="Approvals">
        Changes waiting to go live. Check what each one changes and open its preview; the person approving must not be the
        person who sent it.
      </PageTitle>
      <Suspense>
        <ApprovalsScreen names={loadNames()} />
      </Suspense>
    </>
  );
}
