export interface AIOIntelligence {
  brandMentioned: boolean;
  mentionProminence: "headline" | "body" | "list" | "none";
  mentionSentiment: "positive" | "neutral" | "negative" | "none";
  clientRankInAIO: number | null;
  topCompetitors: string[];
  insight: string;
  recommendedAction: string;
  /** True when no model produced this: every other field is a placeholder. */
  unavailable?: boolean;
}

// Returned when no model could analyse the answer. Marked unavailable: its
// fields are placeholders, not findings, and callers must not show them as such.
const FALLBACK: AIOIntelligence = {
  unavailable: true,
  brandMentioned: false,
  mentionProminence: "none",
  mentionSentiment: "none",
  clientRankInAIO: null,
  topCompetitors: [],
  insight: "AI analysis unavailable.",
  recommendedAction: "Review the AI Overview manually.",
};

// Model chain: Llama first (user preference), then fallbacks
const MODEL_CHAIN = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "minimax/minimax-m2.5:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
];

function extractJSON(text: string): string {
  // Strip markdown code fences
  const stripped = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
  // Find first { ... } block in case model adds explanation
  const match = stripped.match(/\{[\s\S]*\}/);
  return match ? match[0] : stripped;
}

export async function callOpenRouter(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
  maxTokens = 600,
): Promise<{ content: string | null; rateLimited: boolean }> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://vsi.valgrowlabs.com",
      "X-Title": "VSI Search Intelligence",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: maxTokens,
    }),
  });

  const data = await res.json();

  if (data.error) {
    const isRateLimit = data.error.code === 429 ||
      data.error.message?.toLowerCase().includes("rate");
    return { content: null, rateLimited: isRateLimit };
  }

  const content = data.choices?.[0]?.message?.content?.trim() ?? null;
  return { content, rateLimited: false };
}

export async function analyzeAIO(
  keyword: string,
  brand: string,
  aioSnippet: string,
  citedSources: string[]
): Promise<AIOIntelligence> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || !aioSnippet) return FALLBACK;

  const systemPrompt =
    "You are a JSON API for SEO intelligence analysis. " +
    "Respond with only valid JSON, no markdown, no explanation, no extra text.";

  const userPrompt = `Analyze this Google AI Overview text for mentions of the brand "${brand}".

AI Overview text:
"""
${aioSnippet}
"""

Cited source domains: ${citedSources.length ? citedSources.join(", ") : "none"}
Keyword: "${keyword}"

Return exactly this JSON structure:
{
  "brandMentioned": boolean,
  "mentionProminence": "headline" | "body" | "list" | "none",
  "mentionSentiment": "positive" | "neutral" | "negative" | "none",
  "clientRankInAIO": number | null,
  "topCompetitors": string[],
  "insight": string,
  "recommendedAction": string
}

Definitions:
- mentionProminence: "headline" = first sentence, "body" = paragraph, "list" = bullet point only, "none" = not found
- clientRankInAIO: ordinal position among named brands (1 = first named). null if not mentioned
- topCompetitors: other brands mentioned more prominently than "${brand}" (max 5)
- insight: one punchy sentence for an SEO agency. Max 20 words.
- recommendedAction: one concrete next step. Max 15 words.`;

  for (const model of MODEL_CHAIN) {
    try {
      const { content, rateLimited } = await callOpenRouter(
        model,
        systemPrompt,
        userPrompt,
        apiKey
      );

      if (rateLimited) {
        // Try next model in chain
        continue;
      }

      if (!content) continue;

      const jsonStr = extractJSON(content);
      const parsed = JSON.parse(jsonStr) as AIOIntelligence;
      return parsed;
    } catch {
      // Parse error or network error — try next model
      continue;
    }
  }

  return FALLBACK;
}

// ─────────────────────────────────────────
// Citation Intelligence — why Google cited this page
// ─────────────────────────────────────────

export interface CitationIntelligence {
  whyCited: string[];           // 3–5 reasons Google picked this page
  contentSignals: string[];     // E-E-A-T / authority signals present
  keyTopics: string[];          // main topics the page covers
  missingFromClient: string[];  // content gaps vs competitor
  citabilityScore: number;      // 1–10 estimate of how citable this is
  summary: string;              // one sentence agency can show client
  /** True when no model produced this: every other field is a placeholder. */
  unavailable?: boolean;
}

// Returned when no model could analyse the page. Marked unavailable (the score
// is a placeholder, not a real 0/10).
const CITATION_FALLBACK: CitationIntelligence = {
  unavailable: true,
  whyCited: [],
  contentSignals: [],
  keyTopics: [],
  missingFromClient: [],
  citabilityScore: 0,
  summary: "Analysis unavailable.",
};

export async function analyzeCitation(
  keyword: string,
  sourceName: string,
  pageMarkdown: string,
  clientBrand: string
): Promise<CitationIntelligence> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || !pageMarkdown) return CITATION_FALLBACK;

  const systemPrompt =
    "You are a JSON API for SEO content intelligence. " +
    "Respond with only valid JSON, no markdown, no explanation, no extra text.";

  // Truncate markdown to keep prompt manageable
  const content = pageMarkdown.slice(0, 4000);

  const userPrompt = `Google's AI Overview cited this page for the keyword "${keyword}".
Source: ${sourceName}
Client brand being compared against: ${clientBrand}

Page content (markdown):
"""
${content}
"""

Analyze why Google is citing this page and what ${clientBrand} is missing.

Return exactly this JSON:
{
  "whyCited": string[],
  "contentSignals": string[],
  "keyTopics": string[],
  "missingFromClient": string[],
  "citabilityScore": number,
  "summary": string
}

Definitions:
- whyCited: 3–5 specific reasons this page earned an AIO citation (be specific to the content)
- contentSignals: E-E-A-T signals present (e.g. "author credentials", "statistics cited", "case studies", "client logos", "awards mentioned")
- keyTopics: main topics this page covers that relate to the keyword
- missingFromClient: specific content elements ${clientBrand} likely lacks based on this page
- citabilityScore: 1–10 score for how citable this content is (10 = highly structured, authoritative, data-rich)
- summary: one sentence an SEO agency would say to their client about this competitor. Max 25 words.`;

  for (const model of MODEL_CHAIN) {
    try {
      const { content: raw, rateLimited } = await callOpenRouter(
        model,
        systemPrompt,
        userPrompt,
        apiKey
      );

      if (rateLimited) continue;
      if (!raw) continue;

      const jsonStr = extractJSON(raw);
      const parsed = JSON.parse(jsonStr) as CitationIntelligence;
      return parsed;
    } catch {
      continue;
    }
  }

  return CITATION_FALLBACK;
}
