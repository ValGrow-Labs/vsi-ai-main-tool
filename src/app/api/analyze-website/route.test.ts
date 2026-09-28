import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ProviderUnavailableError } from "@/lib/provider-status";

const scrapeUrl = vi.fn();
const callOpenRouter = vi.fn();

vi.mock("@/lib/firecrawl", () => ({ scrapeUrl: (...args: unknown[]) => scrapeUrl(...args) }));
vi.mock("@/lib/llm", () => ({ callOpenRouter: (...args: unknown[]) => callOpenRouter(...args) }));

const auth: { session: Record<string, unknown> | null } = { session: null };
vi.mock("@/lib/auth", () => ({
  requireAgencyApi: async () => {
    if (!auth.session) return Response.json({ error: "Sign in again to continue." }, { status: 401 });
    if (!auth.session.agencyId) return Response.json({ error: "Create your organization first." }, { status: 403 });
    return auth.session;
  },
}));

import { POST } from "./route";
import { detectDomainLocation, extractBrandFromDomain } from "./website-profile";
import { UnsafeUrlError } from "@/lib/net/safe-fetch";

const PAGE = {
  markdown: "# Acme Widgets\nWe make industrial widgets for factories in Dubai.",
  title: "Acme Widgets",
  description: "Industrial widgets",
  url: "https://acme.com",
  wordCount: 10,
  source: "fallback",
};

const FULL_REPLY = {
  brandName: "Acme",
  businessType: "Industrial equipment",
  language: "English",
  location: "United Arab Emirates",
  locationCode: "ae",
  suggestedTopics: ["Industrial widgets", "Topic 2"],
  suggestedKeywords: [
    { keyword: "industrial widgets dubai", category: "geo", categoryLabel: "Location Search", selected: true },
    { keyword: "search query 2", category: "primary", categoryLabel: "Primary Keyword", selected: true },
  ],
  sitemapUrl: "https://acme.com/sitemap.xml",
  competitiveAdvantage: "Same-day delivery",
  aboutBusiness: "Acme makes widgets.",
  targetCustomers: ["Factories", "Group 2"],
  suggestedCompetitors: [
    { domain: "competitor1.com", name: "Competitor One", market: "Country / Global", selected: true },
    { domain: "competitor2.com", name: "Competitor Two", market: "Country / Global", selected: true },
    { domain: "example.com", name: "Example", market: "Global", selected: true },
    { name: "No Domain Inc", market: "UAE", selected: true },
    { domain: "", name: "Empty", selected: true },
    { domain: "acme.com", name: "Own site", selected: true },
    { domain: "https://www.widgetco.ae/about", name: "WidgetCo", market: "UAE", selected: true },
  ],
  geoTopics: ["Who makes industrial widgets in Dubai?", "Topic / Query 2 for AI search"],
};

function req(url: unknown = "acme.com") {
  return new NextRequest("http://localhost/api/analyze-website", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

const realFetch = globalThis.fetch;
const originalKey = process.env.OPENROUTER_API_KEY;

beforeEach(() => {
  auth.session = { userId: "u1", agencyId: "a1" };
  scrapeUrl.mockReset();
  callOpenRouter.mockReset();
  process.env.OPENROUTER_API_KEY = "test-key";
  // Any real network call fails the test.
  globalThis.fetch = vi.fn(async () => {
    throw new Error("Network access is not allowed in tests");
  }) as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
});

async function expectUnavailable(res: Response, reason: string) {
  expect(res.status).toBe(503);
  const body = await res.json();
  expect(body.success).toBe(false);
  expect(body.status).toBe("ANALYSIS_UNAVAILABLE");
  expect(body.reason).toBe(reason);
  expect(typeof body.message).toBe("string");
  expect(body.message.length).toBeGreaterThan(0);
  // No invented business profile of any kind.
  expect(body.data).toBeUndefined();
  expect(JSON.stringify(body)).not.toMatch(/businessType|suggestedKeywords|suggestedCompetitors|suggestedTopics|E-commerce/);
  expect(Object.keys(body.derived).sort()).toEqual(["brandName", "domain", "location", "locationCode"]);
  return body;
}

describe("POST /api/analyze-website — analysis unavailable", () => {
  it("returns ANALYSIS_UNAVAILABLE when no API key is configured, without fetching the site", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const body = await expectUnavailable(await POST(req()), "PROVIDER_NOT_CONFIGURED");
    expect(scrapeUrl).not.toHaveBeenCalled();
    expect(body.derived).toEqual({ domain: "acme.com", brandName: "Acme", location: null, locationCode: null });
  });

  it("returns ANALYSIS_UNAVAILABLE when the website can't be fetched", async () => {
    scrapeUrl.mockRejectedValue(new Error("HTTP 404"));
    await expectUnavailable(await POST(req()), "PROVIDER_ERROR");
    expect(callOpenRouter).not.toHaveBeenCalled();
  });

  it("returns ANALYSIS_UNAVAILABLE when the website returns nothing readable", async () => {
    scrapeUrl.mockResolvedValue({ ...PAGE, markdown: "", title: null, description: null });
    await expectUnavailable(await POST(req()), "INVALID_RESPONSE");
  });

  it("returns ANALYSIS_UNAVAILABLE when the LLM call throws", async () => {
    scrapeUrl.mockResolvedValue(PAGE);
    callOpenRouter.mockRejectedValue(new Error("socket hang up"));
    await expectUnavailable(await POST(req()), "PROVIDER_ERROR");
  });

  it("keeps the provider's own failure reason", async () => {
    scrapeUrl.mockResolvedValue(PAGE);
    callOpenRouter.mockRejectedValue(new ProviderUnavailableError("openrouter", "PROVIDER_AUTH_FAILED"));
    await expectUnavailable(await POST(req()), "PROVIDER_AUTH_FAILED");
  });

  it("returns ANALYSIS_UNAVAILABLE when the LLM is rate limited", async () => {
    scrapeUrl.mockResolvedValue(PAGE);
    callOpenRouter.mockResolvedValue({ content: null, rateLimited: true });
    await expectUnavailable(await POST(req()), "PROVIDER_RATE_LIMITED");
  });

  it("returns ANALYSIS_UNAVAILABLE when the LLM returns no content", async () => {
    scrapeUrl.mockResolvedValue(PAGE);
    callOpenRouter.mockResolvedValue({ content: null, rateLimited: false });
    await expectUnavailable(await POST(req()), "PROVIDER_ERROR");
  });

  it("returns ANALYSIS_UNAVAILABLE for unparseable JSON (e.g. cut off by max_tokens)", async () => {
    scrapeUrl.mockResolvedValue(PAGE);
    callOpenRouter.mockResolvedValue({ content: '{"brandName": "Acme", "businessType": "Indus', rateLimited: false });
    await expectUnavailable(await POST(req()), "INVALID_RESPONSE");
  });

  it("returns ANALYSIS_UNAVAILABLE when the reply is only the prompt template echoed back", async () => {
    scrapeUrl.mockResolvedValue(PAGE);
    callOpenRouter.mockResolvedValue({
      content: JSON.stringify({
        brandName: "Brand Name",
        businessType: "Industry / Category",
        suggestedTopics: ["Topic 1", "Topic 2"],
        suggestedKeywords: [{ keyword: "search query 1" }],
        targetCustomers: ["Group 1"],
        suggestedCompetitors: [{ domain: "competitor1.com", name: "Competitor One" }],
      }),
      rateLimited: false,
    });
    await expectUnavailable(await POST(req()), "INVALID_RESPONSE");
  });

  it("derives brand and ccTLD market from the typed domain only", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const body = await expectUnavailable(await POST(req("https://www.amazon.co.in/deals")), "PROVIDER_NOT_CONFIGURED");
    expect(body.derived).toEqual({ domain: "amazon.co.in", brandName: "Amazon", location: "India", locationCode: "in" });
  });

  it("still rejects an invalid URL with 400", async () => {
    const res = await POST(req("not a url"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/analyze-website — auth and outbound policy", () => {
  it("401s without a session and fetches nothing", async () => {
    auth.session = null;
    const res = await POST(req());
    expect(res.status).toBe(401);
    expect(scrapeUrl).not.toHaveBeenCalled();
  });

  it("403s for a user without an organization", async () => {
    auth.session = { userId: "u1", agencyId: null };
    expect((await POST(req())).status).toBe(403);
    expect(scrapeUrl).not.toHaveBeenCalled();
  });

  it.each([
    "169.254.169.254",
    "http://169.254.169.254/latest/meta-data/",
    "10.0.0.5",
    "127.0.0.1",
    "localhost",
    "metadata.google.internal",
    "2130706433",
    "[::1]",
  ])("rejects internal target %s with 400 before fetching or calling the model", async (url) => {
    const res = await POST(req(url));
    expect(res.status).toBe(400);
    expect(scrapeUrl).not.toHaveBeenCalled();
    expect(callOpenRouter).not.toHaveBeenCalled();
  });

  it("rejects a name that resolves to a private address (scrapeUrl's DNS check) with 400", async () => {
    scrapeUrl.mockRejectedValue(new UnsafeUrlError("That address points to a private network and can't be checked."));
    const res = await POST(req("169.254.169.254.nip.io"));
    expect(res.status).toBe(400);
    expect(callOpenRouter).not.toHaveBeenCalled();
  });
});

describe("POST /api/analyze-website — successful analysis", () => {
  it("keeps real values, drops template echoes and competitors without a real domain", async () => {
    scrapeUrl.mockResolvedValue(PAGE);
    callOpenRouter.mockResolvedValue({ content: "```json\n" + JSON.stringify(FULL_REPLY) + "\n```", rateLimited: false });

    const res = await POST(req());
    expect(res.status).toBe(200);
    const { success, data } = await res.json();
    expect(success).toBe(true);
    expect(data.businessType).toBe("Industrial equipment");
    expect(data.location).toBe("United Arab Emirates");
    expect(data.locationCode).toBe("ae");
    expect(data.suggestedTopics).toEqual(["Industrial widgets"]);
    expect(data.suggestedKeywords.map((k: { keyword: string }) => k.keyword)).toEqual(["industrial widgets dubai"]);
    expect(data.targetCustomers).toEqual(["Factories"]);
    expect(data.geoTopics).toEqual(["Who makes industrial widgets in Dubai?"]);
    expect(data.suggestedCompetitors).toEqual([{ domain: "widgetco.ae", name: "WidgetCo", market: "UAE", selected: false }]);
    expect(data.sitemapUrl).toBe("https://acme.com/sitemap.xml");
  });

  it("leaves missing fields null/empty instead of inventing defaults", async () => {
    scrapeUrl.mockResolvedValue({ ...PAGE, title: null, description: null });
    callOpenRouter.mockResolvedValue({
      content: JSON.stringify({ aboutBusiness: "Acme makes widgets.", suggestedCompetitors: [{ name: "Rival" }] }),
      rateLimited: false,
    });

    const res = await POST(req());
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.aboutBusiness).toBe("Acme makes widgets.");
    expect(data.businessType).toBeNull();
    expect(data.language).toBeNull();
    expect(data.location).toBeNull();
    expect(data.locationCode).toBeNull();
    expect(data.competitiveAdvantage).toBeNull();
    expect(data.websiteTitle).toBeNull();
    expect(data.metaDescription).toBeNull();
    expect(data.sitemapUrl).toBeNull();
    expect(data.suggestedTopics).toEqual([]);
    expect(data.suggestedKeywords).toEqual([]);
    expect(data.targetCustomers).toEqual([]);
    expect(data.suggestedCompetitors).toEqual([]);
    expect(data.geoTopics).toEqual([]);
    // Brand from the typed domain is allowed as an editable suggestion.
    expect(data.brandName).toBe("Acme");
    const text = JSON.stringify(data);
    for (const invented of ["Online Retail", "United States", "Market Competitor", "competitor-", "Consumers", "Leading provider"]) {
      expect(text).not.toContain(invented);
    }
  });

  it("uses the domain's country code when the model gives no location, and null for a generic TLD", async () => {
    scrapeUrl.mockResolvedValue(PAGE);
    callOpenRouter.mockResolvedValue({ content: JSON.stringify({ businessType: "Retail" }), rateLimited: false });

    const uk = await (await POST(req("bbc.co.uk"))).json();
    expect(uk.data.location).toBe("United Kingdom");
    expect(uk.data.locationCode).toBe("uk");
    expect(uk.data.brandName).toBe("Bbc");

    const com = await (await POST(req("acme.io"))).json();
    expect(com.data.location).toBeNull();
    expect(com.data.locationCode).toBeNull();
  });
});

describe("domain derivations", () => {
  it("returns null location for generic TLDs", () => {
    for (const d of ["nike.com", "stripe.io", "example.net", "wikipedia.org", "shop.dev", "brand.co"]) {
      expect(detectDomainLocation(d)).toBeNull();
    }
  });

  it("keeps real ccTLD mappings", () => {
    expect(detectDomainLocation("flipkart.in")?.locationCode).toBe("in");
    expect(detectDomainLocation("amazon.co.in")?.locationCode).toBe("in");
    expect(detectDomainLocation("bbc.co.uk")?.locationCode).toBe("uk");
    expect(detectDomainLocation("noon.ae")?.locationCode).toBe("ae");
    expect(detectDomainLocation("shop.com.sg")?.locationCode).toBe("sg");
    expect(detectDomainLocation("daraz.lk")?.locationCode).toBe("lk");
  });

  it("takes the brand from the registrable label, not the public suffix", () => {
    expect(extractBrandFromDomain("amazon.co.in")).toBe("Amazon");
    expect(extractBrandFromDomain("bbc.co.uk")).toBe("Bbc");
    expect(extractBrandFromDomain("ox.ac.uk")).toBe("Ox");
    expect(extractBrandFromDomain("canva.com.au")).toBe("Canva");
    expect(extractBrandFromDomain("rakuten.co.jp")).toBe("Rakuten");
    expect(extractBrandFromDomain("shopee.com.sg")).toBe("Shopee");
    expect(extractBrandFromDomain("trademe.co.nz")).toBe("Trademe");
    expect(extractBrandFromDomain("mercadolivre.com.br")).toBe("Mercadolivre");
    expect(extractBrandFromDomain("shop.nike.com")).toBe("Nike");
    expect(extractBrandFromDomain("my-shop.com")).toBe("My Shop");
    expect(extractBrandFromDomain("amazon.co.in")).not.toBe("Co");
  });
});
