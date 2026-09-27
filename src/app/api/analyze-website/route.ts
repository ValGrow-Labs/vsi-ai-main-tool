import { NextRequest, NextResponse } from "next/server";
import { normaliseDomain } from "@/lib/url-input";
import { scrapeUrl } from "@/lib/firecrawl";
import { callOpenRouter } from "@/lib/llm";
import { type Location } from "@/types/search";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export interface ExtractedWebsiteData {
  brandName: string;
  domain: string;
  businessType: string;
  websiteTitle: string;
  metaDescription: string;
  language: string;
  location: string;
  locationCode: Location;
  suggestedTopics: string[];
  suggestedKeywords: Array<{
    keyword: string;
    category: "primary" | "long_tail" | "geo" | "ai_search" | "branded";
    categoryLabel: string;
    selected: boolean;
  }>;
  sitemapUrl: string;
  competitiveAdvantage: string;
  aboutBusiness: string;
  targetCustomers: string[];
  suggestedCompetitors: Array<{
    domain: string;
    name: string;
    market: string;
    selected: boolean;
  }>;
  geoTopics: string[];
}

/** Helper to clean domain name for brand fallback */
function extractBrandFromDomain(domain: string): string {
  const parts = domain.split(".");
  if (parts.length >= 2) {
    const main = parts[parts.length - 2];
    return main.charAt(0).toUpperCase() + main.slice(1);
  }
  return domain;
}

function detectDomainLocation(domain: string): { location: string; locationCode: Location } {
  const d = domain.toLowerCase().trim();
  if (d.endsWith(".in") || d.endsWith(".co.in")) return { location: "India", locationCode: "in" };
  if (d.endsWith(".uk") || d.endsWith(".co.uk")) return { location: "United Kingdom", locationCode: "uk" };
  if (d.endsWith(".ae") || d.endsWith(".co.ae")) return { location: "UAE", locationCode: "ae" };
  if (d.endsWith(".sg") || d.endsWith(".com.sg")) return { location: "Singapore", locationCode: "sg" };
  if (d.endsWith(".lk")) return { location: "Sri Lanka", locationCode: "lk" };
  return { location: "United States", locationCode: "us" };
}

/** Dynamic content-aware fallback when LLM is unreachable */
function generateDynamicFallback(
  domain: string,
  title?: string,
  description?: string,
  markdown?: string
): ExtractedWebsiteData {
  const brand = extractBrandFromDomain(domain);
  const cleanTitle = title?.trim() || `${brand} Official Website`;
  const cleanDesc = description?.trim() || `${brand} provides solutions and services online.`;
  const locInfo = detectDomainLocation(domain);

  const fullText = `${cleanTitle} ${cleanDesc} ${(markdown || "").slice(0, 1000)}`.toLowerCase();

  // Industry detection based on actual page content
  let businessType = "Digital Services & Solutions";
  let targetCustomers = ["Individual consumers", "Enterprises and businesses", "Digital users"];
  let suggestedTopics = [`${brand} Services`, "Digital Solutions", "Customer Platform", "Technology & Innovation"];
  let competitiveAdvantage = `${brand} delivers specialized, customer-centric services with high reliability and performance.`;
  let suggestedCompetitors = [
    { domain: `leading-${domain}`, name: `Market Leader 1`, market: locInfo.location, selected: true },
    { domain: `top-${domain}`, name: `Top Competitor 2`, market: locInfo.location, selected: true },
  ];

  if (/\b(stream|streaming|movie|movies|film|films|tv show|tv shows|series|watch|video|entertainment)\b/i.test(fullText)) {
    businessType = "Video Streaming & Entertainment";
    targetCustomers = ["Movie & TV enthusiasts", "Streaming subscribers", "Families & households", "Mobile & smart TV viewers"];
    suggestedTopics = ["Streaming TV Shows", "Movies & Feature Films", "Original Content & Series", "Multi-Device Streaming", "Entertainment Recommendations"];
    competitiveAdvantage = `${brand} offers a rich entertainment catalog with seamless on-demand streaming across smart TVs, mobile, and web.`;
    suggestedCompetitors = [
      { domain: "hulu.com", name: "Hulu", market: locInfo.location, selected: true },
      { domain: "disneyplus.com", name: "Disney+", market: locInfo.location, selected: true },
      { domain: "primevideo.com", name: "Amazon Prime Video", market: locInfo.location, selected: true },
    ];
  } else if (/\b(software|saas|cloud|api|platform|developer|analytics|automation|workflow|ai|database)\b/i.test(fullText)) {
    businessType = "Software & Cloud Platform (SaaS)";
    targetCustomers = ["Enterprises and corporations", "Developers and engineering teams", "IT decision makers", "Growth startups"];
    suggestedTopics = ["Cloud Architecture", "Platform Integration", "Enterprise Security", "Data & Analytics", "Workflow Automation"];
    competitiveAdvantage = `${brand} empowers teams with scalable, automated software infrastructure and modern cloud reliability.`;
    suggestedCompetitors = [
      { domain: "microsoft.com", name: "Microsoft", market: locInfo.location, selected: true },
      { domain: "google.com", name: "Google Cloud", market: locInfo.location, selected: true },
      { domain: "amazon.com", name: "AWS", market: locInfo.location, selected: true },
    ];
  } else if (/\b(shop|store|cart|buy|price|products|apparel|footwear|fashion|clothing|ecommerce|retail)\b/i.test(fullText)) {
    businessType = "E-Commerce & Retail";
    targetCustomers = ["Online shoppers", "Fashion and lifestyle consumers", "Value-conscious buyers"];
    suggestedTopics = ["Online Catalog", "Trending Products", "Seasonal Collections", "Customer Support", "Exclusive Offers"];
    competitiveAdvantage = `${brand} provides curated quality products with competitive pricing, easy returns, and fast fulfillment.`;
    suggestedCompetitors = [
      { domain: "amazon.com", name: "Amazon", market: locInfo.location, selected: true },
      { domain: "walmart.com", name: "Walmart", market: locInfo.location, selected: true },
    ];
  } else if (/\b(bank|banking|invest|investment|finance|financial|loan|credit|wealth|crypto|insurance)\b/i.test(fullText)) {
    businessType = "Financial Services & Fintech";
    targetCustomers = ["Individual investors", "Retail banking clients", "Business owners and founders"];
    suggestedTopics = ["Financial Planning", "Digital Banking", "Wealth & Investment", "Secure Transactions", "Advisory Services"];
    competitiveAdvantage = `${brand} provides secure, transparent financial solutions with dedicated advisory support.`;
  } else if (/\b(health|healthcare|medical|clinic|doctor|patient|hospital|medicine|wellness|therapy)\b/i.test(fullText)) {
    businessType = "Healthcare & Medical Services";
    targetCustomers = ["Patients & individuals", "Healthcare professionals", "Families seeking medical care"];
    suggestedTopics = ["Clinical Care", "Patient Consultations", "Specialized Treatments", "Preventative Health", "Medical Expertise"];
    competitiveAdvantage = `${brand} offers certified medical care and patient-first healthcare guidance.`;
  } else if (/\b(travel|hotel|hotels|resort|vacation|tour|flights|booking|destinations|trip)\b/i.test(fullText)) {
    businessType = "Travel & Hospitality";
    targetCustomers = ["Vacationers & tourists", "Business travelers", "Adventure & leisure seekers"];
    suggestedTopics = ["Travel Booking", "Destinations & Guides", "Hotel Accommodations", "Travel Packages", "Customer Reviews"];
    competitiveAdvantage = `${brand} provides seamless travel bookings and verified accommodations worldwide.`;
  }

  return {
    brandName: brand,
    domain,
    businessType,
    websiteTitle: cleanTitle,
    metaDescription: cleanDesc,
    language: "English",
    location: locInfo.location,
    locationCode: locInfo.locationCode,
    suggestedTopics,
    suggestedKeywords: [
      { keyword: `best ${brand.toLowerCase()} services`, category: "primary", categoryLabel: "Primary Search", selected: true },
      { keyword: `${brand.toLowerCase()} official website`, category: "branded", categoryLabel: "Branded Search", selected: true },
      { keyword: `top alternatives to ${brand.toLowerCase()}`, category: "long_tail", categoryLabel: "Transactional", selected: true },
      { keyword: `${brand.toLowerCase()} reviews and features`, category: "primary", categoryLabel: "Primary Search", selected: true },
      { keyword: `what is ${brand.toLowerCase()} and how it works`, category: "ai_search", categoryLabel: "AI Overview", selected: true },
    ],
    sitemapUrl: `https://${domain}/sitemap.xml`,
    competitiveAdvantage,
    aboutBusiness: cleanDesc,
    targetCustomers,
    suggestedCompetitors,
    geoTopics: [
      `What makes ${brand} stand out in the ${businessType} market?`,
      `How does ${brand} compare to other industry providers?`,
      `What are customer reviews and feedback for ${brand}?`,
    ],
  };
}

async function extractWithOpenRouter(prompt: string, apiKey: string): Promise<string | null> {
  const models = ["openrouter/auto", "meta-llama/llama-3.3-70b-instruct"];
  for (const model of models) {
    try {
      const res = await callOpenRouter(
        model,
        "You are an expert AI business and SEO analyst. Respond ONLY with valid JSON.",
        prompt,
        apiKey
      );
      if (res.content) return res.content;
    } catch {
      continue;
    }
  }
  return null;
}

async function extractWithGemini(prompt: string, apiKey: string): Promise<string | null> {
  const models = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-2.5-flash"];
  for (const model of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
          }),
          signal: AbortSignal.timeout(15000),
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return text;
    } catch {
      continue;
    }
  }
  return null;
}

async function extractWithOpenAI(prompt: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an expert AI business and SEO analyst. Respond ONLY with valid JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    let body: { url?: unknown };
    try {
      body = (await req.json()) as { url?: unknown };
    } catch {
      return NextResponse.json({ success: false, error: "Please enter a valid website URL." }, { status: 400 });
    }

    const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
    if (!rawUrl) {
      return NextResponse.json({ success: false, error: "Please enter a valid website URL." }, { status: 400 });
    }

    const urlWithProto = rawUrl.startsWith("http://") || rawUrl.startsWith("https://") ? rawUrl : `https://${rawUrl}`;
    const parsed = normaliseDomain(urlWithProto);

    if (!parsed?.domain) {
      return NextResponse.json({ success: false, error: "Please enter a valid website URL." }, { status: 400 });
    }

    const targetUrl = `https://${parsed.domain}`;

    // Scrape website using Firecrawl or fallback scraper
    let scrapedResult;
    try {
      scrapedResult = await scrapeUrl(targetUrl);
    } catch {
      return NextResponse.json(
        { success: false, error: "We couldn't access this website. Please check the URL and try again." },
        { status: 400 }
      );
    }

    const { markdown, title, description } = scrapedResult;

    if (!markdown && !title && !description) {
      return NextResponse.json(
        { success: false, error: "We couldn't access this website. Please check the URL and try again." },
        { status: 400 }
      );
    }

    const userPrompt = `Analyze this website content and extract comprehensive, authentic business intelligence.
Do NOT invent unrelated e-commerce or retail topics if the business is entertainment, streaming, technology, health, or finance.

Website Domain: ${parsed.domain}
Website Title: ${title ?? "N/A"}
Meta Description: ${description ?? "N/A"}

Scraped Content Preview (Markdown):
"""
${(markdown || "").slice(0, 4000)}
"""

Return JSON in this EXACT structure:
{
  "brandName": "Actual Brand Name",
  "businessType": "Accurate Specific Industry / Category (e.g. Video Streaming / Entertainment or Cloud SaaS Platform)",
  "language": "Primary Language e.g. English",
  "location": "Primary Country e.g. United States or India or United Arab Emirates",
  "locationCode": "ae" | "us" | "uk" | "in" | "lk" | "sg",
  "suggestedTopics": ["Accurate Topic 1", "Accurate Topic 2", "Accurate Topic 3", "Accurate Topic 4", "Accurate Topic 5"],
  "suggestedKeywords": [
    { "keyword": "search query 1", "category": "primary", "categoryLabel": "Primary Keyword", "selected": true },
    { "keyword": "search query 2", "category": "geo", "categoryLabel": "Location Search", "selected": true },
    { "keyword": "search query 3", "category": "ai_search", "categoryLabel": "AI Search Prompt", "selected": true },
    { "keyword": "search query 4", "category": "branded", "categoryLabel": "Branded Search", "selected": true },
    { "keyword": "search query 5", "category": "long_tail", "categoryLabel": "Transactional", "selected": true }
  ],
  "sitemapUrl": "https://${parsed.domain}/sitemap.xml",
  "competitiveAdvantage": "Authentic value proposition describing what this specific company actually offers.",
  "aboutBusiness": "2-3 concise sentences summarizing what this business actually does.",
  "targetCustomers": ["Real Target Audience 1", "Real Target Audience 2", "Real Target Audience 3"],
  "suggestedCompetitors": [
    { "domain": "actual-competitor1.com", "name": "Actual Competitor One", "market": "Country / Global", "selected": true },
    { "domain": "actual-competitor2.com", "name": "Actual Competitor Two", "market": "Country / Global", "selected": true },
    { "domain": "actual-competitor3.com", "name": "Actual Competitor Three", "market": "Country / Global", "selected": true }
  ],
  "geoTopics": ["Topic / Query 1 for AI search", "Topic / Query 2 for AI search"]
}`;

    let aiContent: string | null = null;

    // 1. Try OpenRouter
    if (process.env.OPENROUTER_API_KEY) {
      aiContent = await extractWithOpenRouter(userPrompt, process.env.OPENROUTER_API_KEY);
    }

    // 2. Try Gemini fallback
    if (!aiContent && (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) {
      const gKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)!;
      aiContent = await extractWithGemini(userPrompt, gKey);
    }

    // 3. Try OpenAI fallback
    if (!aiContent && process.env.OPENAI_API_KEY) {
      aiContent = await extractWithOpenAI(userPrompt, process.env.OPENAI_API_KEY);
    }

    if (aiContent) {
      try {
        const match = aiContent.match(/\{[\s\S]*\}/);
        if (match) {
          const parsedData = JSON.parse(match[0]);
          const locInfo = detectDomainLocation(parsed.domain);

          const finalData: ExtractedWebsiteData = {
            brandName: parsedData.brandName || extractBrandFromDomain(parsed.domain),
            domain: parsed.domain,
            businessType: parsedData.businessType || "Digital Services & Solutions",
            websiteTitle: title || parsedData.brandName || parsed.domain,
            metaDescription: description || parsedData.aboutBusiness || "",
            language: parsedData.language || "English",
            location: parsedData.location || locInfo.location,
            locationCode: (["ae", "us", "uk", "in", "lk", "sg"].includes(parsedData.locationCode)
              ? parsedData.locationCode
              : locInfo.locationCode) as Location,
            suggestedTopics:
              Array.isArray(parsedData.suggestedTopics) && parsedData.suggestedTopics.length > 0
                ? parsedData.suggestedTopics
                : [`${parsedData.brandName || parsed.domain} Services`, "Digital Solutions"],
            suggestedKeywords: Array.isArray(parsedData.suggestedKeywords) ? parsedData.suggestedKeywords : [],
            sitemapUrl: parsedData.sitemapUrl || `https://${parsed.domain}/sitemap.xml`,
            competitiveAdvantage:
              parsedData.competitiveAdvantage ||
              `${parsedData.brandName || parsed.domain} provides leading solutions with high reliability and performance.`,
            aboutBusiness:
              parsedData.aboutBusiness || description || `${parsedData.brandName || parsed.domain} is a leading industry provider.`,
            targetCustomers:
              Array.isArray(parsedData.targetCustomers) && parsedData.targetCustomers.length > 0
                ? parsedData.targetCustomers
                : ["Consumers", "Businesses", "Subscribers"],
            suggestedCompetitors: Array.isArray(parsedData.suggestedCompetitors)
              ? parsedData.suggestedCompetitors.map((c: { domain?: string; name?: string; market?: string }) => ({
                  domain:
                    c.domain?.toLowerCase().replace(/^https?:\/\//i, "").replace(/\/.*$/, "") ||
                    `competitor-${parsed.domain}`,
                  name: c.name || c.domain || "Industry Competitor",
                  market: c.market || parsedData.location || "Global",
                  selected: true,
                }))
              : [],
            geoTopics: Array.isArray(parsedData.geoTopics) ? parsedData.geoTopics : [],
          };

          return NextResponse.json({ success: true, data: finalData });
        }
      } catch (err) {
        console.warn("[analyze-website] failed to parse AI JSON, falling back to dynamic content analysis", err);
      }
    }

    // Dynamic content-aware fallback using the actual scraped title, description, and keywords
    const dynamicFallback = generateDynamicFallback(parsed.domain, title ?? undefined, description ?? undefined, markdown);
    return NextResponse.json({ success: true, data: dynamicFallback });
  } catch (err) {
    console.error("[analyze-website] error:", err);
    return NextResponse.json(
      { success: false, error: "Website analysis encountered an error. Please try again." },
      { status: 500 }
    );
  }
}
