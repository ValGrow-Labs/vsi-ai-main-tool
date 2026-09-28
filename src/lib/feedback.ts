/**
 * Helper utilities for Feedback submission, configuration verification,
 * and error classification.
 */

export function checkSupabaseConfig(): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || url.includes("dummy") || url.includes("your-project.supabase.co")) {
    throw new Error("Supabase is not configured. Please define NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment variables.");
  }
  if (!key || key.includes("anon_key_here") || key.includes("dummy_key")) {
    throw new Error("Supabase Anon Key is missing or invalid. Please configure NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }
}

export type FeedbackErrorCategory = "configuration" | "authentication" | "permission" | "database";

export interface ClassifiedFeedbackError {
  type: FeedbackErrorCategory;
  message: string;
}

export function classifyFeedbackError(err: unknown): ClassifiedFeedbackError {
  if (!err) {
    return { type: "database", message: "An unexpected error occurred while submitting feedback." };
  }

  const rawMsg =
    err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
      ? String((err as any).message)
      : String(err);
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as any).code)
      : "";
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? Number((err as any).status)
      : null;

  // 1. Configuration errors
  if (
    rawMsg.includes("NEXT_PUBLIC_SUPABASE") ||
    rawMsg.includes("Supabase is not configured") ||
    rawMsg.includes("Anon Key is missing") ||
    rawMsg.includes("your-project.supabase.co") ||
    rawMsg.includes("anon_key_here")
  ) {
    return {
      type: "configuration",
      message: "Configuration error: Supabase is not configured. Please define NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your environment variables.",
    };
  }

  // 2. Authentication errors
  if (
    status === 401 ||
    rawMsg.includes("No authenticated session") ||
    rawMsg.includes("not authenticated") ||
    rawMsg.includes("sign in") ||
    rawMsg.includes("JWT") ||
    rawMsg.includes("token is expired") ||
    rawMsg.includes("invalid claim")
  ) {
    return {
      type: "authentication",
      message: "Authentication error: You must be signed in to submit feedback. Please sign in again.",
    };
  }

  // 3. Permission errors
  if (
    code === "42501" ||
    status === 403 ||
    rawMsg.toLowerCase().includes("permission denied") ||
    rawMsg.toLowerCase().includes("row-level security") ||
    rawMsg.toLowerCase().includes("violates row-level security policy")
  ) {
    return {
      type: "permission",
      message: "Permission error: You do not have permission to submit feedback (row-level security policy violation).",
    };
  }

  // 4. Database errors
  if (
    rawMsg === "fetch failed" ||
    rawMsg.toLowerCase().includes("network") ||
    rawMsg.toLowerCase().includes("failed to fetch") ||
    rawMsg.toLowerCase().includes("connection")
  ) {
    return {
      type: "database",
      message: "Database error: The database server is unreachable. Please verify NEXT_PUBLIC_SUPABASE_URL is correct and the database is active.",
    };
  }

  // Our own API's validation messages (400) are fixed text written for users: show them.
  if (status === 400 && rawMsg) {
    return { type: "database", message: rawMsg };
  }

  // Anything else: fixed text. The raw database/server message stays in the console.
  return {
    type: "database",
    message: "Your feedback wasn't sent. Please try again in a moment.",
  };
}

/** A trimmed, length-capped string, or null for anything else / empty. */
export function trimOrNull(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim().slice(0, max);
  return t || null;
}

/**
 * The only keys stored in feedback.context_data. Everything else a client sends (user_id, email,
 * agency_id, role, is_admin, status, admin_notes, ...) is dropped, so nothing identity- or
 * privilege-shaped can ride along in the JSON.
 */
export const FEEDBACK_CONTEXT_KEYS = [
  "rating",
  "device",
  "os",
  "screen",
  "viewport",
  "timezone",
  "theme",
  "timestamp",
  "attachment_name",
  "subject",
  "submitted_from",
] as const;

export function feedbackContextData(input: Record<string, unknown>): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {};
  for (const key of FEEDBACK_CONTEXT_KEYS) {
    const v = input[key];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
    else if (typeof v === "string") out[key] = v.slice(0, 200);
    else if (v === null) out[key] = null;
  }
  return out;
}

/** Response from POST /api/feedback, the only way the browser stores feedback. */
export async function submitFeedback(body: Record<string, unknown>): Promise<{ id: string }> {
  const res = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: string; error?: string; code?: string };
  if (!res.ok || !data.ok || !data.id) {
    const err = new Error(data.error || "Your feedback wasn't sent. Please try again in a moment.") as Error & { status?: number; code?: string };
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return { id: data.id };
}
