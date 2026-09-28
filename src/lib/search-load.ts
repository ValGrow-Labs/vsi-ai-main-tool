import "server-only";
import { isDummySupabase } from "@/lib/auth";
import { computeSearch, type RankRow, type SearchSummary } from "@/lib/search";
import { loadProjectFlags, loadRecentResults, loadTrackedKeywords, type ProjectFlags, type TrackedKeywordRow } from "@/lib/project-data-load";
import type { ProjectSummary } from "@/lib/project-types";

export type SearchLoad =
  | { state: "ok"; summary: SearchSummary; rankTrackingEnabled: boolean; activeSearches: number }
  | { state: "error"; message: string };

export const SEARCH_COLUMNS = "tracked_keyword_id, keyword, created_at, rank_position, rank_url, rank_status, serp_first:serp_results_json->0";

export async function loadSearch(project: ProjectSummary): Promise<SearchLoad> {
  if (isDummySupabase()) return { state: "error", message: "VSI isn't connected to its database in this environment." };

  const [flags, keywords, rows] = await Promise.all([
    loadProjectFlags(project.id),
    loadTrackedKeywords(project.id),
    loadRecentResults(project.id, SEARCH_COLUMNS),
  ]);
  return buildSearch(flags, keywords, rows);
}

/** Turns loaded rows into the Search Visibility summary. Shared with the combined visibility loader. */
export function buildSearch(
  flags: ProjectFlags | null,
  keywordsRes: { rows: TrackedKeywordRow[]; error: { code?: string } | null },
  rowsRes: { data: unknown[] | null; error: { code?: string } | null },
): SearchLoad {
  if (keywordsRes.error || rowsRes.error) {
    console.error("[search] load failed", { keywords: keywordsRes.error?.code, rows: rowsRes.error?.code });
    return { state: "error", message: "We couldn't load your Google rankings right now." };
  }

  const rankTrackingEnabled = flags?.rank_tracking_enabled ?? true;
  const keywords = keywordsRes.rows;
  const tracked = new Set(
    rankTrackingEnabled ? keywords.filter((k) => k.is_active && (k.track_type === "seo" || k.track_type === "both")).map((k) => k.id) : [],
  );

  return {
    state: "ok",
    summary: computeSearch((rowsRes.data ?? []) as RankRow[], tracked),
    rankTrackingEnabled,
    activeSearches: keywords.filter((k) => k.is_active).length,
  };
}
