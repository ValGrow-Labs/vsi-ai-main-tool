export type Priority = "critical" | "high" | "medium" | "protect" | "info";

export interface OpportunityAction {
  action: string;
  why: string;
}

export interface OpportunitySignal {
  priority: Priority;
  priorityLabel: string;
  priorityColor: string;
  priorityBg: string;
  headline: string;
  explanation: string;
  quickActions: OpportunityAction[];
}

export interface KeywordOpportunity {
  id: string;
  keyword: string;
  domain: string;
  trackType: string;
  rankPosition: number | null;
  aioPresent: boolean | null;
  clientCited: boolean | null;
  mentionedInText: boolean | null;
  citedDomains: string[];
  gapLabel: string;
  signal: OpportunitySignal;
  createdAt: string;
}

// ─── Priority scoring ─────────────────────────────────────────
const SIGNAL_MAP: Record<string, OpportunitySignal> = {
  search_strong_ai_invisible: {
    priority: "critical",
    priorityLabel: "Critical",
    priorityColor: "text-red-700",
    priorityBg: "bg-white border-l-4 border-l-red-500 border-y border-r border-gray-200",
    headline: "Ranking but AI is stealing your clicks",
    explanation:
      "You hold a top-10 Google position but AI Overview answers this query directly — users never reach your page. Every day this persists is lost traffic.",
    quickActions: [
      {
        action: "Add a direct-answer paragraph at the very top of your ranking page",
        why: "Google pulls AIO citations from pages with clear, quotable answers — your page ranks well but isn't structured as an answer.",
      },
      {
        action: "Add FAQ schema targeting the exact query and related sub-questions",
        why: "Structured data signals to Google that your page is an authoritative answer source.",
      },
      {
        action: "Analyse the pages Google IS citing — match their E-E-A-T signals",
        why: "Cited pages typically have credentials, statistics, or case studies your page currently lacks.",
      },
    ],
  },

  geo_invisible: {
    priority: "high",
    priorityLabel: "High",
    priorityColor: "text-yellow-700",
    priorityBg: "bg-white border-l-4 border-l-yellow-500 border-y border-r border-gray-200",
    headline: "AI Overview exists — you're completely invisible in it",
    explanation:
      "Google is answering this query with an AI Overview and citing competitors. Your brand doesn't appear anywhere in it.",
    quickActions: [
      {
        action: "Create a comprehensive page that directly answers this query",
        why: "AIO citations go to pages that answer the query clearly, not pages that just mention the topic.",
      },
      {
        action: "Analyse the top 3 cited competitor pages — use the 'Analyse Content' button on each citation to see what earns them the citation",
        why: "The cited pages have specific content signals (credentials, data, structure) Google values for this query.",
      },
      {
        action: "Get your brand mentioned by sources already cited in this AIO",
        why: "Google builds its AIO knowledge graph from trusted sources — appearing in those sources raises your citability.",
      },
    ],
  },

  weak_double_loss: {
    priority: "high",
    priorityLabel: "High",
    priorityColor: "text-orange-700",
    priorityBg: "bg-white border-l-4 border-l-orange-500 border-y border-r border-gray-200",
    headline: "Invisible on both Google ranking and AI Overview",
    explanation:
      "Not ranking in top 10 and not cited in AI Overview. This is a content gap — no page is competing for this query.",
    quickActions: [
      {
        action: "Create foundational content targeting this keyword with depth and authority",
        why: "No content = no visibility on either channel. A well-structured page is the prerequisite for everything else.",
      },
      {
        action: "Target long-tail variants of this keyword first to build topical authority",
        why: "Easier to rank and get cited for specific sub-queries before competing for the broad term.",
      },
      {
        action: "Build internal links from existing high-authority pages to the new content",
        why: "New pages need authority signals — internal linking accelerates indexing and ranking.",
      },
    ],
  },

  ai_mentioned: {
    priority: "medium",
    priorityLabel: "Medium",
    priorityColor: "text-blue-700",
    priorityBg: "bg-white border-l-4 border-l-blue-500 border-y border-r border-gray-200",
    headline: "Brand mentioned in AIO — but no citation link",
    explanation:
      "Google's AI knows your brand and mentions it, but isn't linking to your page as a source. You get brand awareness, not traffic.",
    quickActions: [
      {
        action: "Rewrite the opening section of your page as a concise, directly quotable answer",
        why: "Google cites pages it can quote directly — dense paragraphs are harder to extract answers from than clear, structured responses.",
      },
      {
        action: "Add HowTo or FAQ schema to your existing page",
        why: "Schema markup helps Google understand your page is an authoritative answer source for structured queries.",
      },
      {
        action: "Earn additional mentions from industry publications and directories already cited in the AIO",
        why: "Your brand is already in Google's knowledge graph for this topic — third-party endorsements push it from 'mentioned' to 'cited source'.",
      },
    ],
  },

  seo_not_ranked: {
    priority: "medium",
    priorityLabel: "Medium",
    priorityColor: "text-orange-700",
    priorityBg: "bg-white border-l-4 border-l-orange-400 border-y border-r border-gray-200",
    headline: "Not ranking in top 100",
    explanation:
      "No Google ranking for this keyword. Either content doesn't exist or lacks authority to compete.",
    quickActions: [
      {
        action: "Run a content gap analysis — identify what the top 3 ranking pages cover that yours doesn't",
        why: "Ranking requires matching the search intent and depth of content Google already trusts.",
      },
      {
        action: "Build topical clusters around this keyword to establish authority",
        why: "Google ranks hubs of expertise, not isolated pages — surrounding content lifts the main target page.",
      },
      {
        action: "Check if this keyword has sufficient search intent — check the SERP features panel",
        why: "Some keywords are dominated by AIO, featured snippets, or paid ads — organic traffic potential may be low.",
      },
    ],
  },

  geo_cited: {
    priority: "protect",
    priorityLabel: "Winning",
    priorityColor: "text-green-700",
    priorityBg: "bg-white border-l-4 border-l-green-500 border-y border-r border-gray-200",
    headline: "Cited as source AND named in AI Overview",
    explanation:
      "Your page is cited as a source AND your brand is named in the answer text. Google trusts your content enough to surface AND attribute it — strongest possible AI signal.",
    quickActions: [
      {
        action: "Keep this page updated — fresh content maintains AIO citation status",
        why: "AIO citations shift when Google finds more current or comprehensive sources.",
      },
      {
        action: "Use this page as a template for other uncaptured queries",
        why: "Something about this page's structure, depth, or authority is working — replicate it.",
      },
      {
        action: "Monitor weekly for new competitors entering the AIO for this query",
        why: "Citation positions are not permanent — proactive monitoring prevents surprise drops.",
      },
    ],
  },

  geo_cited_no_mention: {
    priority: "medium",
    priorityLabel: "Medium",
    priorityColor: "text-blue-700",
    priorityBg: "bg-white border-l-4 border-l-blue-500 border-y border-r border-gray-200",
    headline: "Linked as source — but brand is not named",
    explanation:
      "Your page is one of the source links under the AI Overview answer, but Google never names the brand in the answer text itself. Users read the answer and don't know it came from you — link visibility without brand recall.",
    quickActions: [
      {
        action: "Lead the page with brand-anchored authority signals — author bio, brand-as-entity schema, About link",
        why: "Brand-as-entity signals push Google to name the source in the answer text, not just link to the page.",
      },
      {
        action: "Build third-party brand mentions on the domains Google already cites here",
        why: "When competitor / partner pages name your brand, the AIO is more likely to surface the name in its answer.",
      },
      {
        action: "Re-write the cited page with the brand named in the first 100 words and around key statistics",
        why: "Models are more likely to attribute claims to the brand when the brand sits close to the quotable facts.",
      },
    ],
  },

  aligned: {
    priority: "protect",
    priorityLabel: "Winning",
    priorityColor: "text-green-700",
    priorityBg: "bg-white border-l-4 border-l-green-500 border-y border-r border-gray-200",
    headline: "Ranking, cited, AND named — winning both channels",
    explanation:
      "Top-10 in Google, linked as a source in AI Overview, and the brand is named in the answer text. Full alignment across organic and AI search.",
    quickActions: [
      {
        action: "Expand to semantic variants of this keyword while protecting the core page",
        why: "Aligned keywords signal strong topical authority — leverage it for adjacent queries.",
      },
      {
        action: "Document what makes this page citable and apply it to AI-Invisible keywords",
        why: "Your winning page has a repeatable formula — other keywords need the same treatment.",
      },
      {
        action: "Set up a weekly check — AIO citation positions shift when competitors improve content",
        why: "Defending is easier than recapturing — early detection prevents loss.",
      },
    ],
  },

  aligned_no_mention: {
    priority: "medium",
    priorityLabel: "Medium",
    priorityColor: "text-blue-700",
    priorityBg: "bg-white border-l-4 border-l-blue-500 border-y border-r border-gray-200",
    headline: "Ranking & cited — but brand is not named in the answer",
    explanation:
      "You rank in Google and your page is cited as an AIO source, but the brand isn't named in the answer text. Strong link visibility, weak brand attribution.",
    quickActions: [
      {
        action: "Rewrite the ranking page intro to put the brand within the first 100 words next to the quotable answer",
        why: "Models attribute claims to the brand when the brand sits close to the facts being summarised.",
      },
      {
        action: "Add brand-as-entity structured data (Organization schema, sameAs to Wikipedia / Crunchbase / LinkedIn)",
        why: "Entity signals push Google to name the source, not just link to the page.",
      },
      {
        action: "Build third-party brand mentions that link back to this page",
        why: "When third parties name your brand together with the cited URL, AIO attribution improves.",
      },
    ],
  },

  geo_mentioned: {
    priority: "medium",
    priorityLabel: "Medium",
    priorityColor: "text-blue-700",
    priorityBg: "bg-white border-l-4 border-l-blue-500 border-y border-r border-gray-200",
    headline: "Brand appears in AI Overview text but not sourced",
    explanation:
      "Google references your brand in the AIO answer without linking to your page. Brand visibility without traffic.",
    quickActions: [
      {
        action: "Create a dedicated landing page that directly answers this query",
        why: "A brand mention means Google knows you — a source citation means Google trusts your page to answer the query.",
      },
      {
        action: "Improve E-E-A-T signals: add author bio, credentials, data sources",
        why: "Source citations go to pages with demonstrable expertise — brand alone isn't enough.",
      },
      {
        action: "Earn a feature or mention in one of the domains already cited in this AIO",
        why: "Third-party authority signals from already-trusted sources accelerate citation status.",
      },
    ],
  },

  seo_ranked: {
    priority: "protect",
    priorityLabel: "Ranking",
    priorityColor: "text-green-700",
    priorityBg: "bg-white border-l-4 border-l-green-500 border-y border-r border-gray-200",
    headline: "Ranking in top 10",
    explanation: "Solid Google ranking for this keyword. No AIO tracking — consider upgrading to SEO+GEO to check AI visibility.",
    quickActions: [
      {
        action: "Enable GEO tracking for this keyword to check AI Overview visibility",
        why: "Ranking in top 10 doesn't mean clicks — if AIO is present, traffic may already be intercepted.",
      },
      {
        action: "Monitor for ranking volatility — AI Overview can suppress click-through even at #1",
        why: "Position alone doesn't guarantee traffic in the AI search era.",
      },
      {
        action: "Strengthen the page with fresh data and updated statistics",
        why: "Ranking pages that go stale lose both organic position and potential AIO citations.",
      },
    ],
  },

  seo_ranked_no_aio: {
    priority: "protect",
    priorityLabel: "Ranking",
    priorityColor: "text-green-700",
    priorityBg: "bg-white border-l-4 border-l-green-500 border-y border-r border-gray-200",
    headline: "Ranking in top 10 — no AI Overview triggered",
    explanation: "Strong organic position, and Google isn't using an AI Overview for this query yet. Full SERP control.",
    quickActions: [
      {
        action: "Keep this page fresh — AIOs can appear later, and ranking pages get cited first",
        why: "When Google decides to add an AIO to this query, current top rankers have the best citation odds.",
      },
      {
        action: "Build structured FAQ content on this page proactively",
        why: "Pre-emptive E-E-A-T structuring keeps the page citation-ready when AIO arrives.",
      },
      {
        action: "Monitor weekly for new AIO appearances",
        why: "AIO triggers expand month-over-month — staying alert protects rank-to-click conversion.",
      },
    ],
  },

  geo_no_aio: {
    priority: "info",
    priorityLabel: "Info",
    priorityColor: "text-gray-700",
    priorityBg: "bg-white border-l-4 border-l-gray-400 border-y border-r border-gray-200",
    headline: "No AI Overview triggered for this query",
    explanation: "Google isn't surfacing an AI Overview for this query yet. Tracking continues for when it does.",
    quickActions: [
      {
        action: "Verify the query phrasing — try more conversational variants",
        why: "AIOs trigger on question-style queries more reliably than short-tail keywords.",
      },
      {
        action: "Monitor weekly — AIO coverage is expanding rapidly",
        why: "A query that doesn't trigger an AIO today may trigger one next month.",
      },
    ],
  },
};

const PRIORITY_ORDER: Priority[] = ["critical", "high", "medium", "protect", "info"];

export function getOpportunitySignal(gapLabel: string): OpportunitySignal {
  return (
    SIGNAL_MAP[gapLabel] ?? {
      priority: "info",
      priorityLabel: "Info",
      priorityColor: "text-gray-700",
      priorityBg: "bg-white border-l-4 border-l-gray-400 border-y border-r border-gray-200",
      headline: "Tracking active",
      explanation: "Data collected — gap classification pending.",
      quickActions: [],
    }
  );
}

export function groupByPriority(opportunities: KeywordOpportunity[]): Record<Priority, KeywordOpportunity[]> {
  const grouped: Record<Priority, KeywordOpportunity[]> = {
    critical: [], high: [], medium: [], protect: [], info: [],
  };
  for (const opp of opportunities) {
    grouped[opp.signal.priority].push(opp);
  }
  return grouped;
}

export { PRIORITY_ORDER };
