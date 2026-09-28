import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAgencyApi, apiServerError } from "@/lib/auth";
import { UUID_PATTERN } from "@/lib/project-types";

export const dynamic = "force-dynamic";

interface Payload {
 // An ordered list of task IDs in their new priority order (top = priority 0).
 order: string[];
}

export async function POST(req: NextRequest) {
 const session = await requireAgencyApi();
 if (session instanceof Response) return session;
 try {
 const { order } = (await req.json()) as Payload;
 if (!Array.isArray(order) || order.length === 0 || order.length > 500 || !order.every((id) => typeof id === "string" && UUID_PATTERN.test(id))) {
 return NextResponse.json({ error: "order array required" }, { status: 400 });
 }
 const supabase = await createClient();

 // Update each task's priority. Supabase's update doesn't batch by id with
 // different values in one statement, so we issue one update per id but
 // in parallel. With 50-ish tasks per group this is well under any limit.
 const isSuperAdmin = session.role === "super_admin";
 await Promise.all(order.map((id, i) => {
 let q = supabase.from("tasks").update({ priority: i }).eq("id", id);
 if (!isSuperAdmin) q = q.eq("agency_id", session.agencyId);
 return q;
 }));

 return NextResponse.json({ ok: true, count: order.length });
 } catch (e) {
 return apiServerError("tasks/reorder", e);
 }
}
