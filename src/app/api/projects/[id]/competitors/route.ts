import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAgencyApi, type SessionContext } from "@/lib/auth";
import { UUID_PATTERN } from "@/lib/project-types";
import { MAX_COMPETITORS, validateCompetitorDomain } from "@/lib/project-competitors";
import { isMissingTableError } from "@/lib/site-audit/store";

export const dynamic = "force-dynamic";

function error(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

const SETUP_REQUIRED = () =>
  error(503, "setup_required", "Saving competitors needs a one-time database update (migration 036) before it can be used.");

/** The project, only if the caller's organization owns it (super admins: any). */
async function findProject(session: SessionContext & { agencyId: string }, projectId: string) {
  const supabase = await createClient();
  let q = supabase.from("clients").select("id, agency_id, website").eq("id", projectId);
  if (session.role !== "super_admin") q = q.eq("agency_id", session.agencyId);
  const { data } = await q.maybeSingle();
  return { supabase, project: data as { id: string; agency_id: string; website: string | null } | null };
}

/** List the competitors added to a project. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAgencyApi();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!UUID_PATTERN.test(id)) return error(400, "bad_request", "Choose a valid project.");
  const { supabase, project } = await findProject(session, id);
  if (!project) return error(404, "not_found", "That project isn't available.");

  const { data, error: qErr } = await supabase
    .from("project_competitors")
    .select("id, domain, name, created_at")
    .eq("client_id", id)
    .order("created_at", { ascending: true });
  if (qErr) {
    if (isMissingTableError(qErr, "project_competitors")) return SETUP_REQUIRED();
    return error(500, "load_failed", "We couldn't load competitors. Please try again.");
  }
  return NextResponse.json({ competitors: data ?? [] });
}

/** Add one or more competitors: { domains: string[] } or { domain: string, name?: string }. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAgencyApi();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!UUID_PATTERN.test(id)) return error(400, "bad_request", "Choose a valid project.");

  let body: { domain?: unknown; domains?: unknown; name?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return error(400, "bad_request", "Invalid request.");
  }
  const inputs = Array.isArray(body.domains) ? body.domains : [body.domain];
  if (inputs.length === 0 || inputs.length > MAX_COMPETITORS || inputs.some((d) => typeof d !== "string")) {
    return error(400, "bad_request", "Enter one or more competitor websites.");
  }
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : null;

  const { supabase, project } = await findProject(session, id);
  if (!project) return error(404, "not_found", "That project isn't available.");

  const { data: existingRows, error: exErr } = await supabase.from("project_competitors").select("domain").eq("client_id", id);
  if (exErr) {
    if (isMissingTableError(exErr, "project_competitors")) return SETUP_REQUIRED();
    return error(500, "load_failed", "We couldn't save competitors. Please try again.");
  }

  const existing = ((existingRows ?? []) as { domain: string }[]).map((r) => r.domain);
  const toInsert: string[] = [];
  for (const raw of inputs as string[]) {
    const check = validateCompetitorDomain(raw, project.website, [...existing, ...toInsert]);
    if (!check.ok) return error(400, "invalid_domain", `${raw.trim() || "That website"}: ${check.message}`);
    toInsert.push(check.domain);
  }

  const { data, error: insErr } = await supabase
    .from("project_competitors")
    .insert(
      toInsert.map((domain) => ({
        agency_id: project.agency_id,
        client_id: id,
        domain,
        name: toInsert.length === 1 ? name : null,
        created_by: session.userId,
      })),
    )
    .select("id, domain, name, created_at");
  if (insErr) {
    if (isMissingTableError(insErr, "project_competitors")) return SETUP_REQUIRED();
    if (insErr.code === "23505") return error(409, "duplicate", "That competitor is already on the list.");
    if (insErr.code === "23514") return error(400, "limit", `You can add up to ${MAX_COMPETITORS} competitors.`);
    console.error("[competitors] insert failed", { code: insErr.code });
    return error(500, "save_failed", "We couldn't save competitors. Please try again.");
  }
  return NextResponse.json({ competitors: data ?? [] }, { status: 201 });
}
