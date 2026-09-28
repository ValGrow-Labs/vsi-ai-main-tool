import { createClient } from "@/lib/supabase/server";
import { runSiteAudit } from "@/lib/site-audit/run";
import { isAuditProblem } from "@/lib/site-audit/checks";
import { auditRowUpdate } from "@/lib/site-audit/store";
import { runKeywordsForClient, type TrackedKeyword } from "@/lib/run-pipeline";
import { isProviderUnavailable, serpApiKey, serperKey } from "@/lib/provider-status";
import { logProviderError, safeProviderMessage } from "@/lib/provider-response";
import type { Location, TrackType } from "@/types/search";

export type StageName =
  | "website_analysis"
  | "seo_analysis"
  | "competitor_analysis"
  | "geo_analysis"
  | "results_prep";

export type StageStatus = "pending" | "in_progress" | "completed" | "failed" | "unconfigured";

export interface AnalysisJobRecord {
  id: string;
  agency_id: string;
  client_id: string;
  status: "in_progress" | "completed" | "failed";
  stage: StageName | "completed";
  stage_statuses: Record<StageName, StageStatus>;
  error_message: string | null;
  stages_data: Record<string, unknown>;
  /** Who started the job (analysis_jobs.requested_by). */
  requested_by?: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** Who is asking for a job. A job is only ever handed to its own organization (or a platform admin). */
export interface JobScope {
  agencyId: string;
  isSuperAdmin: boolean;
}

function inScope(job: AnalysisJobRecord, scope: JobScope): boolean {
  return scope.isSuperAdmin || job.agency_id === scope.agencyId;
}

/**
 * A job still "in progress" after this long is treated as dead (the process that ran it is gone:
 * maxDuration is 300s), so it no longer blocks a new run.
 */
export const JOB_STALE_AFTER_MS = 10 * 60 * 1000;

export function isJobRunning(job: Pick<AnalysisJobRecord, "status" | "updated_at" | "created_at">, now = Date.now()): boolean {
  if (job.status !== "in_progress") return false;
  const last = Date.parse(job.updated_at || job.created_at);
  return Number.isFinite(last) && now - last < JOB_STALE_AFTER_MS;
}

/**
 * Text stored in analysis_jobs / site_audits for a thrown error. Those columns are returned to the
 * project's organization (GET /api/jobs/analysis, the overview), so they only ever hold fixed
 * wording: a provider failure gets its standard message, anything else the caller's fallback. The raw
 * error (which can carry provider URLs with api_key, SQL or stack detail) is logged server-side only.
 */
export function publicJobError(err: unknown, fallback: string): string {
  return isProviderUnavailable(err) ? safeProviderMessage(err) : fallback;
}

/** The analysis_jobs table is missing (migration 040 not applied). */
export function isMissingJobsTable(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "42P01" || err.code === "PGRST205") return true;
  const msg = err.message ?? "";
  return msg.includes("analysis_jobs") && /does not exist|schema cache|could not find/i.test(msg);
}

/**
 * The in-memory job store is a local-development stand-in for the analysis_jobs table. It is
 * process-global (not shared between server instances, lost on restart), so it is never used in
 * production: there a missing table is reported as 503 "setup required" instead.
 */
export function memoryJobStoreAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}

/** In-memory job state for local development when the analysis_jobs migration is pending. */
const fallbackJobStore = new Map<string, AnalysisJobRecord>();
const clientToJobStore = new Map<string, string>();

/** A fallback job, only if it belongs to the caller's organization (platform admins: any). */
export function getFallbackJob(jobId: string, scope: JobScope): AnalysisJobRecord | null {
  const job = fallbackJobStore.get(jobId) ?? null;
  return job && inScope(job, scope) ? job : null;
}

/** The latest fallback job for a project, only if it belongs to the caller's organization. */
export function getFallbackJobForClient(clientId: string, scope: JobScope): AnalysisJobRecord | null {
  const jobId = clientToJobStore.get(clientId);
  const job = jobId ? fallbackJobStore.get(jobId) ?? null : null;
  if (job && job.client_id === clientId) return inScope(job, scope) ? job : null;
  for (const j of Array.from(fallbackJobStore.values()).reverse()) {
    if (j.client_id === clientId) return inScope(j, scope) ? j : null;
  }
  return null;
}

export function setFallbackJob(job: AnalysisJobRecord): void {
  fallbackJobStore.set(job.id, job);
  clientToJobStore.set(job.client_id, job.id);
}

/** Tests only. */
export function resetFallbackJobStore(): void {
  fallbackJobStore.clear();
  clientToJobStore.clear();
}

/**
 * Projects whose job is being created right now in this process. Closes the gap between "no job
 * is running" and the new row existing, for two requests in the same process. Across server
 * instances only a database constraint can do that (see the partial unique index requested for
 * analysis_jobs).
 */
const startingClients = new Set<string>();

export function claimJobStart(clientId: string): boolean {
  if (startingClients.has(clientId)) return false;
  startingClients.add(clientId);
  return true;
}

export function releaseJobStart(clientId: string): void {
  startingClients.delete(clientId);
}

export async function updateJobStage(
  jobId: string,
  stageName: StageName,
  stageStatus: StageStatus,
  nextStage?: StageName | "completed",
  stageData?: Record<string, unknown>,
  errorMessage?: string
) {
  // Update in-memory fallback store first
  const fallback = fallbackJobStore.get(jobId);
  if (fallback) {
    fallback.stage_statuses[stageName] = stageStatus;
    if (stageData) fallback.stages_data[stageName] = stageData;
    if (nextStage) fallback.stage = nextStage;
    if (errorMessage) fallback.error_message = errorMessage;
    if (nextStage === "completed") {
      fallback.status = Object.values(fallback.stage_statuses).includes("failed") || stageStatus === "failed" ? "failed" : "completed";
      fallback.completed_at = new Date().toISOString();
    }
    fallback.updated_at = new Date().toISOString();
    fallbackJobStore.set(jobId, fallback);
  }

  try {
    const supabase = await createClient();
    const { data: job } = await supabase
      .from("analysis_jobs")
      .select("stage_statuses, stages_data")
      .eq("id", jobId)
      .maybeSingle();

    if (job) {
      const currentStatuses = (job.stage_statuses as Record<StageName, StageStatus>) || {};
      const currentData = (job.stages_data as Record<string, unknown>) || {};
      currentStatuses[stageName] = stageStatus;
      if (stageData) currentData[stageName] = stageData;

      const updates: Record<string, unknown> = {
        stage_statuses: currentStatuses,
        stages_data: currentData,
        updated_at: new Date().toISOString(),
      };
      if (nextStage) updates.stage = nextStage;
      if (stageStatus === "failed" && errorMessage) updates.error_message = errorMessage;
      if (nextStage === "completed") {
        updates.status = Object.values(currentStatuses).includes("failed") ? "failed" : "completed";
        updates.completed_at = new Date().toISOString();
      }
      await supabase.from("analysis_jobs").update(updates).eq("id", jobId);
    }
  } catch (dbErr) {
    // Non-fatal if table does not exist
  }
}


export interface AnalysisClientInput {
  id: string;
  name?: string | null;
  website: string;
  brand_name?: string | null;
  default_location?: string | null;
  industry?: string | null;
  country?: string | null;
  language?: string | null;
}

export async function runFullAnalysisPipeline(
  jobId: string,
  clientId: string,
  agencyId: string,
  initialClient?: AnalysisClientInput | null
) {
  let supabase: Awaited<ReturnType<typeof createClient>> | null = null;
  try {
    supabase = await createClient();
  } catch {
    // createClient may fail in background after() without active cookies
  }

  try {
    let client: AnalysisClientInput | null = initialClient || null;

    if (!client && supabase) {
      const { data: dbClient } = await supabase
        .from("clients")
        .select("id, name, website, brand_name, default_location, industry, country")
        .eq("id", clientId)
        .maybeSingle();
      if (dbClient) {
        client = dbClient as AnalysisClientInput;
      }
    }

    if (!client || !client.website) {
      await updateJobStage(
        jobId,
        "website_analysis",
        "failed",
        "completed",
        undefined,
        "Website URL missing for project."
      );
      return;
    }

    const domain = client.website.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
    const brandName = client.brand_name || client.name || domain;
    // No invented market: without a project location the checks can't run.
    const locationCode = (client.default_location || null) as Location | null;

    // Fetch tracked keywords for SEO setup & checks
    let keywords: Array<{ id: string; keyword: string; domain?: string | null; brand?: string | null; location?: string | null; track_type?: string | null }> = [];
    if (supabase) {
      try {
        const { data: kwRows } = await supabase
          .from("tracked_keywords")
          .select("id, keyword, domain, brand, location, track_type")
          .eq("client_id", clientId)
          .eq("is_active", true);
        if (kwRows) keywords = kwRows;
      } catch {
        // non-fatal
      }
    }

    // ─────────────────────────────────────────
    // STAGE 1: WEBSITE ANALYSIS (site audit)
    // ─────────────────────────────────────────
    await updateJobStage(jobId, "website_analysis", "in_progress", "website_analysis");
    await runAuditStage(jobId, supabase, { agencyId, clientId, website: client.website, domain, keywords: keywords.map((k) => k.keyword), client });

    // ─────────────────────────────────────────
    // STAGES 2 + 4: GOOGLE RANKS AND AI ANSWERS
    // The same pipeline as "Run checks": one row per search, real provider
    // data only, failed checks recorded as failed (never as "not ranking" or
    // "not mentioned"), and each AI engine stored only from its own provider.
    // ─────────────────────────────────────────
    await updateJobStage(jobId, "seo_analysis", "in_progress", "seo_analysis");

    const searchConfigured = !!(serpApiKey() || serperKey());
    let run: Awaited<ReturnType<typeof runKeywordsForClient>> | null = null;
    let runError: string | null = null;

    if (keywords.length > 0 && searchConfigured && supabase) {
      try {
        const { data: toggles } = await supabase
          .from("clients")
          .select("rank_tracking_enabled, ai_mode_enabled, ai_overview_enabled, chatgpt_enabled")
          .eq("id", clientId)
          .maybeSingle();
        const tracked: TrackedKeyword[] = [];
        for (const k of keywords) {
          const location = (k.location || locationCode) as Location | null;
          if (!location) continue; // no market chosen for this search: not checked
          tracked.push({
            id: k.id,
            keyword: k.keyword,
            domain: k.domain || domain,
            brand: k.brand || brandName,
            location,
            track_type: (k.track_type || "both") as TrackType,
            client_id: clientId,
          });
        }
        run = await runKeywordsForClient({
          agencyId,
          clientId,
          client: {
            rank_tracking_enabled: toggles?.rank_tracking_enabled ?? null,
            ai_mode_enabled: toggles?.ai_mode_enabled ?? null,
            ai_overview_enabled: toggles?.ai_overview_enabled ?? null,
            chatgpt_enabled: toggles?.chatgpt_enabled ?? null,
          },
          keywords: tracked,
        });
      } catch (err) {
        logProviderError("analysis keyword checks", err);
        runError = publicJobError(err, "The checks couldn't be run.");
      }
    }

    const runSummary = run
      ? {
          totalKeywords: keywords.length,
          checked: run.total,
          saved: run.completed,
          failed: run.failed,
          notCheckedNoLocation: keywords.length - run.total,
          failures: run.results.filter((r) => r.error).map((r) => ({ keyword: r.keyword, error: r.error })),
        }
      : { totalKeywords: keywords.length, isSearchConfigured: searchConfigured, error: runError };

    // A stage is "failed" when checks were attempted and none produced a stored result.
    const runStatus: StageStatus = !searchConfigured
      ? "unconfigured"
      : runError || (run && run.total > 0 && run.completed === 0)
        ? "failed"
        : "completed";

    await updateJobStage(
      jobId,
      "seo_analysis",
      runStatus,
      "competitor_analysis",
      runSummary,
      runStatus === "failed" ? runError ?? "None of the Google checks could be completed." : undefined,
    );

    // ─────────────────────────────────────────
    // STAGE 3: COMPETITORS (the project's own list; nothing is generated)
    // ─────────────────────────────────────────
    await updateJobStage(jobId, "competitor_analysis", "in_progress", "competitor_analysis");

    let competitorDomains: string[] = [];
    if (supabase) {
      try {
        const { data: compRows } = await supabase
          .from("project_competitors")
          .select("domain")
          .eq("client_id", clientId);
        competitorDomains = (compRows ?? []).map((c: { domain: string }) => c.domain);
      } catch {
        // non-fatal
      }
    }

    await updateJobStage(jobId, "competitor_analysis", "completed", "geo_analysis", {
      totalCompetitors: competitorDomains.length,
      competitorDomains,
    });

    // STAGE 4 ran together with stage 2 (one pipeline, one row per search).
    await updateJobStage(jobId, "geo_analysis", runStatus, "results_prep", runSummary);

    // ─────────────────────────────────────────
    // STAGE 5: RESULTS
    // ─────────────────────────────────────────
    await updateJobStage(jobId, "results_prep", "in_progress", "results_prep");
    await updateJobStage(jobId, "results_prep", "completed", "completed", {
      summary:
        runStatus === "completed"
          ? "Checks finished. Results are on the Search and AI Visibility pages."
          : runStatus === "unconfigured"
            ? "Google and AI checks weren't run: no search provider is configured."
            : "Some checks couldn't be completed.",
    });
  } catch (err) {
    console.error("[analysis-runner] critical error:", err);
    await updateJobStage(
      jobId,
      "results_prep",
      "failed",
      "completed",
      undefined,
      publicJobError(err, "An unexpected error occurred during analysis.")
    );
  }
}

/**
 * Stage 1: site audit. Stores the audit only as what it really is — a failed
 * audit is stored as failed with its reason, never as a completed score.
 */
async function runAuditStage(
  jobId: string,
  supabase: Awaited<ReturnType<typeof createClient>> | null,
  ctx: { agencyId: string; clientId: string; website: string; domain: string; keywords: string[]; client: AnalysisClientInput },
) {
  try {
    const seoSetup = {
      trackedKeywords: ctx.keywords,
      targetCountry: ctx.client.country || ctx.client.default_location,
      targetLanguage: ctx.client.language || null,
    };

    const auditOutcome = await runSiteAudit(ctx.website, seoSetup);
    // An unreachable site comes back as status "failed" (no score, no checks):
    // it's stored as a failed audit, never as a completed one.
    const auditFailed = auditOutcome.status === "failed";
    const failureMessage = auditOutcome.failure?.message ?? "We couldn't load any pages from the website.";

    if (supabase) {
      const { error } = await supabase
        .from("site_audits")
        .insert({ agency_id: ctx.agencyId, client_id: ctx.clientId, ...auditRowUpdate(auditOutcome) });
      if (error) console.error("[analysis-runner] site audit save failed:", error.message);
    }

    await updateJobStage(
      jobId,
      "website_analysis",
      auditFailed ? "failed" : "completed",
      "seo_analysis",
      auditFailed
        ? { error: failureMessage, auditStatus: auditOutcome.status }
        : {
            auditStatus: auditOutcome.status,
            score: auditOutcome.score,
            pagesScanned: auditOutcome.coverage.pagesLoaded,
            issuesFound: auditOutcome.checks.filter(isAuditProblem).length,
          },
      auditFailed ? failureMessage : undefined,
    );
  } catch (err) {
    const errMsg = publicJobError(err, "Website analysis failed.");
    console.error("[analysis-runner] website analysis error:", err);
    if (supabase) {
      const { error } = await supabase.from("site_audits").insert({
        agency_id: ctx.agencyId,
        client_id: ctx.clientId,
        domain: ctx.domain,
        status: "failed",
        error_message: errMsg,
        completed_at: new Date().toISOString(),
      });
      if (error) console.error("[analysis-runner] site audit save failed:", error.message);
    }
    await updateJobStage(jobId, "website_analysis", "failed", "seo_analysis", { error: errMsg }, errMsg);
  }
}

