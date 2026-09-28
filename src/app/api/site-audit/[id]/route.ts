import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAgencyApi } from "@/lib/auth";
import { UUID_PATTERN } from "@/lib/project-types";

export const dynamic = "force-dynamic";

/** Poll the status of one audit run. RLS limits rows to the caller's organization. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAgencyApi();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: { code: "bad_request", message: "Invalid audit." } }, { status: 400 });
  }

  const supabase = await createClient();
  let query = supabase.from("site_audits").select("id, status, score, error_message, completed_at").eq("id", id);
  if (session.role !== "super_admin") query = query.eq("agency_id", session.agencyId);
  const { data } = await query.maybeSingle();
  if (!data) {
    return NextResponse.json({ error: { code: "not_found", message: "That audit isn't available." } }, { status: 404 });
  }
  return NextResponse.json(data);
}
