import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiServerError, requireAgencyApi } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
 try {
 const { id } = await ctx.params;
 // 401 signed out, 403 disabled / no organization — JSON, never a redirect.
 const session = await requireAgencyApi();
 if (session instanceof Response) return session;
 const supabase = await createClient();

 let q = supabase
 .from("reports")
 .delete()
 .eq("id", id);
 if (session.role !== "super_admin") q = q.eq("agency_id", session.agencyId);
 const { error } = await q;
 if (error) return apiServerError("keyword-report/[id]", error);
 return NextResponse.json({ ok: true });
 } catch (e) {
 return apiServerError("keyword-report/[id]", e);
 }
}
