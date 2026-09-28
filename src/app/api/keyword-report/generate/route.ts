import { NextRequest, NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { apiServerError, requireAgencyApi } from "@/lib/auth";
import { buildKeywordReport, generateShareToken, type KeywordReportType } from "@/lib/keyword-report-builder";
import { track } from "@/lib/track";
import { shareLinkExpiry } from "@/lib/report-share";

export const maxDuration = 180;
export const dynamic = "force-dynamic";

const VALID_TYPES: KeywordReportType[] = ["keyword_summary", "keyword_detailed", "keyword_tasks"];

export async function POST(req: NextRequest) {
 try {
 // Authorise first: an anonymous caller learns nothing about validation rules.
 const session = await requireAgencyApi();
 if (session instanceof Response) return session;

 const { tracked_keyword_id, type } = (await req.json()) as { tracked_keyword_id?: string; type?: string };
 if (!tracked_keyword_id) return NextResponse.json({ error: "tracked_keyword_id required" }, { status: 400 });
 if (!type || !VALID_TYPES.includes(type as KeywordReportType)) {
 return NextResponse.json({ error: "type must be one of: " + VALID_TYPES.join(", ") }, { status: 400 });
 }

 const supabase = await createClient();
 const isSuperAdmin = session.role === "super_admin";

 let kwQuery = supabase
 .from("tracked_keywords")
 .select("id, client_id, agency_id")
 .eq("id", tracked_keyword_id);
 if (!isSuperAdmin) kwQuery = kwQuery.eq("agency_id", session.agencyId);
 const { data: kw } = await kwQuery.maybeSingle();
 if (!kw) return NextResponse.json({ error: "Keyword not found" }, { status: 404 });
 const owningAgencyId = (kw.agency_id as string) ?? session.agencyId;

 // Insert a "pending" row immediately and return its id. The heavy LLM
 // work runs in a background after() callback so the proxy can't kill it.
 const shareToken = generateShareToken();
 const { data: inserted, error: insertErr } = await supabase
 .from("reports")
 .insert({
 agency_id: owningAgencyId,
 client_id: kw.client_id,
 tracked_keyword_id,
 type,
 share_token: shareToken,
 expires_at: shareLinkExpiry(),
 status: "pending",
 content: { schema: "vsi-keyword-report-v1", type, status: "pending" },
 created_by: session.userId,
 })
 .select("id, share_token")
 .single();
 if (insertErr || !inserted) {
 return apiServerError("keyword-report/generate insert", insertErr ?? new Error("no row"), "The report couldn't be started. Please try again.");
 }

 const origin = req.headers.get("origin") ?? "https://searchintel.valgrowlabs.com";
 const reportId = inserted.id as string;
 const startedAt = Date.now();

 track({
 agencyId: owningAgencyId,
 userId: session.userId,
 type: "report_generated",
 payload: { type, tracked_keyword_id, report_id: reportId },
 });

 after(async () => {
 try {
 const result = await buildKeywordReport({
 agencyId: owningAgencyId,
 trackedKeywordId: tracked_keyword_id,
 type: type as KeywordReportType,
 });
 const supa = await createClient();
 if (!result.ok) {
 await supa
 .from("reports")
 .update({ status: "failed", error_message: result.error ?? "Generation failed" })
 .eq("id", reportId);
 return;
 }
 await supa
 .from("reports")
 .update({ status: "ready", content: result.content, error_message: null })
 .eq("id", reportId);
 track({
 agencyId: owningAgencyId,
 userId: session.userId,
 type: "report_completed",
 payload: { type, report_id: reportId, duration_ms: Date.now() - startedAt },
 });
 } catch (e) {
 console.error("[keyword-report after()] generation failed", e);
 const supa = await createClient();
 await supa
 .from("reports")
 // The raw error stays in the server log; the status API shows this text to the browser.
 .update({ status: "failed", error_message: "Report generation failed. Please try again." })
 .eq("id", reportId);
 }
 });

 return NextResponse.json({
 id: reportId,
 share_token: inserted.share_token,
 share_url: `${origin}/r/${inserted.share_token}`,
 type,
 status: "pending",
 }, { status: 202 });
 } catch (err) {
 return apiServerError("keyword-report/generate", err);
 }
}
