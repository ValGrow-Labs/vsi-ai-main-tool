import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAgencyApi, type AgencySession } from "@/lib/auth";
import { UUID_PATTERN } from "@/lib/project-types";
import {
  runFullAnalysisPipeline,
  getFallbackJob,
  getFallbackJobForClient,
  setFallbackJob,
  isJobRunning,
  JOB_STALE_AFTER_MS,
  isMissingJobsTable,
  memoryJobStoreAllowed,
  claimJobStart,
  releaseJobStart,
  type AnalysisClientInput,
  type AnalysisJobRecord,
  type JobScope,
  type StageName,
  type StageStatus,
} from "@/lib/analysis-runner";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/*
 * Analysis jobs, one organization at a time.
 *
 * - Every request is authenticated (401 / 403 account_disabled / 403 no_organization).
 * - A project id or job id from the browser is never trusted: the project is looked up in the
 *   database with the caller's organization (platform admins: any) before anything is read,
 *   started or restarted. Another organization's project or job answers 404, exactly like one
 *   that doesn't exist, so ids can't be probed.
 * - Job rows come from analysis_jobs (migration 040). If that table is missing, local development
 *   uses a process-memory stand-in (also scoped by organization); production answers 503
 *   "setup required" instead, since a per-process store is neither shared nor durable.
 * - Only one job per project runs at a time: a second start or retry answers 409 already_running.
 */

type Supa = Awaited<ReturnType<typeof createClient>>;
type OwnedClient = AnalysisClientInput & { agency_id: string };

const CLIENT_COLUMNS = "id, agency_id, name, website, brand_name, default_location, industry, country";
/** Job ids we hand out: database UUIDs, local-development ids (job_...), and site-audit views (audit_<uuid>). */
const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

function errorResp(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: { code, message }, ...extra }, { status });
}

const notFound = (what = "Analysis job") => errorResp(404, "not_found", `${what} not found.`);
const setupRequired = () =>
  errorResp(503, "setup_required", "Analysis tracking needs a one-time database update (migration 040) before it can run.");
const serverError = (context: string, err: unknown) => {
  const e = err as { code?: string; message?: string } | null;
  console.error(`[jobs/analysis] ${context} failed`, { code: e?.code, message: e?.message });
  return errorResp(500, "server_error", "Something went wrong. Please try again.");
};
const alreadyRunning = (jobId: string | null) =>
  errorResp(409, "already_running", "An analysis is already running for this project.", { jobId });

function scopeOf(session: AgencySession): JobScope {
  return { agencyId: session.agencyId, isSuperAdmin: session.role === "super_admin" };
}

/** The project, read from the database, only if the caller's organization owns it (platform admins: any). */
async function findOwnedClient(
  supabase: Supa,
  session: AgencySession,
  clientId: string,
): Promise<{ client: OwnedClient | null; error: unknown }> {
  let q = supabase.from("clients").select(CLIENT_COLUMNS).eq("id", clientId);
  if (session.role !== "super_admin") q = q.eq("agency_id", session.agencyId);
  const { data, error } = await q.maybeSingle();
  return { client: (data as OwnedClient | null) ?? null, error };
}

const INITIAL_STATUSES: Record<StageName, StageStatus> = {
  website_analysis: "pending",
  seo_analysis: "pending",
  competitor_analysis: "pending",
  geo_analysis: "pending",
  results_prep: "pending",
};

/**
 * The job currently running for a project, if any. `tableMissing` is set when analysis_jobs does
 * not exist; `error` for any other database failure.
 */
async function findRunningJob(
  supabase: Supa,
  session: AgencySession,
  clientId: string,
): Promise<{ running: { id: string } | null; tableMissing: boolean; error: unknown }> {
  let q = supabase
    .from("analysis_jobs")
    .select("id, status, created_at, updated_at")
    .eq("client_id", clientId)
    .eq("status", "in_progress");
  if (session.role !== "super_admin") q = q.eq("agency_id", session.agencyId);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) {
    if (isMissingJobsTable(error)) {
      const mem = memoryJobStoreAllowed() ? getFallbackJobForClient(clientId, scopeOf(session)) : null;
      return { running: mem && isJobRunning(mem) ? { id: mem.id } : null, tableMissing: true, error: null };
    }
    return { running: null, tableMissing: false, error };
  }
  const row = data as Pick<AnalysisJobRecord, "id" | "status" | "created_at" | "updated_at"> | null;
  return { running: row && isJobRunning(row) ? { id: row.id } : null, tableMissing: false, error: null };
}

/** Create a job row (or, in local development without the table, a memory record) and start the pipeline. */
async function createAndStartJob(
  supabase: Supa,
  session: AgencySession,
  client: OwnedClient,
  tableMissing: boolean,
): Promise<Response> {
  const clientId = client.id;
  const agencyId = client.agency_id;
  let jobId: string | null = null;
  let useMemory = tableMissing;

  if (!tableMissing) {
    // Close runs that died without finishing, so they neither block this one nor linger as "running".
    await supabase
      .from("analysis_jobs")
      .update({ status: "failed", error_message: "The analysis stopped unexpectedly.", completed_at: new Date().toISOString() })
      .eq("client_id", clientId)
      .eq("status", "in_progress")
      .lt("updated_at", new Date(Date.now() - JOB_STALE_AFTER_MS).toISOString());

    const { data: jobRow, error: insertError } = await supabase
      .from("analysis_jobs")
      .insert({
        agency_id: agencyId,
        client_id: clientId,
        status: "in_progress",
        stage: "website_analysis",
        stage_statuses: INITIAL_STATUSES,
        requested_by: session.userId,
      })
      .select("id")
      .single();
    if (insertError || !jobRow) {
      if (isMissingJobsTable(insertError)) {
        useMemory = true;
      } else if ((insertError as { code?: string } | null)?.code === "23505") {
        // A database-level one-running-job-per-project rule, when present.
        return alreadyRunning(null);
      } else {
        return serverError("create job", insertError);
      }
    } else {
      jobId = jobRow.id as string;
    }
  }

  if (useMemory) {
    if (!memoryJobStoreAllowed()) return setupRequired();
    jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    setFallbackJob({
      id: jobId,
      agency_id: agencyId,
      client_id: clientId,
      status: "in_progress",
      stage: "website_analysis",
      stage_statuses: { ...INITIAL_STATUSES },
      error_message: null,
      stages_data: {},
      requested_by: session.userId,
      created_at: now,
      updated_at: now,
      completed_at: null,
    });
  }

  const startedId = jobId as string;
  after(async () => {
    await runFullAnalysisPipeline(startedId, clientId, agencyId, client);
  });
  return NextResponse.json({ jobId: startedId, status: "in_progress" }, { status: 202 });
}

async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body = (await req.json()) as unknown;
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** GET /api/jobs/analysis?job_id=... or ?client_id=... */
export async function GET(req: NextRequest) {
  const session = await requireAgencyApi();
  if (session instanceof Response) return session;

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("job_id");
  const clientId = searchParams.get("client_id");

  if (!jobId && !clientId) return errorResp(400, "bad_request", "Provide job_id or client_id");
  if (clientId && !UUID_PATTERN.test(clientId)) return errorResp(400, "bad_request", "Valid client_id required.");
  if (jobId && !JOB_ID_PATTERN.test(jobId)) return errorResp(400, "bad_request", "Valid job_id required.");

  const supabase = await createClient();
  const scope = scopeOf(session);

  // The project must be the caller's before anything about it is read.
  if (clientId) {
    const { client, error } = await findOwnedClient(supabase, session, clientId);
    if (error) return serverError("load project", error);
    if (!client) return notFound("Project");
  }

  // 1. The database.
  let tableMissing = false;
  if (!jobId || UUID_PATTERN.test(jobId)) {
    let query = supabase.from("analysis_jobs").select("*");
    if (jobId) query = query.eq("id", jobId);
    if (clientId) query = query.eq("client_id", clientId);
    if (!scope.isSuperAdmin) query = query.eq("agency_id", session.agencyId);
    if (!jobId) query = query.order("created_at", { ascending: false }).limit(1);

    const { data, error } = await query.maybeSingle();
    if (error) {
      if (!isMissingJobsTable(error)) return serverError("load job", error);
      tableMissing = true;
    } else if (data) {
      const job = data as AnalysisJobRecord;
      // Looked up by job id alone: its project must still be the caller's.
      if (!clientId) {
        const { client, error: cErr } = await findOwnedClient(supabase, session, job.client_id);
        if (cErr) return serverError("load project", cErr);
        if (!client) return notFound();
      }
      return NextResponse.json({ job });
    }
  }

  // 2. Local development without the analysis_jobs table: the memory store, scoped the same way.
  if (memoryJobStoreAllowed()) {
    const fallback = jobId ? getFallbackJob(jobId, scope) : clientId ? getFallbackJobForClient(clientId, scope) : null;
    if (fallback && (!clientId || fallback.client_id === clientId)) {
      if (!clientId) {
        const { client, error } = await findOwnedClient(supabase, session, fallback.client_id);
        if (error) return serverError("load project", error);
        if (!client) return notFound();
      }
      return NextResponse.json({ job: fallback });
    }
  }

  // 3. A project with no job record: show its latest site audit, if any.
  if (clientId && !jobId) {
    let auditQuery = supabase.from("site_audits").select("*").eq("client_id", clientId);
    if (!scope.isSuperAdmin) auditQuery = auditQuery.eq("agency_id", session.agencyId);
    const { data: latestAudit } = await auditQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();

    if (latestAudit) {
      const isFailed = latestAudit.status === "failed";
      const isRunning = latestAudit.status === "running";
      return NextResponse.json({
        job: {
          id: `audit_${latestAudit.id}`,
          agency_id: latestAudit.agency_id,
          client_id: clientId,
          status: isRunning ? "in_progress" : isFailed ? "failed" : "completed",
          stage: isRunning ? "website_analysis" : "completed",
          stage_statuses: {
            website_analysis: isRunning ? "in_progress" : isFailed ? "failed" : "completed",
            seo_analysis: isRunning ? "pending" : "completed",
            competitor_analysis: isRunning ? "pending" : "completed",
            geo_analysis: isRunning ? "pending" : "completed",
            results_prep: isRunning ? "pending" : isFailed ? "failed" : "completed",
          },
          error_message: isFailed ? latestAudit.error_message || "Audit failed" : null,
          stages_data: {
            website_analysis: {
              score: latestAudit.score,
              pagesScanned: latestAudit.pages_scanned,
            },
          },
          created_at: latestAudit.created_at,
          updated_at: latestAudit.completed_at || latestAudit.created_at,
          completed_at: latestAudit.completed_at,
        },
      });
    }
  }

  if (tableMissing && !memoryJobStoreAllowed()) return setupRequired();
  return notFound();
}

/** POST /api/jobs/analysis -> Create job and trigger background pipeline */
export async function POST(req: NextRequest) {
  const session = await requireAgencyApi();
  if (session instanceof Response) return session;

  const body = await readJson(req);
  if (!body) return errorResp(400, "bad_request", "Invalid request body.");
  const clientId = typeof body.client_id === "string" ? body.client_id : "";
  if (!clientId || !UUID_PATTERN.test(clientId)) {
    return errorResp(400, "bad_request", "Valid client_id required.");
  }

  const supabase = await createClient();
  const { client, error: clientError } = await findOwnedClient(supabase, session, clientId);
  if (clientError) return serverError("load project", clientError);
  if (!client) return notFound("Project");
  if (!client.website) return errorResp(400, "missing_website", "Website URL missing for this project.");

  if (!claimJobStart(clientId)) return alreadyRunning(null);
  try {
    const { running, tableMissing, error } = await findRunningJob(supabase, session, clientId);
    if (error) return serverError("check running job", error);
    if (running) return alreadyRunning(running.id);
    return await createAndStartJob(supabase, session, client, tableMissing);
  } finally {
    releaseJobStart(clientId);
  }
}

/** PATCH /api/jobs/analysis -> Retry analysis job */
export async function PATCH(req: NextRequest) {
  const session = await requireAgencyApi();
  if (session instanceof Response) return session;

  const body = await readJson(req);
  if (!body) return errorResp(400, "bad_request", "Invalid request body.");
  const jobId = typeof body.job_id === "string" ? body.job_id : "";
  const clientId = typeof body.client_id === "string" ? body.client_id : "";
  if (!clientId || !UUID_PATTERN.test(clientId)) return errorResp(400, "bad_request", "client_id required.");
  if (jobId && !JOB_ID_PATTERN.test(jobId)) return errorResp(400, "bad_request", "Valid job_id required.");

  const supabase = await createClient();
  const { client, error: clientError } = await findOwnedClient(supabase, session, clientId);
  if (clientError) return serverError("load project", clientError);
  if (!client) return notFound("Project");
  if (!client.website) return errorResp(400, "missing_website", "Website URL missing for this project.");

  if (!claimJobStart(clientId)) return alreadyRunning(null);
  try {
    const { running, tableMissing, error } = await findRunningJob(supabase, session, clientId);
    if (error) return serverError("check running job", error);
    if (running) return alreadyRunning(running.id);

    const scope = scopeOf(session);
    const agencyId = client.agency_id;
    const now = new Date().toISOString();

    // Restart an existing database job: only that project's, in the caller's organization.
    if (jobId && UUID_PATTERN.test(jobId) && !tableMissing) {
      let q = supabase
        .from("analysis_jobs")
        .update({
          status: "in_progress",
          stage: "website_analysis",
          stage_statuses: INITIAL_STATUSES,
          error_message: null,
          completed_at: null,
          updated_at: now,
        })
        .eq("id", jobId)
        .eq("client_id", clientId);
      if (!scope.isSuperAdmin) q = q.eq("agency_id", session.agencyId);
      const { data: updated, error: upErr } = await q.select("id");
      if (upErr) return serverError("restart job", upErr);
      if (!updated || updated.length === 0) return notFound();
      after(async () => {
        await runFullAnalysisPipeline(jobId, clientId, agencyId, client);
      });
      return NextResponse.json({ jobId, status: "in_progress" }, { status: 200 });
    }

    // Restart a local-development memory job: only if it is this project's and the caller's.
    if (jobId.startsWith("job_")) {
      const existing = memoryJobStoreAllowed() ? getFallbackJob(jobId, scope) : null;
      if (!existing || existing.client_id !== clientId) return notFound();
      setFallbackJob({
        ...existing,
        status: "in_progress",
        stage: "website_analysis",
        stage_statuses: { ...INITIAL_STATUSES },
        error_message: null,
        stages_data: {},
        requested_by: session.userId,
        updated_at: now,
        completed_at: null,
      });
      after(async () => {
        await runFullAnalysisPipeline(jobId, clientId, agencyId, client);
      });
      return NextResponse.json({ jobId, status: "in_progress" }, { status: 200 });
    }

    // No job id, or a site-audit view (audit_<id>) or a database id while the table is missing:
    // start a fresh job for the project.
    if (jobId && !jobId.startsWith("audit_") && !(UUID_PATTERN.test(jobId) && tableMissing)) return notFound();
    return await createAndStartJob(supabase, session, client, tableMissing);
  } finally {
    releaseJobStart(clientId);
  }
}
