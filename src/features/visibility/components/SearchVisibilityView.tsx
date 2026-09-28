"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronRight, Search } from "lucide-react";
import { PageContainer, PageHeader, Section } from "@/components/ui/Page";
import { Notice, StatusIcon } from "@/components/ui/Status";
import { ButtonLink } from "@/components/ui/Button";
import { MetricHero } from "@/components/ui/MetricHero";
import { SearchScene } from "@/components/illustrations";
import { CapabilityList } from "@/components/intro/FeatureIntro";
import { SetupPanel } from "@/components/intro/SetupPanel";
import { INTROS } from "@/components/intro/intros";
import { FindingDrawer } from "@/features/actions/components/FindingDrawer";
import { RunChecksButton } from "@/features/geo/components/RunChecksButton";
import { searchConclusion, type SearchSummary, type RankedSearch } from "@/lib/search";
import type { Finding } from "@/lib/findings";
import { cn } from "@/lib/utils";
import { TrendLine, type TrendPoint } from "./TrajectoryChart";
import { GuideTarget } from "@/components/onboarding/GuideTarget";

export interface SearchViewData {
  project: { id: string; name: string; domain: string | null } | null;
  state: "ok" | "error" | "no_project";
  errorMessage?: string;
  summary?: SearchSummary;
  rankTrackingEnabled?: boolean;
  activeSearches?: number;
  lastChecked?: string | null;
  findings: Finding[];
  trend: TrendPoint[];
}

function changeLabel(s: RankedSearch): { text: string; tone: "up" | "down" | "flat" | "none" } {
  if (s.previous === null && s.position !== null && s.history.length <= 1) return { text: "First check", tone: "none" };
  if (s.movement === "entered") return { text: "Now ranking", tone: "up" };
  if (s.movement === "dropped_out") return { text: "Dropped out", tone: "down" };
  if (s.change === null) return { text: s.history.length <= 1 ? "First check" : "No change", tone: s.history.length <= 1 ? "none" : "flat" };
  if (s.change > 0) return { text: `Up ${s.change}`, tone: "up" };
  if (s.change < 0) return { text: `Down ${Math.abs(s.change)}`, tone: "down" };
  return { text: "No change", tone: "flat" };
}

export default function SearchVisibilityView({ data }: { data: SearchViewData }) {
  const { project, summary: s } = data;
  const [open, setOpen] = useState<Finding | null>(null);
  const [created, setCreated] = useState<Set<string>>(new Set());

  const header = (
    <PageHeader
      title="Search Visibility"
      description="See where your website appears in search, and what is improving, dropping or worth your attention."
      meta={
        project && (
          <>
            {project.domain && <span>{project.domain}</span>}
            {data.lastChecked && <span>Last checked {data.lastChecked}</span>}
          </>
        )
      }
      actions={
        project && data.state === "ok" ? (
          <>
            <ButtonLink href="/dashboard/check?tab=quick-check" variant="secondary">
              <Search size={15} strokeWidth={1.75} aria-hidden />
              Check a search
            </ButtonLink>
            {(s?.tracked ?? 0) > 0 && <RunChecksButton clientId={project.id} searches={data.activeSearches ?? 0} label="Check rankings now" />}
          </>
        ) : undefined
      }
    />
  );

  if (!project || data.state !== "ok" || !s) {
    return (
      <PageContainer>
        {header}
        <Notice tone="critical" title={data.errorMessage ?? "We couldn't load your rankings."}>Refresh the page to try again.</Notice>
      </PageContainer>
    );
  }

  if (!data.rankTrackingEnabled) {
    return (
      <PageContainer>
        {header}
        <Notice
          tone="attention"
          title="Google ranking checks are turned off for this project"
          action={<ButtonLink href={`/dashboard/clients/${project.id}/settings`} size="sm">Project settings</ButtonLink>}
        >
          Turn them on in project settings to see where you appear in Google.
        </Notice>
      </PageContainer>
    );
  }

  if (s.tracked === 0) {
    const searches = data.activeSearches ?? 0;
    return (
      <PageContainer>
        {header}
        <SetupPanel
          title={searches === 0 ? "Add the searches you want to track" : "Run your first ranking check"}
          description={
            searches === 0
              ? "Add the searches your customers type into Google. VSI then checks where your website appears for each one and keeps the history."
              : "Your searches are ready. One check looks up your Google position for each search and checks AI answers at the same time. It uses search credits, so it only runs when you start it."
          }
          items={[
            { state: "done", label: "Website added", detail: project.domain ?? undefined },
            searches === 0
              ? { state: "todo", label: "Searches to track", detail: "None yet" }
              : { state: "done", label: "Searches to track", detail: `${searches} ${searches === 1 ? "search" : "searches"}` },
            { state: "todo", label: "First ranking check", detail: "Not checked yet" },
          ]}
          action={
            searches === 0 ? (
              <GuideTarget step="searches">
                <ButtonLink href={`/dashboard/clients/${project.id}/keywords/new`} variant="primary">
                  Add searches
                </ButtonLink>
              </GuideTarget>
            ) : (
              <RunChecksButton clientId={project.id} searches={searches} label="Run first check" align="start" />
            )
          }
          illustration={<SearchScene />}
        />
        {INTROS.search.capabilities && <CapabilityList {...INTROS.search.capabilities} />}
      </PageContainer>
    );
  }

  const buckets = [
    { label: "Top 3", count: s.top3 },
    { label: "Positions 4 to 10", count: s.top10 - s.top3 },
    { label: "Page two", count: s.page2 },
    { label: "Further back", count: s.ranked - s.top10 - s.page2 },
    { label: "Not found", count: s.notFound },
  ];

  return (
    <PageContainer>
      {header}

      <MetricHero
        ariaLabel="Your Google visibility"
        label="On Google's first page"
        value={s.top10}
        suffix={`of ${s.tracked}`}
        meter={s.tracked > 0 ? Math.round((s.top10 / s.tracked) * 100) : null}
        note={s.averagePosition !== null ? `Average position ${s.averagePosition}` : undefined}
        conclusion={searchConclusion(s)}
        chart={
          data.trend.length >= 2 ? (
            <TrendLine points={data.trend} format={(v) => `${v}%`} ariaLabel="Share of searches on Google's first page over time" />
          ) : null
        }
        chartEmpty="A trend appears here after your next check."
      />

      <section aria-label="Where your searches rank" className="space-y-3">
        <div
          className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full"
          role="img"
          aria-label={buckets.map((b) => `${b.label}: ${b.count}`).join(", ")}
        >
          {buckets.map((b, i) =>
            b.count > 0 ? (
              <span
                key={b.label}
                className={cn("h-full origin-left animate-line-grow", i === 0 ? "bg-brand" : i === 1 ? "bg-brand/55" : i === 2 ? "bg-ink-3/60" : i === 3 ? "bg-ink-3/35" : "bg-line-strong")}
                style={{ flexGrow: b.count, flexBasis: 0 }}
              />
            ) : null,
          )}
        </div>
        <dl className="grid grid-cols-2 gap-y-4 border-b border-line pb-5 sm:grid-cols-5 sm:divide-x sm:divide-line">
          {buckets.map((b, i) => (
            <div key={b.label} className="sm:px-5 sm:first:pl-0">
              <dt className="flex items-center gap-1.5 text-caption font-medium text-ink-3">
                <span
                  className={cn("h-2 w-2 shrink-0 rounded-full", i === 0 ? "bg-brand" : i === 1 ? "bg-brand/55" : i === 2 ? "bg-ink-3/60" : i === 3 ? "bg-ink-3/35" : "bg-line-strong")}
                  aria-hidden
                />
                {b.label}
              </dt>
              <dd className="mt-1 text-[1.5rem] font-semibold leading-8 tabular text-ink">{b.count}</dd>
            </div>
          ))}
        </dl>
      </section>

      {data.findings.length > 0 && (
        <Section title="What you can improve">
          <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
            {data.findings.map((f) => (
              <li key={f.key}>
                <button type="button" onClick={() => setOpen(f)} className="flex w-full items-start gap-3 px-4 py-4 text-left hover:bg-surface-2">
                  <span className="mt-0.5">
                    <StatusIcon tone={f.tone} size={18} />
                  </span>
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="block text-body font-medium text-ink">{f.title}</span>
                    <span className="block text-support text-ink-2">{f.whatWeFound}</span>
                  </span>
                  {created.has(f.key) && <span className="hidden text-caption text-positive sm:inline">Task created</span>}
                  <ChevronRight size={16} strokeWidth={1.75} className="mt-1 shrink-0 text-ink-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Your searches" description="Best position first. Open a search to see who ranks around you.">
        <div className="rounded-panel border border-line bg-surface">
          <div className="hidden grid-cols-[minmax(0,1.6fr)_6rem_8rem_minmax(0,1.4fr)] gap-4 rounded-t-panel border-b border-line bg-surface-2 px-4 py-2.5 text-caption font-medium text-ink-3 md:grid">
            <span>Search</span>
            <span>Position</span>
            <span>Change</span>
            <span>Your page that ranks</span>
          </div>
          <ul className="divide-y divide-line">
            {s.searches.map((row) => {
              const change = changeLabel(row);
              return (
                <li key={row.keywordId ?? row.keyword} className="grid gap-1 px-4 py-3 md:grid-cols-[minmax(0,1.6fr)_6rem_8rem_minmax(0,1.4fr)] md:items-center md:gap-4">
                  <div className="min-w-0">
                    {row.keywordId ? (
                      <Link href={`/dashboard/clients/${project.id}/keywords/${row.keywordId}`} className="block truncate text-support font-medium text-ink hover:underline">
                        {row.keyword}
                      </Link>
                    ) : (
                      <span className="block truncate text-support font-medium text-ink">{row.keyword}</span>
                    )}
                    <span className="text-caption text-ink-3 md:hidden">Checked {row.checkedAt}</span>
                  </div>
                  <span className="text-support tabular text-ink">
                    {row.position === null ? (
                      <span className="text-ink-3">Not found</span>
                    ) : (
                      <span
                        className={cn(
                          "inline-flex min-w-9 justify-center rounded-control px-1.5 py-0.5 font-medium",
                          row.position <= 3 ? "bg-brand-soft text-brand-strong" : row.position <= 10 ? "bg-surface-2 text-ink" : "text-ink-2",
                        )}
                      >
                        #{row.position}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-support",
                      change.tone === "up" && "text-positive",
                      change.tone === "down" && "text-attention",
                      (change.tone === "flat" || change.tone === "none") && "text-ink-3",
                    )}
                  >
                    {change.tone === "up" && <ArrowUp size={13} strokeWidth={2} aria-hidden />}
                    {change.tone === "down" && <ArrowDown size={13} strokeWidth={2} aria-hidden />}
                    {change.text}
                  </span>
                  <span className="truncate text-support text-ink-3">{row.url ? row.url.replace(/^https?:\/\//, "") : "None"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </Section>

      <FindingDrawer
        finding={open}
        onClose={() => setOpen(null)}
        alreadyCreated={open ? created.has(open.key) : false}
        onCreated={(key) => setCreated((prev) => new Set(prev).add(key))}
      />
    </PageContainer>
  );
}
