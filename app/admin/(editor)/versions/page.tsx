import VersionsScreen from "@/components/editor/VersionsScreen";
import { PageTitle } from "@/components/editor/ui";

export default function Versions() {
  return (
    <>
      <PageTitle title="Versions">Every change approved in the editor, newest first.</PageTitle>
      <VersionsScreen />
    </>
  );
}
