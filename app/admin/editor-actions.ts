"use server";

import { cookies } from "next/headers";
import {
  approveChange,
  discardChange,
  EditorError,
  getChange,
  listChanges,
  listVersions,
  loadDocuments,
  sendBackChange,
  sendChange,
  undoLastChange,
  waitingChangesFor,
  type SendInput,
} from "@/lib/editor/changes";
import { GitHubError, savingConfigured } from "@/lib/editor/github";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/editor/session";

/** Every editor action answers with a result rather than throwing, so the message reaches the screen. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

async function run<T>(work: () => Promise<T>): Promise<Result<T>> {
  // The proxy already guards /admin; this check keeps actions safe on their own.
  if (!verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value)) {
    return { ok: false, error: "You have been signed out. Sign in again (copy anything you typed first)." };
  }
  if (!savingConfigured()) return { ok: false, error: "Saving is not switched on yet: the GitHub token still needs to be added." };
  try {
    return { ok: true, value: await work() };
  } catch (e) {
    if (e instanceof EditorError) return { ok: false, error: e.message };
    console.error(e);
    if (e instanceof GitHubError && (e.status === 401 || e.status === 403)) {
      return { ok: false, error: "GitHub refused the request. The token may have expired or lack access; it needs replacing." };
    }
    return { ok: false, error: "Something went wrong talking to GitHub. Nothing was changed; try again." };
  }
}

export async function loadForEdit(paths: string[], change?: number) {
  return run(async () => ({
    documents: await loadDocuments(paths, change),
    waiting: change ? [] : await waitingChangesFor(paths),
  }));
}

export async function sendForApproval(input: SendInput) {
  return run(() => sendChange(input));
}

export async function fetchChanges() {
  return run(listChanges);
}

export async function fetchChange(n: number) {
  return run(() => getChange(n));
}

export async function approve(n: number, approver: string) {
  return run(() => approveChange(n, approver));
}

export async function sendBack(n: number, by: string, note: string) {
  return run(() => sendBackChange(n, by, note));
}

export async function discard(n: number, by: string) {
  return run(() => discardChange(n, by));
}

export async function fetchVersions() {
  return run(listVersions);
}

export async function undoLast(by: string) {
  return run(() => undoLastChange(by));
}
