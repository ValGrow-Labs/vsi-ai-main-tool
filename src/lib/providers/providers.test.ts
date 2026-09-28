import { afterEach, describe, it, expect, vi } from "vitest";
import {
  calculateVisibilityMetrics,
  generateDataDrivenRecommendations,
  getSearchProvider,
  getAIProvider,
  type SearchQueryResult,
  type AIResponseResult,
  type TechnicalSeoIssue,
} from "./index";
import { SerpApiSearchProvider, SerperSearchProvider, UnconfiguredSearchProvider } from "./search-providers";
import { OpenAIProvider, OpenRouterAIProvider, UnconfiguredAIProvider } from "./ai-providers";

const PROVIDER_KEYS = ["SERPER_API_KEY", "SERPAPI_KEY", "SERPAPI_API_KEY", "OPENROUTER_API_KEY", "OPENAI_API_KEY"];
/** Tests decide the keys; nothing from the shell environment leaks in. */
function withKeys(keys: Record<string, string> = {}) {
  for (const k of PROVIDER_KEYS) vi.stubEnv(k, keys[k] ?? "");
}

describe("Provider Architecture & Metrics Suite", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("should return UnconfiguredSearchProvider when SERP keys are missing", () => {
    withKeys();
    expect(getSearchProvider()).toBeInstanceOf(UnconfiguredSearchProvider);
  });

  it("should return UnconfiguredAIProvider when AI keys are missing", () => {
    withKeys();
    expect(getAIProvider()).toBeInstanceOf(UnconfiguredAIProvider);
  });

  it("picks the configured provider when a key is set (no call is made)", () => {
    withKeys({ SERPAPI_KEY: "test-serpapi" });
    expect(getSearchProvider()).toBeInstanceOf(SerpApiSearchProvider);
    withKeys({ SERPER_API_KEY: "test-serper" });
    const serper = getSearchProvider();
    expect(serper).toBeInstanceOf(SerperSearchProvider);
    expect(serper).not.toBeInstanceOf(SerpApiSearchProvider); // SerpApi extends Serper
    withKeys({ OPENAI_API_KEY: "test-openai" });
    expect(getAIProvider()).toBeInstanceOf(OpenAIProvider);
    withKeys({ OPENROUTER_API_KEY: "test-openrouter" });
    expect(getAIProvider()).toBeInstanceOf(OpenRouterAIProvider);
  });

  it("should accurately compute search and AI visibility metrics mathematically", () => {
    const mockSearchResults: SearchQueryResult[] = [
      {
        query: "best streaming service",
        engine: "Google",
        location: "us",
        timestamp: new Date().toISOString(),
        serpFeatures: [],
        organicResults: [],
        rankingPosition: 2,
        rankingUrl: "https://example.com/streaming",
        rankingTitle: "Example Streaming",
        is_visible: true,
      },
      {
        query: "top movies app",
        engine: "Google",
        location: "us",
        timestamp: new Date().toISOString(),
        serpFeatures: [],
        organicResults: [],
        rankingPosition: null,
        rankingUrl: null,
        rankingTitle: null,
        is_visible: false,
      },
    ];

    const mockAiResults: AIResponseResult[] = [
      {
        providerName: "OpenRouter",
        modelName: "llama-3.3",
        prompt: "What is the best streaming service?",
        timestamp: new Date().toISOString(),
        rawResponse: "Example is a top choice.",
        brandMentioned: true,
        mentionCount: 1,
        competitorsMentioned: ["Netflix"],
        citations: ["https://example.com/streaming"],
        isTargetCited: true,
      },
      {
        providerName: "OpenRouter",
        modelName: "llama-3.3",
        prompt: "Which app has the best movies?",
        timestamp: new Date().toISOString(),
        rawResponse: "Hulu and Disney+ offer movies.",
        brandMentioned: false,
        mentionCount: 0,
        competitorsMentioned: ["Hulu", "Disney+"],
        citations: [],
        isTargetCited: false,
      },
    ];

    const metrics = calculateVisibilityMetrics(mockSearchResults, mockAiResults, ["Netflix", "Hulu"]);

    expect(metrics.searchQueriesAnalyzed).toBe(2);
    expect(metrics.searchQueriesVisible).toBe(1);
    expect(metrics.searchVisibilityRate).toBe(0.5); // 1 of 2 queries
    expect(metrics.searchTop3Rate).toBe(0.5);
    expect(metrics.searchTop10Rate).toBe(0.5);
    expect(metrics.searchAvgPosition).toBe(2);

    expect(metrics.aiPromptsAnalyzed).toBe(2);
    expect(metrics.aiBrandMentions).toBe(1);
    expect(metrics.aiMentionRate).toBe(0.5); // 1 of 2 prompts
    expect(metrics.aiCitationRate).toBe(0.5);
    expect(metrics.competitorsTracked).toBe(2);
  });

  it("should generate evidence-grounded recommendations", () => {
    const mockTechIssues: TechnicalSeoIssue[] = [
      {
        checkId: "meta_descriptions",
        title: "Missing Meta Descriptions",
        severity: "warning",
        description: "3 pages missing meta description",
        affectedCount: 3,
        affectedUrls: ["https://example.com/page1", "https://example.com/page2", "https://example.com/page3"],
        recommendation: "Add descriptive meta tags to affected pages.",
      },
    ];

    const mockSearchResults: SearchQueryResult[] = [
      {
        query: "streaming price",
        engine: "Google",
        location: "us",
        timestamp: new Date().toISOString(),
        serpFeatures: [],
        organicResults: [],
        rankingPosition: null,
        rankingUrl: null,
        rankingTitle: null,
        is_visible: false,
      },
    ];

    const mockAiResults: AIResponseResult[] = [
      {
        providerName: "OpenAI",
        modelName: "gpt-4o",
        prompt: "Best price streaming",
        timestamp: new Date().toISOString(),
        rawResponse: "Netflix is popular.",
        brandMentioned: false,
        mentionCount: 0,
        competitorsMentioned: ["Netflix"],
        citations: [],
        isTargetCited: false,
      },
    ];

    const recommendations = generateDataDrivenRecommendations({
      technicalIssues: mockTechIssues,
      searchResults: mockSearchResults,
      aiResults: mockAiResults,
      competitorDomains: ["netflix.com"],
    });

    expect(recommendations.length).toBeGreaterThanOrEqual(3);
    const techRec = recommendations.find((r) => r.category === "technical");
    expect(techRec).toBeDefined();
    expect(techRec?.evidence).toContain("https://example.com/page1");

    const geoRec = recommendations.find((r) => r.category === "geo");
    expect(geoRec).toBeDefined();
    expect(geoRec?.evidence).toContain("Best price streaming");
  });
});
