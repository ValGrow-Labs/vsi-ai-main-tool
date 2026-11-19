"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
import { matchLocationOption } from "@/components/project-creation/location";
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

interface SaveProgress {
  projectId: string | null;
  searches: boolean;
  competitors: boolean;
}

const NO_SAVE: SaveProgress = { projectId: null, searches: false, competitors: false };

export default function NewProjectPage() {
  const router = useRouter();

  // Wizard state: 1: Website Input/Analysis, 2: Business Summary, 3: Competitor Websites, 4: SEO Setup
  const [step, setStep] = useState<number>(1);
  const [isAnalyzingWebsite, setIsAnalyzingWebsite] = useState(false);
  const [isProgressShowing, setIsProgressShowing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisUnavailable, setAnalysisUnavailable] = useState<string | null>(null);

  // Real 3-step progress states
  const [progressStep, setProgressStep] = useState<number>(1);
  const [progressDetail, setProgressDetail] = useState<string>("Connecting to website...");
  const [isAnalysisCompleted, setIsAnalysisCompleted] = useState(false);
  const currentUrlRef = useRef<string>("");

  // Business summary data state
  const [businessData, setBusinessData] = useState<BusinessData>(EMPTY_BUSINESS);

  // Competitor list state
  const [competitors, setCompetitors] = useState<CompetitorItem[]>([]);

  // Keywords & SEO setup state
  const [keywords, setKeywords] = useState<KeywordSetupItem[]>([]);
  const [geoTopics, setGeoTopics] = useState<string[]>([]);

  // Start analysis job submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRegeneratingCompetitors, setIsRegeneratingCompetitors] = useState(false);
  const [showStartModal, setShowStartModal] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saveProgress, setSaveProgress] = useState<SaveProgress>(NO_SAVE);

  async function fetchCompetitorsForLocation(targetLoc: string, targetLocCode?: string) {
    const loc = targetLoc.trim();
    if (!loc) return;
    const dom = businessData.domain || currentUrlRef.current;
    if (!dom) return;

    setIsRegeneratingCompetitors(true);
    try {
      const res = await fetch("/api/analyze-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "regenerate",
          section: "competitors",
          url: dom,
          domain: dom,
          businessType: businessData.businessType,
          brandName: businessData.brandName,
          location: loc,
          locationCode: targetLocCode || businessData.locationCode,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data?.suggestedCompetitors) {
          const newComps: CompetitorItem[] = json.data.suggestedCompetitors.map(
            (c: { domain: string; name?: string; market?: string }) => ({
              domain: c.domain,
              name: c.name || c.domain,
              market: c.market || loc,
              selected: false,
            })
          );
          if (newComps.length > 0) {
            setCompetitors(newComps);
          }
        }
      }
    } catch (err) {
      console.warn("[onboarding] Failed to fetch competitors for location:", err);
    } finally {
      setIsRegeneratingCompetitors(false);
    }
  }

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
        if (cancelled || error) return;
        if (!profile?.agency_id) router.replace("/onboarding");
      } catch {
        // Continue
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

  function mapExtractedToBusinessData(extracted: ExtractedWebsiteData): BusinessData {
    const locMatch = matchLocationOption(extracted.locationCode || extracted.location);
    return {
      brandName: extracted.brandName ?? "",
      domain: extracted.domain,
      businessType: extracted.businessType ?? "",
      websiteTitle: extracted.websiteTitle ?? "",
      metaDescription: extracted.metaDescription ?? "",
      language: extracted.language ?? "English",
      location: locMatch?.country || extracted.location || "",
      locationCode: locMatch?.code || extracted.locationCode || "",
      suggestedTopics: extracted.suggestedTopics || [],
      sitemapUrl: extracted.sitemapUrl ?? "",
      competitiveAdvantage: extracted.competitiveAdvantage ?? "",
      aboutBusiness: extracted.aboutBusiness ?? "",
      targetCustomers: extracted.targetCustomers || [],
    };
  }

  /** Step 1: Trigger backend website analysis with real SSE streaming, 40s timeout, and 1 auto-retry */
  async function handleAnalyzeWebsite(url: string, isRetry = false) {
    currentUrlRef.current = url;
    setIsAnalyzingWebsite(true);
    setIsProgressShowing(true);
    setProgressStep(1);
    setProgressDetail("Connecting to website and reading structure...");
    setIsAnalysisCompleted(false);
    setAnalysisError(null);
    setAnalysisUnavailable(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    try {
      const res = await fetch("/api/analyze-website?stream=true", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok && res.headers.get("content-type")?.includes("application/json")) {
        const errJson = await res.json().catch(() => ({}));
        if (errJson.status === "ANALYSIS_UNAVAILABLE") {
          handleUnavailableFallback(errJson);
          return;
        }
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Could not connect to analysis stream.");

      const decoder = new TextDecoder();
      let buffer = "";
      let receivedComplete = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          const trimmed = block.trim();
          if (!trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === "progress") {
              setProgressStep(event.step || 1);
              if (event.detail) setProgressDetail(event.detail);
            } else if (event.type === "complete") {
              receivedComplete = true;
              const extracted: ExtractedWebsiteData = event.data;
              const targetLocation = extracted.location ?? "";
              const biz = mapExtractedToBusinessData(extracted);

              applyAnalysis(
                biz,
                (extracted.suggestedCompetitors || []).map((c) => ({
                  ...c,
                  market: detectMarketFromDomain(c.domain, targetLocation),
                })),
                extracted.suggestedKeywords || [],
                extracted.geoTopics || []
              );

              setProgressStep(3);
              setProgressDetail("Business summary generated successfully!");
              setIsAnalysisCompleted(true);
              setIsAnalyzingWebsite(false);
            } else if (event.type === "error") {
              if (event.status === "ANALYSIS_UNAVAILABLE") {
                handleUnavailableFallback(event);
                return;
              }
              throw new Error(event.message || event.error || "Analysis failed");
            }
          } catch (parseErr) {
            console.warn("[onboarding] Failed to parse SSE event:", parseErr);
          }
        }
      }

      if (!receivedComplete && !analysisUnavailable) {
        throw new Error("Analysis ended without complete data.");
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      const errMsg = isAbort
        ? "Analysis timed out. Retrying automatically..."
        : err instanceof Error
        ? err.message
        : "Failed to connect to website.";

      // 1 automatic retry on timeout or failure before falling back
      if (!isRetry) {
        console.warn("[onboarding] Analysis attempt 1 failed, retrying once:", errMsg);
        setProgressDetail("Retrying analysis with fallback scraper...");
        setTimeout(() => handleAnalyzeWebsite(url, true), 1200);
        return;
      }

      // If retry also failed: fall back gracefully to manual entry with derived brand/domain
      setIsAnalyzingWebsite(false);
      const domainGuess = url.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
      applyAnalysis(
        {
          ...EMPTY_BUSINESS,
          brandName: domainGuess.split(".")[0],
          domain: domainGuess,
        },
        [],
        [],
        []
      );
      setAnalysisUnavailable(
        "Website analysis took too long or was blocked. You can fill in the business summary below or try again."
      );
      setIsProgressShowing(false);
      setStep(2);
    }
  }

  function handleUnavailableFallback(event: { derived?: { brandName?: string | null; domain?: string; location?: string | null; locationCode?: string | null }; message?: string }) {
    const d = event.derived || { domain: currentUrlRef.current, brandName: "" };
    const locMatch = matchLocationOption(d.locationCode || d.location);
    applyAnalysis(
      {
        ...EMPTY_BUSINESS,
        brandName: d.brandName ?? "",
        domain: d.domain || currentUrlRef.current,
        location: locMatch?.country || (d.location ?? ""),
        locationCode: locMatch?.code || (d.locationCode ?? ""),
      },
      [],
      [],
      []
    );
    setAnalysisUnavailable(event.message || "Automatic analysis couldn't be completed.");
    setIsAnalyzingWebsite(false);
    setIsProgressShowing(false);
    setStep(2);
  }

  /** Step 1 analysis progress finished -> Move to Step 2 */
  function handleProgressComplete() {
    setIsProgressShowing(false);
    setStep(2);
  }

  /** Final Step: Save project & run analysis jobs */
  async function handleStartAnalysis() {
    setSubmitError(null);

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

      // 1. Create client project
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

      // 4. Select active project context
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

      // 6. Return user to the main dashboard after completing setup
      router.push("/dashboard");
      router.refresh();
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
    <div className="flex min-h-screen flex-col bg-canvas font-sans text-ink">
      {/* 1. Full-screen Top Navigation & Progress Header */}
      <header className="sticky top-0 z-40 w-full border-b border-line bg-surface/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[1340px] items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Brand Logo & Name */}
          <Link
            href="/dashboard"
            className="flex shrink-0 items-center gap-2.5 transition-opacity hover:opacity-85"
            aria-label="Exit setup to dashboard"
          >
            <Image
              src="/vg-logo.png"
              alt="VSI Logo"
              width={28}
              height={28}
              className="shrink-0 rounded-md ring-1 ring-line"
            />
            <div className="hidden sm:block">
              <span className="block text-[0.9375rem] font-semibold leading-tight text-ink">VSI</span>
              <span className="block text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-ink-3">Search Intelligence</span>
            </div>
          </Link>

          {/* Desktop Stepper (Website → Business → Competitors → SEO Setup) */}
          <nav aria-label="Setup progress" className="hidden md:flex items-center justify-center">
            <ol className="flex items-center gap-3 lg:gap-4">
              {STEP_LABELS.map((label, i) => {
                const stepNum = i + 1;
                const isCurrent = stepNum === step;
                const isPast = stepNum < step;

                return (
                  <li key={label} className="flex items-center gap-3 lg:gap-4">
                    <div
                      aria-current={isCurrent ? "step" : undefined}
                      className="flex items-center gap-2"
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold transition-all",
                          isPast
                            ? "bg-ink text-white"
                            : isCurrent
                            ? "border-2 border-brand bg-brand-soft text-brand-strong shadow-2xs"
                            : "border border-line-strong bg-surface text-ink-3"
                        )}
                      >
                        {isPast ? <Check size={12} strokeWidth={2.5} aria-hidden /> : stepNum}
                      </span>
                      <span
                        className={cn(
                          "text-caption font-medium tracking-tight",
                          isCurrent
                            ? "font-semibold text-ink"
                            : isPast
                            ? "text-ink"
                            : "text-ink-3"
                        )}
                      >
                        {label}
                      </span>
                    </div>

                    {i < STEP_LABELS.length - 1 && (
                      <span className="text-ink-3/40 select-none text-caption font-light" aria-hidden>
                        →
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>

          {/* Mobile Step Counter */}
          <div className="flex md:hidden items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-brand bg-brand-soft font-mono text-caption font-bold text-brand-strong">
              {step}
            </span>
            <span className="text-caption font-semibold text-ink">
              {STEP_LABELS[step - 1]}
            </span>
            <span className="text-caption text-ink-3">({step}/4)</span>
          </div>

          {/* Right: Exit Setup to Dashboard */}
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 rounded-control px-2.5 py-1.5 text-caption font-medium text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink cursor-pointer"
            title="Exit setup to dashboard"
          >
            <span className="hidden sm:inline">Exit to dashboard</span>
            <X size={15} strokeWidth={2} />
          </Link>
        </div>
      </header>

      {/* 2. Main Form Content Area - Centered with proper spacing */}
      <main className="flex-1 w-full mx-auto max-w-[1040px] px-4 py-8 sm:px-6 lg:px-8">
        {submitError && (
          <div className="mb-6">
            <Notice tone="critical" title={submitError} />
          </div>
        )}

        {/* STEP 1 — Website URL & Progress */}
        {step === 1 && (
          <>
            {isProgressShowing ? (
              <AnalysisProgress
                currentStep={progressStep}
                stepDetail={progressDetail}
                isCompleted={isAnalysisCompleted}
                onContinue={handleProgressComplete}
                error={analysisError}
                onRetry={() => handleAnalyzeWebsite(currentUrlRef.current)}
              />
            ) : (
              <WebsiteUrlStep
                initialUrl={businessData.domain}
                onAnalyze={(url) => handleAnalyzeWebsite(url)}
                isLoading={isAnalyzingWebsite}
                error={analysisError}
              />
            )}
          </>
        )}

        {/* STEP 2 — Business Summary */}
        {step === 2 && (
          <BusinessSummary
            data={businessData}
            analyzed={analyzed}
            fallbackReason={analysisUnavailable}
            onUpdate={(updated) => {
              setBusinessData((prev) => {
                const next = { ...prev, ...updated };
                const locMatch = matchLocationOption(next.locationCode || next.location);
                if (locMatch) {
                  next.location = locMatch.country;
                  next.locationCode = locMatch.code;
                }
                return next;
              });
              if (updated.location) {
                const locMatch = matchLocationOption(updated.location);
                const finalLoc = locMatch?.country || updated.location;
                fetchCompetitorsForLocation(finalLoc, locMatch?.code);
              }
            }}
            onRetryAnalysis={() => {
              setStep(1);
              handleAnalyzeWebsite(businessData.domain || currentUrlRef.current);
            }}
          />
        )}

        {/* STEP 3 — Competitor Websites */}
        {step === 3 && (
          <CompetitorSelection
            initialCompetitors={competitors}
            userDomain={businessData.domain}
            defaultMarket={businessData.location}
            isRegenerating={isRegeneratingCompetitors}
            onRegenerate={() => fetchCompetitorsForLocation(businessData.location, businessData.locationCode)}
            onChange={(updatedComps) => setCompetitors(updatedComps)}
          />
        )}

        {/* STEP 4 — Search & SEO Setup */}
        {step === 4 && (
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
            onLocationChange={(code, name) => {
              const locMatch = matchLocationOption(code || name);
              const finalCode = (locMatch?.code || code) as Location;
              const finalName = locMatch?.country || name;
              setBusinessData((prev) => ({
                ...prev,
                locationCode: finalCode,
                location: finalName,
              }));
              fetchCompetitorsForLocation(finalName, finalCode);
            }}
            onLanguageChange={(lang) =>
              setBusinessData((prev) => ({ ...prev, language: lang }))
            }
          />
        )}
      </main>

      {/* 3. Bottom Sticky StepFooter (Steps 2, 3, 4) */}
      {step === 2 && (
        <StepFooter
          currentStep={2}
          hintText="You can change these settings later."
          onBack={() => setStep(1)}
          onNext={() => {
            const loc = businessData.location;
            const hasLocalMatch = loc && competitors.some((c) => c.market && c.market.toLowerCase().includes(loc.toLowerCase()));
            if (loc && (!hasLocalMatch || competitors.length === 0)) {
              fetchCompetitorsForLocation(loc, businessData.locationCode);
            }
            setStep(3);
          }}
        />
      )}

      {step === 3 && (
        <StepFooter
          currentStep={3}
          hintText="You can change these settings later."
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
          onSkip={() => {
            setCompetitors((prev) => prev.map((c) => ({ ...c, selected: false })));
            setStep(4);
          }}
        />
      )}

      {step === 4 && (
        <StepFooter
          currentStep={4}
          nextLabel="Start Analysis"
          isSubmitting={isSubmitting}
          hintText="You can change these settings later."
          onBack={() => setStep(3)}
          onNext={handleStartAnalysis}
        />
      )}

      {/* Final Analysis Start Progress Modal */}
      <AnalysisStartModal
        isOpen={showStartModal}
        onFinished={handleStartModalFinished}
      />
    </div>
  );
}
