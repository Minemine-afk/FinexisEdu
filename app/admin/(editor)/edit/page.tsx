import { Suspense } from "react";
import EditPage from "@/components/editor/EditPage";
import { loadNames } from "@/lib/editor/names";

export default function Edit() {
  return (
    <Suspense>
      <EditPage names={loadNames()} />
    </Suspense>
  );
}
