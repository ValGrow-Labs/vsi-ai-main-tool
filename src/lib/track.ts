import "server-only";
import { createClient } from "@/lib/supabase/server";
import crypto from "crypto";

// Server-side analytics event capture. Use this anywhere you'd want to
// understand how the platform is being used. Never blocks the caller —
// failures are swallowed and logged.
//
// Server-only, and there is deliberately no browser-facing analytics endpoint: agencyId / userId must
// come from the verified session (requireAgencyApi etc.) or explicit server-side values, never from a
// request body. The user id is stored only as a salted hash.

/** Every event type the platform records. Anything else is dropped (checked at runtime too). */
export const EVENT_TYPES = [
  "chat_query",
  "chat_thumbs",           // payload: { vote: "up" | "down", message_index, scope_kind }
  "brief_generated",
  "brief_regenerated",
  "report_generated",
  "report_completed",
  "task_imported",
  "task_status_change",    // payload: { from, to }
  "task_outcome",          // payload: { status: verified | regressed | neutral }
  "feedback_submitted",
  "keyword_run_outcome",   // payload: { gap_label, rank_delta, citation_delta }
  "engine_used",           // payload: { engine, latency_ms, ok }
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

const EVENT_TYPE_SET: ReadonlySet<string> = new Set(EVENT_TYPES);

/**
 * Payload keys that name a person, an organization or a privilege. Identity is recorded only through
 * the dedicated columns (agency_id, user_hash), which come from the caller's verified session or
 * explicit server arguments; a payload can never carry or override it.
 */
const FORBIDDEN_PAYLOAD_KEY = /^(user_?id|user_?hash|uid|email|e_?mail|agency_?id|org(anization)?_?id|role|roles|is_?admin|is_?super_?admin|super_?admin|admin|is_?disabled|permissions?|password|token|access_?token|refresh_?token|api_?key|secret|session_?id)$/i;

/** A copy of the payload without identity / privilege keys (top level and one level down). */
export function sanitizeEventPayload(payload: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!payload || typeof payload !== "object") return out;
  for (const [k, v] of Object.entries(payload)) {
    if (FORBIDDEN_PAYLOAD_KEY.test(k)) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const inner: Record<string, unknown> = {};
      for (const [ik, iv] of Object.entries(v as Record<string, unknown>)) {
        if (!FORBIDDEN_PAYLOAD_KEY.test(ik)) inner[ik] = iv;
      }
      out[k] = inner;
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function isEventType(value: unknown): value is EventType {
  return typeof value === "string" && EVENT_TYPE_SET.has(value);
}

interface TrackOpts {
  agencyId?: string | null;
  userId?: string | null;
  type: EventType;
  payload?: Record<string, unknown>;
  pagePath?: string | null;
  sessionId?: string | null;
}

// Per-process salt — combined with agency_id so a user_id can't be
// reverse-engineered to a row even if the salt leaks (without the
// matching agency_id). Set ANALYTICS_SALT in env for stable hashing
// across restarts; otherwise we fall back to a process-local UUID.
const SALT = process.env.ANALYTICS_SALT || crypto.randomUUID();

function hashUser(userId: string | null | undefined, agencyId: string | null | undefined): string | null {
  if (!userId) return null;
  return crypto
    .createHash("sha256")
    .update(`${SALT}::${agencyId ?? ""}::${userId}`)
    .digest("hex")
    .slice(0, 32);
}

export async function track(opts: TrackOpts): Promise<void> {
  if (!isEventType(opts.type)) {
    console.warn("[track] dropped unknown event type");
    return;
  }
  try {
    const supabase = await createClient();
    await supabase.from("analytics_events").insert({
      agency_id: opts.agencyId ?? null,
      user_hash: hashUser(opts.userId, opts.agencyId),
      event_type: opts.type,
      payload: sanitizeEventPayload(opts.payload),
      page_path: opts.pagePath ?? null,
      session_id: opts.sessionId ?? null,
    });
  } catch (e) {
    // Analytics failures must never break user-facing flows.
    console.warn("[track] failed to record event:", opts.type, e);
  }
}
