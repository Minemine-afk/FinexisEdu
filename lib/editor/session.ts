import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Editor sign-in: one shared password (the EDITOR_PASSWORD environment
 * variable) and a signed, expiring cookie. The signing key is derived from the
 * password, so changing the password signs everyone out. The public calculator
 * never reads any of this.
 */
export const SESSION_COOKIE = "finexisedu_editor";
export const SESSION_HOURS = 12;

const VERSION = "v1";

function password(): string | undefined {
  const value = process.env.EDITOR_PASSWORD;
  // A very short password would be easy to guess; treat it as not set up.
  return value && value.length >= 8 ? value : undefined;
}

export function editingConfigured(): boolean {
  return password() !== undefined;
}

function sha256(text: string): Buffer {
  return createHash("sha256").update(text).digest();
}

function sign(payload: string, secret: string): string {
  const key = sha256(`finexisedu-editor-session:${secret}`);
  return createHmac("sha256", key).update(payload).digest("base64url");
}

function sameText(a: string, b: string): boolean {
  // Hashing first gives equal lengths, so the comparison takes the same time whatever was typed.
  return timingSafeEqual(sha256(a), sha256(b));
}

export function checkPassword(attempt: string): boolean {
  const secret = password();
  return secret !== undefined && sameText(attempt, secret);
}

/** A cookie value that stays valid until `now + SESSION_HOURS`. */
export function createSessionToken(now = Date.now()): string {
  const secret = password();
  if (!secret) throw new Error("EDITOR_PASSWORD is not set");
  const payload = `${VERSION}.${now + SESSION_HOURS * 3600_000}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionToken(token: string | undefined, now = Date.now()): boolean {
  const secret = password();
  if (!secret || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return false;
  const expires = Number(parts[1]);
  if (!Number.isFinite(expires) || expires <= now) return false;
  return sameText(parts[2], sign(`${parts[0]}.${parts[1]}`, secret));
}
