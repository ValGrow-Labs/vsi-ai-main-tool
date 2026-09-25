import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAgency } from "@/lib/auth";
import { UUID_PATTERN } from "@/lib/project-types";
import {
  runFullAnalysisPipeline,
  getFallbackJob,
  getFallbackJobForClient,
  setFallbackJob,
  type AnalysisJobRecord,
  type StageName,
  type StageStatus,
} from "@/lib/analysis-runner";



export const maxDuration = 300;
export const dynamic = "force-dynamic";

function errorResp(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** GET /api/jobs/analysis?job_id=... or ?client_id=... */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("job_id");
  const clientId = searchParams.get("client_id");

  if (!jobId && !clientId) {
    return errorResp(400, "bad_request", "Provide job_id or client_id");
  }

  const supabase = await createClient();
  const session = await requireAgency();
  const isSuperAdmin = session.role === "super_admin";

  let query = supabase.from("analysis_jobs").select("*");
  if (jobId) {
    query = query.eq("id", jobId);
  } else if (clientId) {
    query = query.eq("client_id", clientId).order("created_at", { ascending: false }).limit(1);
  }

  if (!isSuperAdmin && session.agencyId && session.agencyId !== "00000000-0000-0000-0000-000000000000") {
    query = query.eq("agency_id", session.agencyId);
  }

  const { data, error } = await query.maybeSingle();

  if (data) {
    return NextResponse.json({ job: data });
  }

  // Check fallback store if DB row not found
  if (jobId) {
    const fallback = getFallbackJob(jobId);
    if (fallback) {
      return NextResponse.json({ job: fallback });
    }
  }

  if (clientId) {
    const fallback = getFallbackJobForClient(clientId);
    if (fallback) {
      return NextResponse.json({ job: fallback });
    }

    // Check if site_audits has a recorded run for this client
    let auditQuery = supabase
      .from("site_audits")
      .select("*")
      .eq("client_id", clientId);

    if (!isSuperAdmin) {
      auditQuery = auditQuery.eq("agency_id", session.agencyId);
    }

    const { data: latestAudit } = await auditQuery
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

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
          error_message: isFailed ? (latestAudit.error_message || "Audit failed") : null,
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

  return errorResp(404, "not_found", "Analysis job not found.");
}


/** POST /api/jobs/analysis -> Create job and trigger background pipeline */
export async function POST(req: NextRequest) {
  const session = await requireAgency();

  let body: { client_id?: unknown };
  try {
    body = (await req.json()) as { client_id?: unknown };
  } catch {
    return errorResp(400, "bad_request", "Invalid request body.");
  }

  const clientId = typeof body.client_id === "string" ? body.client_id : "";
  if (!clientId || !UUID_PATTERN.test(clientId)) {
    return errorResp(400, "bad_request", "Valid client_id required.");
  }

  const supabase = await createClient();
  let clientQuery = supabase
    .from("clients")
    .select("id, agency_id, name, website, brand_name, default_location, industry, country")
    .eq("id", clientId);
  if (session.role !== "super_admin" && session.agencyId && session.agencyId !== "00000000-0000-0000-0000-000000000000") {
    clientQuery = clientQuery.eq("agency_id", session.agencyId);
  }
  const { data: client, error: clientError } = await clientQuery.maybeSingle();

  if (!client) {
    return errorResp(404, "not_found", "Project not found.");
  }
  if (!client.website) {
    return errorResp(400, "missing_website", "Website URL missing for this project.");
  }

  const agencyId = client.agency_id as string;
  const initialStatuses: Record<StageName, StageStatus> = {
    website_analysis: "pending",
    seo_analysis: "pending",
    competitor_analysis: "pending",
    geo_analysis: "pending",
    results_prep: "pending",
  };


  const { data: jobRow, error: insertError } = await supabase
    .from("analysis_jobs")
    .insert({
      agency_id: agencyId,
      client_id: clientId,
      status: "in_progress",
      stage: "website_analysis",
      stage_statuses: initialStatuses,
      requested_by: session.userId,
    })
    .select("id")
    .single();

  let jobId: string;

  if (insertError || !jobRow) {
    // If table doesn't exist yet in remote Supabase, use generated fallback UUID
    jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const fallbackRecord: AnalysisJobRecord = {
      id: jobId,
      agency_id: agencyId,
      client_id: clientId,
      status: "in_progress",
      stage: "website_analysis",
      stage_statuses: initialStatuses as Record<string, any>,
      error_message: null,
      stages_data: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      completed_at: null,
    };
    setFallbackJob(fallbackRecord);
  } else {
    jobId = jobRow.id as string;
  }

  // Run background analysis asynchronously with pre-fetched client data
  after(async () => {
    await runFullAnalysisPipeline(jobId, clientId, agencyId, client);
  });

  return NextResponse.json({ jobId, status: "in_progress" }, { status: 202 });
}

/** PATCH /api/jobs/analysis -> Retry analysis job */
export async function PATCH(req: NextRequest) {
  const session = await requireAgency();
  let body: { job_id?: unknown; client_id?: unknown };
  try {
    body = (await req.json()) as { job_id?: unknown; client_id?: unknown };
  } catch {
    return errorResp(400, "bad_request", "Invalid request body.");
  }

  const jobId = typeof body.job_id === "string" ? body.job_id : "";
  const clientId = typeof body.client_id === "string" ? body.client_id : "";

  if (!clientId) {
    return errorResp(400, "bad_request", "client_id required.");
  }

  const supabase = await createClient();
  const { data: client } = await supabase
    .from("clients")
    .select("id, agency_id, name, website, brand_name, default_location, industry, country")
    .eq("id", clientId)
    .single();

  if (!client) {
    return errorResp(404, "not_found", "Project not found.");
  }

  const agencyId = client.agency_id as string;
  const newJobId = jobId || `job_retry_${Date.now()}`;

  // Reset job stage to in_progress
  const initialStatuses: Record<StageName, StageStatus> = {
    website_analysis: "pending",
    seo_analysis: "pending",
    competitor_analysis: "pending",
    geo_analysis: "pending",
    results_prep: "pending",
  };


  await supabase
    .from("analysis_jobs")
    .update({
      status: "in_progress",
      stage: "website_analysis",
      stage_statuses: initialStatuses,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", newJobId);

  const fallbackRecord: AnalysisJobRecord = {
    id: newJobId,
    agency_id: agencyId,
    client_id: clientId,
    status: "in_progress",
    stage: "website_analysis",
    stage_statuses: initialStatuses,
    error_message: null,
    stages_data: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    completed_at: null,
  };
  setFallbackJob(fallbackRecord);

  after(async () => {
    await runFullAnalysisPipeline(newJobId, clientId, agencyId, client);
  });

  return NextResponse.json({ jobId: newJobId, status: "in_progress" }, { status: 200 });
}

