import { NextRequest, NextResponse } from "next/server";
import { isComparableSnapshot } from "@/lib/task-outcome";
import type { RankRow } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import { requireAgencyApi } from "@/lib/auth";
import { buildReportContent, generateShareToken, type SnapshotRow } from "@/lib/report-builder";
import { loadReportExtras } from "@/lib/report-extras";
import { shareLinkExpiry } from "@/lib/report-share";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const RANGE_DAYS = 7; // Weekly report — last 7 days vs prior 7 days

export async function POST(req: NextRequest) {
 try {
 const { client_id } = (await req.json()) as { client_id?: string };
 if (!client_id) {
 return NextResponse.json({ error: "Choose a project first." }, { status: 400 });
 }

 // 401 signed out, 403 disabled / no organization — JSON, never a redirect.

 const session = await requireAgencyApi();

 if (session instanceof Response) return session;
 const supabase = await createClient();
 const isSuperAdmin = session.role === "super_admin";

 // Fetch client. Super admin can act on any agency's client.
 let clientQuery = supabase
 .from("clients")
 .select("id, name, brand_name, website, service_type, default_location, agency_id")
 .eq("id", client_id);
 if (!isSuperAdmin) clientQuery = clientQuery.eq("agency_id", session.agencyId);
 const { data: client } = await clientQuery.single();
 if (!client) {
 return NextResponse.json({ error: "That project isn't available." }, { status: 404 });
 }
 const owningAgencyId = (client.agency_id as string) ?? session.agencyId;

 // Fetch agency branding for the owning agency, not the operator's.
 const { data: agency } = await supabase
 .from("agencies")
 .select("name, display_name, logo_url, primary_color, support_email, report_footer")
 .eq("id", owningAgencyId)
 .single();

 // Pull the last 14 days of snapshots, split into current/previous windows
 const cutoff = new Date(Date.now() - RANGE_DAYS * 2 * 86400 * 1000).toISOString();
 const snapshotQuery = (extra: string) =>
 supabase
 .from("search_results")
 .select(`id, tracked_keyword_id, keyword, track_type, rank_position, aio_present, client_cited, mentioned_in_text, chatgpt_checked, chatgpt_brand_cited, chatgpt_brand_mentioned, citations_json, gap_label, created_at, serp_first:serp_results_json->0${extra}`)
 .eq("client_id", client_id)
 .gte("created_at", cutoff)
 .order("created_at", { ascending: false });
 // rank_status needs migration 042; read without it when it isn't applied.
 const withStatus = await snapshotQuery(", rank_status");
 const snapshots = withStatus.error ? (await snapshotQuery("")).data : withStatus.data;

 // A failed or skipped check is not a result: its NULL rank is not "not
 // ranking", and the gap classification built from it is meaningless.
 const rows: SnapshotRow[] = ((snapshots ?? []) as unknown as (SnapshotRow & { rank_status?: RankRow["rank_status"]; serp_first?: unknown })[]).map(
 (r) => (isComparableSnapshot({ ...r, rank_status: r.rank_status ?? null }) ? r : { ...r, gap_label: "" }),
 );
 const splitTime = Date.now() - RANGE_DAYS * 86400 * 1000;
 const current = rows.filter((r) => new Date(r.created_at).getTime() >= splitTime);
 const previous = rows.filter((r) => new Date(r.created_at).getTime() < splitTime);

 const content = buildReportContent({
 client: {
 name: client.name,
 brandName: client.brand_name ?? null,
 website: client.website,
 servicePackage: client.service_type,
 },
 branding: {
 displayName: agency?.display_name ?? agency?.name ?? "VSI",
 logoUrl: agency?.logo_url ?? null,
 primaryColor: agency?.primary_color ?? "#F59E0B",
 supportEmail: agency?.support_email ?? null,
 footer: agency?.report_footer ?? null,
 },
 currentSnapshots: current,
 previousSnapshots: previous,
 rangeLabel: `Last ${RANGE_DAYS} days`,
 });

 // Website health, completed tasks and competitors come from the same
 // tables as Site Audit, Tasks and Competitors. Missing data stays missing.
 const extras = await loadReportExtras(
 {
 id: client.id as string,
 name: client.name as string,
 website: (client.website as string | null) ?? null,
 brandName: (client.brand_name as string | null) ?? null,
 serviceType: (client.service_type as string | null) ?? null,
 defaultLocation: (client.default_location as string | null) ?? null,
 agencyId: owningAgencyId,
 agencyName: null,
 },
 new Date(splitTime),
 );
 Object.assign(content, extras);

 const shareToken = generateShareToken();

 const { data: inserted, error } = await supabase
 .from("reports")
 .insert({
 agency_id: owningAgencyId,
 client_id: client_id,
 type: "weekly",
 share_token: shareToken,
 expires_at: shareLinkExpiry(),
 content,
 created_by: session.userId,
 })
 .select("id, share_token")
 .single();

 if (error || !inserted) {
 console.error("[reports] save failed", { code: error?.code });
 return NextResponse.json({ error: "We couldn't save the report. Please try again." }, { status: 500 });
 }

 const origin = req.headers.get("origin") ?? "https://searchintel.valgrowlabs.com";
 return NextResponse.json({
 id: inserted.id,
 share_token: inserted.share_token,
 share_url: `${origin}/r/${inserted.share_token}`,
 });
 } catch (err) {
 console.error("[reports] generate failed", err instanceof Error ? err.message : err);
 return NextResponse.json(
 { error: "We couldn't create the report. Please try again." },
 { status: 500 }
 );
 }
}
