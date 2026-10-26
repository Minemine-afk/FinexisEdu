"use client";

import { useSearchParams } from "next/navigation";
import { documentKind, type Names } from "@/lib/editor/documents";
import EditScreen from "./EditScreen";
import { Notice } from "./shared";

/** Where to go back to after editing a file. */
function viewPageFor(path: string): string {
  const u = /^data\/universities\/([a-z]{2})\/([a-z0-9-]+)\.json$/.exec(path);
  if (u) return `/admin/universities/${u[1]}/${u[2]}`;
  if (path.startsWith("data/countries/")) return "/admin/countries";
  if (path === "data/settings.json") return "/admin/settings";
  return "/admin/reasons";
}

/** The edit page for whichever files the address names (?file=…&file=…). */
export default function EditPage({ names }: { names: Names }) {
  const params = useSearchParams();
  const files = params.getAll("file");
  if (files.length === 0 || files.some((f) => !documentKind(f))) return <Notice tone="warn">This page cannot be edited here.</Notice>;
  const title = files.map((f) => documentKind(f)!.describe(names)).join(" and ");
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Edit {title}</h1>
        <p className="mt-1 max-w-3xl text-muted">
          Changes are checked as you type. Nothing reaches the calculator until it is approved on the Approvals screen.
        </p>
      </div>
      <EditScreen key={params.toString()} paths={files} names={names} backHref={viewPageFor(files[0])} />
    </>
  );
}
