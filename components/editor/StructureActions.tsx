"use client";

import Link from "next/link";
import { useState } from "react";
import { addCountryChange, removeCountryChange, removeUniversityChange } from "@/app/admin/editor-actions";
import { MONTHS } from "@/lib/editor/spec";
import { buttonClass, NameInput, Notice, secondaryButtonClass, useEditorName } from "./shared";

function Sent({ change }: { change: number }) {
  return (
    <Notice tone="good">
      Sent for approval.{" "}
      <Link href={`/admin/approvals?change=${change}`} className="underline">
        Open it on the Approvals screen
      </Link>
    </Notice>
  );
}

/** "Remove this university": asks for a name, then sends the removal for approval. */
export function RemoveUniversity({ country, id, name: universityName }: { country: string; id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useEditorName();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<number | null>(null);
  if (sent) return <Sent change={sent} />;
  if (!open) {
    return (
      <button type="button" className={secondaryButtonClass} onClick={() => setOpen(true)}>
        Remove this university
      </button>
    );
  }
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <p className="text-sm">
        Removing {universityName} takes it out of the calculator, its shortlist place and the monthly fee check, once it is
        approved. It can be brought back with &quot;Undo the last change&quot; while nothing newer has been approved.
      </p>
      <div className="flex items-end gap-3">
        <NameInput name={name} setName={setName} />
        <button
          type="button"
          className={buttonClass}
          disabled={busy || name.trim().length < 2}
          onClick={async () => {
            setBusy(true);
            setError("");
            const r = await removeUniversityChange(name, country, id);
            setBusy(false);
            if (r.ok) setSent(r.value);
            else setError(r.error);
          }}
        >
          {busy ? "Sending…" : "Send the removal for approval"}
        </button>
        <button type="button" className={secondaryButtonClass} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {error && <Notice tone="warn">{error}</Notice>}
    </div>
  );
}

/** "Remove" beside a country with no universities. */
export function RemoveCountry({ code, name: countryName }: { code: string; name: string }) {
  const [name] = useEditorName();
  const [state, setState] = useState<{ busy?: boolean; error?: string; sent?: number }>({});
  if (state.sent) return <Sent change={state.sent} />;
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        className="text-sm text-accent underline disabled:opacity-50"
        disabled={state.busy}
        onClick={async () => {
          const by = name.trim().length >= 2 ? name : (prompt("Your name") ?? "");
          if (!by || !confirm(`Send a change removing ${countryName}?`)) return;
          setState({ busy: true });
          const r = await removeCountryChange(by, code);
          setState(r.ok ? { sent: r.value } : { error: r.error });
        }}
      >
        Remove
      </button>
      {state.error && <span className="text-sm text-warn-fg">{state.error}</span>}
    </span>
  );
}

const input = "mt-1 block w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm";

/** The form for a new country: its file, its place at the end of the country order and, if needed, an exchange rate. */
export function NewCountryForm({ defaultIntakeMonth }: { defaultIntakeMonth: number }) {
  const [form, setForm] = useState({ code: "", name: "", currency: "", fee: "3", living: "", month: String(defaultIntakeMonth) });
  const [name, setName] = useEditorName();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<number | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  if (sent) return <Sent change={sent} />;

  const ready =
    /^[a-z]{2}$/i.test(form.code) && form.name.trim() && /^[a-z]{3}$/i.test(form.currency) && form.fee !== "" && name.trim().length >= 2;
  return (
    <div className="max-w-2xl space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <label className="text-sm font-medium">
          Two-letter code
          <input className={input} value={form.code} maxLength={2} onChange={set("code")} placeholder="e.g. hk" />
        </label>
        <label className="text-sm font-medium">
          Name
          <input className={input} value={form.name} onChange={set("name")} placeholder="e.g. Hong Kong" />
        </label>
        <label className="text-sm font-medium">
          Currency code
          <input className={input} value={form.currency} maxLength={3} onChange={set("currency")} placeholder="e.g. HKD" />
          <span className="text-xs font-normal text-muted">It must be one the European Central Bank publishes a rate for.</span>
        </label>
        <label className="text-sm font-medium">
          Usual intake month
          <select className={input} value={form.month} onChange={set("month")}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Typical yearly fee increase (%)
          <input className={input} type="number" step="any" value={form.fee} onChange={set("fee")} />
        </label>
        <label className="text-sm font-medium">
          Yearly living-cost increase (%), optional
          <input className={input} type="number" step="any" value={form.living} onChange={set("living")} placeholder="Site default" />
        </label>
      </div>
      <NameInput name={name} setName={setName} />
      {error && <Notice tone="warn">{error}</Notice>}
      <button
        type="button"
        className={buttonClass}
        disabled={busy || !ready}
        onClick={async () => {
          setBusy(true);
          setError("");
          const r = await addCountryChange(name, {
            code: form.code,
            name: form.name.trim(),
            currency: form.currency,
            defaultFeeIncrease: +(Number(form.fee) / 100).toFixed(8),
            ...(form.living === "" ? {} : { livingCostIncrease: +(Number(form.living) / 100).toFixed(8) }),
            intakeMonth: Number(form.month),
          });
          setBusy(false);
          if (r.ok) setSent(r.value);
          else setError(r.error);
        }}
      >
        {busy ? "Sending…" : "Send for approval"}
      </button>
      <p className="text-sm text-muted">After it is approved, add the country&apos;s universities from the Universities screen.</p>
    </div>
  );
}
