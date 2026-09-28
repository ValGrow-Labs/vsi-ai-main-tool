import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAgencyApi, apiServerError } from "@/lib/auth";
import { UUID_PATTERN } from "@/lib/project-types";
import { track } from "@/lib/track";
import type { TaskStatus, AcceptanceCriterion } from "@/lib/tasks";

export const dynamic = "force-dynamic";

interface PatchPayload {
 status?: TaskStatus;
 title?: string;
 description?: string | null;
 acceptance?: AcceptanceCriterion[];
 owner?: string | null;
 effort?: string | null;
 impact?: string | null;
 due_date?: string | null;
 notes?: string | null;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
 const session = await requireAgencyApi();
 if (session instanceof Response) return session;
 try {
 const { id } = await ctx.params;
 if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "Task not found" }, { status: 404 });
 const supabase = await createClient();
 const body = (await req.json()) as PatchPayload;

 const patch: Record<string, unknown> = {};
 if (body.status !== undefined) {
 patch.status = body.status;
 if (body.status === "done") {
 patch.completed_at = new Date().toISOString();
 patch.completed_by = session.userId;
 } else {
 patch.completed_at = null;
 patch.completed_by = null;
 }
 }
 if (body.title !== undefined) patch.title = body.title;
 if (body.description !== undefined) patch.description = body.description;
 if (body.acceptance !== undefined) patch.acceptance = body.acceptance;
 if (body.owner !== undefined) patch.owner = body.owner;
 if (body.effort !== undefined) patch.effort = body.effort;
 if (body.impact !== undefined) patch.impact = body.impact;
 if (body.due_date !== undefined) patch.due_date = body.due_date;
 if (body.notes !== undefined) patch.notes = body.notes;

 if (Object.keys(patch).length === 0) {
 return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
 }

 let q = supabase
 .from("tasks")
 .update(patch)
 .eq("id", id);
 if (session.role !== "super_admin") q = q.eq("agency_id", session.agencyId);
 const { data, error } = await q.select("*").maybeSingle();

 if (error) return apiServerError("tasks/[id]", error);
 // Not found, or another organization's task: the same answer, so its existence isn't confirmed.
 if (!data) return NextResponse.json({ error: "Task not found" }, { status: 404 });
 if (body.status !== undefined) {
 track({
 agencyId: (data.agency_id as string) ?? session.agencyId,
 userId: session.userId,
 type: "task_status_change",
 payload: { task_id: id, status: body.status },
 });
 }
 return NextResponse.json(data);
 } catch (e) {
 return apiServerError("tasks/[id]", e);
 }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
 const session = await requireAgencyApi();
 if (session instanceof Response) return session;
 try {
 const { id } = await ctx.params;
 if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "Task not found" }, { status: 404 });
 const supabase = await createClient();

 let q = supabase
 .from("tasks")
 .delete()
 .eq("id", id);
 if (session.role !== "super_admin") q = q.eq("agency_id", session.agencyId);
 const { data: deleted, error } = await q.select("id");
 if (error) return apiServerError("tasks/[id]", error);
 if (!deleted || deleted.length === 0) return NextResponse.json({ error: "Task not found" }, { status: 404 });
 return NextResponse.json({ ok: true });
 } catch (e) {
 return apiServerError("tasks/[id]", e);
 }
}
