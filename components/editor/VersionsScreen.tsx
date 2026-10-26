"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchVersions, undoLast } from "@/app/admin/editor-actions";
import type { Version } from "@/lib/editor/changes";
import { buttonClass, NameInput, Notice, useEditorName } from "./shared";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

export default function VersionsScreen() {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useEditorName();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<number | null>(null);

  useEffect(() => {
    fetchVersions().then((r) => (r.ok ? setVersions(r.value) : setError(r.error)));
  }, []);

  if (error && !versions) return <Notice tone="warn">{error}</Notice>;
  if (!versions) return <p className="text-muted">Loading…</p>;
  const latest = versions[0];

  return (
    <div className="space-y-6">
      {latest ? (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm">
            The last approved change was <strong>{latest.title}</strong>, sent by {latest.author || "an editor"} and approved on{" "}
            {when(latest.mergedAt)}. Undoing it sends a change that puts those files back as they were, which someone else then
            approves like any other. The restored data can be edited again afterwards.
          </p>
          {sent ? (
            <Notice tone="good">
              The undo is waiting for approval.{" "}
              <Link href={`/admin/approvals?change=${sent}`} className="underline">
                Open it
              </Link>
            </Notice>
          ) : (
            <div className="flex items-end gap-4">
              <NameInput name={name} setName={setName} />
              <button
                type="button"
                className={buttonClass}
                disabled={busy || name.trim().length < 2}
                onClick={async () => {
                  if (!confirm(`Send a change that undoes "${latest.title}"?`)) return;
                  setBusy(true);
                  setError("");
                  const r = await undoLast(name);
                  setBusy(false);
                  if (r.ok) setSent(r.value);
                  else setError(r.error);
                }}
              >
                {busy ? "Preparing…" : "Undo the last change"}
              </button>
            </div>
          )}
          {error && <Notice tone="warn">{error}</Notice>}
        </div>
      ) : (
        <p className="text-muted">No editor changes have been approved yet.</p>
      )}

      {versions.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead className="text-muted">
            <tr>
              <th className="py-2 font-medium">Approved</th>
              <th className="py-2 font-medium">Change</th>
              <th className="py-2 font-medium">Sent by</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {versions.map((v) => (
              <tr key={v.number}>
                <td className="py-2 pr-4 whitespace-nowrap">{when(v.mergedAt)}</td>
                <td className="py-2 pr-4">
                  {v.title}
                  {v.undoOf ? <span className="text-muted"> (undo)</span> : null}
                </td>
                <td className="py-2">{v.author}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
