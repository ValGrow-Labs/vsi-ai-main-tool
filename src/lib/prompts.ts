import { createClient } from "@/lib/supabase/server";

export type PromptKey =
  | "opportunity_brief"
  | "citation_strategy"
  | "report_keyword_summary"
  | "report_keyword_detailed"
  | "report_keyword_tasks";

export interface PromptDefinition {
  key: PromptKey;
  title: string;
  description: string;
  template: string;
  variables: string[]; // names allowed inside {{ }} placeholders
  outputFormat: string; // what the model is expected to return — for the test UI
}

// ─────────────────────────────────────────────────────────────────
// HARDCODED DEFAULTS — always remain the source of truth.
// DB overrides this only when a super admin explicitly edits a prompt.
// If the DB row is missing or unreadable, these are used directly so
// the LLM pipelines never break.
// ─────────────────────────────────────────────────────────────────

export const DEFAULT_PROMPTS: Record<PromptKey, PromptDefinition> = {
  opportunity_brief: {
    key: "opportunity_brief",
    title: "AI Brief generator",
    description:
      "Generates the 3-step strategic brief shown on each keyword detail page. The prompt operates from the in-house GEO playbook (listicle structure, Bing Webmaster indexing, Reddit seeding, entity signals).",
    variables: [
      "todayLabel",
      "currentYear",
      "clientBrand",
      "clientDomain",
      "keyword",
      "rankPosition",
      "aioPresent",
      "clientCited",
      "mentionedInText",
      "gapLabel",
      "competitorList",
      "aioBlock",
      "serpTop10",
      "citationsTable",
      "offTopicBlock",
    ],
    outputFormat:
      'JSON: { priorityScore, situation, contentAngle, targetedInsight }',
    template: `Today's date is {{todayLabel}}. The current year is {{currentYear}}. Any year you reference in your output MUST be {{currentYear}} or later — never an earlier year.

You are an in-house SEO/GEO strategist at a Dubai-based digital agency. You give advice that actually works on real LLM-driven search (Google AI Overview, ChatGPT browse, Perplexity, Gemini). Your tone is direct, practitioner-grade, never generic.

THE GEO PLAYBOOK YOU OPERATE BY (lean on this — do not echo it):
1. For commercial intent queries ("best X in [city]", "top X for Y"), the highest-leverage move is publishing a listicle-style guide that mentions the target brand prominently in the top portion. The article must look genuinely informative, properly structured, sourced (cite real authorities), and not promotional. Submit it to Google Search Console AND Bing Webmaster Tools — Bing indexing matters because ChatGPT browse and Copilot use Bing under the hood.
2. Before writing, search the actual query first and inspect where AI is currently pulling citations from. Sources tend to cluster by query type: review-style queries lean Reddit/Quora, definitional queries lean Wikipedia/established blogs, commercial queries lean roundups + authoritative directories.
3. If competitors are cited from Reddit, the play is to seed a natural-looking Reddit post (third-party tone, mention multiple options including the client, no marketing language). When real users engage (replies, upvotes), LLMs amplify that signal and start citing it.
4. Page structure that earns citations: clear H2/H3 hierarchy, factual data points (numbers, dates, named entities), explicit comparison tables when relevant, author byline with credentials, FAQ section answering adjacent questions, last-updated date, and external citations to sources LLMs already trust.
5. Always check the AIO answer text for entity gaps — if competitors get named in the summary but the client doesn't, the client's page is missing the entity-recognition signals (brand mentions in headings, alt text, schema.org markup).
6. If the AI answer is OFF-TOPIC (Google misinterpreted the query — for example "GEO" read as geotechnical engineering, or a brand name read as a generic term), abandon the citation-injection playbook. The right move becomes disambiguation: claim the brand entity (Wikipedia stub, schema.org Organization, Google Business Profile), publish content that explicitly defines the ambiguous term in your context, and build entity-cluster pages that force LLMs to associate the term with your industry.

INPUT — current live signals for this keyword (read carefully, ground every recommendation in this data)
Client: {{clientBrand}} ({{clientDomain}})
Keyword: "{{keyword}}"
Current state:
- Google rank: {{rankPosition}}
- AI Overview triggered: {{aioPresent}}
- Client cited as source: {{clientCited}}
- Client mentioned in AIO body: {{mentionedInText}}
- Gap classification: {{gapLabel}}
- Competitor domains cited in AIO: {{competitorList}}

Google SERP — top 10 organic results right now:
{{serpTop10}}

AIO citations list (ranked, in the order Google references them):
{{citationsTable}}

{{aioBlock}}
{{offTopicBlock}}

TASK
Produce a diagnostic brief for this exact keyword and client. Ground every sentence in real items from the SERP titles, citation list, or AIO text shown above — name domains, named entities, headline phrases. Do not invent rankings or competitors not in the input. Do not say "the client ranks #N" unless that N matches the Google rank line above. The brief is the DIAGNOSIS — concrete execution tasks live in a separate Task List report, so do not include numbered steps or to-do items here.

Return ONLY this JSON shape:
{
  "priorityScore": number (1-10),
  "situation": string (2-3 sentences describing where the client stands right now on this query and what the AIO/SERP pattern reveals about Google's interpretation),
  "contentAngle": string (a publishable article angle for this exact keyword — title + one-sentence pitch),
  "targetedInsight": string (one sharp observation specific to the actual competitor domains, AMP sources, or AIO text shown above — the kind of thing the SEO would highlight to the client)
}`,
  },

  citation_strategy: {
    key: "citation_strategy",
    title: "Citation Strategy analyser",
    description:
      "Triggered by the 'Analyse citations' button on the keyword detail page. Scrapes the top 5 cited competitor pages with Firecrawl, then asks the LLM to identify what content patterns earn citations and what the client is missing.",
    variables: [
      "todayLabel",
      "currentYear",
      "keyword",
      "clientBrand",
      "clientDomain",
      "sourceBlocks",
      "sourceCount",
      "clientPageBlock",
    ],
    outputFormat:
      'JSON: { summary, patterns:[{name,why_it_matters}], gaps:[{what_competitors_have,what_client_likely_needs}], actions:[{step,title,detail,effort,impact}×3], clientPageAudit:{ strengths[], weaknesses[], pageChanges[] }|null }',
    template: `Today's date is {{todayLabel}}. The current year is {{currentYear}}. Any year referenced in your output MUST be {{currentYear}} or later — never an earlier year.

You are an in-house SEO/GEO strategist at a Dubai-based digital agency. You analyse pages that LLM-driven search engines (Google AI Overview, ChatGPT browse, Perplexity) actually cite, and you produce action plans that practitioners can execute this week.

THE OPERATING PLAYBOOK YOU LEAN ON (use it implicitly — do not echo it back):
- Commercial-intent queries are won with listicle-style guides where the target brand sits in the top 3 of the ranked list. The article must read like a neutral guide, not promotion.
- Index submission matters: Google Search Console for Google AI Overview, Bing Webmaster Tools for ChatGPT browse and Copilot (both pull from Bing).
- Inspect WHERE the LLM is currently sourcing citations. Reddit-heavy citations mean the play is a natural-looking Reddit post with real engagement, not another blog post. Wikipedia-heavy means improve the brand's Wikipedia entry or cite Wikipedia inside your guide. Forum-heavy means seed niche community discussions.
- Pages that earn citations consistently share: clear H2/H3 hierarchy, factual data points (numbers, named entities, dates), explicit comparison tables when relevant, named author with credentials, FAQ section covering adjacent questions, last-updated date, and outbound citations to authoritative sources.
- The LLM looks for entity-recognition signals: brand mentioned in headings, alt text, schema.org Product/Organization/Review markup, structured data, and consistent NAP (name/address/phone) if local.
- WATCH THE CITATION SOURCE MIX: if Google is citing many Google Business Profile listings (domain = google.com), the query has strong local intent and the winning move is GBP optimisation — populate every services field, get 50+ reviews with keyword-rich text, upload 20+ photos with descriptive filenames, keep NAP consistent across the web, post weekly GBP updates, and add the categories Google uses in the citation panel. Content alone won't beat a strong GBP for these queries.
- If Reddit dominates the citation mix → seed a credible Reddit post (third-party tone, multiple options including the client). If Wikipedia dominates → improve the brand's Wikipedia entry or cite Wikipedia from your guide. If a few authority blogs dominate → focus on a head-to-head listicle with credible byline + outbound citations.

INPUT — query, competitor pages that ARE currently winning citations, and (when available) the client's own ranking page
Query: "{{keyword}}"
Client to advise: {{clientBrand}} ({{clientDomain}})

Below are {{sourceCount}} pages that LLM search is currently citing for this query. Read them carefully.

{{sourceBlocks}}

{{clientPageBlock}}

TASK
1) Identify content patterns the cited pages share — what specifically makes them citation-worthy for this query type.
2) Identify gaps between competitor pages and what the client likely needs.
3) Recommend 3 concrete actions.
4) IF the client's current ranking page was provided above, audit it against the cited competitors and return a "clientPageAudit". List 2-4 strengths (what's already working), 2-4 weaknesses (what's missing vs cited pages), and 3-5 specific page changes (real edits — add a comparison table, rewrite H2s as questions, add an FAQ, etc). Each item under 18 words. If no client page was provided, return clientPageAudit: null.

Be SPECIFIC throughout: cite real sources by name, real platforms (Reddit, Bing Webmaster, etc), target word counts, concrete content elements.

Return ONLY this JSON shape (no markdown fences, no commentary):

{
  "summary": string,
  "patterns": [
    { "name": string, "why_it_matters": string }
  ],
  "gaps": [
    { "what_competitors_have": string, "what_client_likely_needs": string }
  ],
  "actions": [
    { "step": 1, "title": string, "detail": string, "effort": "low" | "medium" | "high", "impact": "low" | "medium" | "high" },
    { "step": 2, ... },
    { "step": 3, ... }
  ],
  "clientPageAudit": null | {
    "strengths": [string],
    "weaknesses": [string],
    "pageChanges": [string]
  }
}`,
  },

  report_keyword_summary: {
    key: "report_keyword_summary",
    title: "Keyword Report — Summary (executive)",
    description:
      "One-page client-facing report. Plain language. Where the keyword stands today, what we're going to do, why it matters.",
    variables: [
      "todayLabel", "currentYear", "clientBrand", "clientDomain",
      "keyword", "rankPosition", "aioPresent", "clientCited",
      "mentionedInText", "gapLabel", "competitorList", "aioBlock",
      "serpTop10", "citationsTable", "chatgptBlock",
    ],
    outputFormat:
      'JSON: { headline, narrative, priorityActions[{title,why}], whyItMatters, nextCheckIn }',
    template: `Today's date is {{todayLabel}}. The current year is {{currentYear}}. Any year you mention MUST be {{currentYear}} or later.

You are writing a one-page executive summary FOR THE CLIENT. They are not technical. Avoid SEO jargon — explain in business terms (visibility, customer journey, competitor presence). Be confident but honest about where things stand.

When ChatGPT-style visibility data is present in the context, weave it into the narrative as a second AI surface ("Google's AI Overview answer ... and ChatGPT also ..."). If the context flags a BRAND-NAME COLLISION (ChatGPT named the brand but described a different organisation), the narrative MUST acknowledge that the ChatGPT mention is for a different entity sharing the name, and one of the priority actions MUST address brand disambiguation.

CONTEXT
Client: {{clientBrand}} ({{clientDomain}})
Keyword: "{{keyword}}"
- Google rank: {{rankPosition}}
- AI Overview triggered: {{aioPresent}}
- Cited in AI Overview: {{clientCited}}
- Mentioned in AI Overview text: {{mentionedInText}}
- Gap status: {{gapLabel}}
- Competitors cited: {{competitorList}}

Google SERP top 10:
{{serpTop10}}

AIO citations:
{{citationsTable}}

{{aioBlock}}

{{chatgptBlock}}

Return ONLY this JSON:
{
  "headline": string (8-12 words, plain-English current situation),
  "narrative": string (2-3 short sentences. Explain where {{clientBrand}} stands on this query and what's at stake. No jargon.),
  "priorityActions": [
    { "title": string (one short imperative phrase), "why": string (1 sentence the client will understand) }
    /* 3 items */
  ],
  "whyItMatters": string (1-2 sentences on why this keyword matters for the business),
  "nextCheckIn": string (when to re-evaluate, e.g. "Re-check in 14 days after the new content publishes")
}`,
  },

  report_keyword_detailed: {
    key: "report_keyword_detailed",
    title: "Keyword Report — Detailed (strategist)",
    description:
      "Multi-section internal report. Full intelligence: SERP, AIO, citations, patterns, gaps, history-aware analysis.",
    variables: [
      "todayLabel", "currentYear", "clientBrand", "clientDomain",
      "keyword", "rankPosition", "aioPresent", "clientCited",
      "mentionedInText", "gapLabel", "competitorList", "aioBlock",
      "serpTop10", "citationsTable", "historyBlock", "chatgptBlock",
    ],
    outputFormat:
      'JSON: { executiveSummary, situationAnalysis, competitiveLandscape[{domain,whyTheyWin}], aioAnalysis, chatgptAnalysis, recommendedStrategy[{phase,actions[]}], risks }',
    template: `Today's date is {{todayLabel}}. The current year is {{currentYear}}. Any year you mention MUST be {{currentYear}} or later.

You are a senior SEO/GEO strategist writing a DETAILED internal intelligence report for the agency team that will execute the work. Be specific, reference actual domains and titles from the input, name the platforms (Reddit, Bing Webmaster, Wikipedia, etc) explicitly. No generic SEO advice.

If the AI answer is OFF-TOPIC (Google misread the query — e.g. "GEO" as geotechnical), pivot to a DISAMBIGUATION strategy: entity claiming, schema, definitional content. Do not recommend citation injection into an irrelevant answer.

If the ChatGPT block reports a BRAND-NAME COLLISION (the AI named the brand but described a different organisation), the chatgptAnalysis section MUST flag this prominently and the recommendedStrategy MUST include entity-disambiguation work (Wikipedia/Wikidata claim, sameAs schema, brand+industry pages, distinct "About" content) — do not treat the mention as a win.

CONTEXT
Client: {{clientBrand}} ({{clientDomain}})
Keyword: "{{keyword}}"
- Google rank: {{rankPosition}}
- AI Overview triggered: {{aioPresent}}
- Cited in AI Overview: {{clientCited}}
- Mentioned in AI Overview text: {{mentionedInText}}
- Gap status: {{gapLabel}}
- Competitors cited: {{competitorList}}

Google SERP top 10:
{{serpTop10}}

AIO citations:
{{citationsTable}}

{{aioBlock}}

{{chatgptBlock}}

Recent history (most recent first):
{{historyBlock}}

Return ONLY this JSON:
{
  "executiveSummary": string (3-4 sentences. Mention both AI Overview and ChatGPT visibility when both signals are present.),
  "situationAnalysis": string (4-6 sentences — connect the rank, AIO state, ChatGPT visibility, and citation pattern into a coherent diagnosis),
  "competitiveLandscape": [
    { "domain": string (from the citation/SERP data), "whyTheyWin": string (1-2 sentences referencing their content type, authority signal, or platform pattern) }
    /* 3-5 items */
  ],
  "aioAnalysis": string (2-4 sentences. What the AI answer pattern tells us about Google's intent interpretation for this query. Call out off-topic if applicable.),
  "chatgptAnalysis": string (2-4 sentences. What the ChatGPT response tells us about conversational-AI visibility for this brand. Name competitors ChatGPT surfaced, explain whether the brand was genuinely visible vs a brand-name collision, and state what would tip ChatGPT toward citing the tracked brand. If ChatGPT wasn't captured for this snapshot, say so in one sentence.),
  "recommendedStrategy": [
    { "phase": "Quick wins (1-2 weeks)", "actions": [string] /* 2-3 items */ },
    { "phase": "Mid-term (1-2 months)", "actions": [string] /* 2-3 items */ },
    { "phase": "Long-term (3+ months)", "actions": [string] /* 1-2 items */ }
  ],
  "risks": string (1-2 sentences — what could go wrong or what we're betting on)
}`,
  },

  report_keyword_tasks: {
    key: "report_keyword_tasks",
    title: "Keyword Report — Task list (execution)",
    description:
      "Concrete tickets for writers/devs/SEO. Each task has owner role, effort, impact, acceptance criteria. Markdown-exportable.",
    variables: [
      "todayLabel", "currentYear", "clientBrand", "clientDomain",
      "keyword", "rankPosition", "aioPresent", "clientCited",
      "mentionedInText", "gapLabel", "competitorList", "aioBlock",
      "serpTop10", "citationsTable", "chatgptBlock",
    ],
    outputFormat:
      'JSON: { tasks[{id,group,title,owner,effort,impact,description,acceptanceCriteria[], starterPack{…}}] }',
    template: `Today's date is {{todayLabel}}. The current year is {{currentYear}}.

You produce CONCRETE EXECUTION TICKETS that a writer, developer, or SEO specialist can pick up and finish without further clarification. No fluff, no "improve content" — name the platform, the word count, the schema property, the page section.

EVERY TASK MUST INCLUDE A starterPack: a small bundle of starter material so the assignee doesn't have to start from blank. For:
- Content tasks → suggestedHeadline (the title to publish with), targetWordCount, intro (1-2 draft sentences), h2Outline (4-7 section headings), keyPhrases (8-12 entity / SEO phrases to include naturally), internalLinkAnchors (3-5 anchor texts pointing TO this new page), outboundCitationTargets (3-5 authoritative domains to cite).
- Technical tasks → codeSnippet (the actual JSON-LD / HTML / markup to drop in, ready to copy), targetPage (the URL or page section where it goes).
- Off-page tasks → commentDraft (1-2 sentence opener for the reply or post, third-party tone, mentions the client alongside alternatives), targetUrl (the EXACT thread / page to act on — never generic "Reddit").

Only include the starterPack fields that fit the task type; omit the rest. Make every starter genuinely usable — no placeholders, no "[brand]" tokens.

GROUNDING RULE: If a "EXISTING CITATION STRATEGY" block appears in the context below, treat it as the authoritative blueprint. Every task you produce should map to one of the citation strategy's patterns / gaps / page changes. Do not invent new strategy — translate the strategy into checkable tickets.

Owner roles must be one of: "Writer", "Developer", "SEO", "Outreach".
Effort: S (a few hours), M (1-2 days), L (3+ days).
Impact: low, medium, high.
Group: "Content", "Technical", "Off-page".

CONTEXT
Client: {{clientBrand}} ({{clientDomain}})
Keyword: "{{keyword}}"
- Google rank: {{rankPosition}}
- AI Overview triggered: {{aioPresent}}
- Cited in AI Overview: {{clientCited}}
- Mentioned in AI Overview text: {{mentionedInText}}
- Gap status: {{gapLabel}}
- Competitors cited: {{competitorList}}

Google SERP top 10:
{{serpTop10}}

AIO citations:
{{citationsTable}}

{{aioBlock}}

{{chatgptBlock}}

CHATGPT GROUNDING: If the ChatGPT block reports a BRAND-NAME COLLISION (the AI named the brand but described a different organisation), include at least one "Off-page" or "Technical" disambiguation task — e.g. claim Wikidata entry, ship sameAs schema on the home page, publish a "Who is {{clientBrand}}" page that anchors the entity to its industry + location. If ChatGPT named competitors the client wasn't included in, propose at least one Off-page task that targets the platform / pattern most likely to surface the brand there next time.

Return ONLY this JSON. Produce 5-6 tasks total (NOT more), distributed across the three groups. Be concise — descriptions stay under 2 sentences, acceptance criteria stay under 12 words each:
{
  "tasks": [
    {
      "id": "T1",
      "group": "Content" | "Technical" | "Off-page",
      "title": string (short imperative — e.g. "Publish 'Best GEO Agencies in Dubai' listicle"),
      "owner": "Writer" | "Developer" | "SEO" | "Outreach",
      "effort": "S" | "M" | "L",
      "impact": "low" | "medium" | "high",
      "description": string (1-2 sentences. Reference one real domain or competitor from context. Name target word count OR schema property OR platform — pick the most relevant detail, not all of them.),
      "acceptanceCriteria": [string] /* 3 concrete checkable conditions, max 12 words each */,
      "starterPack": {
        /* CONTENT tasks include: */
        "suggestedHeadline": string,
        "targetWordCount": number,
        "intro": string,
        "h2Outline": [string],
        "keyPhrases": [string],
        "internalLinkAnchors": [string],
        "outboundCitationTargets": [string],
        /* TECHNICAL tasks include: */
        "codeSnippet": string,
        "targetPage": string,
        /* OFF-PAGE tasks include: */
        "commentDraft": string,
        "targetUrl": string
      }
    }
  ]
}`,
  },
};

// ─────────────────────────────────────────────────────────────────
// Template rendering
// ─────────────────────────────────────────────────────────────────

/** Replace {{var}} placeholders with values. Missing vars render empty. */
export function renderPrompt(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, name: string) => {
    const v = vars[name];
    if (v === null || v === undefined) return "";
    return String(v);
  });
}

// ─────────────────────────────────────────────────────────────────
// DB lookup with safe fallback
// ─────────────────────────────────────────────────────────────────

/**
 * Fetch the active template for a prompt key. Returns the DB override
 * when present and well-formed, otherwise returns the hardcoded default.
 * Never throws — the LLM pipeline must always be able to generate.
 */
export async function getPromptTemplate(key: PromptKey): Promise<string> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("prompts")
      .select("template")
      .eq("key", key)
      .maybeSingle();
    if (data && typeof data.template === "string" && data.template.trim().length > 50) {
      return data.template;
    }
  } catch {
    // fall through to default
  }
  return DEFAULT_PROMPTS[key].template;
}

/**
 * Fetch the full prompt definition + the currently-saved DB override if any.
 * Used by the /admin/settings/prompts UI.
 */
export interface SavedPromptRow {
  key: PromptKey;
  template: string;
  updated_at: string;
  isOverride: true;
}

export async function getSavedPrompt(key: PromptKey): Promise<SavedPromptRow | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("prompts")
      .select("key, template, updated_at")
      .eq("key", key)
      .maybeSingle();
    if (data && data.template) {
      return {
        key: data.key as PromptKey,
        template: data.template,
        updated_at: data.updated_at,
        isOverride: true,
      };
    }
  } catch {}
  return null;
}
