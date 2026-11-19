import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const auth: { session: Record<string, unknown> | null } = { session: null };
vi.mock("@/lib/auth", () => ({
  requireAgencyApi: async () => {
    if (!auth.session) return Response.json({ error: "Sign in again to continue." }, { status: 401 });
    return auth.session;
  },
}));

const mockGetCache = vi.fn();
vi.mock("@/lib/domain-cache", () => ({
  getDomainAnalysisCache: (...args: unknown[]) => mockGetCache(...args),
}));

const mockCallGemini = vi.fn();
const mockCallOpenAI = vi.fn();
vi.mock("@/lib/llm", () => ({
  callGemini: (...args: unknown[]) => mockCallGemini(...args),
  callOpenAI: (...args: unknown[]) => mockCallOpenAI(...args),
}));

import { POST } from "./route";

describe("POST /api/check/suggest-searches", () => {
  beforeEach(() => {
    auth.session = { agencyId: "agency-123", userId: "user-123" };
    mockGetCache.mockReset();
    mockCallGemini.mockReset();
    mockCallOpenAI.mockReset();
    process.env.GEMINI_API_KEY = "test-key";
  });

  it("requires authentication", async () => {
    auth.session = null;
    const req = new NextRequest("http://localhost:3000/api/check/suggest-searches", {
      method: "POST",
      body: JSON.stringify({ domain: "firecrawl.dev" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when domain is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/check/suggest-searches", {
      method: "POST",
      body: JSON.stringify({ domain: "" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns cached Step 2 topics and searches when available", async () => {
    mockGetCache.mockResolvedValueOnce({
      suggestedTopics: ["Web scraping API", "LLM data pipeline"],
      geoTopics: ["How to scrape websites for AI models?"],
      suggestedKeywords: [
        { keyword: "best web scraper for llm", category: "commercial" },
        { keyword: "firecrawl vs crawl4ai", category: "comparison" },
      ],
    });

    const req = new NextRequest("http://localhost:3000/api/check/suggest-searches", {
      method: "POST",
      body: JSON.stringify({ domain: "firecrawl.dev", brandName: "Firecrawl" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.searches.length).toBeGreaterThanOrEqual(4);
    expect(data.searches.some((s: { query: string }) => s.query === "Web scraping API")).toBe(true);
    expect(data.searches.some((s: { query: string }) => s.query === "How to scrape websites for AI models?")).toBe(true);
  });

  it("calls LLM when cached searches are fewer than 5 or fresh is requested", async () => {
    mockGetCache.mockResolvedValueOnce(null);
    mockCallGemini.mockResolvedValueOnce({
      content: JSON.stringify({
        step2Topics: ["Turn websites into LLM data"],
        aiPrompts: ["What is the best tool to convert website to markdown?"],
        commercialSearches: ["website markdown api for llm"],
      }),
    });

    const req = new NextRequest("http://localhost:3000/api/check/suggest-searches", {
      method: "POST",
      body: JSON.stringify({ domain: "firecrawl.dev", brandName: "Firecrawl", country: "United States" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.searches.length).toBe(3);
    expect(data.searches[0].query).toBe("Turn websites into LLM data");
    expect(data.searches[1].category).toBe("ai_prompt");
    expect(data.searches[2].category).toBe("commercial");
  });
});
