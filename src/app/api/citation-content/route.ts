import { NextRequest, NextResponse } from "next/server";
import { scrapeUrl } from "@/lib/firecrawl";
import { requireAgencyApi } from "@/lib/auth";
import { checkUrlPolicy, UnsafeUrlError } from "@/lib/net/safe-fetch";
import { analyzeCitation } from "@/lib/llm";
import type { CitationIntelligence } from "@/lib/llm";

export interface CitationContent {
 url: string;
 title: string | null;
 description: string | null;
 markdown: string;
 wordCount: number;
 source: "firecrawl" | "fallback";
 intelligence: CitationIntelligence | null;
 fetchedAt: string;
}

export async function POST(req: NextRequest) {
 const auth = await requireAgencyApi();
 if (auth instanceof Response) return auth;

 try {
 const { url, keyword, sourceName, clientBrand, analyze = false } = await req.json() as {
 url: string;
 keyword?: string;
 sourceName?: string;
 clientBrand?: string;
 analyze?: boolean; // true = run LLM, false = content only (fast)
 };

 if (typeof url !== "string" || !url.trim()) {
 return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
 }
 // Outbound policy: public http(s) hosts only (DNS is checked again inside scrapeUrl).
 const policy = checkUrlPolicy(url.trim());
 if (!policy.ok) {
 return NextResponse.json({ error: policy.reason }, { status: 400 });
 }

 const scraped = await scrapeUrl(policy.url.toString());

 let intelligence: CitationIntelligence | null = null;
 if (analyze && keyword && sourceName) {
 const analysed = await analyzeCitation(
 keyword,
 sourceName,
 scraped.markdown,
 clientBrand ?? "the client"
 );
 // Placeholder analysis (no model answered) is not shown as a result.
 intelligence = analysed.unavailable ? null : analysed;
 }

 return NextResponse.json({
 url: scraped.url,
 title: scraped.title,
 description: scraped.description,
 markdown: scraped.markdown.slice(0, 5000),
 wordCount: scraped.wordCount,
 source: scraped.source,
 intelligence,
 fetchedAt: new Date().toISOString(),
 } satisfies CitationContent);
 } catch (err) {
 if (err instanceof UnsafeUrlError) {
 return NextResponse.json({ error: err.message }, { status: 400 });
 }
 // Fixed text only: fetch/scrape errors can carry upstream bodies or provider URLs.
 console.error("[citation-content] failed", err instanceof Error ? err.message : err);
 return NextResponse.json({ error: "We couldn't fetch that page. Try again in a moment." }, { status: 500 });
 }
}
