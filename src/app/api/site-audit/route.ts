import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAgencyApi } from "@/lib/auth";
import { UUID_PATTERN } from "@/lib/project-types";
import { runSiteAudit, SiteAuditError } from "@/lib/site-audit/run";
import { auditRowUpdate, isMissingTableError } from "@/lib/site-audit/store";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** A run older than this is assumed to have died (server restart) and is closed. */
const STALE_AFTER_MS = 15 * 60 * 1000;

function error(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** Start a site audit for a project. Returns immediately; the audit runs in the background. */
export async function POST(req: NextRequest) {
  const session = await requireAgencyApi();
  if (session instanceof Response) return session;

  let clientId: unknown;
  try {
    ({ client_id: clientId } = (await req.json()) as { client_id?: unknown });
  } catch {
    return error(400, "bad_request", "Invalid request.");
  }
  if (typeof clientId !== "string" || !UUID_PATTERN.test(clientId)) {
    return error(400, "bad_request", "Choose a project first.");
  }

  const supabase = await createClient();
  let clientQuery = supabase
    .from("clients")
    .select("id, agency_id, website, country, default_location")
    .eq("id", clientId);
  if (session.role !== "super_admin") clientQuery = clientQuery.eq("agency_id", session.agencyId);
  const { data: client } = await clientQuery.maybeSingle();
  if (!client) return error(404, "not_found", "That project isn't available.");
  if (!client.website) return error(400, "missing_website", "Add your website address in project settings first.");

  const { data: kwRows } = await supabase
    .from("tracked_keywords")
    .select("keyword")
    .eq("client_id", clientId)
    .eq("is_active", true);

  const seoSetup = {
    trackedKeywords: (kwRows || []).map((k) => k.keyword),
    targetCountry: client.country || client.default_location,
    targetLanguage: (client as { language?: string | null }).language || null,
  };

  await supabase
    .from("site_audits")
    .update({ status: "failed", error_message: "The audit stopped unexpectedly.", completed_at: new Date().toISOString() })
    .eq("client_id", clientId)
    .eq("status", "running")
    .lt("created_at", new Date(Date.now() - STALE_AFTER_MS).toISOString());

  const { data: row, error: insertError } = await supabase
    .from("site_audits")
    .insert({
      agency_id: client.agency_id,
      client_id: clientId,
      domain: client.website,
      status: "running",
      requested_by: session.userId,
    })
    .select("id")
    .single();

  if (insertError || !row) {
    if (isMissingTableError(insertError)) {
      return error(503, "setup_required", "Site Audit needs a one-time database update before it can run.");
    }
    if (insertError?.code === "23505") {
      return error(409, "already_running", "An audit is already running for this project.");
    }
    console.error("[site-audit] could not start", { code: insertError?.code });
    return error(500, "start_failed", "We couldn't start the audit. Please try again.");
  }

  const auditId = row.id as string;
  const website = client.website as string;

  after(async () => {
    const supa = await createClient();
    let update: Record<string, unknown>;
    try {
      const outcome = await runSiteAudit(website, seoSetup);
      // Failed audits (no page loaded) are stored as "failed" with the reason, never with a score.
      update = auditRowUpdate(outcome);
    } catch (e) {
      const message = e instanceof SiteAuditError ? e.message : "The audit couldn't finish. Please try again.";
      if (!(e instanceof SiteAuditError)) console.error("[site-audit] run failed", e);
      update = { status: "failed", error_message: message, score: null, completed_at: new Date().toISOString() };
    }

    const { error: saveError } = await supa.from("site_audits").update(update).eq("id", auditId);
    if (!saveError) return;

    // The result couldn't be saved. Retry once with the smallest possible
    // failed-state update so the row never stays "running" forever.
    console.error("[site-audit] could not save result", { auditId, code: saveError.code, message: saveError.message });
    const { error: retryError } = await supa
      .from("site_audits")
      .update({
        status: "failed",
        error_message: "The audit finished but its results couldn't be saved. Please run it again.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", auditId);
    if (retryError) {
      console.error("[site-audit] could not mark run as failed", { auditId, code: retryError.code, message: retryError.message });
    }
  });

  return NextResponse.json({ id: auditId, status: "running" }, { status: 202 });
}
