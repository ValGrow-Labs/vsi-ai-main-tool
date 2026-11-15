import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireAgencyApi, apiServerError } from "@/lib/auth";
import { PROJECT_COOKIE, UUID_PATTERN } from "@/lib/project-types";

export const dynamic = "force-dynamic";

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * Permanently delete a project and all its related records (keywords, search results,
 * tasks, audits, competitors, reports, jobs). Enforces agency tenant isolation so
 * users can only delete projects belonging to their own organization (super_admin can delete any).
 */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await requireAgencyApi();
  if (session instanceof Response) return session;

  try {
    const { id } = await ctx.params;
    if (!UUID_PATTERN.test(id)) {
      return errorResponse(400, "bad_request", "Choose a valid project.");
    }

    const supabase = await createClient();

    // Verify ownership and existence
    let checkQuery = supabase.from("clients").select("id, name, agency_id").eq("id", id);
    if (session.role !== "super_admin") {
      checkQuery = checkQuery.eq("agency_id", session.agencyId);
    }
    const { data: project, error: checkError } = await checkQuery.maybeSingle();

    if (checkError) {
      return apiServerError("projects/[id]/delete:check", checkError);
    }
    if (!project) {
      return errorResponse(404, "not_found", "That project isn't available.");
    }

    // Clean up all related tables explicitly to guarantee complete cascading
    // across all database configurations, triggers, and mock storage.
    const relatedTables = [
      "search_results",
      "tracked_keywords",
      "tasks",
      "reports",
      "site_audits",
      "project_competitors",
      "analysis_jobs",
      "client_keyword_analyses",
    ];

    await Promise.allSettled(
      relatedTables.map((tbl) => supabase.from(tbl).delete().eq("client_id", id))
    );

    // Delete the client row
    let deleteQuery = supabase.from("clients").delete().eq("id", id);
    if (session.role !== "super_admin") {
      deleteQuery = deleteQuery.eq("agency_id", session.agencyId);
    }
    const { error: deleteError } = await deleteQuery;

    if (deleteError) {
      return apiServerError("projects/[id]/delete", deleteError);
    }

    // Clear the active project cookie if this project was active
    try {
      const cookieStore = await cookies();
      const currentCookie = cookieStore.get(PROJECT_COOKIE)?.value;
      if (currentCookie === id) {
        cookieStore.delete(PROJECT_COOKIE);
      }
    } catch (cookieErr) {
      console.warn("[projects/[id]] could not clear project cookie", cookieErr);
    }

    return NextResponse.json({ ok: true, deletedId: id, name: project.name });
  } catch (err) {
    return apiServerError("projects/[id]/delete", err);
  }
}

/**
 * Fetch summary for a single project, verifying agency tenant ownership.
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await requireAgencyApi();
  if (session instanceof Response) return session;

  try {
    const { id } = await ctx.params;
    if (!UUID_PATTERN.test(id)) {
      return errorResponse(400, "bad_request", "Choose a valid project.");
    }

    const supabase = await createClient();
    let query = supabase.from("clients").select("*").eq("id", id);
    if (session.role !== "super_admin") {
      query = query.eq("agency_id", session.agencyId);
    }
    const { data: project, error: findError } = await query.maybeSingle();

    if (findError) {
      return apiServerError("projects/[id]/get", findError);
    }
    if (!project) {
      return errorResponse(404, "not_found", "That project isn't available.");
    }

    return NextResponse.json({ project });
  } catch (err) {
    return apiServerError("projects/[id]/get", err);
  }
}
