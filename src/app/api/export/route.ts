import { apiServerError, requireAgencyApi } from "@/lib/auth";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
 // Before: middleware-only, and the organization came from the ?agencyId= parameter (or none: every
 // row RLS let through). Now: the caller's own organization; only a platform admin may pick another.
 const session = await requireAgencyApi();
 if (session instanceof Response) return session;
 try {
 const { searchParams } = new URL(request.url);
 const format = searchParams.get("format") || "json";
 const requested = searchParams.get("agencyId");
 const agencyId = session.role === "super_admin" ? requested : session.agencyId;

 const supabase = await createClient();

 let query = supabase
 .from("search_results")
 .select("gap_label, client_id, keyword, track_type, rank_position, aio_present, client_cited, mentioned_in_text, created_at")
 .order("created_at", { ascending: false })
 .limit(1000);

 if (agencyId) {
 query = query.eq("agency_id", agencyId);
 }

 const { data: results, error } = await query;

 if (error) {
 return apiServerError("export", error);
 }

 if (format === "csv") {
 const headers = ["Keyword Query", "Client ID", "Track Type", "Google Rank Position", "AI Overview Present", "AI Classification", "Created At"];
 const csvRows = [
 headers.join(","),
 ...(results || []).map((r) => [
 `"${(r.keyword || "").replace(/"/g, '""')}"`,
 `"${(r.client_id || "").replace(/"/g, '""')}"`,
 `"${(r.track_type || "").replace(/"/g, '""')}"`,
 r.rank_position ? r.rank_position : "N/A",
 r.aio_present ? "Yes" : "No",
 `"${(r.gap_label || "").replace(/"/g, '""')}"`,
 `"${r.created_at}"`,
 ].join(","))
 ];

 return new NextResponse(csvRows.join("\n"), {
 headers: {
 "Content-Type": "text/csv",
 "Content-Disposition": `attachment; filename="searchintel_export_${Date.now()}.csv"`,
 },
 });
 }

 return NextResponse.json({
 success: true,
 count: results?.length || 0,
 timestamp: new Date().toISOString(),
 data: results || [],
 });
 } catch (err: unknown) {
 return apiServerError("export", err);
 }
}
