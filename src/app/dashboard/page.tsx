import type { Metadata } from "next";
import { requireProjectContext } from "@/lib/project-context";
import { displayDomain } from "@/lib/project-types";
import { loadProjectOverview, findingTaskKey } from "@/lib/project-summary";
import { formatShortDate } from "@/lib/format";
import { isAuditProblem } from "@/lib/site-audit/checks";
import OverviewView, { type OverviewData } from "@/features/visibility/components/OverviewView";
import KeywordResearchView from "@/features/visibility/components/KeywordResearchView";

export const metadata: Metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  if (q) {
    const loc = typeof params.loc === "string" ? params.loc : "United Arab Emirates";
    return <KeywordResearchView key={`${q}|${loc}`} query={q} location={loc} />;
  }

  const setupNotices = typeof params.setup === "string" ? params.setup.split(",").filter(Boolean) : [];
  const { active, error } = await requireProjectContext();

  const empty: OverviewData = {
    project: null,
    loadError: error,
    website: { score: null, problems: 0, checkedAt: null, running: false, error: null },
    search: { tracked: 0, top10: 0, improved: 0, declined: 0, checkedAt: null, error: null },
    ai: { visibility: null, appears: 0, answered: 0, checkedAt: null, error: null, topCompetitor: null, yourCitations: 0 },
    tasks: null,
    activeSearches: 0,
    topFindings: [],
    findingCount: 0,
    urgentCount: 0,
    trends: { website: [], ai: [], search: [] },
    competitors: { state: "ok", domains: [] },
    setupNotices: [],
  };
  if (!active) return <OverviewView data={empty} />;

  const o = await loadProjectOverview(active);
  const withTasks = new Set(o.findingsWithTasks);
  const audit = o.audit.state === "ok" ? o.audit : null;
  const geo = o.geo.state === "ok" ? o.geo.summary : null;
  const search = o.search.state === "ok" ? o.search.summary : null;

  const data: OverviewData = {
    project: { id: active.id, name: active.name, domain: displayDomain(active.website) },
    loadError: null,
    website: {
      score: audit?.completed?.score ?? null,
      problems: audit?.completed ? audit.completed.checks.filter(isAuditProblem).length : 0,
      checkedAt: audit?.completed?.completed_at ?? null,
      running: !!audit?.running,
      error:
        o.audit.state === "error"
          ? o.audit.message
          : o.audit.state === "setup_required"
          ? "Site Audit needs a one-time setup"
          : !audit?.completed && audit?.lastFailed
          ? audit.lastFailed.error_message || "Audit failed"
          : null,
    },

    search: {
      tracked: search?.tracked ?? 0,
      top10: search?.top10 ?? 0,
      improved: search?.improved ?? 0,
      declined: search?.declined ?? 0,
      checkedAt: search?.lastCheckedAt ?? null,
      error: o.search.state === "error" ? o.search.message : null,
    },
    ai: {
      visibility: geo?.visibility ?? null,
      appears: geo?.appears ?? 0,
      answered: geo?.answered ?? 0,
      checkedAt: geo?.lastCheckedAt ?? null,
      error: o.geo.state === "error" ? o.geo.message : null,
      topCompetitor: geo?.competitors[0] ? { domain: geo.competitors[0].domain, answers: geo.competitors[0].answers } : null,
      yourCitations: geo?.citations ?? 0,
    },
    tasks: o.tasks,
    activeSearches: o.search.state === "ok" ? o.search.activeSearches : 0,
    topFindings: o.findings.slice(0, 3).map((f) => ({ ...f, hasTask: withTasks.has(findingTaskKey(f) ?? "") })),
    findingCount: o.findings.length,
    urgentCount: o.findings.filter((f) => f.tone === "critical").length,
    trends: {
      website: (audit?.history ?? []).map((h) => ({ label: formatShortDate(h.created_at), value: h.score ?? 0 })),
      ai: (geo?.trend ?? []).map((t) => ({ label: formatShortDate(t.date), value: t.value })),
      search: (search?.trend ?? []).map((t) => ({ label: formatShortDate(t.date), value: t.value })),
    },
    competitors: { state: o.competitors.state, domains: o.competitors.competitors.map((c) => c.domain) },
    setupNotices,
  };

  return <OverviewView data={data} />;
}
