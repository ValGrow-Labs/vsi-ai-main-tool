import "server-only";
import { createClient } from "@/lib/supabase/server";
import { loadSiteAudits } from "@/lib/site-audit/load";
import { checkHeadline } from "@/lib/site-audit/copy";
import { isAuditProblem } from "@/lib/site-audit/checks";
import { loadGeo } from "@/lib/geo-load";
import { loadProjectCompetitors } from "@/lib/project-competitors-load";
import type { ProjectSummary } from "@/lib/project-types";
import type { ReportCompetitor, ReportCompletedTasks, ReportWebsiteHealth } from "@/lib/report-builder";

/**
 * The parts of a report that come from Site Audit, Tasks and Competitors.
 * Read from the same tables those pages use; a section is null when there
 * is no real data for it, never estimated.
 */
export async function loadReportExtras(project: ProjectSummary, since: Date): Promise<{
  websiteHealth: ReportWebsiteHealth | null;
  completedTasks: ReportCompletedTasks | null;
  competitors: ReportCompetitor[];
}> {
  const supabase = await createClient();
  const [audits, tasksRes, geo, tracked] = await Promise.all([
    loadSiteAudits(project.id),
    supabase
      .from("tasks")
      .select("title, completed_at, outcome_status")
      .eq("client_id", project.id)
      .eq("status", "done")
      .gte("completed_at", since.toISOString())
      .order("completed_at", { ascending: false })
      .limit(50),
    loadGeo(project, { evidence: false }),
    loadProjectCompetitors(project.id),
  ]);

  let websiteHealth: ReportWebsiteHealth | null = null;
  if (audits.state === "ok" && audits.completed && audits.completed.score !== null) {
    const c = audits.completed;
    const earlier = audits.history.filter((h) => h.id !== c.id && h.score !== null && h.created_at < c.created_at);
    websiteHealth = {
      score: c.score as number,
      previousScore: earlier.length ? (earlier[earlier.length - 1].score as number) : null,
      checkedAt: c.completed_at ?? c.created_at,
      pagesChecked: c.pages_scanned,
      issues: (c.checks ?? []).filter(isAuditProblem).slice(0, 6).map((x) => checkHeadline(x)),
      notChecked: (c.checks ?? []).filter((x) => x.status === "not_checked").length,
    };
  }

  let completedTasks: ReportCompletedTasks | null = null;
  if (!tasksRes.error && tasksRes.data && tasksRes.data.length > 0) {
    const rows = tasksRes.data as { title: string; completed_at: string; outcome_status: string | null }[];
    completedTasks = {
      total: rows.length,
      verified: rows.filter((t) => t.outcome_status === "verified").length,
      items: rows.slice(0, 12).map((t) => ({ title: t.title, completedAt: t.completed_at, verified: t.outcome_status === "verified" })),
    };
  }

  const competitors: ReportCompetitor[] = [];
  if (geo.state === "ok" && geo.summary.answered > 0) {
    const same = (a: string, b: string) => a === b || a.endsWith(`.${b}`);
    const trackedDomains = tracked.competitors.map((c) => c.domain);
    for (const d of trackedDomains) {
      const hits = geo.summary.competitors.filter((c) => same(c.domain, d));
      competitors.push({ domain: d, aiAnswers: hits.length ? Math.max(...hits.map((h) => h.answers)) : 0, tracked: true });
    }
    for (const c of geo.summary.competitors) {
      if (competitors.length >= 8) break;
      if (trackedDomains.some((d) => same(c.domain, d))) continue;
      competitors.push({ domain: c.domain, aiAnswers: c.answers, tracked: false });
    }
  }

  return { websiteHealth, completedTasks, competitors };
}
