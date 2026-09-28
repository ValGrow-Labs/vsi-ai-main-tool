import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "node:crypto";
import { requireSessionApi, type SessionContext } from "@/lib/auth";
import type { Message, MessageFolder, MessagePriority, MessageStatus } from "@/lib/types/messages";

export const dynamic = "force-dynamic";

/*
 * Messages are private to the signed-in user: every read and write is filtered by user_id, and the
 * sender is always the signed-in user. Nothing here delivers email; "sent" messages are only stored.
 * There is no in-memory fallback: if the database can't be reached the caller gets an error.
 *
 * messages.id is a global primary key, so ids are always generated here (randomUUID) and any id in
 * a POST body is ignored: a client-chosen id could collide with another user's row and turn the
 * duplicate-key error into an "this id exists" oracle. Every PATCH / DELETE matches on the signed-in
 * user's id first, and "not yours" and "doesn't exist" get the exact same 404 (NOT_FOUND below).
 */

type Row = Record<string, unknown>;

const FOLDERS: MessageFolder[] = ["inbox", "unread", "sent", "drafts", "starred", "archived", "trash", "spam"];
const STATUSES: MessageStatus[] = ["read", "unread", "draft", "sent"];
const PRIORITIES: MessagePriority[] = ["high", "normal", "low"];

const NOT_FOUND_BODY = { success: false, error: "Message not found." } as const;
const MAX_ID_LENGTH = 100;

/** The one answer for a message id that isn't the signed-in user's, whether or not it exists. */
function notFound() {
  return NextResponse.json(NOT_FOUND_BODY, { status: 404 });
}

function dbError(context: string, error: { code?: string; message?: string } | null | undefined) {
  console.error(`[messages] ${context} failed`, { code: error?.code, message: error?.message });
  return NextResponse.json({ success: false, error: "Messages couldn't be reached. Please try again." }, { status: 500 });
}

function asParty(value: unknown): { name: string; email: string } {
  if (value && typeof value === "object") {
    const v = value as { name?: unknown; email?: unknown };
    const email = typeof v.email === "string" ? v.email : "";
    const name = typeof v.name === "string" && v.name ? v.name : email;
    return { name, email };
  }
  return { name: "", email: "" };
}

function mapDbRowToMessage(row: Row): Message {
  const toEmail = typeof row.to_email === "string" ? row.to_email : "";
  const recipient = row.recipient ? asParty(row.recipient) : { name: toEmail, email: toEmail };
  return {
    id: String(row.id),
    sender: asParty(row.sender),
    recipient,
    cc: (row.cc as string | null) ?? undefined,
    bcc: (row.bcc as string | null) ?? undefined,
    subject: (row.subject as string) || "",
    preview: (row.preview as string) || "",
    body: (row.body as string) || "",
    timestamp: (row.created_at as string) || "",
    updatedAt: (row.updated_at as string) || undefined,
    lastSaved: (row.last_saved as string) || undefined,
    status: (row.status as MessageStatus) || "unread",
    priority: (row.priority as MessagePriority) || "normal",
    folder: (row.folder as MessageFolder) || "inbox",
    isStarred: Boolean(row.is_starred),
    labels: (row.labels as string[]) || [],
    relatedClient: (row.related_client as string | null) ?? undefined,
    aiSummary: (row.ai_summary as string | null) ?? undefined,
    attachments: (row.attachments as Message["attachments"]) || [],
  };
}

function previewOf(body: string): string {
  return body.replace(/<[^>]+>/g, "").trim().substring(0, 90);
}

/** The signed-in user as a message sender. Never a made-up address. */
function senderFor(session: Pick<SessionContext, "email" | "fullName">): { name: string; email: string } {
  return { name: session.fullName || session.email, email: session.email };
}

function recipientFrom(body: Row): { name: string; email: string } {
  if (body.recipient && typeof body.recipient === "object") return asParty(body.recipient);
  const to = typeof body.to === "string" ? body.to.trim() : typeof body.recipientEmail === "string" ? body.recipientEmail.trim() : "";
  return { name: to, email: to };
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

// GET /api/messages — only the signed-in user's messages
export async function GET() {
  const session = await requireSessionApi();
  if (session instanceof Response) return session;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("user_id", session.userId)
      .order("created_at", { ascending: false });
    if (error) return dbError("list", error);
    return NextResponse.json({ success: true, messages: (data ?? []).map((r: Row) => mapDbRowToMessage(r)) });
  } catch (e) {
    return dbError("list", { message: e instanceof Error ? e.message : String(e) });
  }
}

// POST /api/messages — store a new message or draft for the signed-in user
export async function POST(req: NextRequest) {
  const session = await requireSessionApi();
  if (session instanceof Response) return session;

  let body: Row;
  try {
    body = (await req.json()) as Row;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const text = typeof body.body === "string" ? body.body : "";
  const folder = pick(body.folder, FOLDERS, "drafts");
  const recipient = recipientFrom(body);
  // Always a fresh server id; body.id is ignored (see the note at the top).
  const id = randomUUID();

  const row = {
    id,
    user_id: session.userId,
    sender: senderFor(session),
    recipient,
    to_email: recipient.email || null,
    cc: typeof body.cc === "string" ? body.cc : "",
    bcc: typeof body.bcc === "string" ? body.bcc : "",
    subject: (typeof body.subject === "string" && body.subject) || "(No Subject)",
    preview: previewOf(text) || "(No content)",
    body: text,
    attachments: Array.isArray(body.attachments) ? body.attachments : [],
    status: pick(body.status, STATUSES, folder === "drafts" ? "draft" : "read"),
    priority: pick(body.priority, PRIORITIES, "normal"),
    folder,
    is_starred: body.isStarred === true,
    labels: Array.isArray(body.labels) ? body.labels.filter((l): l is string => typeof l === "string") : [],
    last_saved: now,
    updated_at: now,
  };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("messages").insert(row).select("*").single();
    if (error || !data) return dbError("insert", error);
    return NextResponse.json({ success: true, message: mapDbRowToMessage(data as Row) }, { status: 201 });
  } catch (e) {
    return dbError("insert", { message: e instanceof Error ? e.message : String(e) });
  }
}

// PATCH /api/messages — update one of the signed-in user's messages
export async function PATCH(req: NextRequest) {
  const session = await requireSessionApi();
  if (session instanceof Response) return session;

  let body: Row;
  try {
    body = (await req.json()) as Row;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ success: false, error: "Message ID is required" }, { status: 400 });
  if (id.length > MAX_ID_LENGTH) return notFound();

  const now = new Date().toISOString();
  const dbUpdates: Row = { updated_at: now, last_saved: now };
  if (typeof body.subject === "string") dbUpdates.subject = body.subject;
  if (typeof body.body === "string") {
    dbUpdates.body = body.body;
    dbUpdates.preview = previewOf(body.body) || "(No content)";
  }
  if (body.to !== undefined || body.recipient !== undefined) {
    const recipient = recipientFrom(body);
    dbUpdates.recipient = recipient;
    dbUpdates.to_email = recipient.email || null;
  }
  if (typeof body.cc === "string") dbUpdates.cc = body.cc;
  if (typeof body.bcc === "string") dbUpdates.bcc = body.bcc;
  if (body.folder !== undefined) dbUpdates.folder = pick(body.folder, FOLDERS, "inbox");
  if (body.status !== undefined) dbUpdates.status = pick(body.status, STATUSES, "read");
  if (body.priority !== undefined) dbUpdates.priority = pick(body.priority, PRIORITIES, "normal");
  if (typeof body.isStarred === "boolean") dbUpdates.is_starred = body.isStarred;
  if (Array.isArray(body.labels)) dbUpdates.labels = body.labels.filter((l): l is string => typeof l === "string");
  if (Array.isArray(body.attachments)) dbUpdates.attachments = body.attachments;
  // The sender and owner can never be changed.

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("messages")
      .update(dbUpdates)
      .eq("user_id", session.userId)
      .eq("id", id)
      .select("*");
    if (error) return dbError("update", error);
    if (!data || data.length === 0) return notFound();
    return NextResponse.json({ success: true, message: mapDbRowToMessage(data[0] as Row) });
  } catch (e) {
    return dbError("update", { message: e instanceof Error ? e.message : String(e) });
  }
}

// DELETE /api/messages?id=… — delete one of the signed-in user's messages
export async function DELETE(req: NextRequest) {
  const session = await requireSessionApi();
  if (session instanceof Response) return session;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ success: false, error: "Missing message ID" }, { status: 400 });
  if (id.length > MAX_ID_LENGTH) return notFound();

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("messages")
      .delete()
      .eq("user_id", session.userId)
      .eq("id", id)
      .select("id");
    if (error) return dbError("delete", error);
    if (!data || data.length === 0) return notFound();
    return NextResponse.json({ success: true, message: "Message deleted." });
  } catch (e) {
    return dbError("delete", { message: e instanceof Error ? e.message : String(e) });
  }
}
