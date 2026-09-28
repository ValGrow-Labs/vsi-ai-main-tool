/**
 * Search Visibility (Google rankings). Pure functions over stored checks.
 * A null position only means "not found" when rank tracking ran for that
 * search; the caller passes which searches that applies to.
 */
import type { Finding } from "@/lib/findings";
import { TASK_SOURCE_LABEL } from "@/lib/task-payload";
import { plural } from "@/lib/format";

export interface RankRow {
  tracked_keyword_id: string | null;
  keyword: string;
  created_at: string;
  rank_position: number | null;
  rank_url: string | null;
  /** Migration 042. NULL/absent on older rows. */
  rank_status?: "found" | "not_found" | "check_failed" | "not_checked" | null;
  /** First stored organic result (serp_results_json->0); null when no results were stored. */
  serp_first?: unknown;
}

/**
 * Was this row a real Google rank observation? Failed or skipped lookups are
 * never read as "not found". Rows from before migration 042 carry no status:
 * a NULL rank counts as "not found" only when the row stored the results it
 * searched through (every real lookup stores the top results) — otherwise the
 * lookup failed or didn't run, and the row is ignored for rankings.
 */
export function isRankObservation(r: RankRow): boolean {
  if (r.rank_status) return r.rank_status === "found" || r.rank_status === "not_found";
  if (r.rank_position !== null && r.rank_position !== undefined) return true;
  return r.serp_first !== null && r.serp_first !== undefined;
}

export interface RankedSearch {
  keywordId: string | null;
  keyword: string;
  position: number | null;
  previous: number | null;
  /** Positive = moved up (better). Null unless both checks found a position. */
  change: number | null;
  /** Moved into or out of the results between the last two checks (no numeric change). */
  movement: "entered" | "dropped_out" | null;
  url: string | null;
  checkedAt: string;
  history: { date: string; position: number | null }[];
}

export interface SearchSummary {
  tracked: number;
  ranked: number;
  top3: number;
  top10: number;
  page2: number;
  notFound: number;
  averagePosition: number | null;
  improved: number;
  declined: number;
  lastCheckedAt: string | null;
  searches: RankedSearch[];
  /** Share of searches on page one, per check date. */
  trend: { date: string; value: number }[];
}

function key(r: RankRow) {
  return r.tracked_keyword_id ?? `kw:${r.keyword.toLowerCase()}`;
}

/**
 * @param rows stored checks, any order
 * @param rankTracked keyword ids (or `kw:` keys) for which rank tracking runs
 */
export function computeSearch(rows: RankRow[], rankTracked: Set<string>): SearchSummary {
  // Only real rank observations: failed or skipped lookups never become "not found".
  rows = rows.filter(isRankObservation);
  const bySearch = new Map<string, RankRow[]>();
  for (const r of rows) {
    const k = key(r);
    if (!rankTracked.has(k)) continue;
    const list = bySearch.get(k) ?? [];
    list.push(r);
    bySearch.set(k, list);
  }

  const searches: RankedSearch[] = [...bySearch.values()].map((list) => {
    list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    // One point per day: the latest check that day.
    const perDay = new Map<string, RankRow>();
    for (const r of list) {
      const day = r.created_at.slice(0, 10);
      if (!perDay.has(day)) perDay.set(day, r);
    }
    const days = [...perDay.values()];
    const latest = days[0];
    const prev = days[1] ?? null;
    // No numeric stand-in for "not found": a change is only computed between
    // two real positions. Entering or leaving the results is its own state.
    const change = prev && latest.rank_position !== null && prev.rank_position !== null ? prev.rank_position - latest.rank_position : null;
    const movement: RankedSearch["movement"] =
      prev && latest.rank_position !== null && prev.rank_position === null
        ? "entered"
        : prev && latest.rank_position === null && prev.rank_position !== null
          ? "dropped_out"
          : null;
    return {
      keywordId: latest.tracked_keyword_id,
      keyword: latest.keyword,
      position: latest.rank_position,
      previous: prev?.rank_position ?? null,
      change: change === 0 ? 0 : change,
      movement,
      url: latest.rank_url,
      checkedAt: latest.created_at,
      history: days
        .slice(0, 12)
        .reverse()
        .map((d) => ({ date: d.created_at.slice(0, 10), position: d.rank_position })),
    };
  });

  searches.sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || a.keyword.localeCompare(b.keyword));

  const ranked = searches.filter((s) => s.position !== null);
  const avg = ranked.length ? Math.round((ranked.reduce((s, r) => s + (r.position ?? 0), 0) / ranked.length) * 10) / 10 : null;

  // Trend: page-one share per date across all searches checked that day.
  const byDate = new Map<string, Map<string, number | null>>();
  for (const r of rows) {
    const k = key(r);
    if (!rankTracked.has(k)) continue;
    const day = r.created_at.slice(0, 10);
    const m = byDate.get(day) ?? new Map<string, number | null>();
    if (!m.has(k)) m.set(k, r.rank_position);
    byDate.set(day, m);
  }
  const trend = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, m]) => {
      const vals = [...m.values()];
      return { date, value: Math.round((vals.filter((v) => v !== null && v <= 10).length / vals.length) * 100) };
    })
    .slice(-12);

  return {
    tracked: searches.length,
    ranked: ranked.length,
    top3: ranked.filter((s) => (s.position ?? 99) <= 3).length,
    top10: ranked.filter((s) => (s.position ?? 99) <= 10).length,
    page2: ranked.filter((s) => (s.position ?? 0) > 10 && (s.position ?? 0) <= 20).length,
    notFound: searches.length - ranked.length,
    averagePosition: avg,
    improved: searches.filter((s) => (s.change ?? 0) > 0 || s.movement === "entered").length,
    declined: searches.filter((s) => (s.change ?? 0) < 0 || s.movement === "dropped_out").length,
    lastCheckedAt: searches.reduce<string | null>((m, s) => (!m || s.checkedAt > m ? s.checkedAt : m), null),
    searches,
    trend,
  };
}

export function searchConclusion(s: SearchSummary): string {
  if (s.tracked === 0) return "We haven't checked your Google rankings yet.";
  if (s.ranked === 0) return `Your website doesn't appear in Google's top results for any of the ${s.tracked} searches we check.`;
  const lead = `You're on Google's first page for ${s.top10} of ${s.tracked} searches.`;
  if (s.declined > s.improved) return `${lead} More searches went down than up since the last check.`;
  if (s.improved > 0) return `${lead} ${plural(s.improved, "search", "searches")} moved up since the last check.`;
  return lead;
}

export function searchFindings(s: SearchSummary, clientId: string): Finding[] {
  const out: Finding[] = [];
  const base = { source: "search" as const, sourceLabel: TASK_SOURCE_LABEL.search, href: "/dashboard/services/seo" };
  const link = (x: RankedSearch) => ({
    label: x.keyword,
    href: x.keywordId ? `/dashboard/clients/${clientId}/keywords/${x.keywordId}` : undefined,
    note:
      x.position === null
        ? "Not found in the top results"
        : x.previous !== null && x.change !== null && x.change < 0
          ? `Position ${x.previous} → ${x.position}`
          : `Position ${x.position}`,
  });

  const dropped = s.searches.filter((x) => x.change !== null && x.change <= -3);
  if (dropped.length > 0) {
    const title = "Some searches lost ground in Google";
    const found = `${plural(dropped.length, "search", "searches")} dropped three or more places since the last check.`;
    const why = "Lower positions get far fewer visits. Catching a drop early makes it easier to win back.";
    const todo = "Open each search and compare your page with the pages now ranking above you. Check the page still loads and is up to date.";
    out.push({
      ...base,
      key: "search:dropped",
      title,
      tone: "attention",
      statusText: "Needs attention",
      priority: Math.min(75, 45 + dropped.length * 4),
      whatWeFound: found,
      whyItMatters: why,
      whatToDo: todo,
      affected: dropped.map(link),
      technical: dropped.map((d) => ({ label: d.keyword, value: `${d.previous ?? "not found"} → ${d.position ?? "not found"}` })),
      draft: {
        clientId,
        source: "search",
        findingKey: "dropped",
        title: dropped.length === 1 ? `Win back Google ranking for "${dropped[0].keyword}"` : title,
        whatWeFound: found,
        whyItMatters: why,
        whatToDo: todo,
        group: "Content",
        owner: "SEO",
        impact: "high",
        effort: "M",
        trackedKeywordId: dropped.length === 1 ? dropped[0].keywordId : null,
        affected: dropped.map((d) => d.keyword),
        acceptance: ["The search is back at or above its previous position on the next check"],
      },
    });
  }

  const missing = s.searches.filter((x) => x.position === null);
  if (missing.length > 0) {
    const title = "Your website doesn't show up for some searches";
    const found = `For ${plural(missing.length, "search", "searches")}, your website isn't in Google's top results at all.`;
    const why = "If people can't find you for these searches, they find someone else.";
    const todo = "Make sure each search has a page that is clearly about it, with the search phrase in the title and main heading. If none exists, create one.";
    out.push({
      ...base,
      key: "search:not_found",
      title,
      tone: "attention",
      statusText: "Needs attention",
      priority: Math.min(70, 40 + missing.length * 3),
      whatWeFound: found,
      whyItMatters: why,
      whatToDo: todo,
      affected: missing.map(link),
      draft: {
        clientId,
        source: "search",
        findingKey: "not_found",
        title: missing.length === 1 ? `Create or improve a page for "${missing[0].keyword}"` : title,
        whatWeFound: found,
        whyItMatters: why,
        whatToDo: todo,
        group: "Content",
        owner: "Writer",
        impact: "medium",
        effort: "L",
        trackedKeywordId: missing.length === 1 ? missing[0].keywordId : null,
        affected: missing.map((m) => m.keyword),
      },
    });
  }

  const close = s.searches.filter((x) => x.position !== null && x.position > 10 && x.position <= 20);
  if (close.length > 0) {
    const title = "Some searches are close to Google's first page";
    const found = `${plural(close.length, "search is", "searches are")} on page two, just outside the top 10.`;
    const why = "Moving from page two to page one usually brings many times more visitors, and these are the easiest wins.";
    const todo = "Improve these pages: answer the search more completely, update facts and dates, and link to them from your other relevant pages.";
    out.push({
      ...base,
      key: "search:page_two",
      title,
      tone: "info",
      statusText: "Opportunity",
      priority: 35,
      whatWeFound: found,
      whyItMatters: why,
      whatToDo: todo,
      affected: close.map(link),
      draft: {
        clientId,
        source: "search",
        findingKey: "page_two",
        title: close.length === 1 ? `Move "${close[0].keyword}" onto Google's first page` : title,
        whatWeFound: found,
        whyItMatters: why,
        whatToDo: todo,
        group: "Content",
        owner: "SEO",
        impact: "medium",
        effort: "M",
        trackedKeywordId: close.length === 1 ? close[0].keywordId : null,
        affected: close.map((c) => c.keyword),
        acceptance: ["The search reaches Google's first page (top 10)"],
      },
    });
  }

  return out.sort((a, b) => b.priority - a.priority);
}
