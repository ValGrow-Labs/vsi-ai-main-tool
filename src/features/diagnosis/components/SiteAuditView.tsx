"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { PageContainer, PageHeader, Section } from "@/components/ui/Page";
import { Notice, StatusIcon, StatusLabel } from "@/components/ui/Status";
import { ButtonLink } from "@/components/ui/Button";
import { Disclosure } from "@/components/ui/Disclosure";
import { MetricHero } from "@/components/ui/MetricHero";
import { SiteAuditScene } from "@/components/illustrations";
import { CapabilityList } from "@/components/intro/FeatureIntro";
import { SetupPanel } from "@/components/intro/SetupPanel";
import { INTROS } from "@/components/intro/intros";
import { TrendLine, type TrendPoint } from "@/features/visibility/components/TrajectoryChart";
import { FindingDrawer } from "@/features/actions/components/FindingDrawer";
import { AREA_LABEL, auditConclusion, auditCoverage, CHECK_COPY, checkHeadline, coverageNote, type AuditArea } from "@/lib/site-audit/copy";
import { isAuditProblem } from "@/lib/site-audit/checks";
import { auditFinding, auditPriority } from "@/lib/site-audit/findings";
import type { CheckResult } from "@/lib/site-audit/types";
import type { PageComparison } from "@/lib/site-audit/load";
import type { Finding } from "@/lib/findings";
import { RunAuditButton } from "./RunAuditButton";
import { GuideTarget } from "@/components/onboarding/GuideTarget";

export interface SiteAuditViewData {
  project: { id: string; name: string; domain: string | null } | null;
  state: "ok" | "setup_required" | "error" | "no_project";
  errorMessage?: string;
  /** `score` is null when the audit couldn't read enough of the site to score it. */
  completed: { id: string; score: number | null; pagesScanned: number; checkedAt: string; checks: CheckResult[] } | null;
  running: { id: string } | null;
  lastFailed: { message: string; when: string } | null;
  history: TrendPoint[];
  previous: { score: number; when: string } | null;
  comparisons: PageComparison[];
}

const AREA_ORDER: AuditArea[] = ["health", "search", "ai", "content"];

export default function SiteAuditView({ data }: { data: SiteAuditViewData }) {
  const { project } = data;
  const [open, setOpen] = useState<Finding | null>(null);
  const [created, setCreated] = useState<Set<string>>(new Set());

  const checks = data.completed?.checks ?? [];
  const problems = useMemo(
    () => checks.filter(isAuditProblem).sort((a, b) => auditPriority(b) - auditPriority(a)),
    [checks],
  );
  const failing = problems.filter((c) => c.status === "fail").length;
  const passing = checks.filter((c) => c.status === "pass").length;
  const notChecked = checks.filter((c) => c.status === "not_checked").length;
  const partialNote = coverageNote(auditCoverage(checks));

  const header = (
    <PageHeader
      title="Site Audit"
      description="Find problems that could be hurting your website, and what to do about each one."
      meta={
        project && (
          <>
            {project.domain && <span>{project.domain}</span>}
            {data.completed && <span>Last checked {data.completed.checkedAt}</span>}
            {data.completed && <span>{data.completed.pagesScanned} pages checked</span>}
          </>
        )
      }
      actions={
        project?.domain && data.state === "ok" && data.completed ? (
          <RunAuditButton clientId={project.id} runningId={data.running?.id} label="Run again" />
        ) : undefined
      }
    />
  );

  if (!project) {
    return (
      <PageContainer>
        {header}
        <Notice tone="critical" title={data.errorMessage ?? "We couldn't load your projects."}>
          Refresh the page to try again.
        </Notice>
      </PageContainer>
    );
  }

  if (data.state === "setup_required") {
    return (
      <PageContainer>
        {header}
        <Notice tone="attention" title="Site Audit needs a one-time database update">
          Ask your administrator to apply the Site Audit update. Until then, audits can&apos;t be saved.
          <Disclosure summary="Technical details" className="mt-2">
            <p className="font-mono text-caption">Apply supabase/migrations/migration_035_site_audits.sql to the Supabase project.</p>
          </Disclosure>
        </Notice>
      </PageContainer>
    );
  }

  if (data.state === "error") {
    return (
      <PageContainer>
        {header}
        <Notice tone="critical" title={data.errorMessage ?? "We couldn't load your audit results."}>
          Refresh the page to try again. Your audit history is safe.
        </Notice>
      </PageContainer>
    );
  }

  if (!project.domain) {
    return (
      <PageContainer>
        {header}
        <Notice
          tone="attention"
          title="Add your website address to run an audit"
          action={<ButtonLink href={`/dashboard/clients/${project.id}/settings`} size="sm">Project settings</ButtonLink>}
        >
          VSI audits the website saved on the project.
        </Notice>
      </PageContainer>
    );
  }

  if (!data.completed) {
    return (
      <PageContainer>
        {header}
        {data.lastFailed && (
          <Notice tone="critical" title={`The last audit didn't finish (${data.lastFailed.when})`}>
            {data.lastFailed.message}
          </Notice>
        )}
        <SetupPanel
          title={data.running ? "Your first audit is running" : "Run your first site audit"}
          description={
            <>
              VSI checks {project.domain} and up to 9 more of its pages: whether they load, whether search engines and AI systems can
              read them, and how clearly they explain your business. The audit is free and usually takes about a minute.
            </>
          }
          items={[
            { state: "done", label: "Website added", detail: project.domain },
            data.running
              ? { state: "running", label: "First site audit", detail: "Running now. This page updates when it's done." }
              : { state: "todo", label: "First site audit", detail: "Not run yet" },
          ]}
          action={
            <GuideTarget step="audit">
              <RunAuditButton clientId={project.id} runningId={data.running?.id} label="Run first audit" align="start" />
            </GuideTarget>
          }
          illustration={<SiteAuditScene />}
        />
        {INTROS.audit.capabilities && <CapabilityList {...INTROS.audit.capabilities} />}
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {header}

      {data.running && (
        <Notice tone="info" title="Auditing your website">
          We&apos;re checking up to 10 pages and the links on them. This usually takes under a minute. The page updates when it&apos;s done.
        </Notice>
      )}
      {data.lastFailed && (
        <Notice tone="critical" title={`The last audit didn't finish (${data.lastFailed.when})`}>
          {data.lastFailed.message}
        </Notice>
      )}

      {partialNote && (
        <Notice tone="attention" title="This audit only covers part of your website">
          {partialNote}
        </Notice>
      )}

      <>
          {/* Conclusion */}
          <MetricHero
            ariaLabel="Website health"
            label="Website health"
            value={data.completed.score ?? "Not scored"}
            suffix={data.completed.score !== null ? "/ 100" : undefined}
            meter={data.completed.score}
            note={
              data.previous && data.completed.score !== null
                ? `${scoreChange(data.completed.score, data.previous.score)} since ${data.previous.when}`
                : undefined
            }
            conclusion={auditConclusion(data.completed.score, problems.length, failing, notChecked)}
            chart={data.history.length >= 2 ? <TrendLine points={data.history} ariaLabel="Website health score over time" /> : null}
            chartEmpty="Your score history appears here after your next audit."
          >
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {failing > 0 && <StatusLabel tone="critical">{failing} to fix</StatusLabel>}
              {problems.length - failing > 0 && <StatusLabel tone="attention">{problems.length - failing} to improve</StatusLabel>}
              <StatusLabel tone="positive">{passing} looking good</StatusLabel>
              {notChecked > 0 && <StatusLabel tone="neutral">{notChecked} not checked</StatusLabel>}
            </div>
          </MetricHero>

          {/* What needs attention */}
          {problems.length > 0 && (
            <Section title="What needs attention" description="Most important first. Open one to see why it matters and what to do.">
              <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
                {problems.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setOpen(auditFinding(c, project.id))}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-surface-2"
                    >
                      <StatusIcon tone={c.status === "fail" ? "critical" : "attention"} size={18} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-body font-medium text-ink">{checkHeadline(c)}</span>
                        <span className="block text-support text-ink-3">{AREA_LABEL[CHECK_COPY[c.id].area]}</span>
                      </span>
                      {created.has(`site_audit:${c.id}`) && <span className="hidden text-caption text-positive sm:inline">Task created</span>}
                      <ChevronRight size={16} strokeWidth={1.75} className="shrink-0 text-ink-3" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Evidence from the AI checks */}
          {data.comparisons.length > 0 && (
            <Section
              title="Pages AI finds hard to use"
              description="When VSI compared these pages with the ones AI answers quote, it found gaps. These come from your AI Visibility checks."
              action={{ label: "AI Visibility", href: "/dashboard/geo" }}
            >
              <ul className="divide-y divide-line border-y border-line">
                {data.comparisons.map((p, i) => (
                  <li key={i} className="grid gap-2 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-8">
                    <div className="min-w-0">
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="block truncate text-body font-medium text-ink hover:underline">
                        {p.url.replace(/^https?:\/\//, "")}
                      </a>
                      <p className="text-support text-ink-3">
                        For &ldquo;{p.keyword}&rdquo;{p.checkedAt ? ` · ${p.checkedAt}` : ""}
                      </p>
                    </div>
                    <ul className="space-y-1 text-support text-ink-2">
                      {p.weaknesses.map((w, j) => (
                        <li key={j} className="flex gap-2">
                          <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-3" />
                          {w}
                        </li>
                      ))}
                      {p.keywordId && (
                        <li>
                          <Link href={`/dashboard/clients/${project.id}/keywords/${p.keywordId}`} className="text-support font-medium text-ink underline-offset-4 hover:underline">
                            See the comparison
                          </Link>
                        </li>
                      )}
                    </ul>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Everything we checked */}
          <Section title="Everything we checked">
            <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
              {AREA_ORDER.map((area) => {
                const inArea = checks.filter((c) => CHECK_COPY[c.id].area === area);
                if (inArea.length === 0) return null;
                return (
                  <div key={area} className="border-t border-line-strong pt-4">
                    <div className="mb-3 flex items-baseline justify-between gap-3">
                      <h3 className="text-body font-semibold text-ink">{AREA_LABEL[area]}</h3>
                      <p className="text-caption text-ink-3">
                        <span className="font-medium tabular text-ink-2">{inArea.filter((c) => c.status === "pass").length}</span> of {inArea.length} passing
                      </p>
                    </div>
                    <ul className="space-y-2.5">
                      {inArea.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => setOpen(auditFinding(c, project.id))}
                            className="flex w-full items-start gap-2.5 text-left text-support text-ink-2 hover:text-ink"
                          >
                            <StatusIcon
                              tone={
                                c.status === "pass" ? "positive" : c.status === "not_checked" ? "neutral" : c.status === "fail" ? "critical" : "attention"
                              }
                            />
                            <span>{checkHeadline(c)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Section>
      </>

      <FindingDrawer
        finding={open}
        onClose={() => setOpen(null)}
        alreadyCreated={open ? created.has(open.key) : false}
        onCreated={(key) => setCreated((prev) => new Set(prev).add(key))}
      />
    </PageContainer>
  );
}

function scoreChange(now: number, before: number): string {
  const diff = now - before;
  if (diff === 0) return "No change";
  return diff > 0 ? `Up ${diff}` : `Down ${Math.abs(diff)}`;
}
