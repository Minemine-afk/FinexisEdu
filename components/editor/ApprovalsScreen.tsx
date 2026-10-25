"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { approve, discard, fetchChange, fetchChanges, sendBack } from "@/app/admin/editor-actions";
import type { ChangeDetail, ChangeSummary } from "@/lib/editor/changes";
import { diffDocument } from "@/lib/editor/diff";
import { documentKind, editPageFor, type Names } from "@/lib/editor/documents";
import { buttonClass, ChangeRows, NameInput, Notice, secondaryButtonClass, useEditorName } from "./shared";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

function CheckState({ change }: { change: ChangeDetail }) {
  const c = change.checks;
  if (c.state === "passed") return <span className="text-good-fg">Checks passed</span>;
  if (c.state === "failed") return <span className="text-warn-fg">Checks failed: {c.failed.join(", ")}</span>;
  return <span className="text-muted">Checks running…</span>;
}

function FileChanges({ file, names }: { file: ChangeDetail["files"][number]; names: Names }) {
  const kind = documentKind(file.path);
  if (!kind) {
    const label = file.path.startsWith("scrapers/") ? "Pages the monthly fee check looks at" : file.path;
    const verb = file.before === undefined ? "Adds" : file.after === undefined ? "Removes" : "Updates";
    return (
      <details className="text-sm">
        <summary className="cursor-pointer">
          {verb} {label} <span className="text-muted">({file.path})</span>
        </summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-sidebar p-3 text-xs">{String(file.after ?? file.before ?? "")}</pre>
      </details>
    );
  }
  const named = (file.after ?? file.before) as { name?: unknown } | undefined;
  const title = typeof named?.name === "string" ? named.name : kind.describe(names);
  if (file.after === undefined) return <h3 className="font-medium">Removes {title}</h3>;
  return (
    <div>
      <h3 className="mb-2 font-medium">{file.before === undefined ? `Adds ${title}` : title}</h3>
      <ChangeRows rows={diffDocument(kind.spec(names), file.before ?? {}, file.after)} />
    </div>
  );
}

function Detail({ number, names, onDone }: { number: number; names: Names; onDone: (message: string) => void }) {
  const [change, setChange] = useState<ChangeDetail | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useEditorName();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetchChange(number);
    if (r.ok) setChange(r.value);
    else setError(r.error);
  }, [number]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChange(null);
    setError("");
    load();
  }, [load]);

  // Checks and the preview take a few minutes; look again while they run.
  useEffect(() => {
    if (!change || (change.checks.state !== "running" && change.checks.state !== "none" && change.preview)) return;
    const t = setTimeout(load, 20_000);
    return () => clearTimeout(t);
  }, [change, load]);

  async function act(work: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setBusy(true);
    setError("");
    const r = await work();
    setBusy(false);
    if (!r.ok) setError(r.error ?? "That did not work.");
    else onDone(done);
  }

  if (error && !change) return <Notice tone="warn">{error}</Notice>;
  if (!change) return <p className="text-muted">Loading the change…</p>;

  const own = change.author !== "" && name.trim().toLowerCase() === change.author.trim().toLowerCase();
  const editPages = [...new Set(change.files.map((f) => editPageFor(f.path, change.number)).filter(Boolean))];
  const ready = change.checks.state === "passed" && !change.sentBack && change.mergeable !== false;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">{change.title}</h2>
        <p className="mt-1 text-sm text-muted">
          Sent by {change.author || "an editor"} · last updated {when(change.updatedAt)}
          {change.undoOf ? ` · undoes change #${change.undoOf}` : ""}
        </p>
        <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <CheckState change={change} />
          {change.preview ? (
            <a href={change.preview} target="_blank" rel="noreferrer" className="text-accent underline">
              Open the preview of the calculator with this change
            </a>
          ) : (
            <span className="text-muted">Preview being built…</span>
          )}
          {change.mergeable === false && <span className="text-warn-fg">Clashes with a change approved since</span>}
        </p>
      </div>

      {change.notes.length > 0 && (
        <ul className="space-y-1 text-sm">
          {change.notes.map((n, i) => (
            <li key={i} className={n.kind === "sent back" ? "text-warn-fg" : "text-muted"}>
              {when(n.at)}: {n.kind} by {n.by}
              {n.text ? `: ${n.text}` : ""}
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-5">
        {change.files.map((f) => (
          <FileChanges key={f.path} file={f} names={names} />
        ))}
      </div>

      <div className="space-y-4 rounded-lg border border-border p-4">
        <NameInput name={name} setName={setName} />
        {own && <p className="text-sm text-warn-fg">You sent this change, so someone else has to approve it.</p>}
        {change.sentBack && <p className="text-sm text-warn-fg">Sent back: it needs updating before it can be approved.</p>}
        {error && <Notice tone="warn">{error}</Notice>}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className={buttonClass}
            disabled={busy || own || !ready || name.trim().length < 2}
            onClick={() => act(() => approve(change.number, name), `Approved "${change.title}". The calculator updates in a few minutes.`)}
          >
            Approve and publish
          </button>
          {editPages.length === 1 && (
            <Link href={editPages[0]!} className={secondaryButtonClass}>
              Edit this change
            </Link>
          )}
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={busy || name.trim().length < 2}
            onClick={() => {
              if (confirm("Discard this change? It will not be published.")) act(() => discard(change.number, name), `Discarded "${change.title}".`);
            }}
          >
            Discard
          </button>
        </div>
        {!change.sentBack && (
          <div className="flex items-end gap-3">
            <label className="block flex-1 text-sm">
              <span className="font-medium">Send back with a note</span>
              <input
                className="mt-1 block w-full rounded-md border border-border bg-surface px-2.5 py-1.5"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What needs changing"
              />
            </label>
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={busy || name.trim().length < 2 || note.trim().length < 3}
              onClick={() => act(() => sendBack(change.number, name, note), `Sent "${change.title}" back.`)}
            >
              Send back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ApprovalsScreen({ names }: { names: Names }) {
  const params = useSearchParams();
  const router = useRouter();
  const selected = Number(params.get("change")) || undefined;
  const [list, setList] = useState<{ changes: ChangeSummary[]; others: { number: number; title: string; url: string }[] } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const r = await fetchChanges();
    if (r.ok) setList(r.value);
    else setError(r.error);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (error) return <Notice tone="warn">{error}</Notice>;
  if (!list) return <p className="text-muted">Loading changes…</p>;

  return (
    <div className="grid grid-cols-[18rem_1fr] gap-8">
      <aside>
        {list.changes.length === 0 ? (
          <p className="text-sm text-muted">Nothing is waiting for approval.</p>
        ) : (
          <ul className="space-y-1">
            {list.changes.map((c) => (
              <li key={c.number}>
                <Link
                  href={`/admin/approvals?change=${c.number}`}
                  className={`block rounded-md px-3 py-2 text-sm ${selected === c.number ? "bg-chip" : "hover:bg-sidebar"}`}
                >
                  <span className="block font-medium">{c.title}</span>
                  <span className="text-xs text-muted">
                    {c.author || "an editor"} · {when(c.updatedAt)}
                    {c.sentBack ? " · sent back" : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {list.others.length > 0 && (
          <div className="mt-6 text-sm">
            <p className="text-muted">Other changes on GitHub (such as the monthly fee check):</p>
            <ul className="mt-1 space-y-1">
              {list.others.map((o) => (
                <li key={o.number}>
                  <a href={o.url} target="_blank" rel="noreferrer" className="text-accent underline">
                    {o.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
      <section>
        {message && (
          <div className="mb-4">
            <Notice tone="good">{message}</Notice>
          </div>
        )}
        {selected ? (
          <Detail
            key={selected}
            number={selected}
            names={names}
            onDone={(m) => {
              setMessage(m);
              router.push("/admin/approvals");
              load();
            }}
          />
        ) : (
          !message && list.changes.length > 0 && <p className="text-muted">Choose a change to see what it does.</p>
        )}
      </section>
    </div>
  );
}
