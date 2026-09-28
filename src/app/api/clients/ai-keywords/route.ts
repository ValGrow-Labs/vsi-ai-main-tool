import { NextRequest, NextResponse } from "next/server";
import { requireAgencyApi } from "@/lib/auth";
import { normaliseDomain } from "@/lib/url-input";
import { scrapeWebsiteMetadata, generateAIKeywordsAndQueries } from "@/lib/ai-keyword-generator";
import { LOCATIONS, type Location } from "@/types/search";

export const dynamic = "force-dynamic";

/**
 * Suggested searches for a website. Suggestions come from the website's
 * title and headings plus industry and location templates; they are ideas
 * for the user to pick from, never saved automatically.
 */
export async function POST(req: NextRequest) {
  // 401 signed out, 403 disabled / no organization — JSON, never a redirect.
  const auth = await requireAgencyApi();
  if (auth instanceof Response) return auth;

  let body: { domain?: unknown; brandName?: unknown; industry?: unknown; location?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }

  const parsed = typeof body.domain === "string" ? normaliseDomain(body.domain) : null;
  if (!parsed) return NextResponse.json({ success: false, error: "Enter a valid website." }, { status: 400 });
  const brand = typeof body.brandName === "string" && body.brandName.trim() ? body.brandName.trim().slice(0, 120) : parsed.domain;
  const industry = typeof body.industry === "string" && body.industry.trim() ? body.industry.trim().slice(0, 80) : "Digital Services";
  const location: Location = typeof body.location === "string" && body.location in LOCATIONS ? (body.location as Location) : "ae";

  try {
    const metadata = await scrapeWebsiteMetadata(parsed.domain);
    const analysis = generateAIKeywordsAndQueries(parsed.domain, brand, industry, location, metadata);
    return NextResponse.json({ success: true, analysis });
  } catch (e) {
    console.error("[ai-keywords] suggestion failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ success: false, error: "Couldn't suggest searches right now." }, { status: 500 });
  }
}
