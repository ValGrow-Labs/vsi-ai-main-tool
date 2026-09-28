import { NextRequest, NextResponse } from "next/server";
import { LOCATIONS } from "@/types/search";
import type { Location } from "@/types/search";
import { requireSuperAdminApi } from "@/lib/auth";

// Debug only — returns raw search engine response so we can inspect the actual structure
export async function POST(req: NextRequest) {
 const session = await requireSuperAdminApi();
 if (session instanceof Response) return session;

 let keyword: unknown, location: unknown;
 try {
 ({ keyword, location = "ae" } = (await req.json()) as { keyword?: unknown; location?: unknown });
 } catch {
 return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
 }
 if (typeof keyword !== "string" || !keyword.trim() || typeof location !== "string" || !(location in LOCATIONS)) {
 return NextResponse.json({ error: "keyword and a valid location are required" }, { status: 400 });
 }

 const key = process.env.SERPAPI_KEY;
 if (!key) return NextResponse.json({ error: "No SERPAPI_KEY" }, { status: 500 });

 const loc = LOCATIONS[location as Location];
 const params = new URLSearchParams({
 engine: "google",
 q: keyword,
 gl: loc.gl,
 hl: loc.hl,
 location: loc.location,
 api_key: key,
 });

 let raw: { ai_overview?: Record<string, unknown> };
 try {
 const res = await fetch(`https://serpapi.com/search?${params.toString()}`);
 raw = await res.json();
 } catch (e) {
 console.error("[debug/aio] provider call failed", e instanceof Error ? e.message : e);
 return NextResponse.json({ error: "The search provider call failed." }, { status: 502 });
 }

 // Return only the ai_overview section to keep the response small
 return NextResponse.json({
 has_ai_overview: !!raw.ai_overview,
 ai_overview_keys: raw.ai_overview ? Object.keys(raw.ai_overview) : [],
 ai_overview: raw.ai_overview ?? null,
 });
}
