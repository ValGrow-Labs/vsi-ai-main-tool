import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Eyebrow, PageContainer, PageHeader, Section, TextLink } from "@/components/ui/Page";
import { ButtonLink } from "@/components/ui/Button";
import { Notice, StatusIcon } from "@/components/ui/Status";
import { SetupChecklist, type SetupItem } from "@/components/intro/SetupPanel";
import { Welcome } from "@/components/intro/Welcome";
import { OverviewNextStep } from "@/components/onboarding/OverviewNextStep";
import { formatDate } from "@/lib/format";
import { TrendLine, type TrendPoint } from "./TrajectoryChart";
import type { Finding } from "@/lib/findings";
import KeywordLookup from "./KeywordLookup";
import { LOCATIONS, type Location } from "@/types/search";

export interface OverviewData {
  project: { id: string; name: string; domain: string | null; country?: string | null; defaultLocation?: string | null } | null;
  loadError: string | null;
  website: { score: number | null; problems: number; checkedAt: string | null; running: boolean; error: string | null };
  search: { tracked: number; top10: number; improved: number; declined: number; checkedAt: string | null; error: string | null };
  ai: { visibility: number | null; appears: number; answered: number; checkedAt: string | null; error: string | null; topCompetitor: { domain: string; answers: number } | null; yourCitations: number };
  tasks: { todo: number; inProgress: number; doneLast30: number; verified: number } | null;
  activeSearches: number;
  topFindings: (Finding & { hasTask: boolean })[];
  findingCount: number;
  urgentCount: number;
  trends: { website: TrendPoint[]; ai: TrendPoint[]; search: TrendPoint[] };
  /** Competitors the user added ("setup_required" until migration 036 is applied). */
  competitors: { state: "ok" | "setup_required" | "error"; domains: string[] };
  /** Parts of project setup that didn't save, passed from the setup flow. */
  setupNotices: string[];
}

const SETUP_NOTICE: Record<string, { title: string; body: string; href: string; label: string }> = {
  searches_not_saved: {
    title: "Your searches weren't saved",
    body: "The project was created, but its searches couldn't be saved. Add them again to start checking Google and AI answers.",
    href: "/dashboard/services/seo",
    label: "Add searches",
  },
  competitors_not_saved: {
    title: "Your competitors weren't saved",
    body: "The project was created, but its competitors couldn't be saved. Add them on the Competitors page.",
    href: "/dashboard/competitors",
    label: "Competitors",
  },
  audit_not_started: {
    title: "The site audit didn't start",
    body: "Your project is ready, but the first site audit couldn't be started. Start it from Site Audit.",
    href: "/dashboard/check",
    label: "Site Audit",
  },
};

function headline(d: OverviewData): string {
  const urgent = d.urgentCount;
  if (d.findingCount === 0) return "Nothing needs your attention right now.";
  if (urgent > 0) return `${urgent === 1 ? "One thing needs" : `${urgent} things need`} your attention, and ${d.findingCount - urgent} more could be improved.`;
  return `${d.findingCount === 1 ? "One thing" : `${d.findingCount} things`} could be improved. Start with the first one below.`;
}

export default function OverviewView({ data }: { data: OverviewData }) {
  const { project } = data;
  const projectCountry =
    project?.country ||
    (project?.defaultLocation && LOCATIONS[project.defaultLocation as Location]?.label) ||
    "India";

  if (!project) {
    if (!data.loadError) return <Welcome />;
    return (
      <PageContainer>
        <PageHeader title="Overview" />
        <Notice tone="critical" title={data.loadError}>Refresh the page to try again.</Notice>
      </PageContainer>
    );
  }

  const searchChecked = data.search.checkedAt !== null;
  const aiChecked = data.ai.checkedAt !== null;
  const anyChecks = searchChecked || aiChecked;
  const hasAnyResult = anyChecks || data.website.checkedAt !== null;
  const setup: SetupItem[] = [
    project.domain
      ? { state: "done", label: "Website added", detail: project.domain }
      : { state: "todo", label: "Website address", detail: "Missing", href: `/dashboard/clients/${project.id}/settings`, hrefLabel: "Add it" },
    data.activeSearches > 0
      ? { state: "done", label: "Searches to track", detail: `${data.activeSearches} ${data.activeSearches === 1 ? "search" : "searches"}` }
      : { state: "todo", label: "Searches to track", detail: "None yet", href: `/dashboard/clients/${project.id}/keywords/new`, hrefLabel: "Add searches" },
    data.competitors.domains.length > 0
      ? { state: "done", label: "Your competitors", detail: `${data.competitors.domains.length} ${data.competitors.domains.length === 1 ? "competitor" : "competitors"}` }
      : data.competitors.state === "ok"
        ? { state: "todo", label: "Your competitors", detail: "None yet", href: "/dashboard/competitors", hrefLabel: "Add competitors" }
        : { state: "todo", label: "Your competitors", detail: "Needs a database update", href: "/dashboard/competitors", hrefLabel: "Details" },
    data.website.checkedAt
      ? { state: "done", label: "Site audit", detail: data.website.score !== null ? `Score ${data.website.score} / 100` : "Done" }
      : data.website.running
        ? { state: "running", label: "Site audit", detail: "Running now" }
        : data.website.error
          ? { state: "failed", label: "Site audit", detail: data.website.error, href: "/dashboard/check", hrefLabel: "Retry" }
          : { state: "todo", label: "Site audit", detail: "Not run yet", href: "/dashboard/check", hrefLabel: "Run site audit" },

    searchChecked
      ? { state: "done", label: "Search visibility", detail: `Checked ${formatDate(data.search.checkedAt)}` }
      : { state: "todo", label: "Search visibility", detail: "Not checked yet" },
    aiChecked
      ? { state: "done", label: "AI visibility", detail: `Checked ${formatDate(data.ai.checkedAt)}` }
      : { state: "todo", label: "AI visibility", detail: "Not checked yet" },
  ];
  // Competitors are optional, so they don't keep "Getting started" open on their own.
  const setupDone = setup.filter((s) => s.label !== "Your competitors").every((s) => s.state === "done");

  return (
    <PageContainer>
      <PageHeader
        title={project.name}
        description="See your website health, search visibility, AI visibility and the actions that can improve them, all in one place."
        meta={project.domain && <span>{project.domain}</span>}
      />

      {data.setupNotices.map((key) => {
        const n = SETUP_NOTICE[key];
        if (!n) return null;
        return (
          <Notice key={key} tone="attention" title={n.title} action={<TextLink href={n.href}>{n.label}</TextLink>}>
            {n.body}
          </Notice>
        );
      })}

      {!setupDone && (
        <Section
          title="Getting started"
          description="What has been set up for this project so far. Each step unlocks more of VSI."
          aside={<SetupProgress done={setup.filter((x) => x.state === "done").length} total={setup.length} />}
        >
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-12">
            <SetupChecklist items={setup} />
            <OverviewNextStep projectId={project.id} activeSearches={data.activeSearches} anyChecks={anyChecks} />
          </div>
        </Section>
      )}

      {/* At a glance and next actions: shown once something has been checked; before that, "Getting started" says it all. */}
      {hasAnyResult && (
      <>
      {/* The lead: the conclusion in words, next to the first things to do. Only once something has been checked. */}
      <section aria-label="What needs attention" className="grid overflow-hidden rounded-panel border border-line bg-surface lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex flex-col justify-between gap-6 p-6 md:p-8">
          <div>
            <Eyebrow rule>What needs attention</Eyebrow>
            <p className="mt-4 text-balance text-[1.5rem] font-semibold leading-8 tracking-[-0.015em] text-ink md:text-[1.625rem] md:leading-9">{headline(data)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <ButtonLink href="/dashboard/next-actions" variant="primary">
              {data.findingCount > 0 ? `See all ${data.findingCount} actions` : "Next Actions"}
              <ArrowRight size={14} strokeWidth={2} aria-hidden />
            </ButtonLink>
            {data.tasks && (
              <p className="text-support text-ink-3">
                <span className="font-medium tabular text-ink-2">{data.tasks.todo + data.tasks.inProgress}</span> open tasks
              </p>
            )}
          </div>
        </div>
        <div className="border-t border-line lg:border-l lg:border-t-0">
          <p className="px-5 pb-1 pt-5 text-caption font-medium text-ink-3 md:px-6">Do these next</p>
          {data.topFindings.length === 0 ? (
            <p className="px-5 pb-6 pt-2 text-body text-ink-2 md:px-6">
              {data.website.checkedAt || data.ai.checkedAt || data.search.checkedAt
                ? "Nothing to fix from your latest checks. VSI will list new findings here after each check."
                : "Findings from your site audit, AI checks and rankings appear here after your first checks."}
            </p>
          ) : (
            <ol className="divide-y divide-line">
              {data.topFindings.map((f, i) => (
                <li key={f.key}>
                  <Link
                    href={`/dashboard/next-actions?open=${encodeURIComponent(f.key)}`}
                    className="group flex items-start gap-3.5 px-5 py-4 transition-colors hover:bg-surface-2 md:px-6"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-soft font-mono text-caption font-medium text-brand-strong">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 space-y-0.5">
                      <span className="block text-body font-medium text-ink">{f.title}</span>
                      <span className="block text-support text-ink-2">{f.whatWeFound}</span>
                      <span className="flex flex-wrap items-center gap-x-1.5 pt-0.5 text-caption text-ink-3">
                        <StatusIcon tone={f.tone} size={13} />
                        {f.sourceLabel}
                        {f.hasTask ? " · Task already created" : ""}
                      </span>
                    </span>
                    <ArrowRight size={15} strokeWidth={1.75} className="mt-1 shrink-0 text-line-strong transition-colors group-hover:text-ink-2" aria-hidden />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <section aria-label="At a glance" className="grid grid-cols-1 border-y border-line sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-line">
        <Glance
          label="Website health"
          value={data.website.score !== null ? `${data.website.score}` : null}
          suffix="/ 100"
          meter={data.website.score}
          empty="Not audited yet"
          sub={data.website.error ?? (data.website.score !== null ? `${data.website.problems} ${data.website.problems === 1 ? "thing" : "things"} to fix or improve` : "Run a site audit to get your score")}
          href="/dashboard/check"
          linkLabel="Site Audit"
        />
        <Glance
          label="Google first page"
          value={data.search.tracked > 0 ? `${data.search.top10}` : null}
          suffix={data.search.tracked > 0 ? `of ${data.search.tracked}` : undefined}
          meter={data.search.tracked > 0 ? Math.round((data.search.top10 / data.search.tracked) * 100) : null}
          empty="Not checked yet"
          sub={
            data.search.error ??
            (data.search.tracked > 0
              ? data.search.improved + data.search.declined > 0
                ? `${data.search.improved} up, ${data.search.declined} down since last check`
                : "No change since last check"
              : "Rankings appear after your first check")
          }
          href="/dashboard/services/seo"
          linkLabel="Search Visibility"
        />
        <Glance
          label="AI visibility"
          value={data.ai.visibility !== null ? `${data.ai.visibility}%` : null}
          meter={data.ai.visibility}
          empty="Not checked yet"
          sub={data.ai.error ?? (data.ai.answered > 0 ? `Mentioned in ${data.ai.appears} of ${data.ai.answered} AI answers` : "Run an AI check to see if AI mentions you")}
          href="/dashboard/geo"
          linkLabel="AI Visibility"
        />
        <Glance
          label="Tasks"
          value={data.tasks ? `${data.tasks.todo + data.tasks.inProgress}` : null}
          suffix={data.tasks ? "open" : undefined}
          empty="None yet"
          sub={data.tasks ? `${data.tasks.doneLast30} done in the last 30 days, ${data.tasks.verified} confirmed by a re-check` : "Tasks you create appear here"}
          href="/dashboard/tasks"
          linkLabel="Tasks"
        />
      </section>

      </>
      )}

      {/* Progress: only once there is something to track. */}
      {(anyChecks || data.website.checkedAt) && (
      <Section title="Progress over time" description="Each point is one check. Lines appear once there are two or more checks.">
        <div className="grid gap-8 md:grid-cols-3">
          <TrendBlock title="Website health" points={data.trends.website} format={(v) => `${v}`} empty="After your second site audit" />
          <TrendBlock title="AI visibility" points={data.trends.ai} format={(v) => `${v}%`} empty="After your second AI check" />
          <TrendBlock title="Searches on Google's first page" points={data.trends.search} format={(v) => `${v}%`} empty="After your second ranking check" />
        </div>
      </Section>
      )}

      {(data.ai.topCompetitor || data.competitors.domains.length > 0) && (
        <Section title="Competitors" action={{ label: "Competitors", href: "/dashboard/competitors" }}>
          {data.ai.topCompetitor && (
            <CitationBars you={data.ai.yourCitations} them={data.ai.topCompetitor.answers} themLabel={data.ai.topCompetitor.domain} youLabel={project.domain ?? project.name} />
          )}
          {data.ai.topCompetitor && (
            <p className="max-w-[65ch] text-body text-ink-2">
              {data.ai.topCompetitor.answers > data.ai.yourCitations ? (
                <>
                  <span className="font-medium text-ink">{data.ai.topCompetitor.domain}</span> is linked in {data.ai.topCompetitor.answers} AI
                  answers for your searches. Your website is linked in {data.ai.yourCitations}.
                </>
              ) : (
                <>
                  Your website is linked in {data.ai.yourCitations} AI answers, at least as often as any competitor. The closest is{" "}
                  <span className="font-medium text-ink">{data.ai.topCompetitor.domain}</span> with {data.ai.topCompetitor.answers}.
                </>
              )}
            </p>
          )}
          {data.competitors.domains.length > 0 && (
            <p className="max-w-[65ch] text-support text-ink-3">
              You&apos;re tracking {data.competitors.domains.slice(0, 3).join(", ")}
              {data.competitors.domains.length > 3 ? ` and ${data.competitors.domains.length - 3} more` : ""}.
              {!anyChecks && " They appear in the comparison after your first check."}
            </p>
          )}
        </Section>
      )}

      <Section title="Look up any search" description="See who Google shows for a search right now. This doesn't use your tracked searches.">
        <KeywordLookup initialLocation={projectCountry} />
      </Section>
    </PageContainer>
  );
}

function Glance({
  label,
  value,
  suffix,
  meter,
  empty,
  sub,
  href,
  linkLabel,
}: {
  label: string;
  value: string | null;
  suffix?: string;
  /** 0 to 100, from real data. Draws a thin gold meter under the number. */
  meter?: number | null;
  empty: string;
  sub: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="flex flex-col border-b border-line py-6 last:border-b-0 sm:px-6 sm:max-lg:[&:nth-child(odd)]:pl-0 sm:max-lg:[&:nth-last-child(-n+2)]:border-b-0 lg:border-b-0 lg:first:pl-0 lg:last:pr-0">
      <p className="text-caption font-medium text-ink-3">{label}</p>
      {value !== null ? (
        <p className="mt-2 flex items-baseline gap-1.5">
          <span className="text-[2rem] font-semibold leading-9 tracking-[-0.02em] tabular text-ink">{value}</span>
          {suffix && <span className="text-support text-ink-3">{suffix}</span>}
        </p>
      ) : (
        <p className="mt-2 text-body font-medium leading-9 text-ink-3">{empty}</p>
      )}
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
        {typeof meter === "number" && (
          <div className="h-full origin-left animate-line-grow rounded-full bg-brand" style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} />
        )}
      </div>
      <p className="mt-3 flex-1 text-support text-ink-2">{sub}</p>
      <Link href={href} className="group mt-3 inline-flex items-center gap-1 self-start text-support font-medium text-ink-2 hover:text-ink">
        {linkLabel}
        <ArrowRight size={13} strokeWidth={1.75} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </div>
  );
}

function TrendBlock({ title, points, format, empty }: { title: string; points: TrendPoint[]; format: (v: number) => string; empty: string }) {
  const last = points.length >= 2 ? points[points.length - 1] : null;
  const change = last ? last.value - points[0].value : 0;
  return (
    <div className="rounded-panel border border-line bg-surface p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-support font-medium text-ink">{title}</p>
        {last && (
          <p className="text-support text-ink-3">
            <span className="text-body font-semibold tabular text-ink">{format(last.value)}</span>
            {change !== 0 && (
              <span className={change > 0 ? "ml-1.5 text-positive" : "ml-1.5 text-attention"}>
                {change > 0 ? "+" : "-"}
                {Math.abs(change)} since {points[0].label}
              </span>
            )}
          </p>
        )}
      </div>
      {points.length >= 2 ? (
        <TrendLine points={points} format={format} ariaLabel={`${title} over time`} />
      ) : (
        <p className="py-6 text-support text-ink-3">{empty}</p>
      )}
    </div>
  );
}

/** How much of the real setup list is done. Counts only, from project state. */
function SetupProgress({ done, total }: { done: number; total: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${done} of ${total} steps done`}>
        <div className="h-full origin-left animate-line-grow rounded-full bg-brand" style={{ width: `${(done / total) * 100}%` }} />
      </div>
      <p className="text-support text-ink-3">
        <span className="font-semibold tabular text-ink">{done}</span> of {total} done
      </p>
    </div>
  );
}

/** Two real counts side by side: your website in gold, the closest competitor neutral. */
function CitationBars({ you, them, youLabel, themLabel }: { you: number; them: number; youLabel: string; themLabel: string }) {
  const max = Math.max(you, them, 1);
  const rows = [
    { label: youLabel, value: you, isYou: true },
    { label: themLabel, value: them, isYou: false },
  ];
  return (
    <dl className="max-w-[640px] space-y-3" aria-label="AI answers that link to each website">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_2rem] items-center gap-3">
          <dt className="truncate text-support text-ink-2">
            {r.label}
            {r.isYou && <span className="ml-1.5 text-caption font-medium text-brand-strong">You</span>}
          </dt>
          <dd className="h-2 overflow-hidden rounded-full bg-surface-2">
            <div className={`h-full origin-left animate-line-grow rounded-full ${r.isYou ? "bg-brand" : "bg-ink-3"}`} style={{ width: `${(r.value / max) * 100}%` }} />
          </dd>
          <dd className="text-right text-support font-semibold tabular text-ink">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
