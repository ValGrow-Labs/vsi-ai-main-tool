/**
 * The AI Visibility page, section by section. Server components: every
 * number is passed in from stored checks, nothing here fetches or runs a check.
 */
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { Lightbulb, ListPlus, MessageSquareQuote, Plus, ScanSearch } from "lucide-react";
import type { IconType } from "react-icons";
import { SiGoogle, SiGooglegemini, SiPerplexity } from "react-icons/si";
import { RiOpenaiFill } from "react-icons/ri";
import { Eyebrow, Section } from "@/components/ui/Page";
import { buttonClasses } from "@/components/ui/Button";
import { Fraction, Stat, StatStrip } from "@/components/ui/Metrics";
import { StatusLabel, type Tone } from "@/components/ui/Status";
import { StepRail } from "@/components/intro/FeatureIntro";
import { ENGINE_COVERAGE } from "@/components/intro/intros";
import { TrendLine, type TrendPoint } from "@/features/visibility/components/TrajectoryChart";
import {
  answerBreakdown,
  COMING_SOON_ENGINES,
  competitorPresence,
  geoConclusion,
  SEARCH_STATE_LABEL,
  type EngineSummary,
  type GeoSummary,
  type SearchState,
  type TrackedSearch,
} from "@/lib/geo";
import type { CompareColumn } from "@/lib/geo-compare";
import { formatShortDate, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ Hero */

export function Hero({
  project,
  lastChecked,
  actions,
  visual,
  compact = false,
}: {
  project: { name: string; domain: string | null } | null;
  lastChecked?: string | null;
  actions?: ReactNode;
  visual: ReactNode;
  /** Data pages: the example visual only on wide screens, so real numbers come first on phones. */
  compact?: boolean;
}) {
  return (
    <section className={cn("grid items-center gap-8 border-b border-line lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-14", compact ? "pb-8 lg:pb-10" : "pb-10")}>
      <div className="min-w-0 animate-rise-in">
        <Eyebrow rule>AI Visibility</Eyebrow>
        <h1 className="mt-4 max-w-[20ch] text-balance text-[1.875rem] font-semibold leading-[1.15] tracking-[-0.025em] text-ink md:text-[2.375rem]">
          See how your website appears in AI answers.
        </h1>
        <p className="mt-4 max-w-[52ch] text-[0.9375rem] leading-6 text-ink-2 md:text-[1rem] md:leading-7">
          Track important questions, understand when your brand is mentioned or cited, and see where competitors appear instead.
        </p>
        {project && (
          <p className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-support text-ink-3 [&>*+*]:before:mr-2.5 [&>*+*]:before:text-line-strong [&>*+*]:before:content-['·']">
            <span className="font-medium text-ink-2">{project.name}</span>
            {project.domain && <span>{project.domain}</span>}
            {lastChecked && <span>Last checked {lastChecked}</span>}
          </p>
        )}
        {actions && <div className="mt-7 flex flex-wrap items-start gap-2.5">{actions}</div>}
      </div>
      <div className={cn("min-w-0 animate-rise-in [animation-delay:120ms]", compact && "hidden lg:block")}>{visual}</div>
    </section>
  );
}

export function LearnHowLink() {
  return (
    <a href="#how-it-works" className={buttonClasses("secondary")}>
      Learn how it works
    </a>
  );
}

/* -------------------------------------------------------------- Overview */

export function Overview({ summary: s, trend }: { summary: GeoSummary; trend: TrendPoint[] }) {
  const presence = competitorPresence(s);
  return (
    <section aria-label="AI visibility overview" className="overflow-hidden rounded-panel border border-line bg-surface">
      <StatStrip className="gap-x-6 border-0 px-5 py-6 md:grid-flow-row md:grid-cols-2 md:divide-x-0 md:px-6 md:[&>div]:px-0 lg:grid-flow-col lg:grid-cols-none lg:divide-x lg:[&>div]:px-5 lg:[&>div:first-child]:pl-0">
        <Stat
          label="AI Visibility"
          value={s.visibility === null ? "Not yet" : `${s.visibility}%`}
          sub={
            <>
              {s.visibility !== null && (
                <span className="mb-1.5 mt-1 block h-1 w-full max-w-[9rem] overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  <span className="block h-full origin-left animate-line-grow rounded-full bg-brand" style={{ width: `${s.visibility}%` }} />
                </span>
              )}
              {s.answered > 0 ? `You appear in ${s.appears} of ${s.answered} answered searches` : "No AI answers yet"}
            </>
          }
        />
        <Stat label="Mentions" value={s.mentions} sub={s.mentions === 1 ? "AI answer names your business" : "AI answers name your business"} />
        <Stat label="Citations" value={s.citations} sub={s.citations === 1 ? "AI answer links to your website" : "AI answers link to your website"} />
        <Stat
          label="Competitor presence"
          value={presence === null ? "Not yet" : `${presence}%`}
          sub={presence === null ? "Appears after AI answers are found" : "of answered searches link to a competitor"}
        />
      </StatStrip>
      <div className="grid divide-y divide-line border-t border-line lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] lg:divide-x lg:divide-y-0">
        <div className="px-5 py-5 md:px-6">
          <Eyebrow rule>In short</Eyebrow>
          <p className="mt-3 max-w-[56ch] text-balance text-[1.125rem] font-semibold leading-7 tracking-[-0.01em] text-ink">{geoConclusion(s)}</p>
          {s.early && <p className="mt-2 text-support text-ink-3">Early read: based on {plural(s.answered, "answered search", "answered searches")}. Add more searches for a steadier number.</p>}
        </div>
        <div className="px-5 py-5 md:px-6">
          <p className="mb-2 text-caption font-medium text-ink-3">AI Visibility over time</p>
          {trend.length >= 2 ? (
            <TrendLine points={trend} format={(v) => `${v}%`} ariaLabel="AI visibility over time" />
          ) : (
            <p className="py-3 text-support text-ink-3">A trend appears here after your next check.</p>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------- Engine coverage */

const ENGINE_ICON: Record<string, IconType> = {
  google_ai_overview: SiGoogle,
  chatgpt: RiOpenaiFill,
  Gemini: SiGooglegemini,
  Perplexity: SiPerplexity,
};

function EngineName({ id, label, description, muted = false }: { id: string; label: string; description?: string; muted?: boolean }) {
  const Icon = ENGINE_ICON[id];
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface", muted ? "text-ink-3/70" : "text-ink-2")}>
        {Icon && <Icon size={15} aria-hidden />}
      </span>
      <div className="min-w-0">
        <p className={cn("text-body font-medium", muted ? "text-ink-3" : "text-ink")}>{label}</p>
        {description && <p className="truncate text-caption text-ink-3">{description}</p>}
      </div>
    </div>
  );
}

function engineChange(trend: { date: string; value: number }[]): string {
  const first = trend[0];
  const last = trend[trend.length - 1];
  const diff = last.value - first.value;
  const since = formatShortDate(first.date);
  if (diff === 0) return `No change since ${since}`;
  return `${diff > 0 ? "Up" : "Down"} ${plural(Math.abs(diff), "point")} since ${since}`;
}

const ENGINE_COLS = "lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1.1fr)_5.5rem_5.5rem_minmax(0,1.1fr)]";

export function EngineCoverage({ engines, projectId }: { engines: EngineSummary[]; projectId: string }) {
  return (
    <Section title="AI engine coverage" description="Each AI service answers differently, so VSI checks each one separately and counts them the same way.">
      <div className="rounded-panel border border-line bg-surface">
        <div className={cn("hidden gap-5 border-b border-line px-5 py-2.5 text-caption font-medium text-ink-3 lg:grid", ENGINE_COLS)}>
          <span>AI service</span>
          <span>Visibility</span>
          <span>Mentions</span>
          <span>Citations</span>
          <span>Change over time</span>
        </div>
        <ul className="divide-y divide-line">
          {engines.map((e) => {
            const hasData = e.answered > 0;
            return (
              <li key={e.id} className={cn("grid gap-4 px-4 py-4 lg:items-center lg:gap-5 lg:px-5", ENGINE_COLS)}>
                <EngineName id={e.id} label={e.label} description={e.description} />
                {!e.enabled && e.checked === 0 ? (
                  <p className="text-support text-ink-3 lg:col-span-4">
                    Not turned on for this project.{" "}
                    <Link href={`/dashboard/clients/${projectId}/settings`} className="font-medium text-ink-2 underline-offset-4 hover:text-ink hover:underline">
                      Project settings
                    </Link>
                  </p>
                ) : e.checked === 0 ? (
                  <p className="text-support text-ink-3 lg:col-span-4">Not checked yet. It will be included in your next check.</p>
                ) : !hasData ? (
                  <p className="text-support text-ink-3 lg:col-span-4">None of your searches produced an answer here yet.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3 lg:contents">
                      <div className="col-span-3 min-w-0 lg:col-span-1">
                        <span className="text-caption text-ink-3 lg:hidden">Visibility</span>
                        <Fraction value={e.appears} total={e.answered} tone="you" label="answers" />
                      </div>
                      <EngineNumber label="Mentions" value={e.tracksNames ? e.named : null} note={e.tracksNames ? undefined : "Shows links only"} />
                      <EngineNumber label="Citations" value={e.linked} />
                    </div>
                    <div className="min-w-0">
                      <span className="text-caption text-ink-3 lg:hidden">Change over time</span>
                      {e.trend.length >= 2 ? (
                        <div className="flex items-center gap-3">
                          <TrendLine
                            points={e.trend.map((t) => ({ label: formatShortDate(t.date), value: t.value }))}
                            format={(v) => `${v}%`}
                            ariaLabel={`${e.label} visibility over time`}
                            className="w-24 shrink-0 [&_figcaption]:hidden"
                          />
                          <span className="text-caption text-ink-3">{engineChange(e.trend)}</span>
                        </div>
                      ) : (
                        <p className="text-caption text-ink-3">Shows after two checks</p>
                      )}
                    </div>
                  </>
                )}
              </li>
            );
          })}
          {COMING_SOON_ENGINES.map((name) => (
            <li key={name} className={cn("grid gap-3 px-4 py-4 lg:items-center lg:gap-5 lg:px-5", ENGINE_COLS)}>
              <EngineName id={name} label={name} muted />
              <p className="text-support text-ink-3 lg:col-span-4">Coming soon. VSI doesn&apos;t check {name} yet, so it has no numbers.</p>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

function EngineNumber({ label, value, note }: { label: string; value: number | null; note?: string }) {
  return (
    <div className="min-w-0">
      <span className="text-caption text-ink-3 lg:hidden">{label}</span>
      <p className="text-body font-semibold tabular text-ink">{value === null ? <span className="font-normal text-ink-3">n/a</span> : value}</p>
      {note && <p className="text-caption text-ink-3">{note}</p>}
    </div>
  );
}

/* ------------------------------------------------ Mentions and citations */

export function MentionsCitations({ summary: s }: { summary: GeoSummary }) {
  const b = answerBreakdown(s);
  const parts = [
    { key: "both", label: "Named and linked", value: b.namedAndLinked, className: "bg-brand" },
    { key: "named", label: "Named only", value: b.namedOnly, className: "bg-brand/55" },
    { key: "linked", label: "Linked only", value: b.linkedOnly, className: "bg-brand-light/70" },
    { key: "neither", label: "Not mentioned", value: b.neither, className: "bg-surface-2" },
  ];
  return (
    <Section
      title="Mentions and citations"
      description="A mention is when an AI answer names your business. A citation is when it links to your website as a source. Both matter: mentions build recognition, citations send visitors."
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-12">
        <div className="rounded-panel border border-line bg-surface p-5 md:p-6">
          <p className="text-caption font-medium text-ink-3">How AI answers treat you</p>
          <p className="mt-1 text-body text-ink-2">Across {plural(b.total, "AI answer")} for your searches, latest check each.</p>
          <div className="mt-5 flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(", ")}>
            {parts
              .filter((p) => p.value > 0)
              .map((p) => (
                <span key={p.key} className={cn("h-full origin-left animate-line-grow", p.className)} style={{ width: `${(p.value / Math.max(b.total, 1)) * 100}%` }} />
              ))}
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            {parts.map((p) => (
              <div key={p.key} className="flex min-w-0 flex-col-reverse justify-end gap-1">
                <dt className="flex items-start gap-2 text-caption text-ink-3">
                  <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", p.className, p.key === "neither" && "border border-line-strong")} aria-hidden />
                  {p.label}
                </dt>
                <dd className="text-[1.375rem] font-semibold leading-7 tabular text-ink">{p.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="space-y-4">
          <h3 className="text-section font-semibold text-ink">What AI answers say about you</h3>
          <Checklist summary={s} />
        </div>
      </div>
    </Section>
  );
}

function Checklist({ summary: s }: { summary: GeoSummary }) {
  const top = s.competitors[0];
  const missing = s.searches.filter((x) => x.answered && !x.appears).length;
  const items: { tone: Tone; text: string }[] = [
    s.mentions > 0
      ? { tone: "positive", text: `Your business is named in ${plural(s.mentions, "AI answer")}` }
      : { tone: "attention", text: "AI answers don't name your business yet" },
    s.citations > 0
      ? { tone: "positive", text: `Your website is used as a source in ${plural(s.citations, "answer")}` }
      : { tone: "attention", text: "AI answers don't link to your website yet" },
  ];
  if (s.entity) {
    items.push(
      s.entity.recognised === s.entity.checked
        ? { tone: "positive", text: "ChatGPT recognises your business correctly" }
        : { tone: "attention", text: "ChatGPT sometimes confuses you with another business" },
    );
  }
  if (top) {
    items.push(
      top.answers > s.citations
        ? { tone: "attention", text: `${top.domain} is linked more often than you (${top.answers} vs ${s.citations})` }
        : { tone: "positive", text: "You're linked at least as often as any competitor" },
    );
  }
  if (s.answered > 0) {
    items.push(
      missing > 0
        ? { tone: "attention", text: `${missing} important ${missing === 1 ? "search doesn't" : "searches don't"} mention you` }
        : { tone: "positive", text: "Every AI answer we checked mentions you" },
    );
  }
  return (
    <ul className="divide-y divide-line border-y border-line">
      {items.map((it, i) => (
        <li key={i} className="py-3">
          <StatusLabel tone={it.tone} className="text-body font-normal">
            <span className="text-ink">{it.text}</span>
          </StatusLabel>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------ Competitors */

const SOURCE_TAG: Record<CompareColumn["source"], string> = { you: "You", tracked: "Added by you", found: "Found in answers" };

export function CompetitorTable({ columns, answered }: { columns: CompareColumn[]; answered: number }) {
  const rows: { label: string; hint: string; value: (c: CompareColumn) => ReactNode }[] = [
    { label: "AI citations", hint: "AI answers that link to the website", value: (c) => c.citations },
    {
      label: "Search coverage",
      hint: "Answered searches where an AI answer links to it",
      value: (c) => (c.coverage === null ? "Not yet" : <>{c.coverage}%<span className="ml-1.5 text-caption font-normal text-ink-3">{c.searchesLinked} of {answered}</span></>),
    },
    { label: "Named by ChatGPT", hint: "ChatGPT answers that name the business", value: (c) => (c.chatgptNamed === null ? <span className="font-normal text-ink-3">Not checked</span> : c.chatgptNamed) },
  ];

  return (
    <Section
      title="You and competitors"
      description="How often AI answers point to you and to competitors, counted the same way for everyone."
      action={{ label: columns.length > 1 ? "Compare in Competitors" : "Add competitors", href: "/dashboard/competitors" }}
    >
      {columns.length === 1 ? (
        <div className="rounded-panel border border-dashed border-line-strong p-5 text-support text-ink-3">
          No competitors to compare yet. Add the competitors you care about, and VSI will count them in your next check alongside any sites AI answers link to.
        </div>
      ) : (
        <>
          {/* Wide screens: one column per business. */}
          <div className="hidden overflow-hidden rounded-panel border border-line bg-surface lg:block">
            <table className="w-full table-fixed text-left">
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="w-[28%] px-5 py-3 text-caption font-medium text-ink-3">
                    <span className="sr-only">Measure</span>
                  </th>
                  {columns.map((c) => (
                    <th key={c.key} scope="col" className={cn("px-4 py-3 align-bottom", c.source === "you" && "bg-brand-soft/60")}>
                      <span className={cn("block truncate text-body font-semibold", c.source === "you" ? "text-ink" : "text-ink-2")}>{c.name}</span>
                      <span className={cn("block text-caption", c.source === "you" ? "text-brand-strong" : "text-ink-3")}>{SOURCE_TAG[c.source]}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row" className="px-5 py-3.5 align-top font-normal">
                      <span className="block text-body font-medium text-ink">{r.label}</span>
                      <span className="block text-caption text-ink-3">{r.hint}</span>
                    </th>
                    {columns.map((c) => (
                      <td key={c.key} className={cn("px-4 py-3.5 align-top text-body font-semibold tabular text-ink", c.source === "you" && "bg-brand-soft/60")}>
                        {r.value(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Phones: one block per business. */}
          <ul className="space-y-3 lg:hidden">
            {columns.map((c) => (
              <li key={c.key} className={cn("rounded-panel border bg-surface p-4", c.source === "you" ? "border-brand/40" : "border-line")}>
                <p className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-body font-semibold text-ink">{c.name}</span>
                  <span className={cn("shrink-0 text-caption", c.source === "you" ? "text-brand-strong" : "text-ink-3")}>{SOURCE_TAG[c.source]}</span>
                </p>
                <dl className="mt-3 grid grid-cols-3 gap-3">
                  {rows.map((r) => (
                    <div key={r.label} className="min-w-0">
                      <dt className="text-caption text-ink-3">{r.label}</dt>
                      <dd className="mt-0.5 text-body font-semibold tabular text-ink">{r.value(c)}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

/* --------------------------------------------------------------- Searches */

const STATE_TONE: Record<SearchState, Tone> = {
  named_and_linked: "positive",
  named: "positive",
  linked: "info",
  not_mentioned: "attention",
  no_answer: "neutral",
  not_checked: "neutral",
};

export function TrackedSearches({ summary: s, projectId }: { summary: GeoSummary; projectId: string }) {
  const engines = s.engines;
  const sorted = [...s.searches].sort((a, b) => Number(a.appears) - Number(b.appears) || Number(b.answered) - Number(a.answered));
  const first = sorted.slice(0, 8);
  const rest = sorted.slice(8);
  const cols = { "--cols": `minmax(0,1.4fr) ${engines.map(() => "minmax(0,1fr)").join(" ")}` } as CSSProperties;

  const row = (r: TrackedSearch) => (
    <li key={r.keywordId ?? r.keyword} className="grid gap-2 px-4 py-3 md:items-center md:gap-4 md:px-5 md:[grid-template-columns:var(--cols)]" style={cols}>
      <div className="min-w-0">
        {r.keywordId ? (
          <Link href={`/dashboard/clients/${projectId}/keywords/${r.keywordId}`} className="block truncate text-support font-medium text-ink hover:underline">
            {r.keyword}
          </Link>
        ) : (
          <span className="block truncate text-support font-medium text-ink">{r.keyword}</span>
        )}
      </div>
      {engines.map((e) => (
        <div key={e.id} className="flex items-center gap-2 text-support">
          <span className="text-caption text-ink-3 md:hidden">{e.label}:</span>
          <StatusLabel tone={STATE_TONE[r.states[e.id]]} className="font-normal">
            <span className={r.states[e.id] === "not_checked" || r.states[e.id] === "no_answer" ? "text-ink-3" : "text-ink-2"}>{SEARCH_STATE_LABEL[r.states[e.id]]}</span>
          </StatusLabel>
        </div>
      ))}
    </li>
  );

  return (
    <Section title="Searches we check" description="Searches where you don't appear are listed first.">
      <div className="rounded-panel border border-line bg-surface">
        <div className="hidden gap-4 rounded-t-panel border-b border-line bg-surface-2 px-5 py-2.5 text-caption font-medium text-ink-3 md:grid md:[grid-template-columns:var(--cols)]" style={cols}>
          <span>Search</span>
          {engines.map((e) => (
            <span key={e.id}>{e.label}</span>
          ))}
        </div>
        <ul className="divide-y divide-line">{first.map(row)}</ul>
        {rest.length > 0 && (
          <details className="group border-t border-line">
            <summary className="cursor-pointer list-none px-4 py-2.5 text-support font-medium text-ink-2 hover:text-ink md:px-5 [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Show all {sorted.length} searches</span>
              <span className="hidden group-open:inline">Show fewer</span>
            </summary>
            <ul className="divide-y divide-line border-t border-line">{rest.map(row)}</ul>
          </details>
        )}
      </div>
    </Section>
  );
}

/* ----------------------------------------------------------- How it works */

export const HOW_STEPS = [
  { Icon: ListPlus, title: "Add searches", text: "The questions your customers ask." },
  { Icon: ScanSearch, title: "VSI checks AI answers", text: "Each AI service turned on for your project." },
  { Icon: MessageSquareQuote, title: "Measure mentions and citations", text: "Named, linked, or left out." },
  { Icon: Lightbulb, title: "Act on opportunities", text: "Each one can become a task." },
];

export function HowItWorks() {
  return (
    <div id="how-it-works" className="scroll-mt-24">
      <StepRail
        eyebrow="How it works"
        title="From your searches to clear opportunities"
        text="VSI asks AI services the questions your customers ask, and reads every answer the same way."
        steps={HOW_STEPS}
      />
    </div>
  );
}

/** First-use: what is set up for real, the four steps, and the one action that moves it forward. */
export function FirstUseSetup({ checklist, action, searches }: { checklist: ReactNode; action: ReactNode; searches: number }) {
  return (
    <section id="how-it-works" className="grid scroll-mt-24 gap-10 rounded-panel border border-line bg-surface px-5 py-7 md:px-8 md:py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
      <div className="min-w-0 space-y-5">
        <div>
          <Eyebrow rule>Get started</Eyebrow>
          <h2 className="mt-3 text-[1.375rem] font-semibold leading-7 tracking-[-0.015em] text-ink md:text-[1.625rem] md:leading-8">
            Understand your visibility in AI answers
          </h2>
          <p className="mt-2 max-w-[56ch] text-body text-ink-2 md:text-[0.9375rem] md:leading-6">
            {searches === 0
              ? "Add the searches and questions your customers ask, like “best accountant in Dubai”. VSI asks AI services each one and shows whether they mention you."
              : "Your searches are ready. One check asks AI services each search and looks up your Google position at the same time. It uses search credits, so it only runs when you start it."}
          </p>
        </div>
        {checklist}
        <div>{action}</div>
      </div>
      <ol className="min-w-0 space-y-0" aria-label="How AI Visibility works">
        {HOW_STEPS.map(({ Icon, title, text }, i) => (
          <li key={title} className="relative flex gap-4 pb-6 last:pb-0">
            {i < HOW_STEPS.length - 1 && <span className="absolute left-[21px] top-12 h-[calc(100%-3rem)] w-px border-l border-dashed border-line-strong" aria-hidden />}
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-strong" aria-hidden>
              <Icon size={19} strokeWidth={1.6} />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="font-mono text-caption text-brand-strong" aria-hidden>
                {String(i + 1).padStart(2, "0")}
              </p>
              <p className="text-body font-semibold text-ink">
                <span className="sr-only">Step {i + 1}: </span>
                {title}
              </p>
              <p className="text-support text-ink-3">{text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* -------------------------------------------------------------------- FAQ */

const FAQ: { q: string; a: string }[] = [
  {
    q: "What is AI Visibility?",
    a: "AI Visibility shows how often AI answers name your business or link to your website for the searches you track. The number is the share of searches with an AI answer where you appear.",
  },
  {
    q: "How does VSI measure AI visibility?",
    a: "For each search, VSI uses the most recent check. A search counts as answered when at least one AI service gave an answer, and you appear when that answer names your business or links to your website. Searches with no AI answer are left out, not counted against you.",
  },
  {
    q: "What are mentions and citations?",
    a: "A mention is when an AI answer names your business. A citation is when it links to your website as a source. Competitors are counted the same way. Well-known sites like Reddit or G2 are counted separately, as places AI trusts, not as competitors.",
  },
  {
    q: "Which AI engines are checked?",
    a: `VSI checks ${ENGINE_COVERAGE.live.join(", ")}. ${ENGINE_COVERAGE.soon.join(" and ")} are coming soon; until VSI checks them, they are never given numbers.`,
  },
  {
    q: "How often should I check AI visibility?",
    a: "AI answers change often, so every week or two is a good rhythm. Checks use search credits, so they only run when you start one, or on the schedule you choose in project settings: daily, every three days or weekly.",
  },
];

export function Faq() {
  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-14">
      <div>
        <Eyebrow rule>Questions</Eyebrow>
        <h2 className="mt-3 text-title font-semibold text-ink">About AI Visibility</h2>
      </div>
      <div className="divide-y divide-line border-y border-line">
        {FAQ.map(({ q, a }) => (
          <details key={q} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-body font-medium text-ink transition-colors hover:text-brand-strong [&::-webkit-details-marker]:hidden">
              {q}
              <Plus size={16} strokeWidth={1.75} aria-hidden className="shrink-0 text-ink-3 transition-transform duration-200 group-open:rotate-45" />
            </summary>
            <p className="max-w-[68ch] pb-5 text-support leading-6 text-ink-2">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
