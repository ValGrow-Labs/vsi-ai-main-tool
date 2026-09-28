import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAgencyApi } from "@/lib/auth";
import { UUID_PATTERN } from "@/lib/project-types";

export const dynamic = "force-dynamic";

function error(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Remove a tracked search from a project. Scoped to the caller's organization. */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; keywordId: string }> }
) {
  const session = await requireAgencyApi();
  if (session instanceof Response) return session;
  const { id, keywordId } = await ctx.params;
  if (!UUID_PATTERN.test(id) || !UUID_PATTERN.test(keywordId)) {
    return error(400, "bad_request", "Invalid request.");
  }

  const supabase = await createClient();
  let q = supabase
    .from("tracked_keywords")
    .delete()
    .eq("id", keywordId)
    .eq("client_id", id);
  if (session.role !== "super_admin") {
    q = q.eq("agency_id", session.agencyId);
  }
  const { data, error: delErr } = await q.select("id");
  if (delErr) {
    console.error("[keywords] delete failed", { code: delErr.code, message: delErr.message });
    return error(500, "delete_failed", "We couldn't remove that search. Please try again.");
  }
  if (!data || data.length === 0) {
    return error(404, "not_found", "That search isn't available.");
  }
  return NextResponse.json({ ok: true });
}
