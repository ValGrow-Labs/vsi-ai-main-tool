"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  RotateCcw,
  ArrowLeft,
  Search,
  Shield,
  Globe,
  Brain,
} from "lucide-react";
import { motion } from "framer-motion";

interface StageStatusMap {
  website_analysis: "pending" | "in_progress" | "completed" | "failed" | "unconfigured";
  seo_analysis: "pending" | "in_progress" | "completed" | "failed" | "unconfigured";
  competitor_analysis: "pending" | "in_progress" | "completed" | "failed" | "unconfigured";
  geo_analysis: "pending" | "in_progress" | "completed" | "failed" | "unconfigured";
  results_prep: "pending" | "in_progress" | "completed" | "failed" | "unconfigured";
}

interface AnalysisJobState {
  id: string;
  client_id: string;
  status: "in_progress" | "completed" | "failed";
  stage: string;
  stage_statuses: StageStatusMap;
  error_message: string | null;
  stages_data: Record<string, any>;
}

const STAGE_CONFIGS = [
  { key: "website_analysis", label: "Website analysis", icon: Globe },
  { key: "seo_analysis", label: "SEO / Search Visibility analysis", icon: Search },
  { key: "competitor_analysis", label: "Competitor analysis", icon: Shield },
  { key: "geo_analysis", label: "GEO / AI Visibility analysis", icon: Brain },
  { key: "results_prep", label: "Results preparation", icon: Sparkles },
] as const;

export default function AnalysisProgressPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const clientId = resolvedParams.id;
  const router = useRouter();

  const [job, setJob] = useState<AnalysisJobState | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Poll job status from API */
  async function checkJobStatus() {
    try {
      const res = await fetch(`/api/jobs/analysis?client_id=${clientId}`);
      if (!res.ok) {
        // If no job was created yet, start one now
        if (res.status === 404 && !job) {
          const startRes = await fetch("/api/jobs/analysis", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ client_id: clientId }),
          });
          if (startRes.ok) {
            const retryPoll = await fetch(`/api/jobs/analysis?client_id=${clientId}`);
            if (retryPoll.ok) {
              const retryData = await retryPoll.json();
              if (retryData.job) {
                setJob(retryData.job);
                setError(null);
                return;
              }
            }
          }
        }
        throw new Error("Unable to load analysis status.");
      }
      const data = await res.json();
      if (data.job) {
        setJob(data.job);
        setError(null);
      }
    } catch (err) {
      if (!job) {
        setError(err instanceof Error ? err.message : "Network error");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void checkJobStatus();
    if (job?.status === "completed") return;
    const interval = setInterval(() => {
      void checkJobStatus();
    }, 1800);
    return () => clearInterval(interval);
  }, [clientId, job?.status]);


  /** Retry failed job */
  async function handleRetry() {
    setRetrying(true);
    try {
      const res = await fetch("/api/jobs/analysis", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, job_id: job?.id }),
      });
      if (!res.ok) {
        throw new Error("Unable to restart analysis.");
      }
      await checkJobStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRetrying(false);
    }
  }

  if (loading && !job) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="flex flex-col items-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
          <p className="text-body font-medium text-ink-2">Loading analysis progress...</p>
        </div>
      </div>
    );
  }

  const isCompleted = job?.status === "completed" || job?.stage === "completed";
  const stageStatuses = job?.stage_statuses || {
    website_analysis: "in_progress",
    seo_analysis: "pending",
    competitor_analysis: "pending",
    geo_analysis: "pending",
    results_prep: "pending",
  };
  const hasAnyFailed = Object.values(stageStatuses).some((s) => s === "failed");
  const isFailed = job?.status === "failed" || hasAnyFailed;

  return (
    <div className="mx-auto w-full max-w-[720px] animate-fade-in space-y-8 px-4 py-10 md:py-16">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-strong ring-8 ring-brand-soft/40">
          <Sparkles className={`h-7 w-7 text-brand ${!isCompleted ? "animate-pulse" : ""}`} />
        </div>

        {isCompleted ? (
          <>
            <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Analysis complete
            </h1>
            <p className="text-base text-ink-2 max-w-[500px] mx-auto">
              Your website has been analyzed across search engines and AI engines.
            </p>
          </>
        ) : isFailed ? (
          <>
            <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Analysis couldn&apos;t be completed
            </h1>
            <p className="text-base text-critical max-w-[550px] mx-auto font-medium">
              {job?.error_message || (job?.stages_data as any)?.website_analysis?.error || "One or more analysis modules encountered an issue."}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
              Analyzing your website
            </h1>
            <p className="text-base text-ink-2 max-w-[500px] mx-auto">
              We&apos;re checking how your business appears across search and AI.
            </p>
          </>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-critical-soft bg-critical-soft/60 p-4 text-support text-critical">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Stages Card Checklist */}
      <div className="rounded-panel border border-line bg-surface p-6 shadow-panel space-y-4">
        {STAGE_CONFIGS.map((cfg) => {
          const status = stageStatuses[cfg.key] || "pending";
          const isDone = status === "completed";
          const isUnconfigured = status === "unconfigured";
          const isRunning = status === "in_progress";
          const isStageFailed = status === "failed";
          const stageSpecificError = (job?.stages_data as any)?.[cfg.key]?.error;
          const Icon = cfg.icon;

          return (
            <motion.div
              key={cfg.key}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex items-center justify-between gap-4 rounded-xl border p-4 transition-all ${
                isDone
                  ? "border-positive/30 bg-positive-soft/40"
                  : isRunning
                  ? "border-brand-light bg-brand-soft/50"
                  : isStageFailed
                  ? "border-critical/30 bg-critical-soft/50"
                  : isUnconfigured
                  ? "border-line bg-surface-2/60"
                  : "border-line bg-surface-2/30"
              }`}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                    isDone
                      ? "bg-positive/20 text-positive"
                      : isRunning
                      ? "bg-brand/20 text-brand-strong"
                      : isStageFailed
                      ? "bg-critical/20 text-critical"
                      : "bg-surface-2 text-ink-3"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className={`text-body font-semibold ${isDone || isRunning ? "text-ink" : "text-ink-2"}`}>
                    {cfg.label}
                  </p>
                  {isUnconfigured && (
                    <p className="text-caption text-ink-3">Analysis provider not configured (Data unavailable)</p>
                  )}
                  {isStageFailed && (
                    <p className="text-caption text-critical">
                      {stageSpecificError || "Module unavailable — retry below"}
                    </p>
                  )}
                </div>
              </div>

              {/* Status Badge / Icon */}
              <div className="shrink-0">
                {isDone ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-positive-soft px-3 py-1 text-caption font-semibold text-positive">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Completed</span>
                  </span>
                ) : isRunning ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-caption font-semibold text-brand-strong">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>In progress...</span>
                  </span>
                ) : isStageFailed ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-critical-soft px-3 py-1 text-caption font-semibold text-critical">
                    <AlertCircle className="h-4 w-4" />
                    <span>Failed</span>
                  </span>
                ) : isUnconfigured ? (
                  <span className="rounded-full bg-surface-2 px-3 py-1 text-caption font-semibold text-ink-3">
                    Data unavailable
                  </span>
                ) : (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-line-strong" />
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
        {isCompleted ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push(`/dashboard/clients/${clientId}`)}
              className="flex h-12 items-center gap-2 rounded-xl bg-brand-strong px-8 text-body font-semibold text-white shadow-md transition-all hover:bg-brand active:scale-[0.99]"
            >
              <span>View Results</span>
              <ArrowRight className="h-5 w-5" />
            </button>
            {hasAnyFailed && (
              <button
                type="button"
                onClick={handleRetry}
                disabled={retrying}
                className="flex h-12 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-body font-medium text-ink hover:bg-surface-2 disabled:opacity-50"
              >
                <RotateCcw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
                <span>Retry Analysis</span>
              </button>
            )}
          </div>
        ) : isFailed ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying}
              className="flex h-11 items-center gap-2 rounded-xl bg-brand-strong px-6 text-body font-semibold text-white shadow-sm hover:bg-brand disabled:opacity-50"
            >
              <RotateCcw className={`h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
              <span>Retry Analysis</span>
            </button>
            <button
              type="button"
              onClick={() => router.push(`/dashboard/clients/${clientId}`)}
              className="flex h-11 items-center gap-2 rounded-xl border border-line bg-surface px-5 text-body font-medium text-ink hover:bg-surface-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Project</span>
            </button>
          </div>
        ) : (
          <p className="text-caption font-medium text-ink-3">
            Please keep this page open while VSI completes your initial analysis...
          </p>
        )}
      </div>
    </div>
  );
}
