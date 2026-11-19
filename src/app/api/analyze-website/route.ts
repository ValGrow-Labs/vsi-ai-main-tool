import { NextRequest, NextResponse } from "next/server";
import { normaliseDomain } from "@/lib/url-input";
import { scrapeUrl, scrapeWebsiteForAnalysis } from "@/lib/firecrawl";
import { requireAgencyApi } from "@/lib/auth";
import { checkUrlPolicy, UnsafeUrlError } from "@/lib/net/safe-fetch";
import { callOpenAI, callOpenRouter, callGroq, callGemini, OPENAI_ANALYSIS_MODEL, GROQ_ANALYSIS_MODEL } from "@/lib/llm";
import { failureReason, type ProviderFailureReason } from "@/lib/provider-status";
import { getDomainAnalysisCache, saveDomainAnalysisCache } from "@/lib/domain-cache";
import {
  buildProfile,
  cleanCompetitors,
  deriveFromDomain,
  parseModelJson,
  unavailableMessage,
  type AnalysisSuccessResponse,
  type AnalysisUnavailableResponse,
  type ExtractedWebsiteData,
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

function buildPrompt(
  domain: string,
  title: string | null,
  description: string | null,
  markdown: string,
  isThin = false,
  aboutMd: string | null = null,
  sitemap: string | null = null
): string {
  const contentPreview = [
    markdown ? `Homepage content:\n${markdown.slice(0, 3000)}` : "",
    aboutMd ? `About page content:\n${aboutMd.slice(0, 1500)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const thinNotice = isThin
    ? "\nNote: The site has bot protection or minimal visible HTML. Analyze the brand using its domain, title, meta description, and known public business identity. Never hallucinate unknown facts."
    : "";

  return `Analyze this website content and extract business intelligence for search marketing.
Use what the content shows.${thinNotice}
Determine the primary geographic country/market where this business operates (e.g. from addresses, phone numbers, contact info, currencies, office locations, or ccTLD).
Based on this business model and its specific geographic market, identify 3 to 5 REAL commercial competitor companies operating IN THAT SAME COUNTRY OR REGIONAL MARKET.
CRITICAL RULES FOR COMPETITORS:
1. Every competitor MUST be an actual, active business operating in the same market or country as this website.
2. Do NOT output generic global/Silicon Valley mega-corporations (e.g. C3.ai, DataRobot, OpenAI, IBM) unless the business is specifically located in the United States. If the business is in the UAE, suggest UAE competitors; if in Sri Lanka, suggest Sri Lankan competitors; if in India, suggest Indian competitors; if in Singapore, suggest Singaporean competitors.
3. Every domain must be an active, live commercial domain of an existing business. Never output placeholder domains or acquired/defunct companies (e.g. Element AI).
If a field cannot be determined, use null (or an empty list). Never guess an unknown country.

Website Domain: ${domain}
Website Title: ${title ?? "N/A"}
Meta Description: ${description ?? "N/A"}
${sitemap ? `Detected Sitemap: ${sitemap}` : ""}

Scraped Content Preview (Markdown):
"""
${contentPreview || "No body text extracted."}
"""

Return JSON in this EXACT structure:
{
  "brandName": "Brand Name",
  "businessType": "Industry / Category e.g. B2B SaaS, E-commerce, Fintech, Sports Media",
  "language": "Primary Language e.g. English",
  "location": "Primary Country e.g. India or United States or United Arab Emirates",
  "locationCode": "ae" | "us" | "uk" | "in" | "lk" | "sg" | null,
  "suggestedTopics": [
    "Topic 1", "Topic 2", "Topic 3", "Topic 4", "Topic 5",
    "Topic 6", "Topic 7", "Topic 8", "Topic 9", "Topic 10"
  ],
  "suggestedKeywords": [
    { "keyword": "search query 1", "category": "primary", "categoryLabel": "Primary Keyword" },
    { "keyword": "search query 2", "category": "geo", "categoryLabel": "Location Search" },
    { "keyword": "search query 3", "category": "ai_search", "categoryLabel": "AI Search Prompt" }
  ],
  "sitemapUrl": ${sitemap ? `"${sitemap}"` : "null"},
  "competitiveAdvantage": "One punchy sentence describing key edge or value proposition.",
  "aboutBusiness": "2-3 concise sentences summarizing what the business does and sells.",
  "targetCustomers": ["Audience 1", "Audience 2", "Audience 3", "Audience 4"],
  "suggestedCompetitors": [
    { "domain": "realcompetitor.com", "name": "Company Name", "market": "Country / Global" }
  ],
  "geoTopics": ["Topic / Query 1 for AI search", "Topic / Query 2 for AI search"]
};`;
}

async function callAvailableLLM(
  system: string,
  prompt: string,
  maxTokens: number,
  openaiKey?: string,
  groqKey?: string,
  openrouterKey?: string
): Promise<{ content: string | null; rateLimited: boolean }> {
  const preferGemini = (process.env.AI_PROVIDER || "").toUpperCase() === "GEMINI";
  const geminiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  let rateLimited = false;

  // Try Gemini first if user configured AI_PROVIDER=GEMINI or if only Gemini is configured
  if (geminiKey && (preferGemini || !openaiKey)) {
    try {
      const res = await callGemini(system, prompt, geminiKey, maxTokens);
      if (res?.content) return res;
      if (res?.rateLimited) rateLimited = true;
    } catch (err) {
      console.warn("[analyze-website] Gemini call error:", err);
    }
  }

  // 1. Try OpenAI if key exists
  if (openaiKey) {
    try {
      const res = await callOpenAI(OPENAI_ANALYSIS_MODEL, system, prompt, openaiKey, maxTokens);
      if (res && (res.content || (!groqKey && !geminiKey && res.rateLimited))) return res;
      if (res?.rateLimited) rateLimited = true;
    } catch (err) {
      if (!groqKey && !geminiKey) throw err;
      console.warn("[analyze-website] OpenAI call error, attempting fallback:", err);
    }
  }

  // 2. Try Gemini fallback if key exists and was not tried first
  if (geminiKey && !preferGemini && openaiKey) {
    try {
      const res = await callGemini(system, prompt, geminiKey, maxTokens);
      if (res?.content) return res;
      if (res?.rateLimited) rateLimited = true;
    } catch (err) {
      console.warn("[analyze-website] Gemini fallback error:", err);
    }
  }

  // 3. Try Groq if key exists
  if (groqKey) {
    try {
      const res = await callGroq(GROQ_ANALYSIS_MODEL, system, prompt, groqKey, maxTokens);
      if (res?.content) return res;
      if (res?.rateLimited) rateLimited = true;
    } catch (err) {
      console.warn("[analyze-website] Groq call error:", err);
    }
  }

  // 4. Fallback to OpenRouter only if other providers were not used
  if (!openaiKey && !groqKey && !geminiKey && openrouterKey) {
    return await callOpenRouter(MODEL, system, prompt, openrouterKey, maxTokens);
  }

  return { content: null, rateLimited };
}

async function enrichCompetitorsIfNeeded(
  profile: ExtractedWebsiteData,
  domain: string,
  openaiKey?: string,
  groqKey?: string,
  openrouterKey?: string
) {
  if (profile.suggestedCompetitors && profile.suggestedCompetitors.length > 0) return;
  const targetMarket = profile.location || "Global";

  try {
    const compPrompt = `You are a market intelligence expert.
For a company named "${profile.brandName || domain}" (domain: ${domain}, Industry/Business Type: ${profile.businessType || "Commercial Services"}) targeting the market/country: "${targetMarket}".
Identify 4 REAL, highly active commercial competitor companies operating in "${targetMarket}" offering similar products, services, or solutions.
CRITICAL RULES:
1. Every competitor MUST be an actual, active business operating in "${targetMarket}".
2. Do NOT output generic Silicon Valley mega-corps (e.g. C3.ai, DataRobot, OpenAI, IBM) unless the requested market is United States.
3. Every domain must be a real, live company website (e.g. if Sri Lanka: wso2.com, 99x.io, zone24x7.com, ifs.com; if UAE: core42.ai, provensolution.com, appinventiv.com, beinex.com; if India: tcs.com, infosys.com, zoho.com; if quick commerce India: zepto.com, swiggy.com, blinkit.com).
4. Never output defunct or acquired companies (e.g. Element AI).

Return JSON strictly:
{
  "suggestedCompetitors": [
    { "domain": "realcompetitor.com", "name": "Company Name", "market": "${targetMarket}" }
  ]
}`;
    const compRes = await callAvailableLLM(
      "You are an expert market intelligence and SEO analyst. Respond strictly in valid JSON.",
      compPrompt,
      600,
      openaiKey,
      groqKey,
      openrouterKey
    );
    if (compRes.content) {
      const compJson = parseModelJson(compRes.content);
      if (compJson && (compJson.suggestedCompetitors || compJson.competitors)) {
        const cleaned = cleanCompetitors(compJson.suggestedCompetitors ?? compJson.competitors, domain);
        if (cleaned.length > 0) {
          profile.suggestedCompetitors = cleaned;
        }
      }
    }
  } catch (compErr) {
    console.warn("[analyze-website] competitor fallback lookup failed:", compErr);
  }
}

async function handleRegeneration(
  body: {
    domain: string;
    section: "about" | "topics" | "advantage" | "competitors" | "all";
    businessType?: string;
    brandName?: string;
    location?: string;
    locationCode?: string;
    currentTopics?: string[];
  },
  openaiKey?: string,
  groqKey?: string,
  openrouterKey?: string
) {
  const { domain, section, businessType = "", brandName = "", currentTopics = [], location = "" } = body;
  const brand = brandName || domain;
  const system = "You are an expert AI business and SEO analyst. Respond ONLY with valid JSON.";

  let prompt = "";
  if (section === "about") {
    prompt = `Write a fresh, accurate, 2-3 sentence summary of what ${brand} (${domain}, ${businessType}) does and sells.
Return JSON:
{
  "aboutBusiness": "2-3 concise sentences summarizing what the business does and sells."
}`;
  } else if (section === "topics") {
    prompt = `Generate 10 fresh, highly relevant search topics for ${brand} (${domain}, ${businessType}).
Current topics to avoid duplicating: ${currentTopics.join(", ") || "none"}.
Return JSON:
{
  "suggestedTopics": ["Topic 1", "Topic 2", "Topic 3", "Topic 4", "Topic 5", "Topic 6", "Topic 7", "Topic 8", "Topic 9", "Topic 10"]
}`;
  } else if (section === "advantage") {
    prompt = `Write 1 punchy sentence describing the core competitive advantage or value proposition for ${brand} (${domain}, ${businessType}).
Return JSON:
{
  "competitiveAdvantage": "One punchy sentence describing key edge or value proposition."
}`;
  } else if (section === "competitors") {
    const loc = location || "Global";
    prompt = `You are a market intelligence expert.
For a company named "${brand}" (domain: ${domain}, Industry/Business Type: ${businessType || "Commercial Services"}) targeting the market/country: "${loc}".
Identify 4 REAL, highly active commercial competitor companies operating in "${loc}" offering similar products, services, or solutions.
CRITICAL RULES:
1. Every competitor MUST be an actual, active business operating in "${loc}".
2. Do NOT output generic Silicon Valley mega-corps (e.g. C3.ai, DataRobot, OpenAI, IBM) unless the requested market is United States.
3. Every domain must be a real, live company website (e.g. if Sri Lanka: wso2.com, 99x.io, zone24x7.com, ifs.com; if UAE: core42.ai, provensolution.com, appinventiv.com, beinex.com; if India: tcs.com, infosys.com, zoho.com; if quick commerce India: zepto.com, swiggy.com, blinkit.com).
4. Never output defunct or acquired companies (e.g. Element AI).

Return JSON strictly:
{
  "suggestedCompetitors": [
    { "domain": "realcompetitor.com", "name": "Company Name", "market": "${loc}" }
  ]
}`;
  } else {
    return NextResponse.json({ success: false, error: "Invalid section" }, { status: 400 });
  }

  const res = await callAvailableLLM(system, prompt, 600, openaiKey, groqKey, openrouterKey);

  if (!res.content) {
    return NextResponse.json({ success: false, error: "Regeneration failed." }, { status: 502 });
  }

  const json = parseModelJson(res.content);
  if (section === "competitors" && json) {
    const rawComps = json.suggestedCompetitors ?? json.competitors;
    const cleaned = cleanCompetitors(rawComps, domain);
    return NextResponse.json({ success: true, section, data: { suggestedCompetitors: cleaned } });
  }
  return NextResponse.json({ success: true, section, data: json });
}

export async function POST(req: NextRequest) {
  const auth = await requireAgencyApi();
  if (auth instanceof Response) return auth;

  let body: {
    url?: unknown;
    domain?: string;
    action?: string;
    section?: "about" | "topics" | "advantage" | "competitors" | "all";
    businessType?: string;
    brandName?: string;
    location?: string;
    locationCode?: string;
    currentTopics?: string[];
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ success: false, error: "Please enter a valid website URL." }, { status: 400 });
  }

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const geminiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();

  // Partial section regeneration
  if (body.action === "regenerate" && body.section) {
    if (!openaiKey && !groqKey && !openrouterKey && !geminiKey) {
      return NextResponse.json({ success: false, error: "AI service not configured." }, { status: 503 });
    }
    const rawUrl = typeof body.domain === "string" && body.domain.trim()
      ? body.domain.trim()
      : typeof body.url === "string"
      ? body.url.trim()
      : "";
    const parsed = normaliseDomain(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
    return handleRegeneration(
      {
        domain: parsed?.domain || rawUrl,
        section: body.section,
        businessType: body.businessType,
        brandName: body.brandName,
        location: body.location,
        locationCode: body.locationCode,
        currentTopics: body.currentTopics,
      },
      openaiKey,
      groqKey,
      openrouterKey
    );
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

  // Check if caller requests streaming SSE
  const wantsStream =
    req.nextUrl.searchParams.get("stream") === "true" ||
    req.headers.get("accept")?.includes("text/event-stream");

  // No analysis service: say so.
  if (!openaiKey && !groqKey && !openrouterKey && !geminiKey) {
    return unavailable(domain, "PROVIDER_NOT_CONFIGURED", "analysis");
  }

  // Check Supabase 7-day cache
  try {
    const cachedProfile = await getDomainAnalysisCache(domain);
    if (cachedProfile) {
      if (wantsStream) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "progress", step: 1, label: "Analyzing Business", detail: "Loaded cached profile" })}\n\n`
              )
            );
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "progress", step: 2, label: "Generating Summary", detail: "Applying business summary" })}\n\n`
              )
            );
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "progress", step: 3, label: "Finding Topics", detail: "Finalizing topics" })}\n\n`
              )
            );
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "complete", data: cachedProfile, cached: true })}\n\n`)
            );
            controller.close();
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      }
      return NextResponse.json({ success: true, data: cachedProfile, cached: true });
    }
  } catch (err) {
    console.warn("[analyze-website] cache check error:", err);
  }

  // If streaming mode is requested
  if (wantsStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        function send(event: Record<string, unknown>) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }

        try {
          // Step 1: Analyzing Business
          send({
            type: "progress",
            step: 1,
            label: "Analyzing Business",
            detail: "Connecting to website and reading structure...",
          });

          let scrapeData;
          try {
            scrapeData = await scrapeWebsiteForAnalysis(domain);
          } catch (err) {
            if (err instanceof UnsafeUrlError) {
              send({ type: "error", error: "Please enter a public website address.", status: 400 });
              controller.close();
              return;
            }
            console.warn("[analyze-website] scrapeWebsiteForAnalysis fallback:", err);
            // Fall back to simple scrapeUrl
            try {
              const simple = await scrapeUrl(`https://${domain}`);
              scrapeData = {
                domain,
                url: `https://${domain}`,
                title: simple.title,
                description: simple.description,
                ogTitle: null,
                ogDescription: null,
                ogSiteName: null,
                headings: [],
                markdown: simple.markdown,
                aboutMarkdown: null,
                sitemapUrl: null,
                wordCount: simple.wordCount,
                isThinContent: simple.wordCount < 40,
              };
            } catch (fallbackErr) {
              send({
                type: "error",
                status: "ANALYSIS_UNAVAILABLE",
                reason: failureReason(fallbackErr),
                message: unavailableMessage(failureReason(fallbackErr), "website"),
                derived: deriveFromDomain(domain),
              });
              controller.close();
              return;
            }
          }

          // Step 2: Generating Summary
          send({
            type: "progress",
            step: 2,
            label: "Generating Summary",
            detail: "Synthesizing company overview, value proposition, and audience...",
          });

          const system = "You are an expert AI business and SEO analyst. Respond ONLY with valid JSON.";
          const prompt = buildPrompt(
            domain,
            scrapeData.title,
            scrapeData.description,
            scrapeData.markdown,
            scrapeData.isThinContent,
            scrapeData.aboutMarkdown,
            scrapeData.sitemapUrl
          );

          let content: string | null = null;
          try {
            const res = await callAvailableLLM(system, prompt, 1800, openaiKey, groqKey, openrouterKey);

            if (!res.content) {
              send({
                type: "error",
                status: "ANALYSIS_UNAVAILABLE",
                reason: res.rateLimited ? "PROVIDER_RATE_LIMITED" : "PROVIDER_ERROR",
                message: unavailableMessage(res.rateLimited ? "PROVIDER_RATE_LIMITED" : "PROVIDER_ERROR", "analysis"),
                derived: deriveFromDomain(domain),
              });
              controller.close();
              return;
            }
            content = res.content;
          } catch (err) {
            send({
              type: "error",
              status: "ANALYSIS_UNAVAILABLE",
              reason: failureReason(err),
              message: unavailableMessage(failureReason(err), "analysis"),
              derived: deriveFromDomain(domain),
            });
            controller.close();
            return;
          }

          // Step 3: Finding Topics & Building Profile
          send({
            type: "progress",
            step: 3,
            label: "Finding Topics",
            detail: "Selecting high-impact topics and keywords...",
          });

          const json = parseModelJson(content);
          const profile = json
            ? buildProfile(json, domain, {
                title: scrapeData.title,
                description: scrapeData.description,
              })
            : null;

          if (!profile) {
            send({
              type: "error",
              status: "ANALYSIS_UNAVAILABLE",
              reason: "INVALID_RESPONSE",
              message: unavailableMessage("INVALID_RESPONSE", "analysis"),
              derived: deriveFromDomain(domain),
            });
            controller.close();
            return;
          }

          // Ensure competitor suggestions exist
          await enrichCompetitorsIfNeeded(profile, domain, openaiKey, groqKey, openrouterKey);

          // Save to Supabase 7-day cache
          saveDomainAnalysisCache(domain, profile).catch((e) =>
            console.warn("[analyze-website] cache save error:", e)
          );

          send({ type: "complete", data: profile });
        } catch (fatalErr) {
          console.error("[analyze-website] fatal stream error:", fatalErr);
          send({
            type: "error",
            status: "ANALYSIS_UNAVAILABLE",
            reason: "PROVIDER_ERROR",
            message: "We couldn't analyse your website automatically. Please enter your business details below.",
            derived: deriveFromDomain(domain),
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  // Non-streaming fallback (used by existing tests & standard API callers)
  if (!openaiKey && !openrouterKey && !groqKey) {
    return unavailable(domain, "PROVIDER_NOT_CONFIGURED", "analysis");
  }

  let page;
  try {
    page = await scrapeUrl(`https://${domain}`);
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      return NextResponse.json({ success: false, error: "Please enter a public website address." }, { status: 400 });
    }
    console.warn("[analyze-website] website fetch failed:", err instanceof Error ? err.message : err);
    return unavailable(domain, failureReason(err), "website");
  }

  if (!page || (!page.markdown?.trim() && !page.title && !page.description)) {
    return unavailable(domain, "INVALID_RESPONSE", "website");
  }

  let content: string | null;
  try {
    const system = "You are an expert AI business and SEO analyst. Respond ONLY with valid JSON.";
    const prompt = buildPrompt(domain, page.title, page.description, page.markdown ?? "");
    const res = await callAvailableLLM(system, prompt, 1800, openaiKey, groqKey, openrouterKey);
    if (!res.content) {
      return unavailable(domain, res.rateLimited ? "PROVIDER_RATE_LIMITED" : "PROVIDER_ERROR", "analysis");
    }
    content = res.content;
  } catch (err) {
    console.warn("[analyze-website] analysis failed:", err instanceof Error ? err.message : err);
    return unavailable(domain, failureReason(err), "analysis");
  }

  const json = parseModelJson(content);
  const profile = json ? buildProfile(json, domain, { title: page.title, description: page.description }) : null;
  if (!profile) return unavailable(domain, "INVALID_RESPONSE", "analysis");

  await enrichCompetitorsIfNeeded(profile, domain, openaiKey, groqKey, openrouterKey);

  // Save to Supabase cache
  saveDomainAnalysisCache(domain, profile).catch((e) =>
    console.warn("[analyze-website] cache save error:", e)
  );

  const ok: AnalysisSuccessResponse = { success: true, data: profile };
  return NextResponse.json(ok);
}
