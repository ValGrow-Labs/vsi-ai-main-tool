import { Search } from "lucide-react";
import { PageContainer, Section } from "@/components/ui/Page";
import { Notice } from "@/components/ui/Status";
import { ButtonLink } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { AnswerAnatomy } from "@/components/intro/AnswerAnatomy";
import { CapabilityList } from "@/components/intro/FeatureIntro";
import { ProductStory } from "@/components/intro/ProductStory";
import { SetupChecklist } from "@/components/intro/SetupPanel";
import { ENGINE_COVERAGE, INTROS } from "@/components/intro/intros";
import { GuideTarget } from "@/components/onboarding/GuideTarget";
import type { TrendPoint } from "@/features/visibility/components/TrajectoryChart";
import type { EngineId, GeoSummary } from "@/lib/geo";
import { compareCompetitors } from "@/lib/geo-compare";
import type { AnswerEvidence } from "@/lib/geo-load";
import type { Finding } from "@/lib/findings";
import { RunChecksButton } from "./RunChecksButton";
import { AnswerExamples } from "./AnswerExamples";
import { Opportunities } from "./Opportunities";
import {
  CompetitorTable,
  EngineCoverage,
  Faq,
  FirstUseSetup,
  Hero,
  HowItWorks,
  LearnHowLink,
  MentionsCitations,
  Overview,
  TrackedSearches,
} from "./sections";

export interface GeoViewData {
  project: { id: string; name: string; domain: string | null } | null;
  state: "ok" | "error" | "no_project";
  errorMessage?: string;
  summary?: GeoSummary;
  enabled?: Record<EngineId, boolean>;
  activeSearches?: number;
  lastChecked?: string | null;
  staleDays?: number | null;
  findings: Finding[];
  /** Competitors the user added to the project. */
  trackedCompetitors?: { domain: string; name: string | null }[];
  evidence: AnswerEvidence[];
  trend: TrendPoint[];
}

/**
 * The AI Visibility page. A server component: the only client parts are the
 * check button (which asks before spending credits), the answer switcher and
 * the opportunity drawer. Opening the page never runs a check.
 */
export default function GeoView({ data }: { data: GeoViewData }) {
  const { project, summary } = data;

  if (!project || data.state === "error" || !summary || !data.enabled) {
    return (
      <PageContainer>
        <Hero project={project} visual={<AnswerAnatomy />} />
        <Notice tone="critical" title={data.errorMessage ?? (project ? "We couldn't load your AI visibility data." : "We couldn't load your projects.")}>
          Refresh the page to try again. Nothing has been lost.
        </Notice>
      </PageContainer>
    );
  }

  const searches = data.activeSearches ?? 0;
  const checkButton = <RunChecksButton clientId={project.id} searches={searches} label="Check AI visibility" align="start" />;
  const addSearches = (
    <GuideTarget step="searches">
      <ButtonLink href={`/dashboard/clients/${project.id}/keywords/new`} variant="primary">
        Add searches
      </ButtonLink>
    </GuideTarget>
  );

  /* First use: the project exists but nothing has been checked yet. */
  if (summary.searchesTracked === 0) {
    return (
      <PageContainer>
        <Hero
          project={project}
          actions={
            <>
              {searches === 0 ? addSearches : checkButton}
              <LearnHowLink />
            </>
          }
          visual={<AnswerAnatomy />}
        />
        <FirstUseSetup
          searches={searches}
          checklist={
            <SetupChecklist
              items={[
                { state: "done", label: "Website added", detail: project.domain ?? undefined },
                searches === 0
                  ? { state: "todo", label: "Searches to check", detail: "None yet" }
                  : { state: "done", label: "Searches to check", detail: `${searches} ${searches === 1 ? "search" : "searches"}` },
                { state: "todo", label: "First AI check", detail: "Not checked yet" },
              ]}
            />
          }
          action={searches === 0 ? <ButtonLink href={`/dashboard/clients/${project.id}/keywords/new`} variant="primary">Add searches</ButtonLink> : checkButton}
        />
        {INTROS.ai.capabilities && (
          <Reveal>
            <CapabilityList
              {...INTROS.ai.capabilities}
              note={
                <p>
                  Checked today in {ENGINE_COVERAGE.live.join(", ")}. Coming soon: {ENGINE_COVERAGE.soon.join(" and ")}.
                </p>
              }
            />
          </Reveal>
        )}
        <Reveal>
          <EngineCoverage engines={summary.engines} projectId={project.id} />
        </Reveal>
        <Reveal>
          <ProductStory current="ai" />
        </Reveal>
        <Reveal>
          <Faq />
        </Reveal>
      </PageContainer>
    );
  }

  /* Data state: every number below comes from the project's stored checks. */
  const columns = compareCompetitors(summary, { projectName: project.name, domain: project.domain, tracked: data.trackedCompetitors ?? [] });

  return (
    <PageContainer>
      <Hero
        project={project}
        lastChecked={data.lastChecked}
        compact
        actions={
          <>
            {searches > 0 ? checkButton : addSearches}
            <ButtonLink href="/dashboard/check?tab=quick-check" variant="secondary">
              <Search size={15} strokeWidth={1.75} aria-hidden />
              Check a search
            </ButtonLink>
            <LearnHowLink />
          </>
        }
        visual={<AnswerAnatomy />}
      />

      {data.staleDays && (
        <Notice tone="attention" title={`These results are ${data.staleDays} days old`}>
          AI answers change often. Run a new check to see where you stand today.
        </Notice>
      )}

      <Overview summary={summary} trend={data.trend} />

      <Reveal>
        <EngineCoverage engines={summary.engines} projectId={project.id} />
      </Reveal>

      <Reveal>
        <MentionsCitations summary={summary} />
      </Reveal>

      <Reveal>
        <CompetitorTable columns={columns} answered={summary.answered} />
      </Reveal>

      <Reveal>
        <Section title="AI answer examples" description="Real answers from your latest checks, read the way VSI reads them.">
          {data.evidence.length > 0 ? (
            <AnswerExamples items={data.evidence} projectId={project.id} />
          ) : (
            <div className="rounded-panel border border-dashed border-line-strong p-5 text-support text-ink-3">
              An answer from your own searches appears here once a check finds one in Google AI Overview. The example at the top of the page shows
              what VSI looks for.
            </div>
          )}
        </Section>
      </Reveal>

      <Reveal>
        <Section
          title="Where you can improve"
          description="Ranked by how much each one is costing you. Every finding comes from your own checks."
          action={{ label: "All next actions", href: "/dashboard/next-actions" }}
        >
          {data.findings.length === 0 ? (
            <Notice tone="positive" title="Nothing urgent">
              AI answers mention your business in every search we checked. Keep your pages up to date to stay there.
            </Notice>
          ) : (
            <Opportunities findings={data.findings} />
          )}
        </Section>
      </Reveal>

      <Reveal>
        <TrackedSearches summary={summary} projectId={project.id} />
      </Reveal>

      <Reveal>
        <HowItWorks />
      </Reveal>

      <Reveal>
        <ProductStory current="ai" />
      </Reveal>

      <Reveal>
        <Faq />
      </Reveal>
    </PageContainer>
  );
}
