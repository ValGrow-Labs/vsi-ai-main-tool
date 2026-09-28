import { NextRequest, NextResponse } from "next/server";
import { requireAgencyApi } from "@/lib/auth";
import { analyzeAIO } from "@/lib/llm";

export async function POST(req: NextRequest) {
 // Paid provider call: an active signed-in user with an organization only (401 / 403 otherwise).
 const auth = await requireAgencyApi();
 if (auth instanceof Response) return auth;

 try {
 const { keyword, brand, aioSnippet, citedSources } = await req.json() as {
 keyword: string;
 brand: string;
 aioSnippet: string;
 citedSources: string[];
 };

 if (!aioSnippet?.trim()) {
 return NextResponse.json({ error: "No AIO text to analyze" }, { status: 400 });
 }

 const result = await analyzeAIO(keyword, brand, aioSnippet, citedSources);
 // No model answered: an error, not a "brand not mentioned" analysis.
 if (result.unavailable) {
 return NextResponse.json({ success: false, status: "CHECK_FAILED", error: "AI analysis isn't available right now." }, { status: 503 });
 }
 return NextResponse.json(result);
 } catch (err) {
 if (err instanceof SyntaxError) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
 console.error("[analyze] failed", err instanceof Error ? err.message : err);
 return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
 }
}
