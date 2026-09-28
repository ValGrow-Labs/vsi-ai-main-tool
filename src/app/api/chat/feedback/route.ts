import { NextRequest, NextResponse } from "next/server";
import { requireAgencyApi, apiServerError } from "@/lib/auth";
import { track } from "@/lib/track";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
 const session = await requireAgencyApi();
 if (session instanceof Response) return session;
 try {
 const { vote, scope_kind, message_index, note } = (await req.json()) as {
 vote?: "up" | "down";
 scope_kind?: string;
 message_index?: number;
 note?: string;
 };
 if (vote !== "up" && vote !== "down") {
 return NextResponse.json({ error: "vote must be 'up' or 'down'" }, { status: 400 });
 }
 track({
 agencyId: session.agencyId,
 userId: session.userId,
 type: "chat_thumbs",
 payload: {
 vote,
 scope_kind: typeof scope_kind === "string" ? scope_kind.slice(0, 50) : null,
 message_index: typeof message_index === "number" ? message_index : null,
 note: typeof note === "string" ? note.slice(0, 500) : null,
 },
 });
 return NextResponse.json({ ok: true });
 } catch (e) {
 return apiServerError("chat/feedback", e);
 }
}
