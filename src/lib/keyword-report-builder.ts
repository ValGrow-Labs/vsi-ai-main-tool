import { createClient } from "@/lib/supabase/server";
import { getPromptTemplate, renderPrompt, type PromptKey } from "@/lib/prompts";
import { checkAioTopicRelevance } from "@/lib/aio-topic-relevance";
import { safeAiError } from "@/lib/safe-error";
import type { AIOCitation, OrganicResult } from "@/types/search";

// ─── Public types ─────────────────────────────────────────────

export type KeywordReportType = "keyword_summary" | "keyword_detailed" | "keyword_tasks";

export interface KeywordReportBranding {
  displayName: string;
  logoUrl: string | null;
  primaryColor: string;
  supportEmail: string | null;
  footer: string | null;
}

export interface KeywordReportSnapshot {
  rankPosition: number | null;
  aioPresent: boolean | null;
  clientCited: boolean | null;
  mentionedInText: boolean | null;
  gapLabel: string;
  citedDomains: string[];
  aioFullText: string | null;
  citations: AIOCitation[];
  serp: OrganicResult[];
  // ChatGPT-style visibility (second AI surface). Null when the check
  // didn't run for this snapshot.
  chatgptChecked: boolean;
  chatgptResponse: string | null;
  chatgptBrandCited: boolean | null;
  chatgptBrandMentioned: boolean | null;
  chatgptMentionCount: number | null;
  chatgptCompetitors: string[];
  chatgptEntityMatch: boolean | null;   // false when ChatGPT named the brand but described a different entity
  chatgptActualEntity: string | null;   // short label for the wrong entity (e.g. "biotech startup in San Diego")
  capturedAt: string;
}

export interface KeywordReportHistoryRow {
  capturedAt: string;
  rankPosition: number | null;
  aioPresent: boolean | null;
  clientCited: boolean | null;
  citedDomainCount: number;
  gapLabel: string;
}

// Per-type narrative payloads (LLM-produced)
export interface SummaryNarrative {
  headline: string;
  narrative: string;
  priorityActions: { title: string; why: string }[];
  whyItMatters: string;
  nextCheckIn: string;
}

export interface DetailedNarrative {
  executiveSummary: string;
  situationAnalysis: string;
  competitiveLandscape: { domain: string; whyTheyWin: string }[];
  aioAnalysis: string;
  // ChatGPT analysis section: what conversational-AI visibility looks like
  // for this query, including brand-collision warnings when ChatGPT named
  // the brand but described a different organisation.
  chatgptAnalysis: string;
  recommendedStrategy: { phase: string; actions: string[] }[];
  risks: string;
}

export interface TaskStarterPack {
  // Content tasks
  suggestedHeadline?: string;        // The article / page title to ship with
  targetWordCount?: number;          // Recommended length
  intro?: string;                    // 1-2 sentence intro draft to seed the writer
  h2Outline?: string[];              // Section headings the article should hit
  keyPhrases?: string[];             // SEO/entity phrases to include naturally
  internalLinkAnchors?: string[];    // Anchor texts pointing TO this new page
  outboundCitationTargets?: string[];// Authoritative sources to cite in the piece
  // Technical tasks
  codeSnippet?: string;              // Schema / markup / HTML snippet to drop in
  targetPage?: string;               // Where on the site it goes
  // Off-page tasks
  commentDraft?: string;             // Suggested top-line for a Reddit/Quora reply
  targetUrl?: string;                // The exact thread / page to act on
}

export interface TasksNarrative {
  tasks: {
    id: string;
    group: "Content" | "Technical" | "Off-page";
    title: string;
    owner: "Writer" | "Developer" | "SEO" | "Outreach";
    effort: "S" | "M" | "L";
    impact: "low" | "medium" | "high";
    description: string;
    acceptanceCriteria: string[];
    starterPack?: TaskStarterPack;
  }[];
}

interface BaseReportContent {
  schema: "vsi-keyword-report-v1";
  type: KeywordReportType;
  generatedAt: string;
  client: { name: string; brandName: string | null; website: string };
  keyword: string;
  trackType: string;
  branding: KeywordReportBranding;
  snapshot: KeywordReportSnapshot;
  aioOffTopic: { actualTopic: string } | null;
}

export type KeywordReportContent =
  | (BaseReportContent & { type: "keyword_summary"; narrative: SummaryNarrative })
  | (BaseReportContent & { type: "keyword_detailed"; narrative: DetailedNarrative; history: KeywordReportHistoryRow[] })
  | (BaseReportContent & { type: "keyword_tasks"; narrative: TasksNarrative });

// ─── LLM call ─────────────────────────────────────────────────

// Auto first (gets a fast paid model when credit is available), then
// drop through to explicit free models so a 402/"insufficient credits"
// doesn't kill the whole generation. Now safe to do because reports
// run in a background after() callback — proxy budget no longer
// constrains us.
const MODEL_CHAIN = [
  "openrouter/auto",
  "z-ai/glm-4.5-air:free",
  "openai/gpt-oss-120b:free",
  "meta-llama/llama-3.3-70b-instruct",
];
const PER_MODEL_TIMEOUT_MS = 45000;

async function callOpenAI(prompt: string, model: string, maxTokens: number): Promise<{ content: string | null; error?: string }> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return { content: null, error: "OPENAI_API_KEY not configured" };
  const systemPrompt =
    "You are a JSON API for SEO and GEO (Generative Engine Optimization) reports. Respond ONLY with valid JSON matching the requested schema. No markdown fences, no explanation. Be concise.";
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), PER_MODEL_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: ac.signal,
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.25,
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) return { content: null, error: `HTTP ${res.status}` };
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return { content: null, error: "empty response" };
    const stripped = content.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    const match = stripped.match(/\{[\s\S]*\}/);
    return { content: match ? match[0] : stripped };
  } catch (e) {
    return { content: null, error: e instanceof Error ? e.message : "err" };
  } finally {
    clearTimeout(timer);
  }
}

async function callLLM(prompt: string, apiKey: string, maxTokens: number): Promise<{ content: string | null; errors: string[] }> {
  const systemPrompt =
    "You are a JSON API for SEO and GEO (Generative Engine Optimization) reports. Respond ONLY with valid JSON matching the requested schema. No markdown fences, no explanation. Be concise.";
  const errors: string[] = [];

  for (const model of MODEL_CHAIN) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), PER_MODEL_TIMEOUT_MS);
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: ac.signal,
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://searchintel.valgrowlabs.com",
          "X-Title": "VSI Keyword Report",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature: 0.25,
          max_tokens: maxTokens,
        }),
      });
      if (!res.ok) {
        errors.push(`${model}: HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) { errors.push(`${model}: empty`); continue; }
      const stripped = content.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
      const match = stripped.match(/\{[\s\S]*\}/);
      return { content: match ? match[0] : stripped, errors };
    } catch (e) {
      errors.push(`${model}: ${e instanceof Error ? e.message : "err"}`);
    } finally {
      clearTimeout(timer);
    }
  }
  return { content: null, errors };
}

// ─── Formatters ───────────────────────────────────────────────

function fmtSerp(serp: OrganicResult[]): string {
  if (serp.length === 0) return "(none)";
  return serp.slice(0, 10).map((r) => {
    const snippet = r.snippet ? r.snippet.replace(/\s+/g, " ").slice(0, 180) : "";
    return `${r.position}. ${r.title} — ${r.domain}\n   ${snippet}`;
  }).join("\n");
}

function fmtCitations(c: AIOCitation[]): string {
  if (c.length === 0) return "(none)";
  return c.slice(0, 25).map((x) => {
    const flag = x.isClient ? " ← CLIENT" : "";
    return `${x.position}. ${x.sourceName || x.domain}${flag} (${x.domain})`;
  }).join("\n");
}

function fmtHistory(rows: KeywordReportHistoryRow[]): string {
  if (rows.length === 0) return "(no prior runs)";
  return rows.slice(0, 12).map((r) => {
    const d = new Date(r.capturedAt).toISOString().slice(0, 10);
    return `${d}  rank=${r.rankPosition ?? "—"}  AIO=${r.aioPresent ? "Y" : "N"}  cited=${r.clientCited ? "Y" : "N"}  competitors=${r.citedDomainCount}  gap=${r.gapLabel}`;
  }).join("\n");
}

// ─── Generator ────────────────────────────────────────────────

const PROMPT_BY_TYPE: Record<KeywordReportType, PromptKey> = {
  keyword_summary: "report_keyword_summary",
  keyword_detailed: "report_keyword_detailed",
  keyword_tasks: "report_keyword_tasks",
};

export async function buildKeywordReport(opts: {
  agencyId: string;
  trackedKeywordId: string;
  type: KeywordReportType;
}): Promise<{ ok: true; content: KeywordReportContent } | { ok: false; error: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { ok: false, error: "Report generator unavailable" };

  const supabase = await createClient();

  const { data: kw } = await supabase
    .from("tracked_keywords")
    .select("id, keyword, track_type, client_id, clients(name, brand_name, website)")
    .eq("id", opts.trackedKeywordId)
    .eq("agency_id", opts.agencyId)
    .maybeSingle();
  if (!kw) return { ok: false, error: "Keyword not found" };

  const clientArr = kw.clients as unknown as { name: string; brand_name: string | null; website: string | null }[] | { name: string; brand_name: string | null; website: string | null } | null;
  const client = Array.isArray(clientArr) ? clientArr[0] ?? null : clientArr;
  if (!client) return { ok: false, error: "Client not found" };

  // Agency branding
  const { data: agency } = await supabase
    .from("agencies")
    .select("name, display_name, logo_url, primary_color, support_email, report_footer")
    .eq("id", opts.agencyId)
    .single();

  const branding: KeywordReportBranding = {
    displayName: agency?.display_name ?? agency?.name ?? "Search Intelligence",
    logoUrl: agency?.logo_url ?? null,
    primaryColor: agency?.primary_color ?? "#F59E0B",
    supportEmail: agency?.support_email ?? null,
    footer: agency?.report_footer ?? null,
  };

  // Latest snapshot — pull citation_strategy too so the Task List can be
  // grounded in the patterns / gaps / page changes it identified, rather
  // than re-derive everything from scratch.
  const { data: latest } = await supabase
    .from("search_results")
    .select("id, rank_position, aio_present, client_cited, mentioned_in_text, cited_domains, aio_full_text, aio_snippet, citations_json, serp_results_json, gap_label, citation_strategy, chatgpt_checked, chatgpt_response, chatgpt_brand_cited, chatgpt_brand_mentioned, chatgpt_mention_count, chatgpt_competitors, created_at")
    .eq("tracked_keyword_id", opts.trackedKeywordId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!latest) return { ok: false, error: "No pipeline runs for this keyword yet" };

  // Entity-match columns ship in migration 029 — fetch tolerantly so older
  // databases don't break report generation.
  let chatgptEntityMatch: boolean | null = null;
  let chatgptActualEntity: string | null = null;
  try {
    const { data: entityRow } = await supabase
      .from("search_results")
      .select("chatgpt_entity_match, chatgpt_actual_entity")
      .eq("id", latest.id)
      .maybeSingle();
    if (entityRow) {
      chatgptEntityMatch = (entityRow as { chatgpt_entity_match?: boolean | null }).chatgpt_entity_match ?? null;
      chatgptActualEntity = (entityRow as { chatgpt_actual_entity?: string | null }).chatgpt_actual_entity ?? null;
    }
  } catch {
    // Columns not yet migrated — leave nulls.
  }

  const snapshot: KeywordReportSnapshot = {
    rankPosition: latest.rank_position,
    aioPresent: latest.aio_present,
    clientCited: latest.client_cited,
    mentionedInText: latest.mentioned_in_text,
    gapLabel: latest.gap_label,
    citedDomains: (latest.cited_domains as string[] | null) ?? [],
    aioFullText: (latest.aio_full_text as string | null) ?? (latest.aio_snippet as string | null),
    citations: (latest.citations_json as AIOCitation[] | null) ?? [],
    serp: (latest.serp_results_json as OrganicResult[] | null) ?? [],
    chatgptChecked: !!latest.chatgpt_checked,
    chatgptResponse: (latest.chatgpt_response as string | null) ?? null,
    chatgptBrandCited: (latest.chatgpt_brand_cited as boolean | null) ?? null,
    chatgptBrandMentioned: (latest.chatgpt_brand_mentioned as boolean | null) ?? null,
    chatgptMentionCount: (latest.chatgpt_mention_count as number | null) ?? null,
    chatgptCompetitors: (latest.chatgpt_competitors as string[] | null) ?? [],
    chatgptEntityMatch,
    chatgptActualEntity,
    capturedAt: latest.created_at,
  };

  // History (detailed only)
  let history: KeywordReportHistoryRow[] = [];
  if (opts.type === "keyword_detailed") {
    const { data: hist } = await supabase
      .from("search_results")
      .select("rank_position, aio_present, client_cited, cited_domains, gap_label, created_at")
      .eq("tracked_keyword_id", opts.trackedKeywordId)
      .order("created_at", { ascending: false })
      .limit(20);
    history = (hist ?? []).map((r) => ({
      capturedAt: r.created_at,
      rankPosition: r.rank_position,
      aioPresent: r.aio_present,
      clientCited: r.client_cited,
      citedDomainCount: ((r.cited_domains as string[] | null) ?? []).length,
      gapLabel: r.gap_label,
    }));
  }

  // Off-topic detection: reuse the brief's cached result when available
  // (one fewer LLM call, keeps us under the proxy budget). The brief
  // generator runs this check and stores aioOffTopic on the brief JSON.
  let offTopic: { onTopic: boolean; actualTopic: string } | null = null;
  const { data: cachedBrief } = await supabase
    .from("tracked_keywords")
    .select("ai_brief")
    .eq("id", opts.trackedKeywordId)
    .maybeSingle();
  const briefOffTopic = (cachedBrief?.ai_brief as { aioOffTopic?: { actualTopic: string } } | null)?.aioOffTopic;
  if (briefOffTopic) {
    offTopic = { onTopic: false, actualTopic: briefOffTopic.actualTopic };
  } else if (snapshot.aioPresent && snapshot.aioFullText && snapshot.aioFullText.length > 50) {
    // No cached value — only spend an LLM call if AIO is present and substantial.
    offTopic = await checkAioTopicRelevance({
      keyword: kw.keyword as string,
      clientBrand: client.brand_name ?? client.name,
      clientDomain: client.website ?? "",
      aioText: snapshot.aioFullText,
      apiKey,
    });
  }

  // Render prompt
  const today = new Date();
  const todayLabel = today.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const aioBlock = snapshot.aioFullText
    ? `AIO answer text (verbatim):\n"""\n${snapshot.aioFullText.slice(0, 2500)}\n"""`
    : "AIO answer text: (none)";
  const competitorList = snapshot.citedDomains.slice(0, 10).join(", ") || "none";
  const offTopicNote = offTopic && !offTopic.onTopic
    ? `\n⚠️ AIO TOPIC MISMATCH: Google's AI answer is actually about "${offTopic.actualTopic}", not the client's industry. Recommend disambiguation strategy (entity claiming, schema markup, definitional content) — NOT citation injection.`
    : "";

  // ChatGPT block — second AI surface. Tells the LLM whether the brand
  // surfaces in conversational AI and, critically, whether the response
  // was actually about the tracked entity vs a brand-name collision.
  const chatgptBlock = (() => {
    if (!snapshot.chatgptChecked) {
      return "ChatGPT-style response: (not captured for this snapshot)";
    }
    const lines: string[] = [];
    lines.push(`ChatGPT-style response captured. Brand cited as a source URL: ${snapshot.chatgptBrandCited ? "Yes" : "No"}. Brand named in the answer text: ${snapshot.chatgptBrandMentioned ? "Yes" : "No"}. Mention count: ${snapshot.chatgptMentionCount ?? 0}.`);
    if (snapshot.chatgptCompetitors.length > 0) {
      lines.push(`Competitors named by ChatGPT: ${snapshot.chatgptCompetitors.slice(0, 10).join(", ")}.`);
    }
    if (snapshot.chatgptEntityMatch === false) {
      lines.push(`⚠️ BRAND-NAME COLLISION: ChatGPT named the brand but the response is actually describing ${snapshot.chatgptActualEntity ?? "a different organisation"} — not the tracked entity. Treat "mentioned" as a false positive. Recommended response is entity-disambiguation work (Wikidata / Wikipedia presence, sameAs schema, clearer "About" content, brand+industry phrases on the home page) rather than citation injection.`);
    }
    if (snapshot.chatgptResponse) {
      lines.push(`Verbatim ChatGPT response (truncated):\n"""\n${snapshot.chatgptResponse.slice(0, 1800)}\n"""`);
    }
    return lines.join("\n");
  })();

  // When a Citation Strategy has already been run for this snapshot, fold
  // its findings into the prompt context. This is especially important for
  // the Task List type — its tickets should execute the page changes the
  // citation strategy identified rather than re-derive them.
  type StrategyShape = {
    summary?: string;
    patterns?: { name?: string; why_it_matters?: string }[];
    gaps?: { what_competitors_have?: string; what_client_likely_needs?: string }[];
    clientPageAudit?: { strengths?: string[]; weaknesses?: string[]; pageChanges?: string[] } | null;
  };
  const cs = (latest.citation_strategy as StrategyShape | null) ?? null;
  let citationStrategyBlock = "";
  if (cs) {
    const lines: string[] = ["", "=== EXISTING CITATION STRATEGY (use this as your primary blueprint) ==="];
    if (cs.summary) lines.push(`Summary: ${cs.summary}`);
    if (cs.patterns?.length) {
      lines.push("\nWinning citation patterns observed in cited competitor pages:");
      for (const p of cs.patterns) lines.push(`  • ${p.name}: ${p.why_it_matters}`);
    }
    if (cs.gaps?.length) {
      lines.push("\nGaps between competitor pages and the client:");
      for (const g of cs.gaps) lines.push(`  • Competitors have: ${g.what_competitors_have}\n    Client needs: ${g.what_client_likely_needs}`);
    }
    if (cs.clientPageAudit) {
      const a = cs.clientPageAudit;
      if (a.strengths?.length)   lines.push("\nClient page strengths:\n  • " + a.strengths.join("\n  • "));
      if (a.weaknesses?.length)  lines.push("\nClient page weaknesses:\n  • " + a.weaknesses.join("\n  • "));
      if (a.pageChanges?.length) lines.push("\nSpecific page changes recommended:\n  • " + a.pageChanges.join("\n  • "));
    }
    lines.push("=== END CITATION STRATEGY ===");
    citationStrategyBlock = lines.join("\n");
  }

  const template = await getPromptTemplate(PROMPT_BY_TYPE[opts.type]);
  const prompt = renderPrompt(template, {
    todayLabel,
    currentYear: today.getFullYear(),
    clientBrand: client.brand_name ?? client.name,
    clientDomain: client.website ?? "",
    keyword: kw.keyword,
    rankPosition: snapshot.rankPosition ? `#${snapshot.rankPosition}` : "Not ranking",
    aioPresent: snapshot.aioPresent ? "Yes" : "No",
    clientCited: snapshot.clientCited ? "Yes" : "No",
    mentionedInText: snapshot.mentionedInText ? "Yes" : "No",
    gapLabel: snapshot.gapLabel.replace(/_/g, " "),
    competitorList,
    aioBlock: aioBlock + offTopicNote + citationStrategyBlock,
    serpTop10: fmtSerp(snapshot.serp),
    citationsTable: fmtCitations(snapshot.citations),
    historyBlock: fmtHistory(history),
    chatgptBlock,
  });

  // Tasks generate the most output — give them a hard cap to keep the wall
  // clock predictable. Summary/Detailed produce shorter JSON naturally.
  const maxTokens = opts.type === "keyword_tasks" ? 1400 : 1800;

  // Optional OpenAI route — model picked per report type. Summary and
  // Detailed don't need much horsepower; Task Lists do. Falls back to
  // the free OpenRouter chain on any error so a misconfigured OpenAI
  // key never kills generation.
  let raw: string | null = null;
  const errors: string[] = [];
  try {
    const { getSetting } = await import("@/lib/settings");
    const useOpenAi = await getSetting<boolean>("openai_reports_enabled");
    if (useOpenAi && process.env.OPENAI_API_KEY) {
      const modelKey = opts.type === "keyword_tasks" ? "openai_tasks_model" : "openai_summary_model";
      const fallback = opts.type === "keyword_tasks" ? "gpt-4o" : "gpt-4o-mini";
      const openAiModel = (await getSetting<string>(modelKey)) || fallback;
      const result = await callOpenAI(prompt, openAiModel, maxTokens);
      if (result.content) raw = result.content;
      else if (result.error) errors.push(`openai: ${result.error}`);
    }
  } catch (e) {
    errors.push(`openai-setup: ${e instanceof Error ? e.message : "err"}`);
  }

  if (!raw) {
    const fallback = await callLLM(prompt, apiKey, maxTokens);
    raw = fallback.content;
    errors.push(...fallback.errors);
  }

  if (!raw) {
    console.error("[keyword-report] all LLM paths failed:", errors);
    return { ok: false, error: safeAiError(errors.slice(-1)[0]) };
  }

  let narrative: SummaryNarrative | DetailedNarrative | TasksNarrative;
  try {
    narrative = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Report generator returned invalid JSON" };
  }

  const base: BaseReportContent = {
    schema: "vsi-keyword-report-v1",
    type: opts.type,
    generatedAt: new Date().toISOString(),
    client: {
      name: client.name,
      brandName: client.brand_name,
      website: client.website ?? "",
    },
    keyword: kw.keyword as string,
    trackType: kw.track_type as string,
    branding,
    snapshot,
    aioOffTopic: offTopic && !offTopic.onTopic ? { actualTopic: offTopic.actualTopic } : null,
  };

  let content: KeywordReportContent;
  if (opts.type === "keyword_summary") {
    content = { ...base, type: "keyword_summary", narrative: narrative as SummaryNarrative };
  } else if (opts.type === "keyword_detailed") {
    content = { ...base, type: "keyword_detailed", narrative: narrative as DetailedNarrative, history };
  } else {
    content = { ...base, type: "keyword_tasks", narrative: narrative as TasksNarrative };
  }

  return { ok: true, content };
}

// Cryptographically-random share token (32 hex chars = 128 bits of entropy)
export function generateShareToken(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}
