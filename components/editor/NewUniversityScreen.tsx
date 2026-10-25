"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { addUniversityChange } from "@/app/admin/editor-actions";
import type { Problem } from "@/lib/editor/checks";
import { universityPath, validateDocument } from "@/lib/editor/documents";
import { UNIVERSITY, type FieldSpec } from "@/lib/editor/spec";
import type { University } from "@/lib/schema";
import { buttonClass, NameInput, Notice, useEditorName } from "./shared";
import { Field } from "./SpecForm";

const DRAFT = "finexisedu-draft:new-university";
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

/** A form for a whole new university; sending it adds the file and its "check by hand" scraper entries. */
export default function NewUniversityScreen({ countries }: { countries: { value: string; label: string; currency: string }[] }) {
  const programmes = UNIVERSITY.find((f) => f.key === "programmes") as Extract<FieldSpec, { kind: "list" }>;
  const spec: FieldSpec = useMemo(
    () => ({
      key: "",
      label: "",
      kind: "object",
      fields: [
        { key: "country", label: "Country", kind: "select", options: countries, help: "Add the country first if it is not listed." },
        { key: "id", label: "Short id", kind: "text", help: "Lower-case letters, digits and dashes, used in file names; it cannot be changed later." },
        ...UNIVERSITY,
      ],
    }),
    [countries],
  );
  const [data, setData] = useState<Record<string, unknown>>(() => ({ country: "", id: "", name: "", city: "", programmes: [programmes.blank!()] }));
  const [name, setName] = useEditorName();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<number | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT);
      // Pick up where the editor left off on this computer.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setData(JSON.parse(saved));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      if (!sent) localStorage.setItem(DRAFT, JSON.stringify(data));
    } catch {}
  }, [data, sent]);

  const country = countries.find((c) => c.value === data.country);
  const id = String(data.id ?? "");
  const full = { ...data, currency: country?.currency ?? "" };
  const problems: Problem[] = useMemo(() => {
    const out: Problem[] = [];
    if (!country) out.push({ at: ["country"], message: "Choose a country." });
    if (!ID.test(id)) out.push({ at: ["id"], message: "Use lower-case letters, digits and dashes, e.g. new-university." });
    if (country && ID.test(id)) out.push(...validateDocument(universityPath(country.value, id), full));
    if (!Array.isArray(data.programmes) || data.programmes.length === 0) out.push({ at: ["programmes"], message: "Add at least one programme." });
    return out;
    // `full` is derived from these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, country, id]);

  async function send() {
    setSending(true);
    setError("");
    const r = await addUniversityChange(name, full as unknown as University);
    setSending(false);
    if (!r.ok) return setError(r.error);
    try {
      localStorage.removeItem(DRAFT);
    } catch {}
    setSent(r.value);
  }

  if (sent) {
    return (
      <Notice tone="good">
        Sent for approval. Once someone else approves it on the{" "}
        <Link href={`/admin/approvals?change=${sent}`} className="underline">
          Approvals
        </Link>{" "}
        screen, the university appears in the calculator a few minutes later, and its fee pages are listed for checking by hand.
      </Notice>
    );
  }

  return (
    <div className="pb-28">
      <Field
        spec={spec}
        value={data}
        onChange={(v) => {
          const next = v as Record<string, unknown>;
          // Suggest an id from the name until one is typed.
          if (next.name !== data.name && (!data.id || data.id === slug(String(data.name ?? "")))) next.id = slug(String(next.name ?? ""));
          setData(next);
        }}
        path={[]}
        problems={problems}
      />
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-end gap-5 px-6 py-3 text-sm">
          <NameInput name={name} setName={setName} />
          <span className={`pb-2 ${problems.length ? "text-warn-fg" : "text-good-fg"}`}>
            {problems.length ? `${problems.length} problem${problems.length === 1 ? "" : "s"} to fix (marked in the form)` : "Ready to send"}
          </span>
          {error && <span className="pb-2 text-warn-fg">{error}</span>}
          <span className="flex-1" />
          <button type="button" className={buttonClass} disabled={sending || problems.length > 0 || name.trim().length < 2} onClick={send}>
            {sending ? "Sending…" : "Send for approval"}
          </button>
        </div>
      </div>
    </div>
  );
}
