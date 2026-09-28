import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAgencyApi } from "@/lib/auth";
import { UUID_PATTERN } from "@/lib/project-types";
import { isMissingTableError } from "@/lib/site-audit/store";

export const dynamic = "force-dynamic";

function error(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Remove a competitor from a project. Scoped to the caller's organization. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; competitorId: string }> }) {
  const session = await requireAgencyApi();
  if (session instanceof Response) return session;
  const { id, competitorId } = await ctx.params;
  if (!UUID_PATTERN.test(id) || !UUID_PATTERN.test(competitorId)) return error(400, "bad_request", "Invalid request.");

  const supabase = await createClient();
  let q = supabase.from("project_competitors").delete().eq("id", competitorId).eq("client_id", id);
  if (session.role !== "super_admin") q = q.eq("agency_id", session.agencyId);
  const { data, error: delErr } = await q.select("id");
  if (delErr) {
    if (isMissingTableError(delErr, "project_competitors")) {
      return error(503, "setup_required", "Competitors need a one-time database update (migration 036).");
    }
    console.error("[competitors] delete failed", { code: delErr.code });
    return error(500, "delete_failed", "We couldn't remove that competitor. Please try again.");
  }
  if (!data || data.length === 0) return error(404, "not_found", "That competitor isn't available.");
  return NextResponse.json({ ok: true });
}
