"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { loadForEdit, sendForApproval } from "@/app/admin/editor-actions";
import type { WaitingChange } from "@/lib/editor/changes";
import { diffDocument } from "@/lib/editor/diff";
import { describeLocation, documentKind, editPageFor, validateDocument, type Names } from "@/lib/editor/documents";
import { buttonClass, ChangeRows, NameInput, Notice, secondaryButtonClass, useEditorName } from "./shared";
import { Field } from "./SpecForm";

interface Doc {
  path: string;
  sha: string;
  original: unknown;
  data: unknown;
}

const draftKey = (paths: string[], change: number | undefined) => `finexisedu-draft:${change ?? "live"}:${paths.join(",")}`;

/**
 * Loads the live version of one or more files, shows them as forms, checks
 * them as the editor types, and sends the result for approval. Unsent edits
 * are kept on this computer in case the page is closed.
 */
export default function EditScreen({ paths, names, backHref }: { paths: string[]; names: Names; backHref: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const change = Number(params.get("change")) || undefined;
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [waiting, setWaiting] = useState<WaitingChange[]>([]);
  const [loadError, setLoadError] = useState("");
  const [savedDraft, setSavedDraft] = useState<Record<string, unknown> | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [name, setName] = useEditorName();
  const [summary, setSummary] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sent, setSent] = useState<number | null>(null);
  const key = draftKey(paths, change);

  useEffect(() => {
    let live = true;
    loadForEdit(paths, change).then((r) => {
      if (!live) return;
      if (!r.ok) return setLoadError(r.error);
      setDocs(r.value.documents.map((d) => ({ path: d.path, sha: d.sha, original: d.data, data: structuredClone(d.data) })));
      setWaiting(r.value.waiting);
      try {
        const stored = JSON.parse(localStorage.getItem(key) ?? "null") as { shas: Record<string, string>; data: Record<string, unknown> } | null;
        // Only offer a draft made from the same versions of the files.
        if (stored && r.value.documents.every((d) => stored.shas[d.path] === d.sha)) setSavedDraft(stored.data);
      } catch {}
    });
    return () => {
      live = false;
    };
    // The files to load are fixed for the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const specs = useMemo(() => new Map(paths.map((p) => [p, documentKind(p)!.spec(names)])), [paths, names]);
  const problems = useMemo(() => new Map((docs ?? []).map((d) => [d.path, validateDocument(d.path, d.data)])), [docs]);
  const rows = useMemo(
    () => (docs ?? []).flatMap((d) => diffDocument(specs.get(d.path)!, d.original, d.data).map((r) => ({ ...r, file: d.path }))),
    [docs, specs],
  );
  const problemCount = [...problems.values()].reduce((n, p) => n + p.length, 0);

  // Keep unsent edits on this computer.
  useEffect(() => {
    if (!docs || sent) return;
    try {
      if (rows.length === 0) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify({ shas: Object.fromEntries(docs.map((d) => [d.path, d.sha])), data: Object.fromEntries(docs.map((d) => [d.path, d.data])) }));
    } catch {}
  }, [docs, rows.length, key, sent]);

  // Warn before leaving with unsent edits.
  useEffect(() => {
    if (rows.length === 0 || sent) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [rows.length, sent]);

  const update = (path: string, data: unknown) => setDocs((all) => all!.map((d) => (d.path === path ? { ...d, data } : d)));

  async function send() {
    setSending(true);
    setSendError("");
    const r = await sendForApproval({ author: name, summary, change, documents: docs!.map((d) => ({ path: d.path, sha: d.sha, data: d.data })) });
    setSending(false);
    if (!r.ok) return setSendError(r.error);
    try {
      localStorage.removeItem(key);
    } catch {}
    setSent(r.value);
  }

  if (loadError) return <Notice tone="warn">{loadError}</Notice>;
  if (!docs) return <p className="text-muted">Loading the live version…</p>;

  if (sent) {
    return (
      <Notice tone="good">
        {change ? "The change has been updated" : "Sent for approval"}. Someone else now needs to approve it on the{" "}
        <Link href={`/admin/approvals?change=${sent}`} className="underline">
          Approvals
        </Link>{" "}
        screen; the calculator changes a few minutes after that.{" "}
        <Link href={backHref} className="underline">
          Back
        </Link>
      </Notice>
    );
  }

  return (
    <div className="pb-28">
      {change && (
        <div className="mb-4">
          <Notice>You are editing a change that is waiting for approval; saving updates that change.</Notice>
        </div>
      )}
      {waiting.length > 0 && (
        <div className="mb-4">
          <Notice tone="warn">
            &quot;{waiting[0].title}&quot; by {waiting[0].author || "an editor"} is {waiting[0].sentBack ? "sent back and " : ""}waiting for
            approval on this, so a second change cannot be sent until it is approved, sent back or discarded.{" "}
            <button type="button" className="underline" onClick={() => router.push(editPageFor(paths[0], waiting[0].number)!)}>
              Edit that change instead
            </button>{" "}
            or{" "}
            <Link href={`/admin/approvals?change=${waiting[0].number}`} className="underline">
              look at it
            </Link>
            .
          </Notice>
        </div>
      )}
      {savedDraft && (
        <div className="mb-4">
          <Notice>
            You have unsent edits from earlier.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => {
                setDocs((all) => all!.map((d) => ({ ...d, data: savedDraft[d.path] ?? d.data })));
                setSavedDraft(null);
              }}
            >
              Bring them back
            </button>{" "}
            or{" "}
            <button
              type="button"
              className="underline"
              onClick={() => {
                setSavedDraft(null);
                try {
                  localStorage.removeItem(key);
                } catch {}
              }}
            >
              throw them away
            </button>
            .
          </Notice>
        </div>
      )}

      <div className="space-y-10">
        {docs.map((d) => (
          <section key={`${d.path}:${savedDraft === null}`}>
            {docs.length > 1 && <h2 className="mb-3 text-lg font-semibold">{documentKind(d.path)!.describe(names)}</h2>}
            <Field spec={specs.get(d.path)!} value={d.data} onChange={(v) => update(d.path, v)} path={[]} problems={problems.get(d.path) ?? []} />
          </section>
        ))}
      </div>

      {reviewing && (
        <div className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-backdrop p-10" role="dialog" aria-modal="true">
          <div className="w-full max-w-4xl rounded-xl bg-background p-6 shadow-xl">
            <h2 className="text-xl font-semibold">Check and send for approval</h2>
            <div className="mt-4 max-h-[45vh] overflow-y-auto">
              <ChangeRows rows={rows} />
            </div>
            <div className="mt-5 flex flex-wrap items-end gap-5">
              <NameInput name={name} setName={setName} />
              <label className="block flex-1 text-sm">
                <span className="font-medium">What changed, in a few words</span>
                <input
                  className="mt-1 block w-full rounded-md border border-border bg-surface px-2.5 py-1.5"
                  value={summary}
                  maxLength={200}
                  placeholder="e.g. Update NUS 2027 Computing fees"
                  onChange={(e) => setSummary(e.target.value)}
                />
              </label>
            </div>
            {sendError && (
              <div className="mt-4">
                <Notice tone="warn">{sendError}</Notice>
              </div>
            )}
            <div className="mt-5 flex gap-3">
              <button type="button" className={buttonClass} disabled={sending || name.trim().length < 2 || summary.trim().length < 3} onClick={send}>
                {sending ? "Sending…" : change ? "Update the change" : "Send for approval"}
              </button>
              <button type="button" className={secondaryButtonClass} onClick={() => setReviewing(false)} disabled={sending}>
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-5 px-6 py-3 text-sm">
          <span>
            {rows.length === 0 ? "No changes yet" : `${rows.length} value${rows.length === 1 ? "" : "s"} changed`}
          </span>
          {problemCount > 0 && (
            <details className="relative">
              <summary className="cursor-pointer text-warn-fg">
                {problemCount} problem{problemCount === 1 ? "" : "s"} to fix
              </summary>
              <ul className="absolute bottom-8 left-0 max-h-72 w-[36rem] space-y-1 overflow-y-auto rounded-md border border-border bg-background p-3 shadow-lg">
                {docs.flatMap((d) =>
                  (problems.get(d.path) ?? []).map((p, i) => (
                    <li key={`${d.path}${i}`}>
                      <span className="font-medium">{describeLocation(specs.get(d.path)!, d.data, p.at) || documentKind(d.path)!.describe(names)}</span>: {p.message}
                    </li>
                  )),
                )}
              </ul>
            </details>
          )}
          <span className="flex-1" />
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={rows.length === 0}
            onClick={() => {
              if (confirm("Throw away every edit on this page?")) setDocs((all) => all!.map((d) => ({ ...d, data: structuredClone(d.original) })));
            }}
          >
            Undo my edits
          </button>
          <button type="button" className={buttonClass} disabled={rows.length === 0 || problemCount > 0} onClick={() => setReviewing(true)}>
            Review and send
          </button>
        </div>
      </div>
    </div>
  );
}
