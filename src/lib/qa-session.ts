import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * QA tester sessions for the /qa checklist.
 *
 * Product decision: /qa is an internal testing aid for named pilot testers, not a customer feature.
 * It is therefore OFF unless the deployment opts in with VSI_QA_ENABLED=true (default off, in every
 * environment including production). When off, /qa and /api/qa/* answer 404.
 *
 * When on, the tester cookie is a signed token, never a bare tester id:
 *     v1.<testerId>.<expiresAtEpochSeconds>.<base64url HMAC-SHA256(secret, "v1.<testerId>.<exp>")>
 * The secret comes from QA_COOKIE_SECRET (at least 32 characters). Without it QA fails closed: it
 * is treated as disabled (404) and an error is logged.
 *
 * Tester codes are short, so sign-in is attempt-limited (see qaLoginLimiter). A QA session can only
 * ever write that tester's own qa_checks rows through the qa_save_check RPC; it grants nothing else.
 */

export const QA_COOKIE = "vsi_qa_tester";
export const QA_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const TOKEN_VERSION = "v1";
const MIN_SECRET_LENGTH = 32;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function qaSecret(): string | null {
  const s = process.env.QA_COOKIE_SECRET;
  return s && s.length >= MIN_SECRET_LENGTH ? s : null;
}

/** True only when QA is switched on AND can sign its cookies. */
export function qaEnabled(): boolean {
  if (process.env.VSI_QA_ENABLED !== "true") return false;
  if (!qaSecret()) {
    console.error("[qa] VSI_QA_ENABLED is set but QA_COOKIE_SECRET is missing or shorter than 32 characters; QA stays off.");
    return false;
  }
  return true;
}

/** The response every QA endpoint gives when QA is off: indistinguishable from a missing route. */
export function qaNotFound(): Response {
  return new Response("Not Found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signQaToken(testerId: string, nowMs: number = Date.now()): string {
  const secret = qaSecret();
  if (!secret) throw new Error("QA_COOKIE_SECRET is not configured");
  if (!UUID_RE.test(testerId)) throw new Error("Invalid tester id");
  const exp = Math.floor(nowMs / 1000) + QA_SESSION_TTL_SECONDS;
  const payload = `${TOKEN_VERSION}.${testerId.toLowerCase()}.${exp}`;
  return `${payload}.${sign(payload, secret)}`;
}

/** The tester id carried by a valid, unexpired, correctly signed token; otherwise null. */
export function verifyQaToken(token: string | null | undefined, nowMs: number = Date.now()): string | null {
  const secret = qaSecret();
  if (!secret || typeof token !== "string" || token.length > 256) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [version, testerId, expRaw, mac] = parts;
  if (version !== TOKEN_VERSION || !UUID_RE.test(testerId) || !/^\d{1,12}$/.test(expRaw)) return null;

  const expected = Buffer.from(sign(`${version}.${testerId}.${expRaw}`, secret));
  const given = Buffer.from(mac);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  const exp = Number(expRaw);
  const now = Math.floor(nowMs / 1000);
  if (exp <= now || exp > now + QA_SESSION_TTL_SECONDS + 60) return null;
  return testerId;
}

export const qaCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: QA_SESSION_TTL_SECONDS,
};

// ─── Sign-in attempt limiting ──────────────────────────────────────────────
// Per client address and globally (so rotating addresses doesn't help), counted over a sliding
// window. In-memory: it holds per server instance, which is enough for the handful of testers this
// serves; the database should rate-limit qa_login as well (see the security notes).

export interface LoginLimiterOptions {
  windowMs: number;
  maxFailuresPerKey: number;
  maxFailuresGlobal: number;
}

export function createLoginLimiter(opts: LoginLimiterOptions) {
  const failures = new Map<string, number[]>();
  let global: number[] = [];

  const prune = (list: number[], now: number) => list.filter((t) => now - t < opts.windowMs);

  return {
    /** False when this key (or everyone) has used up the allowed failures for the window. */
    allowed(key: string, now: number = Date.now()): boolean {
      global = prune(global, now);
      const mine = prune(failures.get(key) ?? [], now);
      if (mine.length) failures.set(key, mine);
      else failures.delete(key);
      return mine.length < opts.maxFailuresPerKey && global.length < opts.maxFailuresGlobal;
    },
    recordFailure(key: string, now: number = Date.now()): void {
      const mine = prune(failures.get(key) ?? [], now);
      mine.push(now);
      failures.set(key, mine);
      global = prune(global, now);
      global.push(now);
      // Bound memory: drop the oldest keys if someone sprays addresses.
      if (failures.size > 10_000) {
        const first = failures.keys().next().value;
        if (first !== undefined) failures.delete(first);
      }
    },
    reset(): void {
      failures.clear();
      global = [];
    },
  };
}

export const qaLoginLimiter = createLoginLimiter({
  windowMs: 15 * 60 * 1000,
  maxFailuresPerKey: 5,
  maxFailuresGlobal: 30,
});

/** Best-effort client address for attempt limiting. Never used for authorization. */
export function clientKey(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || headers.get("x-real-ip")?.trim() || "unknown";
}

/** Codes are digits/letters, 4–64 characters. Anything else is rejected before the database. */
export function isPlausibleQaCode(code: unknown): code is string {
  return typeof code === "string" && /^[A-Za-z0-9]{4,64}$/.test(code.trim());
}
