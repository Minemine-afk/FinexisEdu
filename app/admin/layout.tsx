import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FinexisEdu editor",
  robots: { index: false, follow: false },
};

// Editing is for computers with a mouse; phones and tablets get a short note instead.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="hidden lg:pointer-fine:block">{children}</div>
      <div className="safe-x mx-auto max-w-md py-16 text-center lg:pointer-fine:hidden">
        <p className="text-sm font-semibold uppercase tracking-widest text-muted">FinexisEdu editor</p>
        <p className="mt-3 text-lg">Open this on a computer to edit.</p>
        <Link href="/" className="mt-6 inline-block text-accent underline">
          Back to the calculator
        </Link>
      </div>
    </>
  );
}
