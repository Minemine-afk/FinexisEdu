import Link from "next/link";
import { editingConfigured } from "@/lib/editor/session";
import SignInForm from "./SignInForm";

// Read the environment on each visit, so setting the password needs no rebuild.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="safe-x mx-auto max-w-sm py-20">
      <p className="text-sm font-semibold uppercase tracking-widest text-muted">FinexisEdu</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Editor sign-in</h1>
      {editingConfigured() ? (
        <SignInForm />
      ) : (
        <p className="mt-6 text-muted">Editing has not been switched on yet: the editor password still needs to be set.</p>
      )}
      <Link href="/" className="mt-8 inline-block text-sm text-accent underline">
        Back to the calculator
      </Link>
    </main>
  );
}
