/**
 * Password recovery on top of Supabase Auth's own recovery flow. VSI adds no
 * token or session mechanism of its own: the recovery link Supabase emails
 * (sent by ForgotPasswordModal via resetPasswordForEmail, redirectTo
 * /auth/reset-password) is turned into Supabase's recovery session, and the
 * new password is set with auth.updateUser.
 *
 * The link reaches the page in one of Supabase's standard forms:
 *   ?code=…                          PKCE flow (the browser client's default)
 *   ?token_hash=…&type=recovery      custom email template / verifyOtp
 *   #access_token=…&refresh_token=…  implicit flow
 *   ?error=… / #error=…              Supabase already rejected the link (e.g. otp_expired)
 */
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "@/lib/signup";
import { safeInternalPath } from "@/lib/safe-redirect";

export type RecoveryParams =
  | { kind: "code"; code: string }
  | { kind: "token_hash"; tokenHash: string }
  | { kind: "tokens"; accessToken: string; refreshToken: string }
  | { kind: "error"; code: string }
  | { kind: "none" };

/** Reads the recovery link. `search` is location.search, `hash` is location.hash. */
export function readRecoveryParams(search: string, hash: string): RecoveryParams {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const h = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const error = q.get("error_code") || q.get("error") || h.get("error_code") || h.get("error");
  if (error) return { kind: "error", code: error };
  const code = q.get("code");
  if (code) return { kind: "code", code };
  const tokenHash = q.get("token_hash");
  if (tokenHash && (q.get("type") ?? "recovery") === "recovery") return { kind: "token_hash", tokenHash };
  const accessToken = h.get("access_token");
  const refreshToken = h.get("refresh_token");
  if (accessToken && refreshToken && (h.get("type") ?? "recovery") === "recovery") return { kind: "tokens", accessToken, refreshToken };
  return { kind: "none" };
}

type AuthError = { message: string; code?: string; status?: number } | null;

/** The slice of the Supabase client recovery needs, so it can be tested without a network. */
export interface RecoveryClient {
  auth: {
    exchangeCodeForSession(code: string): Promise<{ data: unknown; error: AuthError }>;
    verifyOtp(args: { type: "recovery"; token_hash: string }): Promise<{ data: { session: unknown | null } | null; error: AuthError }>;
    setSession(args: { access_token: string; refresh_token: string }): Promise<{ data: { session: unknown | null } | null; error: AuthError }>;
    getSession(): Promise<{ data: { session: unknown | null }; error: AuthError }>;
    updateUser(args: { password: string }): Promise<{ data: unknown; error: AuthError }>;
    signOut(args?: { scope?: "global" | "local" | "others" }): Promise<{ error: AuthError }>;
  };
}

export type RecoveryStart = { ok: true } | { ok: false; reason: "invalid_or_expired" | "missing" };

/**
 * Turns the link into Supabase's recovery session. Any failure (expired,
 * already used, tampered, opened in a different browser for PKCE) is the same
 * "invalid_or_expired" answer: the page never says which, and never shows the token.
 */
export async function startRecoverySession(client: RecoveryClient, params: RecoveryParams): Promise<RecoveryStart> {
  try {
    if (params.kind === "error") return { ok: false, reason: "invalid_or_expired" };
    if (params.kind === "code") {
      const { error } = await client.auth.exchangeCodeForSession(params.code);
      return error ? { ok: false, reason: "invalid_or_expired" } : { ok: true };
    }
    if (params.kind === "token_hash") {
      const { data, error } = await client.auth.verifyOtp({ type: "recovery", token_hash: params.tokenHash });
      return error || !data?.session ? { ok: false, reason: "invalid_or_expired" } : { ok: true };
    }
    if (params.kind === "tokens") {
      const { data, error } = await client.auth.setSession({ access_token: params.accessToken, refresh_token: params.refreshToken });
      return error || !data?.session ? { ok: false, reason: "invalid_or_expired" } : { ok: true };
    }
    // No link parameters: the Supabase client may already have picked the session up from the URL.
    const { data } = await client.auth.getSession();
    return data.session ? { ok: true } : { ok: false, reason: "missing" };
  } catch {
    return { ok: false, reason: "invalid_or_expired" };
  }
}

export interface NewPasswordErrors {
  password?: string;
  confirmPassword?: string;
}

/** Same rules as sign-up (src/lib/signup.ts). */
export function validateNewPassword(password: string, confirmPassword: string): NewPasswordErrors {
  const errors: NewPasswordErrors = {};
  if (password.length < MIN_PASSWORD_LENGTH) errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  else if (password.length > MAX_PASSWORD_LENGTH) errors.password = `Password can be at most ${MAX_PASSWORD_LENGTH} characters.`;
  if (!confirmPassword) errors.confirmPassword = "Confirm your new password.";
  else if (confirmPassword !== password) errors.confirmPassword = "Passwords don't match.";
  return errors;
}

export type ResetResult =
  | { ok: true; destination: string }
  | { ok: false; fieldErrors?: NewPasswordErrors; message?: string; sessionExpired?: boolean };

/**
 * Sets the new password in the current recovery session, then signs out every
 * other session so a stolen session can't outlive the reset. The destination
 * is always an internal path (safeInternalPath), never an external target.
 */
export async function completePasswordReset(
  client: RecoveryClient,
  input: { password: string; confirmPassword: string; next?: string | null },
): Promise<ResetResult> {
  const fieldErrors = validateNewPassword(input.password, input.confirmPassword);
  if (fieldErrors.password || fieldErrors.confirmPassword) return { ok: false, fieldErrors };

  const { data } = await client.auth.getSession();
  if (!data.session) return { ok: false, sessionExpired: true, message: "This reset link has expired. Request a new one." };

  const { error } = await client.auth.updateUser({ password: input.password });
  if (error) {
    if (error.code === "same_password") return { ok: false, fieldErrors: { password: "Choose a password you haven't used for this account." } };
    if (error.code === "weak_password") return { ok: false, fieldErrors: { password: "That password is too weak. Choose a longer or less common one." } };
    if (error.status === 401 || error.status === 403 || /session|jwt|expired/i.test(error.message)) {
      return { ok: false, sessionExpired: true, message: "This reset link has expired. Request a new one." };
    }
    return { ok: false, message: "Your password couldn't be changed. Please try again." };
  }

  // Best effort: other sessions end; this one continues as a normal signed-in session.
  await client.auth.signOut({ scope: "others" }).catch(() => undefined);
  return { ok: true, destination: safeInternalPath(input.next ?? null, "/dashboard") };
}
