import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isDummySupabase, requireSessionApi } from "@/lib/auth";

export const dynamic = "force-dynamic";

export interface ServerNotification {
  id: string;
  userId?: string;
  title: string;
  description?: string;
  message: string;
  type: 'alert' | 'system' | 'report' | 'user';
  priority: 'high' | 'medium' | 'low' | 'info';
  severity: 'high' | 'medium' | 'low' | 'info';
  status: 'unread' | 'read' | 'cleared';
  isRead: boolean;
  slug?: string;
  fullDetails?: string;
  relatedClient?: string;
  aiEngine?: string;
  recommendedActions?: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * In-memory store used ONLY when VSI runs without a database (placeholder
 * Supabase URL, local development). With a real database every operation
 * goes to Supabase, scoped to the signed-in user, and a database error is
 * reported as an error — never answered from memory as if it had worked.
 */
const devStore: Record<string, ServerNotification[]> = {};

type NotificationRow = {
  id: string;
  user_id: string | null;
  title: string;
  description: string | null;
  message: string;
  type: ServerNotification["type"] | null;
  priority: ServerNotification["priority"] | null;
  severity: ServerNotification["severity"] | null;
  is_read: boolean | null;
  slug: string | null;
  full_details: string | null;
  related_client: string | null;
  ai_engine: string | null;
  recommended_actions: string[] | null;
  created_at: string;
  updated_at: string | null;
};

function toServer(item: NotificationRow): ServerNotification {
  return {
    id: item.id,
    userId: item.user_id ?? undefined,
    title: item.title,
    description: item.description || item.message,
    message: item.message,
    type: item.type || 'system',
    priority: item.priority || 'info',
    severity: item.severity || item.priority || 'info',
    status: item.is_read ? 'read' : 'unread',
    isRead: item.is_read || false,
    slug: item.slug || '',
    fullDetails: item.full_details || '',
    relatedClient: item.related_client || '',
    aiEngine: item.ai_engine || '',
    recommendedActions: item.recommended_actions || [],
    createdAt: item.created_at,
    updatedAt: item.updated_at || item.created_at,
  };
}

/**
 * The caller's verified session: 401 signed out, 403 disabled account (the
 * disabled check doesn't rely on the middleware alone).
 */
async function signedInUser(): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; userId: string } | { denied: Response }> {
  const session = await requireSessionApi();
  if (session instanceof Response) return { denied: session };
  return { supabase: await createClient(), userId: session.userId };
}
const dbError = (message: string) => NextResponse.json({ success: false, error: message }, { status: 500 });

// GET /api/notifications — the signed-in user's notifications
export async function GET() {
  if (isDummySupabase()) return NextResponse.json({ success: true, notifications: devStore.dev ?? [] });
  try {
    const auth = await signedInUser();
    if ("denied" in auth) return auth.denied;
    const { supabase, userId } = auth;
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) return dbError("We couldn't load your notifications right now.");
    return NextResponse.json({ success: true, notifications: (data ?? []).map((r) => toServer(r as NotificationRow)) });
  } catch (e) {
    console.error("[notifications]", e); return dbError("Failed to fetch notifications");
  }
}

// DELETE /api/notifications — delete all of the signed-in user's notifications
export async function DELETE() {
  if (isDummySupabase()) {
    devStore.dev = [];
    return NextResponse.json({ success: true, message: "All notifications deleted" });
  }
  try {
    const auth = await signedInUser();
    if ("denied" in auth) return auth.denied;
    const { supabase, userId } = auth;
    const { error } = await supabase.from("notifications").delete().eq("user_id", userId);
    if (error) return dbError("Your notifications couldn't be deleted. Please try again.");
    return NextResponse.json({ success: true, message: "All notifications deleted" });
  } catch (e) {
    console.error("[notifications]", e); return dbError("Failed to delete notifications");
  }
}

// POST /api/notifications — create a notification for the signed-in user
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const now = new Date().toISOString();
    const fields = {
      title: body.title || "New Notification",
      description: body.description || body.message || "",
      message: body.message || body.description || "",
      type: body.type || 'system',
      priority: body.priority || body.severity || 'info',
      severity: body.severity || body.priority || 'info',
      slug: body.slug || `notification-${Date.now()}`,
      full_details: body.fullDetails || body.message || "",
      related_client: body.relatedClient || "",
      ai_engine: body.aiEngine || "",
      recommended_actions: body.recommendedActions || [],
    };

    if (isDummySupabase()) {
      const n = toServer({ ...fields, id: `dev_${Date.now()}`, user_id: null, is_read: false, created_at: now, updated_at: now });
      (devStore.dev ??= []).unshift(n);
      return NextResponse.json({ success: true, notification: n }, { status: 201 });
    }

    const auth = await signedInUser();
    if ("denied" in auth) return auth.denied;
    const { supabase, userId } = auth;
    // The database assigns the id (a uuid); only the stored row is returned.
    const { data, error } = await supabase
      .from("notifications")
      .insert({ ...fields, user_id: userId, status: 'unread', is_read: false })
      .select("*")
      .single();
    if (error || !data) return dbError("The notification couldn't be saved.");
    return NextResponse.json({ success: true, notification: toServer(data as NotificationRow) }, { status: 201 });
  } catch (e) {
    console.error("[notifications]", e); return dbError("Failed to create notification");
  }
}

// PATCH /api/notifications — mark read / unread
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();

    if (isDummySupabase()) {
      devStore.dev = (devStore.dev ?? []).map((n) =>
        body.action === "mark-all-read" || n.id === body.id ? { ...n, isRead: body.isRead ?? true, status: (body.isRead ?? true) ? 'read' : 'unread' } : n,
      );
      return NextResponse.json({ success: true, message: "Notification updated" });
    }

    const auth = await signedInUser();
    if ("denied" in auth) return auth.denied;
    const { supabase, userId } = auth;

    if (body.action === "mark-all-read") {
      const { error } = await supabase.from("notifications").update({ is_read: true, status: 'read' }).eq("user_id", userId);
      if (error) return dbError("Notifications couldn't be marked as read.");
      return NextResponse.json({ success: true, message: "All notifications marked as read" });
    }

    if (body.id) {
      const isRead = body.isRead ?? true;
      const { data, error } = await supabase
        .from("notifications")
        .update({ is_read: isRead, status: isRead ? 'read' : 'unread' })
        .eq("id", body.id)
        .eq("user_id", userId)
        .select("id");
      if (error) return dbError("The notification couldn't be updated.");
      if (!data || data.length === 0) return NextResponse.json({ success: false, error: "Notification not found." }, { status: 404 });
      return NextResponse.json({ success: true, message: "Notification updated" });
    }

    return NextResponse.json({ success: false, error: "Invalid patch request" }, { status: 400 });
  } catch (e) {
    console.error("[notifications]", e); return dbError("Failed to update");
  }
}
