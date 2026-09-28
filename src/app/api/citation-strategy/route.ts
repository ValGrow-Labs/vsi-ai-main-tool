import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAgencyApi, apiServerError } from "@/lib/auth";
import { UUID_PATTERN } from "@/lib/project-types";
import { runCitationStrategy } from "@/lib/citation-strategy";
import type { AIOCitation } from "@/types/search";

export const maxDuration = 180;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
 const session = await requireAgencyApi();
 if (session instanceof Response) return session;
 try {
 const { snapshot_id } = (await req.json()) as { snapshot_id?: string };
 if (!snapshot_id || typeof snapshot_id !== "string" || !UUID_PATTERN.test(snapshot_id)) {
 return NextResponse.json({ error: "snapshot_id required" }, { status: 400 });
 }

 const supabase = await createClient();
 const isSuperAdmin = session.role === "super_admin";

 let snapQuery = supabase
 .from("search_results")
 .select("id, agency_id, client_id, keyword, brand, domain, citations_json, rank_url, chatgpt_checked, chatgpt_response, chatgpt_brand_cited, chatgpt_brand_mentioned, chatgpt_competitors, clients(brand_name, name, website)")
 .eq("id", snapshot_id);
 if (!isSuperAdmin) {
 snapQuery = snapQuery.eq("agency_id", session.agencyId);
 }
 const { data: snap } = await snapQuery.single();

 if (!snap) {
 return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
 }
 const owningAgencyId = (snap.agency_id as string) ?? session.agencyId;

 const client = (snap.clients as unknown) as { brand_name: string | null; name: string; website: string } | null;
 const brand = snap.brand ?? client?.brand_name ?? client?.name ?? "";
 const domain = snap.domain ?? client?.website ?? "";

 const citations = (snap.citations_json as AIOCitation[] | null) ?? [];
 // Top 10 non-client citations. We run async now so the wall-clock isn't
 // capped by the proxy budget. Firecrawl resolves AMP / google.com
 // redirect URLs to the real underlying competitor pages.
 const urls = citations
 .filter((c) => !c.isClient && c.url && /^https?:\/\//.test(c.url))
 .slice(0, 10)
 .map((c) => c.url);

 if (urls.length === 0) {
 return NextResponse.json(
 { error: "No competitor citations to analyze for this snapshot" },
 { status: 400 }
 );
 }

 const clientPageUrl = typeof snap.rank_url === "string" && /^https?:\/\//.test(snap.rank_url)
 ? snap.rank_url
 : null;

 // Mark the row pending immediately so the UI knows to poll, then run
 // the heavy Firecrawl + LLM work in a background after() callback.
 await supabase
 .from("search_results")
 .update({ citation_strategy_status: "pending", citation_strategy_error: null })
 .eq("id", snapshot_id)
 .eq("agency_id", owningAgencyId);

 // Reddit / forum URLs the LLM should recommend engaging on directly,
 // even when scrape fails (Reddit often blocks our scraper).
 const engagementUrls = citations
 .filter((c) => !c.isClient && c.url && /^https?:\/\//.test(c.url))
 .filter((c) => /reddit\.com|quora\.com|stackexchange|trustpilot|sitejabber|youtube\.com/.test(c.domain.toLowerCase()))
 .slice(0, 5)
 .map((c) => ({ url: c.url, domain: c.domain, title: c.title ?? null, sourceName: c.sourceName }));

 const chatgptContext = snap.chatgpt_checked ? {
 response: (snap.chatgpt_response as string | null) ?? null,
 clientCited: !!snap.chatgpt_brand_cited,
 clientMentioned: !!snap.chatgpt_brand_mentioned,
 competitors: (snap.chatgpt_competitors as string[] | null) ?? [],
 } : null;

 after(async () => {
 const supa = await createClient();
 try {
 const result = await runCitationStrategy({
 keyword: snap.keyword,
 clientBrand: brand,
 clientDomain: domain,
 citationUrls: urls,
 clientPageUrl,
 engagementUrls,
 chatgptContext,
 });
 if (!result.ok || !result.strategy) {
 await supa
 .from("search_results")
 .update({
 citation_strategy_status: "failed",
 citation_strategy_error: result.error ?? "Strategy generation failed",
 })
 .eq("id", snapshot_id);
 return;
 }
 await supa
 .from("search_results")
 .update({
 citation_strategy: result.strategy,
 citation_strategy_at: new Date().toISOString(),
 citation_strategy_status: "ready",
 citation_strategy_error: null,
 })
 .eq("id", snapshot_id);
 } catch (e) {
 console.error("[citation-strategy after()] failed", e);
 await supa
 .from("search_results")
 .update({
 citation_strategy_status: "failed",
 // The raw error stays in the server log; the status API shows this text to the browser.
 citation_strategy_error: "Strategy generation failed",
 })
 .eq("id", snapshot_id);
 }
 });

 return NextResponse.json({ status: "pending", snapshot_id }, { status: 202 });
 } catch (err) {
 return apiServerError("citation-strategy", err);
 }
}
