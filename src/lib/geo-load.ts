import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isDummySupabase } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { loadProjectFlags, loadRecentResults, loadTrackedKeywords, type ProjectFlags, type TrackedKeywordRow } from "@/lib/project-data-load";
import { buildBrandTokens } from "@/lib/brand-match";
import { AI_ENGINES } from "@/lib/ai-engines";
import { computeGeo, highlightBrand, type EngineId, type EvidenceSegment, type GeoRow, type GeoSummary } from "@/lib/geo";
import type { ProjectSummary } from "@/lib/project-types";
import type { AIOCitation } from "@/types/search";

// Only columns the AI visibility summary reads. This list is fetched for up to 3000 rows per page.
export const GEO_COLUMNS =
  "tracked_keyword_id, keyword, created_at, aio_present, mentioned_in_text, client_cited, cited_domains, " +
  "chatgpt_checked, chatgpt_brand_mentioned, " +
  "chatgpt_brand_cited, chatgpt_competitors, chatgpt_cited_urls, chatgpt_entity_match";

export interface AnswerEvidence {
  keyword: string;
  keywordId: string | null;
  engineLabel: string;
  checkedAt: string;
  appears: boolean;
  segments: EvidenceSegment[];
  sources: { position: number; name: string; domain: string; url: string; you: boolean }[];
}

export type GeoLoad =
  | { state: "ok"; summary: GeoSummary; enabled: Record<EngineId, boolean>; evidence: AnswerEvidence[]; activeSearches: number }
  | { state: "error"; message: string };

function trimAnswer(text: string, max = 900): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

export async function loadGeo(project: ProjectSummary, opts: { evidence?: boolean } = {}): Promise<GeoLoad> {
  if (isDummySupabase()) return { state: "error", message: "VSI isn't connected to its database in this environment." };

  const [flags, keywords, rows, chatgptSystem] = await Promise.all([
    loadProjectFlags(project.id),
    loadTrackedKeywords(project.id),
    loadRecentResults(project.id, GEO_COLUMNS),
    loadChatgptSystemSetting(),
  ]);
  return finishGeo(project, buildGeo(project, flags, keywords, rows, chatgptSystem), opts);
}

export function loadChatgptSystemSetting(): Promise<boolean | null> {
  return getSetting<boolean>("chatgpt_api_enabled").catch(() => true);
}

type GeoCore = { state: "ok"; summary: GeoSummary; enabled: Record<EngineId, boolean>; activeSearches: number } | { state: "error"; message: string };

/** Turns loaded rows into the AI Visibility summary. Shared with the combined visibility loader. */
export function buildGeo(
  project: ProjectSummary,
  flags: ProjectFlags | null,
  keywordsRes: { rows: TrackedKeywordRow[]; error: { code?: string } | null },
  rowsRes: { data: unknown[] | null; error: { code?: string } | null },
  chatgptSystem: boolean | null,
): GeoCore {
  if (rowsRes.error || keywordsRes.error) {
    console.error("[geo] load failed", { rows: rowsRes.error?.code, keywords: keywordsRes.error?.code });
    return { state: "error", message: "We couldn't load your AI visibility data right now." };
  }

  const enabled: Record<EngineId, boolean> = {
    // The Google AI Overview check is switched by the ai_mode_enabled column (legacy name).
    google_ai_overview: flags?.ai_mode_enabled ?? true,
    chatgpt: flags?.chatgpt_enabled ?? chatgptSystem ?? true,
  };

  const active = new Set(
    keywordsRes.rows.filter((k) => k.is_active && (k.track_type === "geo" || k.track_type === "both")).map((k) => k.id),
  );
  // Only checks of searches the project still tracks. Rows whose search was
  // removed (tracked_keyword_id set to NULL) no longer count, as on Search Visibility.
  const rows = ((rowsRes.data ?? []) as unknown as GeoRow[]).filter((r) => !!r.tracked_keyword_id && active.has(r.tracked_keyword_id));
  const summary = computeGeo(rows, { domain: project.website, enabled });
  return { state: "ok", summary, enabled, activeSearches: active.size };
}

export async function finishGeo(project: ProjectSummary, core: GeoCore, opts: { evidence?: boolean } = {}): Promise<GeoLoad> {
  if (core.state === "error") return core;
  const evidence = opts.evidence === false ? [] : await loadEvidence(project, core.summary);
  return { ...core, evidence };
}

/**
 * Up to two real answers to show as evidence: one where you appear and one
 * where you don't (the opportunity). Texts come straight from stored checks.
 */
async function loadEvidence(project: ProjectSummary, summary: GeoSummary): Promise<AnswerEvidence[]> {
  const withGoogleAnswer = summary.searches.filter((s) => s.states.google_ai_overview !== "not_checked" && s.states.google_ai_overview !== "no_answer");
  const picks = [withGoogleAnswer.find((s) => s.appears), withGoogleAnswer.find((s) => !s.appears)].filter((p): p is NonNullable<typeof p> => !!p);
  if (picks.length === 0) return [];

  const supabase = await createClient();
  const tokens = buildBrandTokens({ brand: project.brandName || project.name, domain: project.website ?? "" });
  // The picks are independent, so both answers are fetched at once rather than one after the other.
  const found = await Promise.all(
    picks.map(async (pick) => {
      let q = supabase
        .from("search_results")
        .select("keyword, tracked_keyword_id, created_at, aio_full_text, aio_snippet, citations_json, mentioned_in_text, client_cited")
        .eq("client_id", project.id)
        .eq("aio_present", true)
        .order("created_at", { ascending: false })
        .limit(1);
      q = pick.keywordId ? q.eq("tracked_keyword_id", pick.keywordId) : q.eq("keyword", pick.keyword);
      const { data } = await q.maybeSingle();
      return { pick, data };
    }),
  );

  const out: AnswerEvidence[] = [];
  for (const { pick, data } of found) {
    if (!data) continue;
    const text = (data.aio_full_text as string | null) || (data.aio_snippet as string | null) || "";
    if (!text) continue;
    const citations = ((data.citations_json as AIOCitation[] | null) ?? []).slice(0, 6);
    out.push({
      keyword: data.keyword as string,
      keywordId: (data.tracked_keyword_id as string | null) ?? null,
      engineLabel: AI_ENGINES.google_ai_overview.label,
      checkedAt: data.created_at as string,
      appears: pick.appears,
      segments: highlightBrand(trimAnswer(text), tokens),
      sources: citations.map((c, i) => ({
        position: c.position ?? i + 1,
        name: c.sourceName || c.domain,
        domain: c.domain,
        url: c.url,
        you: !!c.isClient,
      })),
    });
  }
  return out;
}
