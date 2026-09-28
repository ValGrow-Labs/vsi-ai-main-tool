import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAgencyApi, apiServerError } from "@/lib/auth";
import { UUID_PATTERN } from "@/lib/project-types";
import { track } from "@/lib/track";
import type { KeywordReportContent } from "@/lib/keyword-report-builder";
import type { TaskGroup, TaskOwner, TaskEffort, TaskImpact, TaskContextSnapshot } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
 const session = await requireAgencyApi();
 if (session instanceof Response) return session;
 try {
 const { report_id } = (await req.json()) as { report_id?: string };
 if (!report_id || typeof report_id !== "string" || !UUID_PATTERN.test(report_id)) {
 return NextResponse.json({ error: "report_id required" }, { status: 400 });
 }

 const supabase = await createClient();
 const isSuperAdmin = session.role === "super_admin";

 let reportQuery = supabase
 .from("reports")
 .select("id, type, client_id, tracked_keyword_id, content, agency_id")
 .eq("id", report_id);
 if (!isSuperAdmin) reportQuery = reportQuery.eq("agency_id", session.agencyId);
 const { data: report } = await reportQuery.maybeSingle();
 if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
 const owningAgencyId = (report.agency_id as string) ?? session.agencyId;
 if (report.type !== "keyword_tasks") {
 return NextResponse.json({ error: "Only Task List reports can be imported" }, { status: 400 });
 }

 const content = report.content as KeywordReportContent;
 if (content.type !== "keyword_tasks" || !Array.isArray(content.narrative?.tasks)) {
 return NextResponse.json({ error: "Report content is malformed" }, { status: 400 });
 }

 // Pull the existing task titles for this keyword so we can skip duplicates
 // on re-import (running "Import" twice should not create duplicates).
 const { data: existing } = await supabase
 .from("tasks")
 .select("title")
 .eq("tracked_keyword_id", report.tracked_keyword_id)
 .eq("agency_id", owningAgencyId);
 const existingTitles = new Set((existing ?? []).map((t) => (t.title as string).trim().toLowerCase()));

 // Snapshot the keyword's signals at task-creation time so we can detect
 // staleness later. Reuse the snapshot info inside the report content.
 const snap = content.snapshot;
 const contextSnapshot: TaskContextSnapshot = {
 rankPosition: snap.rankPosition,
 gapLabel: snap.gapLabel,
 aioPresent: snap.aioPresent,
 clientCited: snap.clientCited,
 citedDomainCount: snap.citedDomains.length,
 capturedAt: snap.capturedAt,
 };

 const inserts = content.narrative.tasks
 .filter((t) => !existingTitles.has(t.title.trim().toLowerCase()))
 .map((t, i) => ({
 agency_id: owningAgencyId,
 client_id: report.client_id,
 tracked_keyword_id: report.tracked_keyword_id,
 source_report_id: report.id,
 group_name: t.group as TaskGroup,
 owner: t.owner as TaskOwner,
 title: t.title,
 description: t.description,
 acceptance: t.acceptanceCriteria.map((c) => ({ text: c, done: false })),
 effort: t.effort as TaskEffort,
 impact: t.impact as TaskImpact,
 priority: i,
 context_snapshot: contextSnapshot,
 created_by: session.userId,
 }));

 if (inserts.length === 0) {
 return NextResponse.json({ inserted: 0, skipped: content.narrative.tasks.length });
 }

 const { error } = await supabase.from("tasks").insert(inserts);
 if (error) return apiServerError("tasks/import-from-report", error);

 track({
 agencyId: owningAgencyId,
 userId: session.userId,
 type: "task_imported",
 payload: {
 report_id: report.id,
 inserted: inserts.length,
 skipped: content.narrative.tasks.length - inserts.length,
 },
 });

 return NextResponse.json({
 inserted: inserts.length,
 skipped: content.narrative.tasks.length - inserts.length,
 });
 } catch (e) {
 return apiServerError("tasks/import-from-report", e);
 }
}
