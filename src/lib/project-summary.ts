import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isDummySupabase } from "@/lib/auth";
import type { ProjectSummary } from "@/lib/project-types";
import type { Finding } from "@/lib/findings";
import type { GeoLoad } from "@/lib/geo-load";
import { geoFindings, pageClarityFinding } from "@/lib/geo-findings";
import type { SearchLoad } from "@/lib/search-load";
import { loadVisibility } from "@/lib/visibility-load";
import { searchFindings } from "@/lib/search";
import { loadPageComparisons, loadSiteAudits } from "@/lib/site-audit/load";
import { auditFinding } from "@/lib/site-audit/findings";
import { isAuditProblem } from "@/lib/site-audit/checks";
import type { AuditLoad } from "@/lib/site-audit/store";
import { parseTaskSource, TASK_SOURCE_LABEL } from "@/lib/task-payload";
import { loadProjectCompetitors, type CompetitorsLoad } from "@/lib/project-competitors-load";

export interface TaskCounts {
  todo: number;
  inProgress: number;
  doneLast30: number;
  verified: number;
}

export interface ProjectOverview {
  audit: AuditLoad;
  geo: GeoLoad;
  search: SearchLoad;
  tasks: TaskCounts | null;
  /** Competitors the user added to the project. */
  competitors: CompetitorsLoad;
  /** Every open finding from every module, most urgent first. */
  findings: Finding[];
  /** "<source label>:<finding key>" for findings that already have a task. */
  findingsWithTasks: string[];
}

export function findingTaskKey(f: Finding): string | null {
  return f.draft ? `${TASK_SOURCE_LABEL[f.source]}:${f.draft.findingKey}` : null;
}

async function loadTasks(clientId: string): Promise<{ counts: TaskCounts; keys: string[] } | null> {
  if (isDummySupabase()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("status, outcome_status, completed_at, description")
    .eq("client_id", clientId)
    .limit(1000);
  if (error || !data) return null;
  const monthAgo = Date.now() - 30 * 86_400_000;
  const keys = new Set<string>();
  for (const t of data as { status: string; description: string | null }[]) {
    if (t.status === "skipped") continue;
    const src = parseTaskSource(t.description);
    if (src) keys.add(`${src.label}:${src.findingKey}`);
  }
  const rows = data as { status: string; outcome_status: string | null; completed_at: string | null }[];
  return {
    counts: {
      todo: rows.filter((t) => t.status === "todo").length,
      inProgress: rows.filter((t) => t.status === "in_progress").length,
      doneLast30: rows.filter((t) => t.status === "done" && t.completed_at && new Date(t.completed_at).getTime() > monthAgo).length,
      verified: rows.filter((t) => t.outcome_status === "verified").length,
    },
    keys: [...keys],
  };
}

/**
 * The single aggregation behind Overview, Next Actions and AI Chat.
 * It reads each module's real data and never fills gaps with estimates.
 */
export async function loadProjectOverview(project: ProjectSummary): Promise<ProjectOverview> {
  const [audit, { geo, search }, comparisons, tasks, competitors] = await Promise.all([
    loadSiteAudits(project.id),
    loadVisibility(project, { evidence: false }),
    loadPageComparisons(project.id),
    loadTasks(project.id),
    loadProjectCompetitors(project.id),
  ]);
  const tracked = competitors.competitors.map((c) => c.domain);

  const findings: Finding[] = [];
  if (audit.state === "ok" && audit.completed) {
    for (const c of audit.completed.checks ?? []) if (isAuditProblem(c)) findings.push(auditFinding(c, project.id));
  }
  if (geo.state === "ok") findings.push(...geoFindings(geo.summary, project.id, tracked));
  const clarity = pageClarityFinding(comparisons, project.id);
  if (clarity) findings.push(clarity);
  if (search.state === "ok") findings.push(...searchFindings(search.summary, project.id));
  findings.sort((a, b) => b.priority - a.priority);

  return { audit, geo, search, tasks: tasks?.counts ?? null, competitors, findings, findingsWithTasks: tasks?.keys ?? [] };
}
