/**
 * GEO / AI Visibility metrics. Pure functions over stored search_results
 * rows; no I/O. Every number shown on the AI Visibility page comes from here.
 *
 * Rules:
 * - A missing field means "not checked", never "no".
 * - Engines VSI doesn't collect are never given numbers.
 */
import { detectPlatform, PLATFORM_LABELS } from "@/types/search";
import { AI_ENGINES, AI_ENGINE_IDS, type AiEngineId } from "@/lib/ai-engines";

/** Engine ids and labels come from the central mapping in ai-engines.ts. */
export type EngineId = AiEngineId;

export const ENGINES: { id: EngineId; label: string; description: string }[] = AI_ENGINE_IDS.map((id) => ({
  id,
  label: AI_ENGINES[id].label,
  description: AI_ENGINES[id].description,
}));

/** AI surfaces VSI does not check yet. Shown as "Coming soon", never with numbers. */
export const COMING_SOON_ENGINES = ["Gemini", "Perplexity"];

export interface GeoRow {
  tracked_keyword_id: string | null;
  keyword: string;
  created_at: string;
  aio_present: boolean | null;
  mentioned_in_text: boolean | null;
  client_cited: boolean | null;
  cited_domains: string[] | null;
  /** Legacy duplicate of the Google request; not read (see ai-engines.ts). */
  ai_overview_present?: boolean | null;
  ai_overview_client_cited?: boolean | null;
  ai_overview_cited_domains?: string[] | null;
  chatgpt_checked: boolean | null;
  chatgpt_brand_mentioned: boolean | null;
  chatgpt_brand_cited: boolean | null;
  chatgpt_competitors: string[] | null;
  chatgpt_cited_urls: string[] | null;
  chatgpt_entity_match?: boolean | null;
}

export interface EngineResult {
  answered: boolean;
  named: boolean | null;
  linked: boolean;
  appears: boolean;
  /** Other domains this answer linked to. */
  domains: string[];
}

export function cleanDomain(input: string): string {
  let d = input.trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/^www\./, "");
  return d;
}

function sameSite(domain: string, own: string): boolean {
  const d = cleanDomain(domain);
  return !!own && (d === own || d.endsWith(`.${own}`));
}

/** Result for one engine on one stored check, or null if that engine wasn't checked. */
export function engineResult(row: GeoRow, engine: EngineId): EngineResult | null {
  if (engine === "google_ai_overview") {
    // Google AI Overview, stored in the aio_* columns.
    if (row.aio_present === null || row.aio_present === undefined) return null;
    const answered = row.aio_present === true;
    const named = answered ? row.mentioned_in_text === true : false;
    const linked = answered && row.client_cited === true;
    return { answered, named, linked, appears: named || linked, domains: answered ? row.cited_domains ?? [] : [] };
  }
  // The legacy ai_overview_* columns only ever held a copy of the same
  // Google request, so they are not read: counting them would count one
  // Google AI Overview twice.
  if (row.chatgpt_checked !== true) return null;
  // A name match about a different organisation with the same name is not a mention of you.
  const named = row.chatgpt_brand_mentioned === true && row.chatgpt_entity_match !== false;
  const linked = row.chatgpt_brand_cited === true;
  const domains = (row.chatgpt_cited_urls ?? []).map(cleanDomain).filter(Boolean);
  return { answered: true, named, linked, appears: named || linked, domains };
}

export type SearchState = "named_and_linked" | "named" | "linked" | "not_mentioned" | "no_answer" | "not_checked";

export function searchState(r: EngineResult | null): SearchState {
  if (!r) return "not_checked";
  if (!r.answered) return "no_answer";
  if (r.named && r.linked) return "named_and_linked";
  if (r.named) return "named";
  if (r.linked) return "linked";
  return "not_mentioned";
}

export const SEARCH_STATE_LABEL: Record<SearchState, string> = {
  named_and_linked: "Named and linked",
  named: "Named",
  linked: "Linked, not named",
  not_mentioned: "Not mentioned",
  no_answer: "No AI answer",
  not_checked: "Not checked",
};

/** Newest row per tracked search. */
export function latestPerSearch(rows: GeoRow[]): GeoRow[] {
  const byKey = new Map<string, GeoRow>();
  for (const row of rows) {
    const key = row.tracked_keyword_id ?? `kw:${row.keyword.toLowerCase()}`;
    const prev = byKey.get(key);
    if (!prev || prev.created_at < row.created_at) byKey.set(key, row);
  }
  return [...byKey.values()].sort((a, b) => a.keyword.localeCompare(b.keyword));
}

export interface EngineSummary {
  id: EngineId;
  label: string;
  description: string;
  enabled: boolean;
  checked: number;
  answered: number;
  appears: number;
  named: number;
  linked: number;
  /** False when the engine doesn't report brand names. */
  tracksNames: boolean;
  /** This engine's visibility per check date, oldest first. Only dates where it gave answers. */
  trend: { date: string; value: number }[];
}

export interface CompetitorPresence {
  domain: string;
  /** AI answers that link to this site. */
  answers: number;
  /** Searches where this site is linked and you are not. */
  gapSearches: number;
  platform: string | null;
}

export interface TrackedSearch {
  keywordId: string | null;
  keyword: string;
  checkedAt: string;
  states: Record<EngineId, SearchState>;
  appears: boolean;
  answered: boolean;
  competitorsLinked: string[];
}

export interface GeoSummary {
  searchesTracked: number;
  lastCheckedAt: string | null;
  /** Searches where at least one engine gave an AI answer. */
  answered: number;
  /** Of those, searches where you appear in at least one engine. */
  appears: number;
  /** appears / answered, 0–100, or null with no answers. */
  visibility: number | null;
  early: boolean;
  mentions: number;
  citations: number;
  engines: EngineSummary[];
  competitors: CompetitorPresence[];
  platforms: { name: string; answers: number }[];
  namedByChatGPT: { name: string; answers: number }[];
  searches: TrackedSearch[];
  entity: { checked: number; recognised: number } | null;
  trend: { date: string; value: number }[];
}

export interface ComputeGeoOptions {
  domain: string | null;
  enabled: Record<EngineId, boolean>;
}

const ENGINE_IDS: EngineId[] = AI_ENGINE_IDS;

function visibilityOf(rows: GeoRow[]): { answered: number; appears: number } {
  let answered = 0;
  let appears = 0;
  for (const row of rows) {
    const results = ENGINE_IDS.map((e) => engineResult(row, e)).filter((r): r is EngineResult => !!r);
    if (results.some((r) => r.answered)) {
      answered++;
      if (results.some((r) => r.appears)) appears++;
    }
  }
  return { answered, appears };
}

export function computeGeo(allRows: GeoRow[], { domain, enabled }: ComputeGeoOptions): GeoSummary {
  const own = domain ? cleanDomain(domain) : "";
  const latest = latestPerSearch(allRows);

  const engines: EngineSummary[] = ENGINES.map((e) => ({
    ...e,
    enabled: enabled[e.id],
    checked: 0,
    answered: 0,
    appears: 0,
    named: 0,
    linked: 0,
    tracksNames: true,
    trend: [],
  }));
  const engineById = Object.fromEntries(engines.map((e) => [e.id, e])) as Record<EngineId, EngineSummary>;

  const competitorAnswers = new Map<string, number>();
  const competitorGaps = new Map<string, number>();
  const chatgptNames = new Map<string, number>();
  let mentions = 0;
  let citations = 0;
  let entityChecked = 0;
  let entityRecognised = 0;

  const searches: TrackedSearch[] = latest.map((row) => {
    const states = {} as Record<EngineId, SearchState>;
    const linkedHere = new Set<string>();
    let appears = false;
    let answered = false;
    let youLinked = false;

    for (const id of ENGINE_IDS) {
      const r = engineResult(row, id);
      states[id] = searchState(r);
      if (!r) continue;
      const s = engineById[id];
      s.checked++;
      if (!r.answered) continue;
      answered = true;
      s.answered++;
      if (r.appears) {
        s.appears++;
        appears = true;
      }
      if (r.named) {
        s.named++;
        mentions++;
      }
      if (r.linked) {
        s.linked++;
        citations++;
        youLinked = true;
      }
      // Count competitors per engine answer, exactly like your own citations.
      const inThisAnswer = new Set<string>();
      for (const d of r.domains) {
        const clean = cleanDomain(d);
        if (!clean || sameSite(clean, own) || inThisAnswer.has(clean)) continue;
        inThisAnswer.add(clean);
        linkedHere.add(clean);
        competitorAnswers.set(clean, (competitorAnswers.get(clean) ?? 0) + 1);
      }
    }

    if (!youLinked) {
      for (const d of linkedHere) competitorGaps.set(d, (competitorGaps.get(d) ?? 0) + 1);
    }
    for (const name of row.chatgpt_competitors ?? []) {
      const n = name.trim();
      if (n) chatgptNames.set(n, (chatgptNames.get(n) ?? 0) + 1);
    }
    if (row.chatgpt_checked && row.chatgpt_entity_match !== null && row.chatgpt_entity_match !== undefined) {
      entityChecked++;
      if (row.chatgpt_entity_match) entityRecognised++;
    }

    return {
      keywordId: row.tracked_keyword_id,
      keyword: row.keyword,
      checkedAt: row.created_at,
      states,
      appears,
      answered,
      competitorsLinked: [...linkedHere],
    };
  });

  const { answered, appears } = visibilityOf(latest);

  const allSites = [...competitorAnswers.entries()].map(([d, answers]) => {
    const platform = detectPlatform(d);
    const isPlatform = platform !== "other" && platform !== "news" && platform !== "brand";
    return { domain: d, answers, gapSearches: competitorGaps.get(d) ?? 0, platform: isPlatform ? PLATFORM_LABELS[platform].label : null };
  });
  const competitors = allSites.filter((c) => !c.platform).sort((a, b) => b.answers - a.answers || a.domain.localeCompare(b.domain));
  const platformCounts = new Map<string, number>();
  for (const s of allSites) if (s.platform) platformCounts.set(s.platform, (platformCounts.get(s.platform) ?? 0) + s.answers);

  // Trend: visibility per check date, using the latest row per search on that day.
  const byDate = new Map<string, GeoRow[]>();
  for (const row of allRows) {
    const day = row.created_at.slice(0, 10);
    const list = byDate.get(day) ?? [];
    list.push(row);
    byDate.set(day, list);
  }
  const days = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => ({ date, rows: latestPerSearch(rows) }));
  const trend = days
    .map(({ date, rows }) => {
      const v = visibilityOf(rows);
      return v.answered > 0 ? { date, value: Math.round((v.appears / v.answered) * 100) } : null;
    })
    .filter((p): p is { date: string; value: number } => p !== null)
    .slice(-12);

  // The same trend per engine, so each AI service shows its own change over time.
  for (const e of engines) {
    e.trend = days
      .map(({ date, rows }) => {
        let answeredHere = 0;
        let appearsHere = 0;
        for (const row of rows) {
          const r = engineResult(row, e.id);
          if (!r?.answered) continue;
          answeredHere++;
          if (r.appears) appearsHere++;
        }
        return answeredHere > 0 ? { date, value: Math.round((appearsHere / answeredHere) * 100) } : null;
      })
      .filter((p): p is { date: string; value: number } => p !== null)
      .slice(-12);
  }

  return {
    searchesTracked: latest.length,
    lastCheckedAt: latest.reduce<string | null>((max, r) => (!max || r.created_at > max ? r.created_at : max), null),
    answered,
    appears,
    visibility: answered > 0 ? Math.round((appears / answered) * 100) : null,
    early: answered > 0 && answered < 5,
    mentions,
    citations,
    engines,
    competitors,
    platforms: [...platformCounts.entries()].map(([name, answers]) => ({ name, answers })).sort((a, b) => b.answers - a.answers),
    namedByChatGPT: [...chatgptNames.entries()].map(([name, answers]) => ({ name, answers })).sort((a, b) => b.answers - a.answers),
    searches,
    entity: entityChecked > 0 ? { checked: entityChecked, recognised: entityRecognised } : null,
    trend,
  };
}

/** One sentence that answers "how visible am I in AI answers?". */
export function geoConclusion(s: GeoSummary): string {
  if (s.answered === 0) {
    return s.searchesTracked === 0
      ? "We haven't checked any searches yet."
      : "None of the searches we checked produced an AI answer yet.";
  }
  const lead = `You appear in ${s.appears} of ${s.answered} AI answers we checked.`;
  const top = s.competitors[0];
  if (s.appears === 0) return `${lead} AI answers are recommending other businesses for all of them.`;
  if (top && top.answers > s.citations) return `${lead} ${top.domain} is linked more often than you.`;
  if (s.appears === s.answered) return `${lead} That's every AI answer for the searches you track.`;
  return `${lead} There's room to appear in ${s.answered - s.appears} more.`;
}

/**
 * Share of answered searches where an AI answer links to at least one
 * competitor (well-known platforms like Reddit are not competitors). 0–100,
 * or null with no answers.
 */
export function competitorPresence(s: GeoSummary): number | null {
  if (s.answered === 0) return null;
  const rivals = new Set(s.competitors.map((c) => c.domain));
  const withRival = s.searches.filter((x) => x.answered && x.competitorsLinked.some((d) => rivals.has(d))).length;
  return Math.round((withRival / s.answered) * 100);
}

export interface AnswerBreakdown {
  /** Every engine answer VSI has for your searches (latest check each). */
  total: number;
  namedAndLinked: number;
  namedOnly: number;
  linkedOnly: number;
  neither: number;
}

/** How the AI answers treat you: named, linked, both or neither. One count per engine answer. */
export function answerBreakdown(s: GeoSummary): AnswerBreakdown {
  const out: AnswerBreakdown = { total: 0, namedAndLinked: 0, namedOnly: 0, linkedOnly: 0, neither: 0 };
  for (const search of s.searches) {
    for (const state of Object.values(search.states)) {
      if (state === "no_answer" || state === "not_checked") continue;
      out.total++;
      if (state === "named_and_linked") out.namedAndLinked++;
      else if (state === "named") out.namedOnly++;
      else if (state === "linked") out.linkedOnly++;
      else out.neither++;
    }
  }
  return out;
}

export interface EvidenceSegment {
  text: string;
  you: boolean;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Split answer text into segments, marking the brand wherever it appears. */
export function highlightBrand(text: string, tokens: string[]): EvidenceSegment[] {
  const words = tokens.filter((t) => t.length >= 4 && !t.includes("."));
  if (!text || words.length === 0) return [{ text, you: false }];
  const re = new RegExp(`((?<![\\p{L}\\p{N}])(?:${words.map(escapeRegExp).sort((a, b) => b.length - a.length).join("|")})(?![\\p{L}\\p{N}]))`, "giu");
  return text
    .split(re)
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, you: words.some((w) => w.toLowerCase() === part.toLowerCase()) }));
}
