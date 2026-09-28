import type { Metadata } from "next";
import { requireProjectContext } from "@/lib/project-context";
import { displayDomain } from "@/lib/project-types";
import { loadPageComparisons, loadSiteAudits } from "@/lib/site-audit/load";
import { formatDate, formatDateTime, formatShortDate } from "@/lib/format";
import { PageContainer, PageHeader } from "@/components/ui/Page";
import LiveSearchCheckView from "@/features/diagnosis/components/LiveSearchCheckView";
import { Intro } from "@/components/intro/intros";
import SiteAuditView, { type SiteAuditViewData } from "@/features/diagnosis/components/SiteAuditView";

export const metadata: Metadata = { title: "Site Audit" };
export const dynamic = "force-dynamic";

export default async function CheckPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { tab } = await searchParams;
  const { active, error } = await requireProjectContext();

  if (tab === "quick-check") {
    return (
      <PageContainer>
        <PageHeader
          title="Check a search"
          description="See right now who Google and its AI answer show for any search, and whether your business is among them."
        />
        <LiveSearchCheckView />
      </PageContainer>
    );
  }

  if (!active && !error) return <Intro name="audit" />;

  const project = active ? { id: active.id, name: active.name, domain: displayDomain(active.website) } : null;
  let data: SiteAuditViewData;

  if (!active) {
    data = { project, state: error ? "error" : "no_project", errorMessage: error ?? undefined, completed: null, running: null, lastFailed: null, history: [], previous: null, comparisons: [] };
  } else {
    const [load, comparisons] = await Promise.all([loadSiteAudits(active.id), loadPageComparisons(active.id)]);
    if (load.state !== "ok") {
      data = {
        project,
        state: load.state,
        errorMessage: load.state === "error" ? load.message : undefined,
        completed: null,
        running: null,
        lastFailed: null,
        history: [],
        previous: null,
        comparisons: [],
      };
    } else {
      const history = load.history.map((h) => ({ label: formatShortDate(h.created_at), value: h.score ?? 0 }));
      const prev = load.history.length >= 2 ? load.history[load.history.length - 2] : null;
      data = {
        project,
        state: "ok",
        completed: load.completed
          ? {
              id: load.completed.id,
              score: load.completed.score,
              pagesScanned: load.completed.pages_scanned,
              checkedAt: formatDateTime(load.completed.completed_at ?? load.completed.created_at),
              checks: load.completed.checks ?? [],
            }
          : null,
        running: load.running ? { id: load.running.id } : null,
        lastFailed: load.lastFailed
          ? { message: load.lastFailed.error_message ?? "The audit couldn't finish.", when: formatDateTime(load.lastFailed.created_at) }
          : null,
        history,
        previous: prev ? { score: prev.score ?? 0, when: formatDate(prev.created_at) } : null,
        comparisons: comparisons.map((c) => ({ ...c, checkedAt: formatDate(c.checkedAt) })),
      };
    }
  }

  return <SiteAuditView data={data} />;
}
