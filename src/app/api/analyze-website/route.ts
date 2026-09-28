import { NextRequest, NextResponse } from "next/server";
import { normaliseDomain } from "@/lib/url-input";
import { scrapeUrl } from "@/lib/firecrawl";
import { requireAgencyApi } from "@/lib/auth";
import { checkUrlPolicy, UnsafeUrlError } from "@/lib/net/safe-fetch";
import { callOpenAI, callOpenRouter, OPENAI_ANALYSIS_MODEL } from "@/lib/llm";
import { failureReason, type ProviderFailureReason } from "@/lib/provider-status";
import {
  buildProfile,
  deriveFromDomain,
  parseModelJson,
  unavailableMessage,
  type AnalysisSuccessResponse,
  type AnalysisUnavailableResponse,
} from "./website-profile";

export type {
  ExtractedWebsiteData,
  DomainDerivedProfile,
  AnalysisSuccessResponse,
  AnalysisUnavailableResponse,
} from "./website-profile";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "meta-llama/llama-3.3-70b-instruct:free";

/**
 * Automatic analysis couldn't be completed. Nothing about the business is returned — only what comes
 * straight from the domain the user typed (brand and ccTLD market), as editable suggestions.
 */
function unavailable(domain: string, reason: ProviderFailureReason, stage: "website" | "analysis") {
  const body: AnalysisUnavailableResponse = {
    success: false,
    status: "ANALYSIS_UNAVAILABLE",
    reason,
    message: unavailableMessage(reason, stage),
    derived: deriveFromDomain(domain),
  };
  return NextResponse.json(body, { status: 503 });
}

function buildPrompt(domain: string, title: string | null, description: string | null, markdown: string): string {
  return `Analyze this website content and extract business intelligence. Use only what the content shows.
If the content doesn't show something, use null (or an empty list). Never guess a location, and only list
competitors whose real website domain you know; otherwise return an empty list.

Website Domain: ${domain}
Website Title: ${title ?? "N/A"}
Meta Description: ${description ?? "N/A"}

Scraped Content Preview (Markdown):
"""
${markdown.slice(0, 3500)}
"""

Return JSON in this EXACT structure:
{
  "brandName": "Brand Name",
  "businessType": "Industry / Category",
  "language": "Primary Language e.g. English",
  "location": "Primary Country e.g. India or United States or United Arab Emirates",
  "locationCode": "ae" | "us" | "uk" | "in" | "lk" | "sg" | null,
  "suggestedTopics": ["Topic 1", "Topic 2", "Topic 3", "Topic 4", "Topic 5"],
  "suggestedKeywords": [
    { "keyword": "search query 1", "category": "primary", "categoryLabel": "Primary Keyword" },
    { "keyword": "search query 2", "category": "geo", "categoryLabel": "Location Search" },
    { "keyword": "search query 3", "category": "ai_search", "categoryLabel": "AI Search Prompt" }
  ],
  "sitemapUrl": null,
  "competitiveAdvantage": "One punchy sentence describing key edge or value proposition.",
  "aboutBusiness": "2-3 concise sentences summarizing what the business does and sells.",
  "targetCustomers": ["Group 1", "Group 2", "Group 3"],
  "suggestedCompetitors": [
    { "domain": "competitor1.com", "name": "Competitor One", "market": "Country / Global" }
  ],
  "geoTopics": ["Topic / Query 1 for AI search", "Topic / Query 2 for AI search"]
}`;
}

export async function POST(req: NextRequest) {
  const auth = await requireAgencyApi();
  if (auth instanceof Response) return auth;

  let body: { url?: unknown };
  try {
    body = (await req.json()) as { url?: unknown };
  } catch {
    return NextResponse.json({ success: false, error: "Please enter a valid website URL." }, { status: 400 });
  }

  const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
  const urlWithProto = rawUrl.startsWith("http://") || rawUrl.startsWith("https://") ? rawUrl : `https://${rawUrl}`;
  const parsed = rawUrl ? normaliseDomain(urlWithProto) : null;
  if (!parsed?.domain) {
    return NextResponse.json({ success: false, error: "Please enter a valid website URL." }, { status: 400 });
  }
  const domain = parsed.domain;
  // Outbound policy (sync part): no internal hosts, IP literals or metadata names — refused up front.
  const policy = checkUrlPolicy(`https://${domain}`);
  if (!policy.ok) {
    return NextResponse.json({ success: false, error: "Please enter a public website address." }, { status: 400 });
  }

  // No analysis service: say so. Don't fetch the site for nothing, and never invent a profile.
  // OpenAI when its key is set, otherwise OpenRouter.
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!openaiKey && !openrouterKey) return unavailable(domain, "PROVIDER_NOT_CONFIGURED", "analysis");

  // 1. Read the website.
  let page;
  try {
    page = await scrapeUrl(`https://${domain}`);
  } catch (err) {
    // The name resolved to a private/internal address (checked by scrapeUrl before any fetch).
    if (err instanceof UnsafeUrlError) {
      return NextResponse.json({ success: false, error: "Please enter a public website address." }, { status: 400 });
    }
    console.warn("[analyze-website] website fetch failed:", err instanceof Error ? err.message : err);
    return unavailable(domain, failureReason(err), "website");
  }
  if (!page.markdown?.trim() && !page.title && !page.description) {
    return unavailable(domain, "INVALID_RESPONSE", "website");
  }

  // 2. Ask the model to read it.
  let content: string | null;
  try {
    const system = "You are an expert AI business and SEO analyst. Respond ONLY with valid JSON.";
    const prompt = buildPrompt(domain, page.title, page.description, page.markdown ?? "");
    const res = openaiKey
      ? await callOpenAI(OPENAI_ANALYSIS_MODEL, system, prompt, openaiKey, 1800)
      : await callOpenRouter(MODEL, system, prompt, openrouterKey as string, 1800);
    if (!res.content) {
      return unavailable(domain, res.rateLimited ? "PROVIDER_RATE_LIMITED" : "PROVIDER_ERROR", "analysis");
    }
    content = res.content;
  } catch (err) {
    console.warn("[analyze-website] analysis failed:", err instanceof Error ? err.message : err);
    return unavailable(domain, failureReason(err), "analysis");
  }

  // 3. Keep only what the model actually said about this business.
  const json = parseModelJson(content);
  const profile = json ? buildProfile(json, domain, { title: page.title, description: page.description }) : null;
  if (!profile) return unavailable(domain, "INVALID_RESPONSE", "analysis");

  const ok: AnalysisSuccessResponse = { success: true, data: profile };
  return NextResponse.json(ok);
}
