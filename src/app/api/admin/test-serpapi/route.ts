import { adminApiSession } from "@/lib/admin/api";
import { NextRequest, NextResponse } from "next/server";
import { logProviderError, safeProviderMessage } from "@/lib/provider-response";

/** Strip anything that looks like a credential from text shown to the admin. */
function redact(text: string): string {
 return text.replace(/(api[_-]?key|key|token)=([^&\s"']+)/gi, "$1=[redacted]");
}

export const maxDuration = 120;
export const dynamic = "force-dynamic";

interface SerpApiBody {
 ai_overview?: unknown;
 text_blocks?: unknown;
 references?: unknown;
 reconstructed_markdown?: unknown;
 error?: string;
 search_metadata?: { status?: string };
}

interface EngineResult {
 status: number;
 bodyExcerpt: SerpApiBody;
 tookMs: number;
 error?: string;
 creditsUsed: number;
 expanded?: boolean; // For the AIO step: whether we had to follow up with page_token
}

async function fire(url: string): Promise<{ status: number; body: Record<string, unknown>; tookMs: number; error?: string }> {
 const started = Date.now();
 try {
 const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
 const took = Date.now() - started;
 const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
 return { status: res.status, body: json, tookMs: took };
 } catch (e) {
 logProviderError("admin/test-serpapi", e);
 return {
 status: 0,
 body: {},
 tookMs: Date.now() - started,
 // Fixed text: a fetch error can echo the request URL, which carries the api_key.
 error: safeProviderMessage(e),
 };
 }
}

function trim(body: Record<string, unknown>): SerpApiBody {
 return {
 ai_overview: body.ai_overview,
 text_blocks: body.text_blocks,
 references: body.references,
 reconstructed_markdown: body.reconstructed_markdown,
 error: typeof body.error === "string" ? redact(body.error) : undefined,
 search_metadata: body.search_metadata as { status?: string } | undefined,
 };
}

async function runAIMode(keyword: string, gl: string, hl: string, apiKey: string): Promise<EngineResult> {
 const url = `https://serpapi.com/search.json?engine=google_ai_mode&q=${encodeURIComponent(keyword)}&gl=${gl}&hl=${hl}&api_key=${apiKey}`;
 const r = await fire(url);
 return {
 status: r.status,
 bodyExcerpt: trim(r.body),
 tookMs: r.tookMs,
 error: r.error,
 creditsUsed: 1,
 };
}

export async function POST(req: NextRequest) {
 const guard = await adminApiSession();
 if (guard instanceof NextResponse) return guard;
 const apiKey = process.env.SERPAPI_KEY || process.env.SERPAPI_API_KEY;
 if (!apiKey) return NextResponse.json({ error: "SERPAPI_KEY missing" }, { status: 503 });

 const { keyword, gl = "ae", hl = "en" } = (await req.json()) as { keyword?: string; gl?: string; hl?: string };
 if (!keyword) return NextResponse.json({ error: "keyword required" }, { status: 400 });

 // Diagnostic only: SerpAPI's Google AI Mode engine. The check pipeline does
 // not use it — it uses engine=google (Google AI Overview, see ai-engines.ts).
 const aiModeResult = await runAIMode(keyword, gl, hl, apiKey);

 return NextResponse.json({
 keyword,
 gl,
 hl,
 ai_mode: aiModeResult,
 });
}
