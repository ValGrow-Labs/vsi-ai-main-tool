"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PageContainer } from "@/components/ui/Page";
import { Notice } from "@/components/ui/Status";
import { cn } from "@/lib/utils";
import { addCompetitors } from "@/lib/competitor-client";
import { addSearches } from "@/lib/keyword-client";
import type { Location } from "@/types/search";

import { WebsiteUrlStep } from "@/components/project-creation/WebsiteUrlStep";
import { AnalysisProgress } from "@/components/project-creation/AnalysisProgress";
import { BusinessSummary, type BusinessData } from "@/components/project-creation/BusinessSummary";
import { CompetitorSelection, detectMarketFromDomain, type CompetitorItem } from "@/components/project-creation/CompetitorSelection";
import { AnalysisSetup, type KeywordSetupItem } from "@/components/project-creation/AnalysisSetup";
import { StepFooter } from "@/components/project-creation/StepFooter";
import { AnalysisStartModal } from "@/components/project-creation/AnalysisStartModal";
import { buildProjectSavePayload } from "@/components/project-creation/save-payload";
import type {
  AnalysisSuccessResponse,
  AnalysisUnavailableResponse,
  ExtractedWebsiteData,
} from "@/app/api/analyze-website/route";

const STEP_LABELS = ["Website", "Business", "Competitors", "SEO Setup"] as const;

/** Nothing is known until the website is analysed or the user enters it. */
const EMPTY_BUSINESS: BusinessData = {
  brandName: "",
  domain: "",
  businessType: "",
  websiteTitle: "",
  metaDescription: "",
  language: "",
  location: "",
  locationCode: "",
  suggestedTopics: [],
  sitemapUrl: "",
  competitiveAdvantage: "",
  aboutBusiness: "",
  targetCustomers: [],
};

/** Which parts of the save already went through, so a retry doesn't create a second project. */
interface SaveProgress {
  projectId: string | null;
  searches: boolean;
  competitors: boolean;
}

const NO_SAVE: SaveProgress = { projectId: null, searches: false, competitors: false };

type AnalyzeResponse = AnalysisSuccessResponse | AnalysisUnavailableResponse | { success: false; error?: string };

export default function NewProjectPage() {
  const router = useRouter();

  // Wizard state: 1: Website Input/Analysis, 2: Business Summary, 3: Competitor Websites, 4: SEO Setup
  const [step, setStep] = useState<number>(1);
  const [isAnalyzingWebsite, setIsAnalyzingWebsite] = useState(false);
  const [isProgressShowing, setIsProgressShowing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  // Set when automatic analysis couldn't be completed and the user enters the details by hand.
  const [analysisUnavailable, setAnalysisUnavailable] = useState<string | null>(null);

  // Business summary data state
  const [businessData, setBusinessData] = useState<BusinessData>(EMPTY_BUSINESS);

  // Competitor list state
  const [competitors, setCompetitors] = useState<CompetitorItem[]>([]);

  // Keywords & SEO setup state
  const [keywords, setKeywords] = useState<KeywordSetupItem[]>([]);
  const [geoTopics, setGeoTopics] = useState<string[]>([]);

  // Start analysis job submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showStartModal, setShowStartModal] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saveProgress, setSaveProgress] = useState<SaveProgress>(NO_SAVE);

  // A project belongs to the signed-in user's own organization. Without one, it is set up first.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!user) {
          router.replace("/login");
          return;
        }
        const { data: profile, error } = await supabase.from("profiles").select("agency_id").eq("id", user.id).single();
        if (cancelled || error) return; // couldn't check now: saving checks again and reports it
        if (!profile?.agency_id) router.replace("/onboarding");
      } catch {
        // Couldn't check now; handleStartAnalysis checks again before saving.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function applyAnalysis(business: BusinessData, comps: CompetitorItem[], kws: KeywordSetupItem[], geo: string[]) {
    setBusinessData(business);
    setCompetitors(comps);
    setKeywords(kws);
    setGeoTopics(geo);
    setSaveProgress(NO_SAVE);
  }

  /** Step 1: Trigger backend website analysis */
  async function handleAnalyzeWebsite(url: string) {
    setIsAnalyzingWebsite(true);
    setAnalysisError(null);
    setAnalysisUnavailable(null);

    try {
      const res = await fetch("/api/analyze-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const json = (await res.json().catch(() => null)) as AnalyzeResponse | null;

      // Analysis couldn't be completed: continue with only what the typed domain tells us (brand and
      // country-code market, both editable) and let the user enter the rest. Nothing is pre-selected.
      if (json && !json.success && "status" in json && json.status === "ANALYSIS_UNAVAILABLE") {
        const d = json.derived;
        applyAnalysis(
          {
            ...EMPTY_BUSINESS,
            brandName: d.brandName ?? "",
            domain: d.domain,
            location: d.location ?? "",
            locationCode: d.locationCode ?? "",
          },
          [],
          [],
          []
        );
        setAnalysisUnavailable(json.message);
        setIsAnalyzingWebsite(false);
        setStep(2);
        return;
      }

      if (!res.ok || !json || !json.success) {
        const message = json && "error" in json && json.error ? json.error : null;
        throw new Error(message || "We couldn't access this website. Please check the URL and try again.");
      }

      const extracted: ExtractedWebsiteData = json.data;
      const targetLocation = extracted.location ?? "";

      applyAnalysis(
        {
          brandName: extracted.brandName ?? "",
          domain: extracted.domain,
          businessType: extracted.businessType ?? "",
          websiteTitle: extracted.websiteTitle ?? "",
          metaDescription: extracted.metaDescription ?? "",
          language: extracted.language ?? "",
          location: targetLocation,
          locationCode: extracted.locationCode ?? "",
          suggestedTopics: extracted.suggestedTopics,
          sitemapUrl: extracted.sitemapUrl ?? "",
          competitiveAdvantage: extracted.competitiveAdvantage ?? "",
          aboutBusiness: extracted.aboutBusiness ?? "",
          targetCustomers: extracted.targetCustomers,
        },
        (extracted.suggestedCompetitors || []).map((c) => ({
          ...c,
          market: detectMarketFromDomain(c.domain, targetLocation),
        })),
        extracted.suggestedKeywords || [],
        extracted.geoTopics || []
      );

      // Switch to smooth animated progress checklist state
      setIsAnalyzingWebsite(false);
      setIsProgressShowing(true);
    } catch (err) {
      setIsAnalyzingWebsite(false);
      setAnalysisError(err instanceof Error ? err.message : "We couldn't access this website. Please check the URL and try again.");
    }
  }

  /** Step 1 analysis progress finished -> Move to Step 2 */
  function handleProgressComplete() {
    setIsProgressShowing(false);
    setStep(2);
  }

  /** Final Step: Save project & run analysis jobs */
  async function handleStartAnalysis() {
    setSubmitError(null);

    // Only what the user kept selected, with a search market they chose.
    const built = buildProjectSavePayload({ business: businessData, keywords, competitors });
    if (!built.ok) {
      setSubmitError(built.message);
      return;
    }
    const { payload } = built;

    setIsSubmitting(true);

    try {
      const supabase = createClient();

      const {
        data: { user },
        error: authErr,
      } = await supabase.auth.getUser();

      if (!user || authErr) {
        throw new Error("Your session has ended. Please sign in again to add your website.");
      }

      let progress = saveProgress;

      // 1. Create client project (once; a retry reuses it)
      if (!progress.projectId) {
        const { data: profile, error: profileErr } = await supabase
          .from("profiles")
          .select("agency_id")
          .eq("id", user.id)
          .single();
        if (profileErr) {
          throw new Error("We couldn't load your organization. Please refresh the page and try again.");
        }
        const agencyId = (profile?.agency_id as string | null | undefined) ?? null;
        if (!agencyId) {
          // No organization yet: it is set up on the onboarding page, never guessed here.
          router.push("/onboarding");
          throw new Error("Your account isn't part of an organization yet. Set one up first, then add your website.");
        }

        const { data: client, error: clientErr } = await supabase
          .from("clients")
          .insert({ ...payload.client, agency_id: agencyId })
          .select("id")
          .single();

        if (clientErr || !client?.id) {
          throw new Error(
            clientErr?.message?.toLowerCase().includes("limit")
              ? "Your plan's project limit is reached."
              : "We couldn't create the project. Please try again."
          );
        }
        progress = { ...progress, projectId: client.id as string };
        setSaveProgress(progress);
      }

      const projectId = progress.projectId as string;
      const failures: string[] = [];

      // 2. Save selected keywords
      if (!progress.searches) {
        const kwRes = await addSearches(projectId, payload.searches);
        if (kwRes.ok) progress = { ...progress, searches: true };
        else failures.push(`Searches: ${kwRes.message}`);
      }

      // 3. Save selected competitors
      if (!progress.competitors) {
        if (payload.competitorDomains.length === 0) {
          progress = { ...progress, competitors: true };
        } else {
          const compRes = await addCompetitors(projectId, payload.competitorDomains);
          if (compRes.ok) progress = { ...progress, competitors: true };
          else failures.push(`Competitors: ${compRes.message}`);
        }
      }
      setSaveProgress(progress);

      if (failures.length > 0) {
        throw new Error(
          `The project was created, but some parts weren't saved. ${failures.join(" ")} Click Start Analysis to try them again.`
        );
      }

      // 4. Select active project context (best effort: the next page is addressed by project id)
      await fetch("/api/project/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      }).catch(() => null);

      // 5. Trigger multi-stage analysis background job
      const jobRes = await fetch("/api/jobs/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: projectId }),
      }).catch(() => null);

      if (!jobRes || !jobRes.ok) {
        const jobBody = jobRes
          ? ((await jobRes.json().catch(() => ({}))) as { error?: { message?: string } | string })
          : {};
        const detail = typeof jobBody.error === "string" ? jobBody.error : jobBody.error?.message;
        throw new Error(
          `Your project was saved, but the analysis couldn't be started${detail ? `: ${detail}` : "."} Click Start Analysis to try again.`
        );
      }

      // 6. Move user to the real-time Analysis Process Screen
      router.push(`/dashboard/clients/${projectId}/analysis`);
    } catch (err) {
      setIsSubmitting(false);
      setSubmitError(err instanceof Error ? err.message : "We couldn't set up the project. Please try again.");
    }
  }

  function handleStartModalFinished() {
    router.push("/dashboard");
    router.refresh();
  }

  const analyzed = !analysisUnavailable;

  return (
    <PageContainer className="max-w-[1020px]">
      {/* Step Stepper Header */}
      <div className="space-y-4">
        <ol className="grid grid-cols-2 gap-x-4 gap-y-3 border-b border-line pb-4 sm:grid-cols-4" aria-label="Setup steps">
          {STEP_LABELS.map((label, i) => {
            const stepNum = i + 1;
            const isCurrent = stepNum === step;
            const isPast = stepNum < step;

            return (
              <li key={label} aria-current={isCurrent ? "step" : undefined} className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-caption font-semibold transition-colors",
                    isPast
                      ? "bg-ink text-white"
                      : isCurrent
                      ? "border-2 border-brand text-brand-strong bg-brand-soft"
                      : "border border-line-strong text-ink-3"
                  )}
                >
                  {isPast ? <Check size={14} strokeWidth={2.5} aria-hidden /> : stepNum}
                </span>
                <span className={cn("text-support font-medium", isCurrent ? "text-ink font-semibold" : "text-ink-3")}>
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {submitError && <Notice tone="critical" title={submitError} />}

      {analysisUnavailable && step > 1 && (
        <Notice tone="attention" title="Automatic analysis couldn't be completed">
          {analysisUnavailable} Enter your business details, competitors and searches yourself. Nothing has been
          filled in for you except the brand{businessData.location ? " and country" : ""} taken from your web
          address, which you can change.
        </Notice>
      )}

      {/* STEP 1 — Website URL & Progress */}
      {step === 1 && (
        <>
          {isProgressShowing ? (
            <AnalysisProgress onComplete={handleProgressComplete} />
          ) : (
            <WebsiteUrlStep
              initialUrl={businessData.domain}
              onAnalyze={handleAnalyzeWebsite}
              isLoading={isAnalyzingWebsite}
              error={analysisError}
            />
          )}
        </>
      )}

      {/* STEP 2 — Business Summary */}
      {step === 2 && (
        <>
          <BusinessSummary
            data={businessData}
            analyzed={analyzed}
            onUpdate={(updated) => setBusinessData((prev) => ({ ...prev, ...updated }))}
          />
          <StepFooter
            currentStep={2}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        </>
      )}

      {/* STEP 3 — Competitor Websites */}
      {step === 3 && (
        <>
          <CompetitorSelection
            initialCompetitors={competitors}
            userDomain={businessData.domain}
            defaultMarket={businessData.location}
            onChange={(updatedComps) => setCompetitors(updatedComps)}
          />
          <StepFooter
            currentStep={3}
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
            onSkip={() => setStep(4)}
          />
        </>
      )}

      {/* STEP 4 — Search & SEO Setup */}
      {step === 4 && (
        <>
          <AnalysisSetup
            analyzed={analyzed}
            topics={businessData.suggestedTopics}
            keywords={keywords}
            location={businessData.location}
            locationCode={businessData.locationCode as Location | ""}
            language={businessData.language}
            targetCustomers={businessData.targetCustomers}
            competitors={competitors.filter((c) => c.selected).map((c) => c.domain)}
            sitemapUrl={businessData.sitemapUrl}
            geoTopics={geoTopics}
            onKeywordsChange={(newKw) => setKeywords(newKw)}
            onLocationChange={(code, name) =>
              setBusinessData((prev) => ({ ...prev, locationCode: code, location: name }))
            }
            onLanguageChange={(lang) =>
              setBusinessData((prev) => ({ ...prev, language: lang }))
            }
          />
          <StepFooter
            currentStep={4}
            nextLabel="Start Analysis"
            isSubmitting={isSubmitting}
            onBack={() => setStep(3)}
            onNext={handleStartAnalysis}
          />
        </>
      )}

      {/* Final Analysis Start Progress Modal */}
      <AnalysisStartModal
        isOpen={showStartModal}
        onFinished={handleStartModalFinished}
      />
    </PageContainer>
  );
}
