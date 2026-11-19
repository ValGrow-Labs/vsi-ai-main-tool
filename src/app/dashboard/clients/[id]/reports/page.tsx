import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isDummySupabase } from "@/lib/auth";
import { requireProjectContext } from "@/lib/project-context";
import { displayDomain } from "@/lib/project-types";
import { loadSetupStatus } from "@/lib/setup-status";
import { formatDateTime, plural } from "@/lib/format";
import { PageContainer, PageHeader, Section } from "@/components/ui/Page";
import { Notice, StatusLabel } from "@/components/ui/Status";
import { Stat, StatStrip } from "@/components/ui/Metrics";
import { ReportScene } from "@/components/illustrations";
import { CapabilityList } from "@/components/intro/FeatureIntro";
import { SetupPanel } from "@/components/intro/SetupPanel";
import { INTROS } from "@/components/intro/intros";
import GenerateReportButton from "@/components/GenerateReportButton";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  weekly: "Weekly progress report",
  keyword_summary: "Search summary",
  keyword_detailed: "Search deep dive",
  keyword_tasks: "Search task log",
};

type ReportRow = {
  id: string;
  type: string;
  share_token: string;
  generated_at: string;
  expires_at: string | null;
  tracked_keywords: { keyword: string } | { keyword: string }[] | null;
};

export default async function ClientReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, projects, error: projectsError } = await requireProjectContext();
  if (isDummySupabase()) notFound();
  const supabase = await createClient();

  const isSuperAdmin = session.role === "super_admin";
  const clientQ = supabase.from("clients").select("id, name, website").eq("id", id);
  // The project's id, name and website are already in the project list the layout loads (the same rows the
  // database allows this user to see), so they are not read a second time. If that list couldn't be loaded,
  // read the row directly, as before.
  const listed = projects.find((p) => p.id === id);
  const findClient = async (): Promise<{ id: string; name: string; website: string | null } | null> => {
    if (!projectsError) return listed ? { id: listed.id, name: listed.name, website: listed.website } : null;
    const { data } = await (isSuperAdmin ? clientQ : clientQ.eq("agency_id", session.agencyId)).maybeSingle();
    return (data as { id: string; name: string; website: string | null } | null) ?? null;
  };
  const reportsQ = supabase
    .from("reports")
    .select("id, type, share_token, generated_at, expires_at, tracked_keywords(keyword)")
    .eq("client_id", id)
    .order("generated_at", { ascending: false })
    .limit(50);
  // None of these reads needs another's result, so they run together. The reports read carries
  // its own organization filter, and nothing renders unless the project is found.
  const [client, { data: reports, error }, status] = await Promise.all([
    findClient(),
    isSuperAdmin ? reportsQ : reportsQ.eq("agency_id", session.agencyId),
    loadSetupStatus(id),
  ]);
  if (!client) notFound();

  const domain = displayDomain(client.website as string | null);
  const rows = ((reports ?? []) as unknown as ReportRow[]).map((r) => {
    const kw = Array.isArray(r.tracked_keywords) ? r.tracked_keywords[0]?.keyword : r.tracked_keywords?.keyword;
    const expired = !!r.expires_at && new Date(r.expires_at) < new Date();
    return { ...r, keyword: kw ?? null, label: TYPE_LABEL[r.type] ?? "Report", expired };
  });
  const hasData = status.audits > 0 || status.checks > 0;

  const isMissingTable =
    !!error &&
    (error.code === "PGRST205" ||
      error.code === "42P01" ||
      error.message?.includes("schema cache") ||
      error.message?.includes("does not exist"));

  return (
    <PageContainer>
      <PageHeader
        title="Reports"
        description="Understand your progress over time. Each report brings your website, search and AI visibility together in one page you can share."
        meta={domain && <span>{domain}</span>}
        actions={rows.length > 0 ? <GenerateReportButton clientId={id} /> : undefined}
      />

      {isMissingTable ? (
        <Notice tone="info" title="Reports table setup required">
          The reports table hasn&apos;t been created in your Supabase database yet. Run the SQL migration in your Supabase SQL editor to enable report generation.
        </Notice>
      ) : error ? (
        <Notice tone="critical" title="We couldn't load your reports right now.">
          Refresh the page to try again.
        </Notice>
      ) : rows.length === 0 ? (
        <>
          <SetupPanel
            title="Create your first report"
            description="A report covers the last 7 days compared with the 7 days before: your website health score, Google rankings, AI citations, competitor gaps and the tasks your team finished. You get a private link to share."
            items={[
              { state: "done", label: "Website added", detail: domain ?? undefined },
              status.audits > 0
                ? { state: "done", label: "Site audit", detail: "Done" }
                : { state: "todo", label: "Site audit", detail: "Not run yet", href: "/dashboard/check", hrefLabel: "Run site audit" },
              status.checks > 0
                ? { state: "done", label: "Search and AI checks", detail: "Done" }
                : { state: "todo", label: "Search and AI checks", detail: "Not checked yet", href: "/dashboard/geo", hrefLabel: "Run first check" },
              status.tasks > 0
                ? { state: "done", label: "Tasks", detail: plural(status.tasks, "task") }
                : { state: "todo", label: "Tasks", detail: "None yet" },
            ]}
            action={
              <div className="space-y-2">
                <GenerateReportButton clientId={id} align="start" disabled={!hasData} />
                {!hasData && <p className="text-support text-ink-3">Run a site audit or a first check so the report has something to show.</p>}
              </div>
            }
            illustration={<ReportScene />}
          />
          {INTROS.reports.capabilities && <CapabilityList {...INTROS.reports.capabilities} />}
        </>
      ) : (
        <>
          <StatStrip>
            <Stat label="Reports" value={rows.length} />
            <Stat label="Links that work" value={rows.filter((r) => !r.expired).length} sub="Anyone with the link can open these" />
            <Stat label="Expired" value={rows.filter((r) => r.expired).length} />
          </StatStrip>
          <Section title="Your reports" description="Anyone with a report's link can open it. Links stop working when a report expires.">
            <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand-strong" aria-hidden>
                    <FileText size={17} strokeWidth={1.6} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-body font-medium text-ink">{r.label}</p>
                    <p className="text-support text-ink-3">
                      {formatDateTime(r.generated_at)}
                      {r.keyword ? ` · “${r.keyword}”` : ""}
                    </p>
                  </div>
                  {r.expired ? (
                    <StatusLabel tone="neutral">Expired</StatusLabel>
                  ) : (
                    <a
                      href={`/r/${r.share_token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-control border border-line bg-surface px-3 text-support font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface-2"
                    >
                      Open report
                      <ExternalLink size={13} strokeWidth={1.75} aria-hidden />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}
    </PageContainer>
  );
}
