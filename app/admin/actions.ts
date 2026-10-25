"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword, createSessionToken, SESSION_COOKIE, SESSION_HOURS } from "@/lib/editor/session";

export async function signIn(_previous: string | null, form: FormData): Promise<string | null> {
  const attempt = String(form.get("password") ?? "");
  if (!checkPassword(attempt)) {
    // Slows down anyone trying passwords one after another.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return "That password is not right.";
  }
  (await cookies()).set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
  redirect("/admin");
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}
