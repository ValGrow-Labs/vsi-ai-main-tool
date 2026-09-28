/**
 * Open-redirect guard for every "where do I go next?" value that comes from a URL
 * (?redirect= on /login, ?next= on /auth/callback, ...).
 *
 * safeInternalPath() returns the input only when it is a plain same-origin path inside one of the
 * app's own sections; anything else returns the fallback. It never returns an absolute URL.
 *
 * Rules (all must hold):
 *  - after decoding (repeatedly, bounded) it starts with exactly one "/" (not "//", not "/\");
 *  - no backslash, control character or whitespace anywhere, raw or decoded (browsers strip tabs and
 *    newlines from URLs and treat "\" like "/", so "/\t/evil.com" or "/\evil.com" would otherwise
 *    become "//evil.com");
 *  - no scheme (javascript:, data:, http:, ...), and malformed percent-encoding is rejected;
 *  - resolved against a sentinel origin it stays on that origin;
 *  - its path is under an allowlisted app section (see ALLOWED_PREFIXES).
 *
 * Allowlist decision: only the signed-in destinations the middleware ever sends to /login
 * (/dashboard, /onboarding, /admin) plus the public report viewer (/r/...). /login itself, /api/*,
 * /auth/* and /qa are deliberately excluded: bouncing back to the login page is a loop, and an API
 * or auth endpoint reached by a GET after sign-in could trigger an action the user did not intend.
 */
export const DEFAULT_AFTER_LOGIN = "/dashboard";

const ALLOWED_PREFIXES = ["/dashboard", "/onboarding", "/admin", "/r/"];

const SENTINEL_ORIGIN = "http://internal.invalid";
const MAX_DECODE_ROUNDS = 5;
const MAX_LENGTH = 2048;

// Control characters (C0, DEL, C1), any whitespace, and backslashes.
const FORBIDDEN_CHARS = /[\u0000-\u001f\u007f-\u009f\s\\]/;

function isAllowedPrefix(pathname: string): boolean {
  return ALLOWED_PREFIXES.some((p) =>
    p.endsWith("/") ? pathname.startsWith(p) && pathname.length > p.length : pathname === p || pathname.startsWith(p + "/"),
  );
}

/** Decode until stable. Returns null on malformed encoding or when it keeps changing. */
function fullyDecode(value: string): string | null {
  let current = value;
  for (let i = 0; i < MAX_DECODE_ROUNDS; i++) {
    let next: string;
    try {
      next = decodeURIComponent(current);
    } catch {
      return null;
    }
    if (next === current) return current;
    current = next;
  }
  return null;
}

function looksUnsafe(s: string): boolean {
  if (FORBIDDEN_CHARS.test(s)) return true;
  // Must start with exactly one "/": this also rules out every scheme (javascript:, data:, http:...).
  return !s.startsWith("/") || s.startsWith("//");
}

export function safeInternalPath(input: string | null | undefined, fallback: string = DEFAULT_AFTER_LOGIN): string {
  if (typeof input !== "string" || input.length === 0 || input.length > MAX_LENGTH) return fallback;
  const raw = input;
  if (FORBIDDEN_CHARS.test(raw)) return fallback;
  // The path part is what a browser could turn into another host, so it is checked decoded too.
  // The query and fragment may legitimately carry encoded spaces and are only checked raw.
  const rawPath = raw.split(/[?#]/, 1)[0];
  const decodedPath = fullyDecode(rawPath);
  if (decodedPath === null) return fallback;
  if (looksUnsafe(rawPath) || looksUnsafe(decodedPath)) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(raw, SENTINEL_ORIGIN);
  } catch {
    return fallback;
  }
  if (parsed.origin !== SENTINEL_ORIGIN) return fallback;
  if (!isAllowedPrefix(parsed.pathname)) return fallback;

  // Rebuild from the parsed parts so what we hand back is exactly what the browser will follow.
  const result = parsed.pathname + parsed.search + parsed.hash;
  if (result.startsWith("//") || FORBIDDEN_CHARS.test(result)) return fallback;
  return result;
}

/**
 * Where the login page sends the browser once the user is signed in: the page's own explicit
 * target (e.g. "/onboarding" after sign-up), else the ?redirect= the middleware added, else the
 * dashboard. Both candidates go through safeInternalPath().
 */
export function postLoginPath(explicitTarget: string | null | undefined, search: string): string {
  if (explicitTarget) return safeInternalPath(explicitTarget);
  return safeInternalPath(new URLSearchParams(search).get("redirect"));
}
