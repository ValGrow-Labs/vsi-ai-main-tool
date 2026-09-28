import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSessionApi, apiServerError } from "@/lib/auth";
import { track } from "@/lib/track";
import { feedbackContextData, trimOrNull } from "@/lib/feedback";

export const dynamic = "force-dynamic";

/**
 * A signed-in user's own feedback.
 *
 * Who sent it (user_id, agency_id) always comes from the verified session. Anything identity- or
 * admin-shaped in the body (user_id, email, agency_id, status, admin_notes, role, is_admin, ...) is
 * ignored: new feedback is always status "new" with no admin notes. Only platform admins change
 * status / admin_notes, through PATCH /api/admin/feedback/[id]. The database enforces the same rules
 * (migration 044), so this is the second of two layers.
 */

interface Payload {
  rating?: unknown;
  comment?: unknown;
  attachment_name?: unknown;
  page?: unknown;
  browser?: unknown;
  device?: unknown;
  os?: unknown;
  screen?: unknown;
  viewport?: unknown;
  timezone?: unknown;
  theme?: unknown;
  timestamp?: unknown;
  category?: unknown;
  message?: unknown;
  subject?: unknown;
  page_url?: unknown;
  context_data?: unknown;
}

type Category = "bug" | "idea" | "question" | "praise" | "general";
const VALID: Category[] = ["bug", "idea", "question", "praise", "general"];

/** What a user may see of their own feedback. admin_notes are internal and never returned. */
const OWN_COLUMNS = "id, category, rating, subject, message, attachment_url, page_url, status, created_at, updated_at";

function ratingToCategory(rating: number): Category {
  if (rating >= 4) return "praise";
  if (rating === 3) return "general";
  return "bug";
}

export async function GET() {
  // Any active signed-in user (feedback works before an organization exists). Disabled: 403.
  const session = await requireSessionApi();
  if (session instanceof Response) return session;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("feedback")
      .select(OWN_COLUMNS)
      .eq("user_id", session.userId)
      .order("created_at", { ascending: false });

    if (error) return apiServerError("feedback", error);
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return apiServerError("feedback", e);
  }
}

export async function POST(req: NextRequest) {
  // Any active signed-in user, with or without an organization yet. Disabled: 403.
  const auth = await requireSessionApi();
  if (auth instanceof Response) return auth;
  try {
    const supabase = await createClient();
    const body = ((await req.json()) ?? {}) as Payload;
    if (typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    const ua = req.headers.get("user-agent")?.slice(0, 500) ?? null;
    const isNew = typeof body.rating === "number";

    let row: Record<string, unknown>;
    let trackPayload: Record<string, unknown>;

    if (isNew) {
      const rating = body.rating as number;
      const comment = typeof body.comment === "string" ? body.comment.trim() : "";
      if (!Number.isInteger(rating) || rating < 1 || rating > 5)
        return NextResponse.json({ error: "Invalid rating (1-5 required)" }, { status: 400 });
      if (comment.length < 4)
        return NextResponse.json({ error: "Comment must be at least 4 characters" }, { status: 400 });
      if (comment.length > 2000)
        return NextResponse.json({ error: "Comment too long (max 2000 characters)" }, { status: 400 });

      const pageUrl = trimOrNull(body.page, 500) ?? trimOrNull(body.page_url, 500);
      const attachmentName = trimOrNull(body.attachment_name, 200);
      row = {
        category: ratingToCategory(rating),
        rating: String(rating),
        subject: trimOrNull(body.subject, 200) ?? (comment.length > 80 ? comment.slice(0, 80) + "..." : comment),
        message: comment,
        attachment_url: attachmentName,
        page_url: pageUrl,
        user_agent: trimOrNull(body.browser, 500) ?? ua,
        context_data: feedbackContextData({ ...(isPlainObject(body.context_data) ? body.context_data : {}), ...pick(body), rating }),
      };
      trackPayload = {
        rating,
        page_url: pageUrl,
        comment_length: comment.length,
        has_attachment: !!attachmentName,
        device: trimOrNull(body.device, 100),
      };
    } else {
      // Category + message form (the Feedback page and the Help page).
      const category = body.category as Category;
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!VALID.includes(category))
        return NextResponse.json({ error: "Invalid category" }, { status: 400 });
      if (message.length < 4)
        return NextResponse.json({ error: "Please write a short message (4+ characters)" }, { status: 400 });
      if (message.length > 5000)
        return NextResponse.json({ error: "Message is too long (5000 char max)" }, { status: 400 });

      const pageUrl = trimOrNull(body.page_url, 500);
      row = {
        category,
        rating: null,
        subject: trimOrNull(body.subject, 200),
        message,
        attachment_url: null,
        page_url: pageUrl,
        user_agent: ua,
        context_data: isPlainObject(body.context_data) ? feedbackContextData(body.context_data) : null,
      };
      trackPayload = { category, page_url: pageUrl, message_length: message.length };
    }

    const { data, error } = await supabase
      .from("feedback")
      .insert({
        ...row,
        // Identity and workflow fields are the server's, never the body's.
        user_id: auth.userId,
        agency_id: auth.agencyId,
        status: "new",
      })
      .select("id")
      .single();

    if (error || !data) return apiServerError("feedback", error ?? new Error("no row"));

    if (auth.agencyId) {
      track({ agencyId: auth.agencyId, userId: auth.userId, type: "feedback_submitted", payload: trackPayload });
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    return apiServerError("feedback", e);
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** The flat device/context fields the feedback widget sends at the top level. */
function pick(body: Payload): Record<string, unknown> {
  const { device, os, screen, viewport, timezone, theme, timestamp, attachment_name } = body;
  const all: Record<string, unknown> = { device, os, screen, viewport, timezone, theme, timestamp, attachment_name };
  return Object.fromEntries(Object.entries(all).filter(([, v]) => v !== undefined));
}
