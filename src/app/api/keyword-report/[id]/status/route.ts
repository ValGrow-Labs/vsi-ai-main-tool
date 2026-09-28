import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiServerError, requireAgencyApi } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
 try {
 const { id } = await ctx.params;
 // 401 signed out, 403 disabled / no organization — JSON, never a redirect.
 const session = await requireAgencyApi();
 if (session instanceof Response) return session;
 const supabase = await createClient();

 let q = supabase
 .from("reports")
 .select("id, type, status, share_token, error_message, generated_at")
 .eq("id", id);
 if (session.role !== "super_admin") q = q.eq("agency_id", session.agencyId);
 const { data, error } = await q.maybeSingle();
 if (error) return apiServerError("keyword-report/[id]/status", error);
 if (!data) return NextResponse.json({ error: "Report not found" }, { status: 404 });

 return NextResponse.json({
 id: data.id,
 type: data.type,
 status: data.status,
 share_url: `/r/${data.share_token}`,
 error: data.error_message,
 generated_at: data.generated_at,
 });
 } catch (e) {
 return apiServerError("keyword-report/[id]/status", e);
 }
}
