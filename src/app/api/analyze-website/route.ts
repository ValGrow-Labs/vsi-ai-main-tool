import { NextRequest, NextResponse } from "next/server";
import { normaliseDomain } from "@/lib/url-input";
import { scrapeUrl, scrapeWebsiteForAnalysis } from "@/lib/firecrawl";
import { requireAgencyApi } from "@/lib/auth";
import { checkUrlPolicy, UnsafeUrlError } from "@/lib/net/safe-fetch";
import { callOpenAI, callOpenRouter, callGroq, OPENAI_ANALYSIS_MODEL, GROQ_ANALYSIS_MODEL } from "@/lib/llm";
import { failureReason, type ProviderFailureReason } from "@/lib/provider-status";
import { getDomainAnalysisCache, saveDomainAnalysisCache } from "@/lib/domain-cache";
import {
  buildProfile,
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
If a field cannot be determined, use null (or an empty list). Never guess a location, and only list
competitors whose real website domain you know; otherwise return an empty list.

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
    { "domain": "competitor1.com", "name": "Competitor One", "market": "Country / Global" }
  ],
  "geoTopics": ["Topic / Query 1 for AI search", "Topic / Query 2 for AI search"]
}`;
}

async function callAvailableLLM(
  system: string,
  prompt: string,
  maxTokens: number,
  openaiKey?: string,
  groqKey?: string,
  openrouterKey?: string
): Promise<{ content: string | null; rateLimited: boolean }> {
  // 1. Try OpenAI if key exists
  if (openaiKey) {
    try {
      const res = await callOpenAI(OPENAI_ANALYSIS_MODEL, system, prompt, openaiKey, maxTokens);
      if (res && (res.content || (!groqKey && res.rateLimited))) return res;
    } catch (err) {
      if (!groqKey) throw err;
      console.warn("[analyze-website] OpenAI call error, attempting Groq fallback:", err);
    }
  }

  // 2. Try Groq if key exists (either as primary or fallback)
  if (groqKey) {
    try {
      const res = await callGroq(GROQ_ANALYSIS_MODEL, system, prompt, groqKey, maxTokens);
      if (res?.content) return res;
    } catch (err) {
      console.warn("[analyze-website] Groq call error:", err);
    }
  }

  // 3. Fallback to OpenRouter only if neither OpenAI nor Groq was used
  if (!openaiKey && !groqKey && openrouterKey) {
    return await callOpenRouter(MODEL, system, prompt, openrouterKey, maxTokens);
  }

  return { content: null, rateLimited: true };
}

async function handleRegeneration(
  body: {
    domain: string;
    section: "about" | "topics" | "advantage" | "all";
    businessType?: string;
    brandName?: string;
    currentTopics?: string[];
  },
  openaiKey?: string,
  groqKey?: string,
  openrouterKey?: string
) {
  const { domain, section, businessType = "", brandName = "", currentTopics = [] } = body;
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
  } else {
    return NextResponse.json({ success: false, error: "Invalid section" }, { status: 400 });
  }

  const res = await callAvailableLLM(system, prompt, 600, openaiKey, groqKey, openrouterKey);

  if (!res.content) {
    return NextResponse.json({ success: false, error: "Regeneration failed." }, { status: 502 });
  }

  const json = parseModelJson(res.content);
  return NextResponse.json({ success: true, section, data: json });
}

export async function POST(req: NextRequest) {
  const auth = await requireAgencyApi();
  if (auth instanceof Response) return auth;

  let body: {
    url?: unknown;
    action?: string;
    section?: "about" | "topics" | "advantage" | "all";
    businessType?: string;
    brandName?: string;
    currentTopics?: string[];
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ success: false, error: "Please enter a valid website URL." }, { status: 400 });
  }

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();

  // Partial section regeneration
  if (body.action === "regenerate" && body.section) {
    if (!openaiKey && !groqKey && !openrouterKey) {
      return NextResponse.json({ success: false, error: "AI service not configured." }, { status: 503 });
    }
    const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
    const parsed = normaliseDomain(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
    return handleRegeneration(
      {
        domain: parsed?.domain || rawUrl,
        section: body.section,
        businessType: body.businessType,
        brandName: body.brandName,
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
  if (!openaiKey && !groqKey && !openrouterKey) {
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

  // Save to Supabase cache
  saveDomainAnalysisCache(domain, profile).catch((e) =>
    console.warn("[analyze-website] cache save error:", e)
  );

  const ok: AnalysisSuccessResponse = { success: true, data: profile };
  return NextResponse.json(ok);
}
