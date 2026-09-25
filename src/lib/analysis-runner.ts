import { createClient } from "@/lib/supabase/server";
import { runSiteAudit } from "@/lib/site-audit/run";
import { getSearchProvider, getAIProvider, calculateVisibilityMetrics, generateDataDrivenRecommendations, type SearchQueryResult, type AIResponseResult, type TechnicalSeoIssue } from "@/lib/providers";
import type { Location } from "@/types/search";

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
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

/** In-memory job state cache for fallback when DB table migration is pending */
const fallbackJobStore = new Map<string, AnalysisJobRecord>();
const clientToJobStore = new Map<string, string>();

export function getFallbackJob(jobId: string): AnalysisJobRecord | null {
  return fallbackJobStore.get(jobId) ?? null;
}

export function getFallbackJobForClient(clientId: string): AnalysisJobRecord | null {
  const jobId = clientToJobStore.get(clientId);
  if (jobId) {
    const job = fallbackJobStore.get(jobId);
    if (job) return job;
  }
  for (const job of Array.from(fallbackJobStore.values()).reverse()) {
    if (job.client_id === clientId) return job;
  }
  return null;
}

export function setFallbackJob(job: AnalysisJobRecord): void {
  fallbackJobStore.set(job.id, job);
  clientToJobStore.set(job.client_id, job.id);
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
      fallback.status = stageStatus === "failed" ? "failed" : "completed";
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
        updates.status = stageStatus === "failed" ? "failed" : "completed";
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
    const locationCode = (client.default_location || "us") as Location;

    const technicalIssues: TechnicalSeoIssue[] = [];
    const searchResults: SearchQueryResult[] = [];
    const aiResults: AIResponseResult[] = [];

    // Fetch tracked keywords for SEO setup & audit
    let keywords: Array<{ id: string; keyword: string; domain?: string; brand?: string; location?: string; track_type?: string }> = [];
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
    // STAGE 1: WEBSITE ANALYSIS
    // ─────────────────────────────────────────
    await updateJobStage(jobId, "website_analysis", "in_progress", "website_analysis");
    try {
      const seoSetup = {
        trackedKeywords: keywords.map((k) => k.keyword),
        targetCountry: client.country || client.default_location,
        targetLanguage: (client as { language?: string | null }).language || null,
      };

      const auditOutcome = await runSiteAudit(client.website, seoSetup);

      // Collect technical SEO issues with evidence
      for (const check of auditOutcome.checks) {
        if (check.status !== "pass") {
          technicalIssues.push({
            checkId: check.id,
            title: `Check: ${check.id.replace(/_/g, " ").toUpperCase()}`,
            severity: check.status === "fail" ? "critical" : "warning",
            description: `${check.count} issue(s) detected during technical audit.`,
            affectedCount: check.count,
            affectedUrls: check.affected || [],
            recommendation: `Review and address ${check.id.replace(/_/g, " ")} on affected pages.`,
          });
        }
      }

      if (supabase) {
        try {
          await supabase.from("site_audits").insert({
            agency_id: agencyId,
            client_id: clientId,
            domain: auditOutcome.domain || domain,
            status: "completed",
            score: auditOutcome.score,
            pages_scanned: auditOutcome.pages.length,
            checks: auditOutcome.checks,
            pages: auditOutcome.pages.map(({ internalLinks, ...rest }) => ({ ...rest, linkCount: internalLinks.length })),
            completed_at: new Date().toISOString(),
          });
        } catch {
          // ignore DB error
        }
      }

      await updateJobStage(
        jobId,
        "website_analysis",
        "completed",
        "seo_analysis",
        { score: auditOutcome.score, pagesScanned: auditOutcome.pages.length, issuesFound: technicalIssues.length }
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Website analysis failed.";
      console.error("[analysis-runner] website analysis error:", err);

      if (supabase) {
        try {
          await supabase.from("site_audits").insert({
            agency_id: agencyId,
            client_id: clientId,
            domain: domain,
            status: "failed",
            error_message: errMsg,
            completed_at: new Date().toISOString(),
          });
        } catch {
          // ignore DB error
        }
      }

      await updateJobStage(
        jobId,
        "website_analysis",
        "failed",
        "seo_analysis",
        { error: errMsg },
        errMsg
      );
    }

    // ─────────────────────────────────────────
    // STAGE 2: SEO / SEARCH VISIBILITY ANALYSIS
    // ─────────────────────────────────────────
    await updateJobStage(jobId, "seo_analysis", "in_progress", "seo_analysis");

    const searchProvider = getSearchProvider();
    const isSearchConfigured = searchProvider.isConfigured();

    if (keywords.length > 0 && isSearchConfigured) {
      for (const kw of keywords) {
        try {
          const res = await searchProvider.search(kw.keyword, kw.location || locationCode, domain, kw.brand || brandName);
          searchResults.push(res);

          // Save snapshot to search_results table
          if (supabase) {
            try {
              await supabase.from("search_results").insert({
                agency_id: agencyId,
                client_id: clientId,
                tracked_keyword_id: kw.id,
                keyword: kw.keyword,
                domain: domain,
                brand: kw.brand || brandName,
                location: kw.location || locationCode,
                track_type: kw.track_type || "both",
                rank_position: res.rankingPosition,
                rank_url: res.rankingUrl,
                rank_title: res.rankingTitle,
                serp_features: res.serpFeatures,
                serp_results_json: res.organicResults,
              });
            } catch {
              // ignore DB insert error
            }
          }
        } catch {
          // Continue with next keyword
        }
      }

      await updateJobStage(
        jobId,
        "seo_analysis",
        "completed",
        "competitor_analysis",
        {
          totalKeywords: keywords.length,
          providerUsed: searchProvider.name,
          isSearchConfigured: true,
        }
      );
    } else {
      await updateJobStage(
        jobId,
        "seo_analysis",
        isSearchConfigured ? "completed" : "unconfigured",
        "competitor_analysis",
        {
          totalKeywords: keywords.length,
          providerUsed: searchProvider.name,
          isSearchConfigured,
        }
      );
    }


    // ─────────────────────────────────────────
    // STAGE 3: COMPETITOR ANALYSIS
    // ─────────────────────────────────────────
    await updateJobStage(jobId, "competitor_analysis", "in_progress", "competitor_analysis");

    let competitors: Array<{ domain: string; name?: string }> = [];
    if (supabase) {
      try {
        const { data: compRows } = await supabase
          .from("project_competitors")
          .select("domain, name")
          .eq("client_id", clientId);
        if (compRows) competitors = compRows;
      } catch {
        // non-fatal
      }
    }

    const competitorDomains = competitors.map((c) => c.domain);

    await updateJobStage(
      jobId,
      "competitor_analysis",
      "completed",
      "geo_analysis",
      {
        totalCompetitors: competitorDomains.length,
        competitorDomains,
      }
    );

    // ─────────────────────────────────────────
    // STAGE 4: GEO / AI VISIBILITY ANALYSIS
    // ─────────────────────────────────────────
    await updateJobStage(jobId, "geo_analysis", "in_progress", "geo_analysis");

    const aiProvider = getAIProvider();
    const isAiConfigured = aiProvider.isConfigured();

    if (keywords.length > 0 && isAiConfigured) {
      for (const kw of keywords.slice(0, 5)) {

        try {
          const aiRes = await aiProvider.generateResponse(kw.keyword, brandName, domain, competitorDomains);
          aiResults.push(aiRes);

          if (supabase) {
            try {
              await supabase.from("search_results").insert({
                agency_id: agencyId,
                client_id: clientId,
                tracked_keyword_id: kw.id,
                keyword: kw.keyword,
                domain: domain,
                brand: kw.brand || brandName,
                location: kw.location || locationCode,
                track_type: "geo",
                aio_present: aiRes.brandMentioned || aiRes.citations.length > 0,
                aio_snippet: aiRes.rawResponse.slice(0, 300),
                aio_full_text: aiRes.rawResponse,
                cited_domains: aiRes.citations,
                client_cited: aiRes.isTargetCited,
                mentioned_in_text: aiRes.brandMentioned,
                chatgpt_checked: true,
                chatgpt_response: aiRes.rawResponse,
                chatgpt_brand_cited: aiRes.isTargetCited,
                chatgpt_brand_mentioned: aiRes.brandMentioned,
                chatgpt_mention_count: aiRes.mentionCount,
                chatgpt_competitors: aiRes.competitorsMentioned,
                chatgpt_cited_urls: aiRes.citations,
                citations_json: aiRes.citations,
              });
            } catch {
              // ignore DB insert error
            }
          }
        } catch {
          // Continue
        }
      }
    }

    await updateJobStage(
      jobId,
      "geo_analysis",
      isAiConfigured ? "completed" : "unconfigured",
      "results_prep",
      {
        promptsChecked: aiResults.length,
        providerUsed: aiProvider.name,
        isAiConfigured,
      }
    );

    // ─────────────────────────────────────────
    // STAGE 5: RESULTS PREPARATION & METRICS
    // ─────────────────────────────────────────
    await updateJobStage(jobId, "results_prep", "in_progress", "results_prep");

    const metrics = calculateVisibilityMetrics(searchResults, aiResults, competitorDomains);
    const recommendations = generateDataDrivenRecommendations({
      technicalIssues,
      searchResults,
      aiResults,
      competitorDomains,
    });

    await updateJobStage(
      jobId,
      "results_prep",
      "completed",
      "completed",
      {
        metrics,
        recommendations,
        summary: "Full search & GEO visibility analysis completed successfully.",
      }
    );
  } catch (err) {
    console.error("[analysis-runner] critical error:", err);
    await updateJobStage(
      jobId,
      "results_prep",
      "failed",
      "completed",
      undefined,
      err instanceof Error ? err.message : "An unexpected error occurred during analysis."
    );
  }
}

