import { describe, expect, it, vi } from "vitest";
import { completePasswordReset, readRecoveryParams, startRecoverySession, validateNewPassword, type RecoveryClient } from "./password-reset";

function client(over: Partial<{ session: boolean; exchange: unknown; verify: unknown; set: unknown; update: unknown }> = {}) {
  const auth = {
    exchangeCodeForSession: vi.fn(async () => ({ data: {}, error: (over.exchange as never) ?? null })),
    verifyOtp: vi.fn(async () => (over.verify === undefined ? { data: { session: {} }, error: null } : { data: { session: null }, error: over.verify as never })),
    setSession: vi.fn(async () => (over.set === undefined ? { data: { session: {} }, error: null } : { data: { session: null }, error: over.set as never })),
    getSession: vi.fn(async () => ({ data: { session: over.session === false ? null : {} }, error: null })),
    updateUser: vi.fn(async () => ({ data: {}, error: (over.update as never) ?? null })),
    signOut: vi.fn(async () => ({ error: null })),
  };
  return { auth } as unknown as RecoveryClient & { auth: typeof auth };
}

describe("readRecoveryParams", () => {
  it("reads each Supabase recovery link form", () => {
    expect(readRecoveryParams("?code=abc", "")).toEqual({ kind: "code", code: "abc" });
    expect(readRecoveryParams("?token_hash=th&type=recovery", "")).toEqual({ kind: "token_hash", tokenHash: "th" });
    expect(readRecoveryParams("", "#access_token=at&refresh_token=rt&type=recovery")).toEqual({ kind: "tokens", accessToken: "at", refreshToken: "rt" });
    expect(readRecoveryParams("", "")).toEqual({ kind: "none" });
  });
  it("treats Supabase's own link errors (expired / used) as errors", () => {
    expect(readRecoveryParams("?error=access_denied&error_code=otp_expired", "")).toEqual({ kind: "error", code: "otp_expired" });
    expect(readRecoveryParams("", "#error=access_denied&error_code=otp_expired")).toEqual({ kind: "error", code: "otp_expired" });
  });
  it("ignores token_hash links of another type (e.g. signup)", () => {
    expect(readRecoveryParams("?token_hash=th&type=signup", "")).toEqual({ kind: "none" });
  });
});

describe("startRecoverySession — valid and invalid/expired recovery", () => {
  it("valid PKCE code → recovery session", async () => {
    const c = client();
    expect(await startRecoverySession(c, { kind: "code", code: "abc" })).toEqual({ ok: true });
    expect(c.auth.exchangeCodeForSession).toHaveBeenCalledWith("abc");
  });
  it("valid token_hash → verifyOtp(recovery)", async () => {
    const c = client();
    expect(await startRecoverySession(c, { kind: "token_hash", tokenHash: "th" })).toEqual({ ok: true });
    expect(c.auth.verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "th" });
  });
  it("expired, already-used or tampered link → invalid_or_expired (one answer for all)", async () => {
    const used = { message: "Email link is invalid or has expired", code: "otp_expired", status: 403 };
    expect(await startRecoverySession(client({ exchange: used }), { kind: "code", code: "x" })).toEqual({ ok: false, reason: "invalid_or_expired" });
    expect(await startRecoverySession(client({ verify: used }), { kind: "token_hash", tokenHash: "x" })).toEqual({ ok: false, reason: "invalid_or_expired" });
    expect(await startRecoverySession(client({ set: used }), { kind: "tokens", accessToken: "a", refreshToken: "r" })).toEqual({ ok: false, reason: "invalid_or_expired" });
    expect(await startRecoverySession(client(), { kind: "error", code: "otp_expired" })).toEqual({ ok: false, reason: "invalid_or_expired" });
  });
  it("no link and no session → missing", async () => {
    expect(await startRecoverySession(client({ session: false }), { kind: "none" })).toEqual({ ok: false, reason: "missing" });
  });
});

describe("completePasswordReset", () => {
  it("password mismatch → field error, no call to Supabase", async () => {
    const c = client();
    const res = await completePasswordReset(c, { password: "long-enough-1", confirmPassword: "different-1" });
    expect(res).toMatchObject({ ok: false, fieldErrors: { confirmPassword: "Passwords don't match." } });
    expect(c.auth.updateUser).not.toHaveBeenCalled();
  });
  it("password validation (same rules as sign-up)", () => {
    expect(validateNewPassword("short", "short").password).toMatch(/at least 8/);
    expect(validateNewPassword("x".repeat(73), "x".repeat(73)).password).toMatch(/at most 72/);
    expect(validateNewPassword("long-enough-1", "")).toEqual({ confirmPassword: "Confirm your new password." });
  });
  it("success → updateUser, other sessions signed out, safe internal destination", async () => {
    const c = client();
    const res = await completePasswordReset(c, { password: "long-enough-1", confirmPassword: "long-enough-1", next: "/dashboard/tasks" });
    expect(res).toEqual({ ok: true, destination: "/dashboard/tasks" });
    expect(c.auth.updateUser).toHaveBeenCalledWith({ password: "long-enough-1" });
    expect(c.auth.signOut).toHaveBeenCalledWith({ scope: "others" });
  });
  it.each(["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "%2F%2Fevil.com"])("unsafe next=%s → /dashboard", async (next) => {
    const res = await completePasswordReset(client(), { password: "long-enough-1", confirmPassword: "long-enough-1", next });
    expect(res).toEqual({ ok: true, destination: "/dashboard" });
  });
  it("recovery session gone (expired) → sessionExpired, no update", async () => {
    const c = client({ session: false });
    const res = await completePasswordReset(c, { password: "long-enough-1", confirmPassword: "long-enough-1" });
    expect(res).toMatchObject({ ok: false, sessionExpired: true });
    expect(c.auth.updateUser).not.toHaveBeenCalled();
  });
  it("Supabase rejections map to clear, safe messages", async () => {
    expect(await completePasswordReset(client({ update: { message: "x", code: "same_password", status: 422 } }), { password: "long-enough-1", confirmPassword: "long-enough-1" })).toMatchObject({ ok: false, fieldErrors: { password: expect.any(String) } });
    expect(await completePasswordReset(client({ update: { message: "JWT expired", status: 401 } }), { password: "long-enough-1", confirmPassword: "long-enough-1" })).toMatchObject({ ok: false, sessionExpired: true });
    const other = await completePasswordReset(client({ update: { message: "internal db detail", status: 500 } }), { password: "long-enough-1", confirmPassword: "long-enough-1" });
    expect(other).toEqual({ ok: false, message: "Your password couldn't be changed. Please try again." });
  });
});
