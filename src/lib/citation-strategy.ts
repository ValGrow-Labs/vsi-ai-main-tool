import { scrapeUrlsBatch, type FirecrawlResult } from "@/lib/firecrawl";
import { getPromptTemplate, renderPrompt } from "@/lib/prompts";
import { safeAiError } from "@/lib/safe-error";

export interface StrategyPattern {
  name: string;
  why_it_matters: string;
}

export interface StrategyGap {
  what_competitors_have: string;
  what_client_likely_needs: string;
}

export interface StrategyAction {
  step: number;
  title: string;
  detail: string;
  effort: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
}

// Side-by-side comparison the LLM produces when the client has a ranking
// page we can scrape. Empty when the client doesn't rank or the page
// couldn't be fetched.
export interface ClientPageAudit {
  url: string;
  title: string | null;
  wordCount: number;
  strengths: string[];          // what the client's page already does well
  weaknesses: string[];         // what's missing vs cited competitors
  pageChanges: string[];        // concrete edits to make on the page
}

export interface CitationStrategy {
  summary: string;
  patterns: StrategyPattern[];
  gaps: StrategyGap[];
  actions: StrategyAction[];
  clientPageAudit: ClientPageAudit | null;
  scrapedSources: Array<{
    url: string;
    title: string | null;
    wordCount: number;
    scraped: boolean;
    isClient?: boolean;
  }>;
  generatedAt: string;
}

interface SourceForLLM {
  url: string;
  title: string | null;
  wordCount: number;
  excerpt: string;
}

// Keep this short — the whole route must finish before the upstream proxy
// (Coolify default ~60-90s) drops the connection. Two models × 25s = 50s,
// plus scrape budget ~30s, fits comfortably.
const MODEL_CHAIN = [
  "openrouter/auto",
  "z-ai/glm-4.5-air:free",
];
const PER_MODEL_TIMEOUT_MS = 25000;

interface OpenRouterError { message?: string; code?: string | number }
interface OpenRouterChoice { message?: { content?: string } }
interface OpenRouterResponse { choices?: OpenRouterChoice[]; error?: OpenRouterError }

async function callOpenAIStrategy(prompt: string, model: string): Promise<{ content: string | null; error?: string }> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return { content: null, error: "OPENAI_API_KEY not configured" };
  const systemPrompt =
    "You are a senior SEO/GEO strategist. Respond ONLY with valid JSON matching the requested schema. No markdown fences, no explanation, no extra text.";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1800,
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

async function callLLM(prompt: string, apiKey: string): Promise<{ content: string | null; errors: string[] }> {
  const systemPrompt =
    "You are a senior SEO/GEO strategist. Respond ONLY with valid JSON matching the requested schema. " +
    "No markdown fences, no explanation, no extra text.";
  const errors: string[] = [];

  for (const model of MODEL_CHAIN) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PER_MODEL_TIMEOUT_MS);
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://searchintel.valgrowlabs.com",
          "X-Title": "VSI Citation Strategy",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 1800,
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        errors.push(`${model}: HTTP ${res.status} ${text.slice(0, 150)}`);
        continue;
      }
      const data = (await res.json()) as OpenRouterResponse;
      if (data.error) {
        errors.push(`${model}: ${data.error.message ?? data.error.code ?? "error"}`);
        continue;
      }
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) {
        errors.push(`${model}: empty response`);
        continue;
      }
      const stripped = content.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
      const match = stripped.match(/\{[\s\S]*\}/);
      return { content: match ? match[0] : stripped, errors };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "network error";
      errors.push(`${model}: ${msg.includes("abort") ? "timed out" : msg}`);
    } finally {
      clearTimeout(timer);
    }
  }
  return { content: null, errors };
}

// Bucket each scraped competitor URL into a pattern bucket so the LLM
// knows the citation mix at a glance (GBP-heavy means a different
// playbook than Reddit-heavy).
function bucketUrl(u: string): "GBP" | "Reddit" | "Wikipedia" | "YouTube" | "Quora" | "LinkedIn" | "Forum" | "Web" {
  try {
    const h = new URL(u).hostname.replace(/^www\./, "");
    if (h === "google.com" || h.endsWith(".google.com")) return "GBP";
    if (h.includes("reddit.com")) return "Reddit";
    if (h.includes("wikipedia.org")) return "Wikipedia";
    if (h.includes("youtube.com") || h === "youtu.be") return "YouTube";
    if (h.includes("quora.com")) return "Quora";
    if (h.includes("linkedin.com")) return "LinkedIn";
    if (/(forum|discourse|stackexchange|stackoverflow|trustpilot|sitejabber)/.test(h)) return "Forum";
    return "Web";
  } catch { return "Web"; }
}

async function buildPrompt(opts: {
  keyword: string;
  clientBrand: string;
  clientDomain: string;
  sources: SourceForLLM[];
  clientPage: SourceForLLM | null;
  allCitationUrls: string[];   // full list including non-scraped — for the mix calculation
  engagementUrls?: Array<{ url: string; domain: string; title: string | null; sourceName: string }>;
  chatgptContext?: RunStrategyInput["chatgptContext"];
}): Promise<string> {
  const sourceBlocks = opts.sources
    .map((s, i) => `--- Source ${i + 1}: ${s.title ?? s.url}\nURL: ${s.url}\nWord count: ${s.wordCount}\nExcerpt:\n${s.excerpt}\n`)
    .join("\n");

  const clientPageBlock = opts.clientPage
    ? `=== CLIENT'S CURRENT RANKING PAGE ===\nURL: ${opts.clientPage.url}\nTitle: ${opts.clientPage.title ?? "(no title)"}\nWord count: ${opts.clientPage.wordCount}\nExcerpt:\n${opts.clientPage.excerpt}\n=== END CLIENT PAGE ===\n`
    : "";

  // Citation source-mix summary — counts every URL Google cited (not just
  // the ones we scraped) so the LLM sees the real distribution.
  const buckets: Record<string, number> = {};
  for (const u of opts.allCitationUrls) {
    const b = bucketUrl(u);
    buckets[b] = (buckets[b] ?? 0) + 1;
  }
  const mixLine = Object.entries(buckets).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(" · ");
  const gbpCount = buckets.GBP ?? 0;
  const sourceMixBlock = mixLine
    ? `\n=== CITATION SOURCE MIX (${opts.allCitationUrls.length} total cited URLs) ===\n${mixLine}\n${gbpCount >= 3 ? `⚠️ GBP-HEAVY: ${gbpCount} of ${opts.allCitationUrls.length} citations are Google Business Profile listings, not regular websites. For local-intent queries this means the playbook leans heavily on GBP optimisation (services list, reviews, photos, NAP consistency) rather than just blog content.` : ""}`
    : "";

  // Direct-engagement URLs (Reddit / Quora / forum / YouTube): the AI is
  // citing a thread we can join. The recommendation should ALWAYS include
  // a specific action against that exact URL — not a generic "post on Reddit".
  const engagementBlock = (opts.engagementUrls ?? []).length > 0
    ? `\n=== DIRECT-ENGAGEMENT SOURCES (AI is citing these threads — recommend specific actions on the exact URLs) ===\n${opts.engagementUrls!.map((e, i) => `${i + 1}. ${e.sourceName || e.domain} — ${e.title ?? "(no title)"}\n   URL: ${e.url}`).join("\n")}\n\nFor EACH engagement URL above, the action plan MUST include one ticket like: "Reply to this specific Reddit thread with a credible, third-party-toned comment that mentions ${opts.clientBrand} alongside 2-3 alternatives" — naming the exact URL, the angle, and the suggested top-line of the comment. Do not write generic "post on Reddit" advice.`
    : "";

  // ChatGPT-class signal — a second AI surface buyers ask on.
  const chatgptBlock = opts.chatgptContext
    ? `\n=== CHATGPT-CLASS RESPONSE FOR THIS QUERY ===\nResponse (verbatim):\n"""\n${(opts.chatgptContext.response ?? "").slice(0, 1500)}\n"""\nClient cited by ChatGPT: ${opts.chatgptContext.clientCited ? "Yes" : "No"}\nClient mentioned by ChatGPT: ${opts.chatgptContext.clientMentioned ? "Yes" : "No"}\nCompetitors named: ${opts.chatgptContext.competitors.slice(0, 8).join(", ") || "none"}\n\nIf ChatGPT mentions competitors but not ${opts.clientBrand}, include a ticket to publish a Bing-indexable comparison page (ChatGPT browse uses Bing) — ChatGPT mentions are a leading indicator for AI-Mode citation patterns.`
    : "";

  const today = new Date();
  const todayLabel = today.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const currentYear = today.getFullYear();

  const template = await getPromptTemplate("citation_strategy");
  return renderPrompt(template, {
    todayLabel,
    currentYear,
    keyword: opts.keyword,
    clientBrand: opts.clientBrand,
    clientDomain: opts.clientDomain,
    sourceCount: opts.sources.length,
    sourceBlocks: sourceBlocks + sourceMixBlock + engagementBlock + chatgptBlock,
    clientPageBlock,
  });
}

export interface RunStrategyInput {
  keyword: string;
  clientBrand: string;
  clientDomain: string;
  citationUrls: string[];   // top N URLs from the snapshot, already filtered to non-client
  clientPageUrl?: string | null;  // client's own ranking URL, if they rank
  // URLs we should recommend engaging on directly (Reddit/Quora/forum/YouTube)
  // — useful when the AI cites a community thread we can comment on.
  engagementUrls?: Array<{ url: string; domain: string; title: string | null; sourceName: string }>;
  // The ChatGPT-class visibility signal for this same query, when captured.
  chatgptContext?: {
    response: string | null;
    clientCited: boolean;
    clientMentioned: boolean;
    competitors: string[];
  } | null;
}

export interface RunStrategyResult {
  ok: boolean;
  strategy?: CitationStrategy;
  error?: string;
}

export async function runCitationStrategy(input: RunStrategyInput): Promise<RunStrategyResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { ok: false, error: "Strategy generation isn't available: the AI service isn't configured." };
  if (input.citationUrls.length === 0) return { ok: false, error: "No citation URLs to analyze" };

  // Async generation lets us widen the funnel. Up to 10 competitor URLs
  // plus the client's own page, all scraped in parallel. Firecrawl
  // resolves google.com AMP / redirect URLs to the underlying domain.
  const competitorUrls = input.citationUrls.slice(0, 10);
  const allUrls = input.clientPageUrl ? [input.clientPageUrl, ...competitorUrls] : competitorUrls;
  const scrapedAll: FirecrawlResult[] = await scrapeUrlsBatch(allUrls, { concurrency: 5 });

  const clientScraped: FirecrawlResult | null = input.clientPageUrl ? scrapedAll[0] : null;
  const competitorScraped: FirecrawlResult[] = input.clientPageUrl ? scrapedAll.slice(1) : scrapedAll;

  const usable = competitorScraped.filter((s) => s.markdown && s.wordCount > 80);
  if (usable.length === 0) {
    return { ok: false, error: "Could not extract content from any cited pages" };
  }

  // Build LLM input
  const sources: SourceForLLM[] = usable.map((s) => ({
    url: s.url,
    title: s.title,
    wordCount: s.wordCount,
    excerpt: s.markdown.slice(0, 2200),
  }));

  const clientPage: SourceForLLM | null = clientScraped && clientScraped.markdown && clientScraped.wordCount > 80
    ? {
        url: clientScraped.url,
        title: clientScraped.title,
        wordCount: clientScraped.wordCount,
        excerpt: clientScraped.markdown.slice(0, 2200),
      }
    : null;

  const prompt = await buildPrompt({
    keyword: input.keyword,
    clientBrand: input.clientBrand,
    clientDomain: input.clientDomain,
    sources,
    clientPage,
    allCitationUrls: input.citationUrls,
    engagementUrls: input.engagementUrls,
    chatgptContext: input.chatgptContext,
  });
  // Prefer OpenAI when the super admin has enabled it (stronger model,
  // better patterns/gaps). Fall back to the free OpenRouter chain on any
  // error so a misconfigured key never breaks the analysis.
  let raw: string | null = null;
  const errors: string[] = [];
  try {
    const { getSetting } = await import("@/lib/settings");
    const useOpenAi = await getSetting<boolean>("openai_citation_enabled");
    if (useOpenAi && process.env.OPENAI_API_KEY) {
      const model = (await getSetting<string>("openai_citation_model")) || "gpt-4o";
      const result = await callOpenAIStrategy(prompt, model);
      if (result.content) raw = result.content;
      else if (result.error) errors.push(`openai: ${result.error}`);
    }
  } catch (e) {
    errors.push(`openai-setup: ${e instanceof Error ? e.message : "err"}`);
  }

  if (!raw) {
    const fallback = await callLLM(prompt, apiKey);
    raw = fallback.content;
    errors.push(...fallback.errors);
  }

  if (!raw) {
    console.error("[citation-strategy] all LLM paths failed:", errors);
    return { ok: false, error: safeAiError(errors.slice(-1)[0]) };
  }

  // The LLM can either omit clientPageAudit or supply a placeholder when
  // we didn't actually scrape a client page — normalise to null.
  type LLMResult = Omit<CitationStrategy, "scrapedSources" | "generatedAt" | "clientPageAudit"> & {
    clientPageAudit?: Partial<ClientPageAudit> | null;
  };
  let parsed: LLMResult;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "The AI returned an answer we couldn't read. Try again." };
  }

  let clientPageAudit: ClientPageAudit | null = null;
  if (clientPage && parsed.clientPageAudit) {
    const a = parsed.clientPageAudit;
    clientPageAudit = {
      url: clientPage.url,
      title: clientPage.title,
      wordCount: clientPage.wordCount,
      strengths: Array.isArray(a.strengths) ? a.strengths : [],
      weaknesses: Array.isArray(a.weaknesses) ? a.weaknesses : [],
      pageChanges: Array.isArray(a.pageChanges) ? a.pageChanges : [],
    };
  }

  const strategy: CitationStrategy = {
    summary: parsed.summary,
    patterns: parsed.patterns ?? [],
    gaps: parsed.gaps ?? [],
    actions: parsed.actions ?? [],
    clientPageAudit,
    scrapedSources: [
      ...(clientScraped
        ? [{
            url: clientScraped.url,
            title: clientScraped.title,
            wordCount: clientScraped.wordCount,
            scraped: !!clientScraped.markdown && clientScraped.wordCount > 80,
            isClient: true,
          }]
        : []),
      ...competitorScraped.map((s) => ({
        url: s.url,
        title: s.title,
        wordCount: s.wordCount,
        scraped: !!s.markdown && s.wordCount > 80,
      })),
    ],
    generatedAt: new Date().toISOString(),
  };

  return { ok: true, strategy };
}
