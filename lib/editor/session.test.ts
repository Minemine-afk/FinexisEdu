import { afterEach, describe, expect, it, vi } from "vitest";
import { checkPassword, createSessionToken, editingConfigured, SESSION_HOURS, sessionIdOf, sessionKey, verifySessionToken } from "./session";

describe("editor session", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off until a password of at least 8 characters is set", () => {
    vi.stubEnv("EDITOR_PASSWORD", "");
    expect(editingConfigured()).toBe(false);
    expect(checkPassword("")).toBe(false);
    vi.stubEnv("EDITOR_PASSWORD", "short");
    expect(editingConfigured()).toBe(false);
    expect(checkPassword("short")).toBe(false);
  });

  it("accepts only the shared password", () => {
    vi.stubEnv("EDITOR_PASSWORD", "correct horse");
    expect(checkPassword("correct horse")).toBe(true);
    expect(checkPassword("correct hors")).toBe(false);
    expect(checkPassword("")).toBe(false);
  });

  it("issues cookies that expire and break when tampered with or the password changes", () => {
    vi.stubEnv("EDITOR_PASSWORD", "correct horse");
    const now = Date.UTC(2026, 9, 25);
    const token = createSessionToken(now);
    expect(verifySessionToken(token, now + 1000)).toBe(true);
    expect(verifySessionToken(token, now + SESSION_HOURS * 3600_000 + 1)).toBe(false);
    const [v, exp, id, sig] = token.split(".");
    expect(verifySessionToken(`${v}.${Number(exp) + 3600_000}.${id}.${sig}`, now)).toBe(false);
    expect(verifySessionToken(`${v}.${exp}.someone-else.${sig}`, now)).toBe(false);
    expect(verifySessionToken(undefined, now)).toBe(false);
    expect(verifySessionToken("rubbish", now)).toBe(false);
    vi.stubEnv("EDITOR_PASSWORD", "a new password");
    expect(verifySessionToken(token, now + 1000)).toBe(false);
  });

  it("gives each sign-in its own session id, kept out of public text by hashing", () => {
    vi.stubEnv("EDITOR_PASSWORD", "correct horse");
    const a = createSessionToken();
    const b = createSessionToken();
    expect(sessionIdOf(a)).toBeTruthy();
    expect(sessionIdOf(a)).not.toBe(sessionIdOf(b));
    expect(sessionIdOf("rubbish")).toBeUndefined();
    expect(sessionKey(sessionIdOf(a)!)).toMatch(/^[0-9a-f]{16}$/);
    expect(sessionKey(sessionIdOf(a)!)).not.toContain(sessionIdOf(a)!);
  });
});
