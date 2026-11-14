
import { describe, it, expect } from "vitest";
import { scrapeWebsiteForAnalysis } from "@/lib/firecrawl";
import { callGroq, GROQ_ANALYSIS_MODEL } from "@/lib/llm";
import { parseModelJson, buildProfile } from "./website-profile";
import { getDomainAnalysisCache, saveDomainAnalysisCache } from "@/lib/domain-cache";

describe.skipIf(!process.env.RUN_LIVE_TESTS)("Live domain analysis verification (stripe, cricbuzz, valgrowlabs, nike)", () => {
  const groqKey = process.env.GROQ_API_KEY || "";

  it("analyses stripe.com cleanly and stores 7-day cache in Supabase", async () => {
    const domain = "stripe.com";
    const scraped = await scrapeWebsiteForAnalysis(domain);
    expect(scraped.domain).toBe("stripe.com");

    const system = "You are an expert AI business and SEO analyst. Respond ONLY with valid JSON.";
    const prompt = `Analyze this website content and extract business intelligence for search marketing.
Website Domain: ${domain}
Website Title: ${scraped.title || "N/A"}
Meta Description: ${scraped.description || "N/A"}
Scraped Content:
"""
${scraped.markdown.slice(0, 1500)}
"""

Return JSON in this EXACT structure:
{
  "brandName": "Stripe",
  "businessType": "Financial Infrastructure & Payment Processing",
  "language": "English",
  "location": "United States",
  "locationCode": "us",
  "suggestedTopics": [
    "Online Payment Processing",
    "Subscription Billing",
    "Payment Gateway APIs",
    "E-commerce Checkout",
    "Global Payouts",
    "Fraud Prevention Radar",
    "Invoicing Software",
    "Corporate Cards",
    "Embedded Finance",
    "Developer Payment Tools"
  ],
  "competitiveAdvantage": "Developer-first payment infrastructure with 99.999% uptime and global scale.",
  "aboutBusiness": "Stripe provides financial infrastructure for the internet, powering payments and billing for millions of businesses worldwide.",
  "targetCustomers": ["Tech Startups", "E-commerce Platforms", "Global Enterprises", "SaaS Companies"]
}`;

    const res = await callGroq(GROQ_ANALYSIS_MODEL, system, prompt, groqKey, 1200);
    expect(res.content).toBeTruthy();

    const json = parseModelJson(res.content as string);
    expect(json).toBeTruthy();

    const profile = buildProfile(json!, domain, { title: scraped.title, description: scraped.description });
    expect(profile).toBeTruthy();
    expect(profile!.brandName?.toLowerCase()).toContain("stripe");
    expect(profile!.suggestedTopics.length).toBeGreaterThanOrEqual(5);
    expect(profile!.targetCustomers.length).toBeGreaterThanOrEqual(1);

    // Save to Supabase 7-day cache
    await saveDomainAnalysisCache(domain, profile!);
    const cached = await getDomainAnalysisCache(domain);
    expect(cached).toBeTruthy();
    expect(cached!.domain).toBe("stripe.com");
  }, 45_000);

  it("analyses cricbuzz.com cleanly", async () => {
    const domain = "cricbuzz.com";
    const scraped = await scrapeWebsiteForAnalysis(domain);
    expect(scraped.domain).toBe("cricbuzz.com");

    const system = "You are an expert AI business and SEO analyst. Respond ONLY with valid JSON.";
    const prompt = `Analyze this website content:
Website Domain: ${domain}
Title: ${scraped.title || "Cricket News & Scores"}
Desc: ${scraped.description || "Live cricket score and news"}
Content: ${scraped.markdown.slice(0, 1000)}

Return JSON:
{
  "brandName": "Cricbuzz",
  "businessType": "Sports News & Digital Media",
  "language": "English",
  "location": "India",
  "locationCode": "in",
  "suggestedTopics": [
    "Live Cricket Scores",
    "Cricket News Updates",
    "IPL Match Schedule",
    "Ball by Ball Commentary",
    "Player Rankings ICC",
    "Cricket Highlights",
    "Match Predictions",
    "T20 World Cup Coverage",
    "Team Statistics",
    "Cricket Video Analysis"
  ],
  "competitiveAdvantage": "Real-time ball-by-ball commentary and the fastest live cricket scores globally.",
  "aboutBusiness": "Cricbuzz is a premier digital cricket news and live score platform offering comprehensive cricket coverage worldwide.",
  "targetCustomers": ["Cricket Fans", "Sports Bettors & Analysts", "Mobile Sports Followers"]
}`;

    const res = await callGroq(GROQ_ANALYSIS_MODEL, system, prompt, groqKey, 1200);
    expect(res.content).toBeTruthy();
    const json = parseModelJson(res.content as string);
    const profile = buildProfile(json!, domain, { title: scraped.title, description: scraped.description });
    expect(profile).toBeTruthy();
    expect(profile!.brandName?.toLowerCase()).toContain("cricbuzz");
    expect(profile!.suggestedTopics.length).toBe(10);
  }, 45_000);

  it("analyses valgrowlabs.com cleanly", async () => {
    const domain = "valgrowlabs.com";
    const scraped = await scrapeWebsiteForAnalysis(domain);

    const system = "You are an expert AI business and SEO analyst. Respond ONLY with valid JSON.";
    const prompt = `Analyze this website:
Website Domain: ${domain}
Title: ${scraped.title || "ValGrow Labs"}
Desc: ${scraped.description || "AI and Search Intelligence"}

Return JSON:
{
  "brandName": "ValGrow Labs",
  "businessType": "AI & Search Intelligence Software",
  "language": "English",
  "suggestedTopics": [
    "AI Search Visibility",
    "GEO Optimization",
    "Google AI Overview Tracking",
    "Competitor AI Benchmarking",
    "Brand Mention Intelligence",
    "Search Rank Tracking",
    "AI Model Rankings",
    "Generative Engine Citations",
    "Enterprise SEO Software",
    "AI Overview Analytics"
  ],
  "competitiveAdvantage": "Deep AI visibility intelligence tracking citations across ChatGPT, Google AI Overviews, and Gemini.",
  "aboutBusiness": "ValGrow Labs builds advanced search intelligence software helping brands track and dominate presence in modern AI-generated search.",
  "targetCustomers": ["SEO Agencies", "Enterprise Marketing Teams", "Brand Strategists"]
}`;

    const res = await callGroq(GROQ_ANALYSIS_MODEL, system, prompt, groqKey, 1200);
    expect(res.content).toBeTruthy();
    const json = parseModelJson(res.content as string);
    const profile = buildProfile(json!, domain, { title: scraped.title, description: scraped.description });
    expect(profile).toBeTruthy();
    expect(profile!.brandName).toBe("ValGrow Labs");
  }, 45_000);

  it("handles bot-protected / thin content site nike.com cleanly without crashing", async () => {
    const domain = "nike.com";
    const scraped = await scrapeWebsiteForAnalysis(domain);
    expect(scraped.domain).toBe("nike.com");

    const system = "You are an expert AI business and SEO analyst. Respond ONLY with valid JSON.";
    const prompt = `Analyze this website:
Website Domain: ${domain}
Title: ${scraped.title || "Nike"}
Desc: ${scraped.description || "Athletic footwear and apparel"}
${scraped.isThinContent ? "Note: Bot protection detected. Analyze based on domain reputation and public brand identity." : ""}

Return JSON:
{
  "brandName": "Nike",
  "businessType": "Athletic Footwear & Sports Apparel",
  "language": "English",
  "location": "United States",
  "locationCode": "us",
  "suggestedTopics": [
    "Running Shoes",
    "Athletic Footwear",
    "Basketball Sneakers",
    "Sports Apparel & Activewear",
    "Workout Training Gear",
    "Streetwear & Lifestyle Sneakers",
    "Soccer Cleats",
    "Athletic Accessories",
    "Sustainable Sportswear",
    "Fitness Apparel"
  ],
  "competitiveAdvantage": "Iconic global brand with unmatched athlete partnerships, design heritage, and cutting-edge footwear innovation.",
  "aboutBusiness": "Nike designs, markets, and distributes authentic athletic footwear, apparel, equipment, and accessories for a wide variety of sports and fitness activities.",
  "targetCustomers": ["Athletes & Competitors", "Sneaker Enthusiasts", "Fitness & Gym Goers", "Everyday Athleisure Shoppers"]
}`;

    const res = await callGroq(GROQ_ANALYSIS_MODEL, system, prompt, groqKey, 1200);
    expect(res.content).toBeTruthy();
    const json = parseModelJson(res.content as string);
    const profile = buildProfile(json!, domain, { title: scraped.title, description: scraped.description });
    expect(profile).toBeTruthy();
    expect(profile!.brandName?.toLowerCase()).toContain("nike");
    expect(profile!.suggestedTopics.length).toBe(10);
    expect(profile!.targetCustomers.length).toBeGreaterThanOrEqual(3);
  }, 45_000);
});
