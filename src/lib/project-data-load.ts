import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Project reads shared by the Search and AI visibility loaders. `cache()` only
 * dedupes within one server request, so nothing is shared between users.
 */

const RECENT_DAYS = 120;
const RECENT_LIMIT = 3000;

export interface ProjectFlags {
  rank_tracking_enabled: boolean | null;
  ai_mode_enabled: boolean | null;
  ai_overview_enabled: boolean | null;
  chatgpt_enabled: boolean | null;
}

export interface TrackedKeywordRow {
  id: string;
  is_active: boolean;
  track_type: string;
}

/** The project's engine switches. A failed read counts as "not set", as before. */
export const loadProjectFlags = cache(async (projectId: string): Promise<ProjectFlags | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clients")
    .select("rank_tracking_enabled, ai_mode_enabled, ai_overview_enabled, chatgpt_enabled")
    .eq("id", projectId)
    .maybeSingle();
  return (data as ProjectFlags | null) ?? null;
});

export const loadTrackedKeywords = cache(async (projectId: string): Promise<{ rows: TrackedKeywordRow[]; error: { code?: string } | null }> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tracked_keywords").select("id, is_active, track_type").eq("client_id", projectId);
  return { rows: (data ?? []) as TrackedKeywordRow[], error };
});

/** Columns from migrations that may not be applied yet; dropped on retry when missing. */
const OPTIONAL_COLUMNS = [
  "rank_status",
  "check_provenance",
  "chatgpt_entity_match",
  "chatgpt_actual_entity",
  "chatgpt_competitors",
  "chatgpt_cited_urls",
];

/** The last 120 days of checks for a project, newest first. */
export async function loadRecentResults(projectId: string, columns: string): Promise<{ data: unknown[] | null; error: { code?: string } | null }> {
  const supabase = await createClient();
  const since = new Date(Date.now() - RECENT_DAYS * 86_400_000).toISOString();
  const run = (cols: string) =>
    supabase
      .from("search_results")
      .select(cols)
      .eq("client_id", projectId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(RECENT_LIMIT);
  let { data, error } = await run(columns);
  // Missing column error handling (e.g. 42703, column does not exist)
  if (error && /column|42703|PGRST204/i.test(`${error.code ?? ""} ${error.message ?? ""}`)) {
    let reducedCols = columns
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c && !OPTIONAL_COLUMNS.includes(c));

    const matchCol = (error.message ?? "").match(/column\s+(?:search_results\.)?["']?([a-zA-Z0-9_]+)["']?\s+does not exist/i);
    if (matchCol?.[1]) {
      reducedCols = reducedCols.filter((c) => c !== matchCol[1]);
    }

    const reduced = reducedCols.join(", ");
    if (reduced !== columns) ({ data, error } = await run(reduced));
  }
  return { data: (data as unknown[] | null) ?? null, error };
}

/** Joins column lists without repeating a column. */
export function mergeColumns(...lists: string[]): string {
  const seen = new Set<string>();
  for (const list of lists) for (const c of list.split(",")) if (c.trim()) seen.add(c.trim());
  return [...seen].join(", ");
}
