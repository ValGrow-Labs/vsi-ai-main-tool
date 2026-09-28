// Detects when Google's AI Overview answer is on a *different topic* than the
// tracked keyword (e.g. query "best GEO agency dubai" returns an AIO about
// geotechnical engineering). When this happens, the standard
// citation-injection playbook doesn't apply — the right move is
// disambiguation / entity-clarification, not chasing AIO citations.

const MODEL = "openrouter/auto";

export async function checkAioTopicRelevance(opts: {
  keyword: string;
  clientBrand: string;
  clientDomain: string;
  aioText: string;
  apiKey: string;
}): Promise<{ onTopic: boolean; actualTopic: string } | null> {
  const prompt = `You will be given a search query and the text of an AI search-engine answer. Decide whether the AI answer is actually about the same topic the query was asking about.

Query: "${opts.keyword}"
Client industry context: ${opts.clientBrand} (${opts.clientDomain})

AI answer text:
"""
${opts.aioText.slice(0, 1800)}
"""

Examples of mismatches:
- Query "best GEO agency dubai" (Generative Engine Optimization marketing) → answer about geotechnical / soil testing companies. MISMATCH.
- Query "apple support" (the brand) → answer about apple fruit nutrition. MISMATCH.
- Query "best ai marketing agency" → answer about AI marketing agencies. MATCH.

Return ONLY this JSON: { "onTopic": true | false, "actualTopic": "<short noun phrase describing what the AI answer is actually about>" }`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://searchintel.valgrowlabs.com",
        "X-Title": "VSI Search Intelligence",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "Respond with only valid JSON, no commentary." },
          { role: "user", content: prompt },
        ],
        temperature: 0.0,
        max_tokens: 120,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]) as { onTopic?: boolean; actualTopic?: string };
    return {
      onTopic: parsed.onTopic !== false,
      actualTopic: parsed.actualTopic ?? "unknown",
    };
  } catch (e) {
    console.error("[aio-topic-relevance] failed", e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
