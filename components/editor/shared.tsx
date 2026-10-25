"use client";

import { useEffect, useState } from "react";
import type { ChangeRow } from "@/lib/editor/diff";

const NAME_KEY = "finexisedu-editor-name";

/** The editor's name, remembered on this computer; changes and approvals are signed with it. */
export function useEditorName(): [string, (name: string) => void] {
  const [name, setName] = useState("");
  useEffect(() => {
    try {
      // Read once after mounting, so the server render and first client render agree.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(localStorage.getItem(NAME_KEY) ?? "");
    } catch {}
  }, []);
  return [
    name,
    (next: string) => {
      setName(next);
      try {
        localStorage.setItem(NAME_KEY, next);
      } catch {}
    },
  ];
}

export function NameInput({ name, setName, label = "Your name" }: { name: string; setName: (n: string) => void; label?: string }) {
  return (
    <label className="block text-sm">
      <span className="font-medium">{label}</span>
      <input
        className="mt-1 block w-64 rounded-md border border-border bg-surface px-2.5 py-1.5"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="name"
      />
    </label>
  );
}

export function ChangeRows({ rows }: { rows: ChangeRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted">No values differ.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-sidebar text-muted">
          <tr>
            <th className="w-1/3 px-3 py-2 font-medium">What</th>
            <th className="px-3 py-2 font-medium">Before</th>
            <th className="px-3 py-2 font-medium">After</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="px-3 py-2 align-top">{r.path.join(" › ")}</td>
              <td className="px-3 py-2 align-top text-muted">
                {r.before === "" ? <em>empty</em> : <span className="whitespace-pre-wrap line-through decoration-1">{r.before}</span>}
              </td>
              <td className="px-3 py-2 align-top">{r.after === "" ? <em className="text-muted">empty</em> : <span className="whitespace-pre-wrap">{r.after}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "good"; children: React.ReactNode }) {
  const colours = { info: "bg-sidebar text-foreground", warn: "bg-warn-bg text-warn-fg", good: "bg-good-bg text-good-fg" }[tone];
  return <div className={`rounded-md px-4 py-3 text-sm ${colours}`}>{children}</div>;
}

export const buttonClass = "rounded-md bg-accent-fill px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-50";
export const secondaryButtonClass = "rounded-md border border-border px-4 py-2 text-sm font-medium text-accent hover:bg-sidebar disabled:opacity-50";
