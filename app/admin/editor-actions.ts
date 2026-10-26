"use server";

import { cookies } from "next/headers";
import {
  approveChange,
  discardChange,
  EditorError,
  getChange,
  listChanges,
  listVersions,
  openForEditing,
  sendBackChange,
  sendChange,
  undoLastChange,
  type SendInput,
} from "@/lib/editor/changes";
import { GitHubError, savingConfigured } from "@/lib/editor/github";
import { SESSION_COOKIE, sessionIdOf } from "@/lib/editor/session";
import { addCountry, addUniversity, removeCountry, removeUniversity, type NewCountry } from "@/lib/editor/structure";
import type { University } from "@/lib/schema";

/** Every editor action answers with a result rather than throwing, so the message reaches the screen. */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const PERMISSION_NAMES: Record<string, string> = {
  contents: "Contents",
  pull_requests: "Pull requests",
  issues: "Issues",
  actions: "Actions",
  checks: "Checks",
  statuses: "Commit statuses",
  deployments: "Deployments",
  metadata: "Metadata",
};

/** "checks=read; pull_requests=read" -> "Checks (read) or Pull requests (read)". */
function permissionNames(header: string): string {
  return header
    .split(";")
    .map((alt) =>
      alt
        .split(",")
        .map((p) => p.trim().split("="))
        .filter(([name]) => name)
        .map(([name, level]) => `${PERMISSION_NAMES[name] ?? name} (${level === "write" ? "read and write" : "read"})`)
        .join(" and "),
    )
    .filter(Boolean)
    .join(" or ");
}

async function run<T>(work: (session: string) => Promise<T>): Promise<Result<T>> {
  // The proxy already guards /admin; this check keeps actions safe on their own.
  const session = sessionIdOf((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return { ok: false, error: "You have been signed out. Sign in again (copy anything you typed first)." };
  }
  if (!savingConfigured()) return { ok: false, error: "Saving is not switched on yet: the GitHub token still needs to be added." };
  try {
    return { ok: true, value: await work(session) };
  } catch (e) {
    if (e instanceof EditorError) return { ok: false, error: e.message };
    console.error(e);
    if (e instanceof GitHubError && e.status === 401) {
      return { ok: false, error: "GitHub refused the request: the token has expired or is wrong, so it needs replacing." };
    }
    if (e instanceof GitHubError && e.status === 403) {
      const missing = permissionNames(e.needs);
      return {
        ok: false,
        error: missing
          ? `GitHub refused the request: the token needs ${missing}. Edit the token on GitHub to add it, then try again.`
          : "GitHub refused the request. The token may lack a permission; see the editor setup steps in the README.",
      };
    }
    return { ok: false, error: "Something went wrong talking to GitHub. Nothing was changed; try again." };
  }
}

export async function loadForEdit(paths: string[], change?: number) {
  return run((session) => openForEditing(paths, change, session));
}

export async function sendForApproval(input: SendInput) {
  return run((session) => sendChange({ ...input, session }));
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

export async function addUniversityChange(by: string, data: University) {
  return run((session) => addUniversity(by, data, session));
}

export async function removeUniversityChange(by: string, country: string, id: string) {
  return run((session) => removeUniversity(by, country, id, session));
}

export async function addCountryChange(by: string, input: NewCountry) {
  return run((session) => addCountry(by, input, session));
}

export async function removeCountryChange(by: string, code: string) {
  return run((session) => removeCountry(by, code, session));
}
