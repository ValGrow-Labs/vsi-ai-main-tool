import { callOpenRouter } from "@/lib/llm";
import { buildBrandTokens, countNameMentions, matchesBrand, mentionsName } from "@/lib/brand-match";
import { hostMatchesDomain } from "@/lib/url-input";
import { ProviderUnavailableError, failureReason } from "@/lib/provider-status";
import type { AIProviderAdapter, AIResponseResult } from "./types";

/**
 * Brand mentions, competitor mentions and citations in a model's answer.
 * Whole-word brand matching (never a fragment of another word or a generic
 * word from the brand name) and exact-host citation matching.
 */
export function extractCitationsAndMentions(
  text: string,
  brand: string,
  domain: string,
  competitors: string[]
): {
  brandMentioned: boolean;
  mentionCount: number;
  competitorsMentioned: string[];
  citations: string[];
  isTargetCited: boolean;
} {
  if (!text) {
    return { brandMentioned: false, mentionCount: 0, competitorsMentioned: [], citations: [], isTargetCited: false };
  }

  const tokens = buildBrandTokens({ brand, domain });
  const brandMentioned = matchesBrand(text, tokens);
  const mentionCount = brandMentioned ? Math.max(1, countNameMentions(text, tokens[0] ?? "")) : 0;

  // Extract URLs / citations from text
  const urlRegex = /https?:\/\/[^\s()<>]+\.[^\s()<>]*/gi;
  const rawUrls = text.match(urlRegex) || [];
  const citations = Array.from(new Set(rawUrls.map((u) => u.replace(/[.,;)]$/, ""))));

  // Cited = a URL whose host IS the target site (not a URL that merely contains its name).
  const isTargetCited = citations.some((c) => {
    try {
      return hostMatchesDomain(new URL(c).hostname, domain);
    } catch {
      return false;
    }
  });

  const competitorsMentioned = competitors.filter((comp) => {
    const clean = comp.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    const stem = clean.split(".")[0];
    return mentionsName(text, clean) || (stem.length >= 4 && mentionsName(text, stem));
  });

  return { brandMentioned, mentionCount, competitorsMentioned, citations, isTargetCited };
}

export class OpenRouterAIProvider implements AIProviderAdapter {
  name = "OpenRouter (Llama 3.3 70B)";

  isConfigured(): boolean {
    return !!process.env.OPENROUTER_API_KEY;
  }

  async generateResponse(
    prompt: string,
    brand: string,
    domain: string,
    competitors: string[]
  ): Promise<AIResponseResult> {
    const apiKey = process.env.OPENROUTER_API_KEY || "";
    if (!apiKey) throw new ProviderUnavailableError("openrouter", "PROVIDER_NOT_CONFIGURED");
    const startTime = Date.now();

    const systemPrompt = `You are a neutral search and AI recommendations assistant. Answer the user prompt directly and concisely.`;
    const res = await callOpenRouter("meta-llama/llama-3.3-70b-instruct", systemPrompt, prompt, apiKey);

    // No answer is a failed check — never a "not mentioned" result.
    if (!res.content) {
      throw new ProviderUnavailableError(
        "openrouter",
        res.rateLimited ? "PROVIDER_RATE_LIMITED" : "PROVIDER_ERROR",
        res.rateLimited ? "OpenRouter rate limited" : "No content returned from OpenRouter",
      );
    }

    const analysis = extractCitationsAndMentions(res.content, brand, domain, competitors);

    return {
      providerName: this.name,
      modelName: "meta-llama/llama-3.3-70b-instruct",
      prompt,
      timestamp: new Date().toISOString(),
      rawResponse: res.content,
      latencyMs: Date.now() - startTime,
      ...analysis,
    };
  }
}

export class OpenAIProvider implements AIProviderAdapter {
  name = "OpenAI (gpt-4o-mini)";

  isConfigured(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }

  async generateResponse(
    prompt: string,
    brand: string,
    domain: string,
    competitors: string[]
  ): Promise<AIResponseResult> {
    const apiKey = process.env.OPENAI_API_KEY || "";
    if (!apiKey) throw new ProviderUnavailableError("openai", "PROVIDER_NOT_CONFIGURED");
    const startTime = Date.now();

    let data: { id?: string; error?: { message?: string }; choices?: Array<{ message?: { content?: string } }> };
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Provide clear, accurate recommendations." },
            { role: "user", content: prompt },
          ],
          temperature: 0.1,
          max_tokens: 600,
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.status === 401 || res.status === 403) throw new ProviderUnavailableError("openai", "PROVIDER_AUTH_FAILED");
      if (res.status === 429) throw new ProviderUnavailableError("openai", "PROVIDER_RATE_LIMITED");
      if (!res.ok) throw new ProviderUnavailableError("openai", "PROVIDER_ERROR", `OpenAI HTTP status ${res.status}`);
      data = await res.json();
    } catch (err) {
      if (err instanceof ProviderUnavailableError) throw err;
      throw new ProviderUnavailableError("openai", failureReason(err), err instanceof Error ? err.message : "OpenAI call failed");
    }

    if (data.error) throw new ProviderUnavailableError("openai", "PROVIDER_ERROR", data.error.message || "OpenAI API error");
    const content = data.choices?.[0]?.message?.content ?? "";
    if (!content) throw new ProviderUnavailableError("openai", "INVALID_RESPONSE", "OpenAI returned no answer text");

    const analysis = extractCitationsAndMentions(content, brand, domain, competitors);

    return {
      providerName: this.name,
      modelName: "gpt-4o-mini",
      prompt,
      timestamp: new Date().toISOString(),
      rawResponse: content,
      responseId: data.id,
      latencyMs: Date.now() - startTime,
      ...analysis,
    };
  }
}

export class UnconfiguredAIProvider implements AIProviderAdapter {
  name = "Unconfigured AI Provider";

  isConfigured(): boolean {
    return false;
  }

  async generateResponse(): Promise<AIResponseResult> {
    // No provider, no result: callers must not record a check.
    throw new ProviderUnavailableError("ai", "PROVIDER_NOT_CONFIGURED", "AI provider API key (OPENROUTER_API_KEY / OPENAI_API_KEY) not configured.");
  }
}

export function getAIProvider(): AIProviderAdapter {
  if (process.env.OPENROUTER_API_KEY) {
    return new OpenRouterAIProvider();
  }
  if (process.env.OPENAI_API_KEY) {
    return new OpenAIProvider();
  }
  return new UnconfiguredAIProvider();
}
