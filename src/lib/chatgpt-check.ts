import { buildBrandTokens, countNameMentions, matchesBrand, mentionsName } from "@/lib/brand-match";
import { failureReason, type AiCheckStatus, type ProviderFailureReason } from "@/lib/provider-status";
import { checkChatGPTEntityMatch } from "@/lib/chatgpt-entity-check";

export interface ChatGPTCheckResult {
  checked: boolean;
  response: string | null;
  brand_cited: boolean | null;
  brand_mentioned: boolean | null;
  mention_count: number | null;
  competitors: string[];
  cited_urls: string[];
  // Entity disambiguation — when brand_mentioned is true, a follow-up LLM
  // call decides whether the response is actually about the tracked
  // brand (vs a different organisation with the same name). Null when
  // the check wasn't run (brand not mentioned, or LLM unavailable).
  entity_match: boolean | null;
  entity_actual: string | null;
  skipped_reason?: string;
  /** "answered" when OpenAI returned an answer; otherwise why there is no result. */
  status: AiCheckStatus;
  failure_reason?: ProviderFailureReason;
  /** Provenance of the answer. Only OpenAI answers are ever labelled ChatGPT. */
  provider: "openai" | null;
  model: string | null;
  checked_at: string;
}

/** A competitor the project tracks. */
export interface ProjectCompetitor {
  domain: string;
  name?: string | null;
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string;
      annotations?: Array<{
        type?: string;
        url_citation?: { url?: string; title?: string };
      }>;
    };
  }>;
  error?: { message?: string };
}

/**
 * Which of the project's own competitors the answer names. Matches the
 * competitor's name or its domain / domain stem as whole words. No built-in
 * list: without tracked competitors this returns [].
 */
export function findCompetitorMentions(text: string, competitors: ProjectCompetitor[]): string[] {
  const found = new Set<string>();
  for (const c of competitors) {
    const domain = (c.domain || "").toLowerCase().replace(/^[a-z]+:\/+/, "").replace(/^www\./, "").split(/[/?#]/)[0];
    if (!domain) continue;
    const stem = domain.split(".")[0];
    const candidates = [c.name ?? "", domain, stem.length >= 4 ? stem : ""].filter(Boolean);
    if (candidates.some((n) => mentionsName(text, n))) found.add(domain);
  }
  return Array.from(found);
}

function countMentions(text: string, brand: string): number {
  if (!brand) return 0;
  const tokens = buildBrandTokens({ brand, domain: "" });
  if (tokens.length === 0) return 0;
  // Count the brand itself (the first, strictest token) as whole words.
  return countNameMentions(text, tokens[0]);
}

function extractCitedUrls(annotations: Array<{ type?: string; url_citation?: { url?: string } }> | undefined): string[] {
  if (!annotations) return [];
  const urls = new Set<string>();
  for (const a of annotations) {
    const u = a?.url_citation?.url;
    if (u && /^https?:\/\//.test(u)) urls.add(u);
  }
  return Array.from(urls);
}

function skipped(reason: string, status: AiCheckStatus, failure?: ProviderFailureReason, model: string | null = null): ChatGPTCheckResult {
  return {
    checked: false,
    response: null,
    brand_cited: null,
    brand_mentioned: null,
    mention_count: null,
    competitors: [],
    cited_urls: [],
    entity_match: null,
    entity_actual: null,
    skipped_reason: reason,
    status,
    failure_reason: failure,
    provider: status === "not_checked" ? null : "openai",
    model,
    checked_at: new Date().toISOString(),
  };
}

export async function runChatGPTCheck(opts: {
  keyword: string;
  clientBrand: string;
  clientDomain: string;
  /** The project's tracked competitors; the only source of competitor mentions. */
  competitors?: ProjectCompetitor[];
}): Promise<ChatGPTCheckResult> {
  const openaiKey = process.env.OPENAI_API_KEY;

  // The ChatGPT check is answered by OpenAI only. Without an OpenAI key the
  // check doesn't run (not checked) — another model's answer is never
  // stored or labelled as ChatGPT.
  if (!openaiKey) {
    return skipped("ChatGPT checks need OPENAI_API_KEY", "not_checked", "PROVIDER_NOT_CONFIGURED");
  }

  const endpoint = "https://api.openai.com/v1/chat/completions";
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${openaiKey}`,
    "Content-Type": "application/json",
  };
  // Model is super-admin-configurable so we can balance cost vs grounding.
  // Default = plain gpt-4o-mini (no per-search fee). Flip to
  // gpt-4o-mini-search-preview from /admin/settings when an agency
  // is paying for the search tier.
  const { getSetting } = await import("@/lib/settings");
  const searchEnabled = await getSetting<boolean>("openai_search_enabled");
  const configuredModel = await getSetting<string>("openai_chatgpt_model");
  const model = searchEnabled ? "gpt-4o-mini-search-preview" : (configuredModel || "gpt-4o-mini");

  const today = new Date();
  const todayLabel = today.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const currentYear = today.getFullYear();

  const messages: OpenAIMessage[] = [
    {
      role: "system",
      content:
        `Today's date is ${todayLabel}. The current year is ${currentYear}. Any year you mention in your answer MUST be ${currentYear} or later — never an earlier year. ` +
        "You are a helpful research assistant. When asked a question, answer concisely " +
        "based on what you know. Reference real businesses, products, or sources where " +
        "appropriate. Keep the answer under 400 words.",
    },
    { role: "user", content: opts.keyword },
  ];

  // Per-call timeout so a hanging free model doesn't stall the pipeline
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40000);

  let data: OpenAIResponse;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 800,
        temperature: 0.3,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const reason: ProviderFailureReason =
        res.status === 401 || res.status === 403 ? "PROVIDER_AUTH_FAILED" : res.status === 429 ? "PROVIDER_RATE_LIMITED" : "PROVIDER_ERROR";
      return skipped(`HTTP ${res.status} ${text.slice(0, 200)}`, "check_failed", reason, model);
    }
    try {
      data = (await res.json()) as OpenAIResponse;
    } catch {
      return skipped("OpenAI returned invalid JSON", "check_failed", "INVALID_RESPONSE", model);
    }
    if (data.error) {
      return skipped(data.error.message ?? "LLM API error", "check_failed", "PROVIDER_ERROR", model);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    return skipped(msg.includes("abort") ? "Timed out after 40s" : msg, "check_failed", msg.includes("abort") ? "PROVIDER_TIMEOUT" : failureReason(err), model);
  } finally {
    clearTimeout(timer);
  }

  const message = data.choices?.[0]?.message;
  const response = message?.content?.trim() ?? null;
  // Annotations (URL citations) are only emitted by OpenAI's web-search-
  // enabled models — open-weight models on OpenRouter won't include them.
  const citedUrls = extractCitedUrls(message?.annotations);

  if (!response) {
    // No answer text means nothing was checked — not "not mentioned".
    return skipped("Empty response from OpenAI", "check_failed", "INVALID_RESPONSE", model);
  }

  const brandTokens = buildBrandTokens({ brand: opts.clientBrand, domain: opts.clientDomain });
  const mentionedInText = matchesBrand(response, brandTokens);
  const mentionCount = countMentions(response, opts.clientBrand);

  const cleanDomain = opts.clientDomain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .toLowerCase();

  const brandCited = cleanDomain
    ? citedUrls.some((u) => {
        try {
          const host = new URL(u).hostname.replace(/^www\./, "").toLowerCase();
          return host === cleanDomain || host.endsWith(`.${cleanDomain}`);
        } catch {
          return false;
        }
      })
    : false;

  const competitors = findCompetitorMentions(response, opts.competitors ?? []);

  // Entity disambiguation. Only worth the extra LLM call when the brand
  // name actually appeared — if it didn't, there's nothing to disambiguate.
  // A direct domain citation also confirms identity, so skip the check
  // when brand_cited is true.
  let entityMatch: boolean | null = null;
  let entityActual: string | null = null;
  if (mentionedInText && !brandCited) {
    try {
      const verdict = await checkChatGPTEntityMatch({
        clientBrand: opts.clientBrand,
        clientDomain: opts.clientDomain,
        keyword: opts.keyword,
        response,
      });
      if (verdict) {
        entityMatch = verdict.aboutClient;
        entityActual = verdict.aboutClient ? null : verdict.actualEntity;
      }
    } catch (e) {
      console.error("[chatgpt-check] entity disambiguation failed", e);
    }
  } else if (brandCited) {
    // Domain citation is a definitive identity signal.
    entityMatch = true;
  }

  return {
    checked: true,
    response,
    brand_cited: brandCited,
    brand_mentioned: mentionedInText,
    mention_count: mentionCount,
    competitors,
    cited_urls: citedUrls,
    entity_match: entityMatch,
    entity_actual: entityActual,
    status: "answered",
    provider: "openai",
    model,
    checked_at: new Date().toISOString(),
  };
}
