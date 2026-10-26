import Link from "next/link";

/** Small building blocks shared by the editor screens. */

export function money(value: number | undefined): string {
  return value === undefined ? "" : value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

export function percent(rate: number | undefined): string {
  return rate === undefined ? "" : `${(rate * 100).toLocaleString("en-GB", { maximumFractionDigits: 2 })}%`;
}

export function PageTitle({ title, edit, children }: { title: string; edit?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {children && <p className="mt-1 max-w-3xl text-muted">{children}</p>}
      </div>
      {edit && (
        <Link href={edit} className="shrink-0 rounded-md bg-accent-fill px-4 py-2 text-sm font-medium text-on-accent">
          Edit
        </Link>
      )}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Label and value rows; empty values show a dash so gaps are easy to spot. */
export function Facts({ rows }: { rows: [label: string, value: React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[14rem_1fr] gap-x-6 gap-y-2 rounded-lg border border-border bg-surface p-4 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="break-words">{value === undefined || value === "" ? <span className="text-muted">-</span> : value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-sidebar text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

export function Cell({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 align-top ${className}`}>{children}</td>;
}

export function ExternalLink({ href }: { href: string | undefined | null }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="break-all text-accent underline">
      {href}
    </a>
  );
}
