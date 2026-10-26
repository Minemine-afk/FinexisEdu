import Link from "next/link";
import { signOut } from "../actions";

const SCREENS = [
  { href: "/admin", label: "Universities" },
  { href: "/admin/countries", label: "Countries" },
  { href: "/admin/reasons", label: "Reasons" },
  { href: "/admin/settings", label: "Site settings" },
];

export default function EditorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="bg-accent-strong text-on-accent">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <div className="flex items-center gap-8">
            <p className="font-semibold">FinexisEdu editor</p>
            <nav className="flex gap-5 text-sm">
              {SCREENS.map((s) => (
                <Link key={s.href} href={s.href} className="text-on-accent-muted hover:text-on-accent">
                  {s.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-5 text-sm">
            <Link href="/" className="text-on-accent-muted hover:text-on-accent">
              View the calculator
            </Link>
            <form action={signOut}>
              <button type="submit" className="text-on-accent-muted hover:text-on-accent">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="border-b border-border bg-sidebar">
        <p className="mx-auto max-w-6xl px-6 py-2 text-sm text-muted">
          View only for now: these screens show what is live on the calculator. Editing comes in the next update.
        </p>
      </div>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
