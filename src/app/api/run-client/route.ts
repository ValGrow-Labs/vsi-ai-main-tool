import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAgencyApi } from "@/lib/auth";
import { UUID_PATTERN } from "@/lib/project-types";
import { runKeywordsForClient, type RunResult, type TrackedKeyword } from "@/lib/run-pipeline";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
 const session = await requireAgencyApi();
 if (session instanceof Response) return session;
 try {
 let body: { client_id?: unknown; keyword_ids?: unknown };
 try {
 body = (await req.json()) as typeof body;
 } catch {
 return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
 }
 const client_id = typeof body.client_id === "string" ? body.client_id : "";
 const keyword_ids = Array.isArray(body.keyword_ids) ? body.keyword_ids : undefined;

 if (!client_id || !UUID_PATTERN.test(client_id)) {
 return NextResponse.json({ error: "client_id required" }, { status: 400 });
 }
 if (keyword_ids && !keyword_ids.every((k) => typeof k === "string" && UUID_PATTERN.test(k))) {
 return NextResponse.json({ error: "keyword_ids must be search ids" }, { status: 400 });
 }

 const supabase = await createClient();
 const isSuperAdmin = session.role === "super_admin";

 // Super admin can run any client across the platform; agency users
 // stay scoped to their own.
 let clientQuery = supabase
 .from("clients")
 .select("id, agency_id, ai_mode_enabled, ai_overview_enabled, rank_tracking_enabled, chatgpt_enabled")
 .eq("id", client_id);
 if (!isSuperAdmin) {
 clientQuery = clientQuery.eq("agency_id", session.agencyId);
 }
 const { data: client } = await clientQuery.single();

 if (!client) {
 return NextResponse.json({ error: "Client not found" }, { status: 404 });
 }

 let query = supabase
 .from("tracked_keywords")
 .select("id, keyword, domain, brand, location, track_type, client_id")
 .eq("client_id", client_id)
 .eq("is_active", true);

 if (keyword_ids?.length) query = query.in("id", keyword_ids);

 const { data: keywords } = await query;
 const kws = (keywords ?? []) as TrackedKeyword[];

 const result: RunResult = await runKeywordsForClient({
 agencyId: client.agency_id as string,
 clientId: client_id,
 client: {
 ai_mode_enabled: client.ai_mode_enabled,
 ai_overview_enabled: client.ai_overview_enabled,
 rank_tracking_enabled: client.rank_tracking_enabled,
 chatgpt_enabled: client.chatgpt_enabled,
 },
 keywords: kws,
 });

 return NextResponse.json(result);
 } catch (err) {
 console.error("[run-client] run failed", err instanceof Error ? err.message : err);
 return NextResponse.json(
 { error: "The check couldn't run. Please try again." },
 { status: 500 }
 );
 }
}
