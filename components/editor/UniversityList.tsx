"use client";

import Link from "next/link";
import { useState } from "react";
import { Cell, Table } from "./ui";

interface Row {
  id: string;
  name: string;
  city: string;
  programmes: number;
  hasLiving: boolean;
}

export default function UniversityList({ groups }: { groups: { code: string; name: string; universities: Row[] }[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = groups
    .map((g) => ({
      ...g,
      universities: g.universities.filter(
        (u) => !q || `${u.name} ${u.city} ${u.id} ${g.name}`.toLowerCase().includes(q),
      ),
    }))
    .filter((g) => g.universities.length > 0);

  return (
    <>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by university, city or country"
        className="mb-6 w-full max-w-md rounded-md border border-border bg-surface px-3 py-2"
      />
      {shown.length === 0 && <p className="text-muted">No university matches that search.</p>}
      {shown.map((g) => (
        <section key={g.code} className="mb-8">
          <h2 className="mb-2 text-lg font-semibold">
            {g.name} <span className="text-sm font-normal text-muted">({g.universities.length})</span>
          </h2>
          <Table head={["University", "City", "Programmes", "Living costs"]}>
            {g.universities.map((u) => (
              <tr key={u.id}>
                <Cell>
                  <Link href={`/admin/universities/${g.code}/${u.id}`} className="text-accent underline">
                    {u.name}
                  </Link>
                </Cell>
                <Cell>{u.city}</Cell>
                <Cell>{u.programmes}</Cell>
                <Cell>{u.hasLiving ? "Yes" : <span className="text-muted">None</span>}</Cell>
              </tr>
            ))}
          </Table>
        </section>
      ))}
    </>
  );
}
