import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAgencyApi, apiServerError } from "@/lib/auth";
import { UUID_PATTERN } from "@/lib/project-types";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ snapshotId: string }> }) {
 const session = await requireAgencyApi();
 if (session instanceof Response) return session;
 try {
 const { snapshotId } = await ctx.params;
 if (!UUID_PATTERN.test(snapshotId)) return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
 const supabase = await createClient();
 let q = supabase
 .from("search_results")
 .select("citation_strategy, citation_strategy_status, citation_strategy_error, citation_strategy_at")
 .eq("id", snapshotId);
 if (session.role !== "super_admin") q = q.eq("agency_id", session.agencyId);
 const { data, error } = await q.maybeSingle();
 if (error) return apiServerError("citation-strategy/[snapshotId]/status", error);
 if (!data) return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });

 return NextResponse.json({
 status: data.citation_strategy_status ?? (data.citation_strategy ? "ready" : null),
 error: data.citation_strategy_error,
 strategy: data.citation_strategy_status === "ready" || (data.citation_strategy_status == null && data.citation_strategy)
 ? data.citation_strategy
 : null,
 generated_at: data.citation_strategy_at,
 });
 } catch (e) {
 return apiServerError("citation-strategy/[snapshotId]/status", e);
 }
}
