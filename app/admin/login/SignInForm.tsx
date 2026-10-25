"use client";

import { useActionState } from "react";
import { signIn } from "../actions";

export default function SignInForm() {
  const [error, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="mt-6 space-y-4">
      <label className="block text-sm font-medium">
        Password
        <input
          type="password"
          name="password"
          required
          autoFocus
          autoComplete="current-password"
          className="mt-1 block w-full rounded-md border border-border bg-surface px-3 py-2 text-base"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-warn-fg">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent-fill px-4 py-2 font-medium text-on-accent disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
