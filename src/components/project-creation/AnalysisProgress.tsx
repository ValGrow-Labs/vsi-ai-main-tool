"use client";

import { CheckCircle2, Loader2, Sparkles, ArrowRight, RotateCw, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";

interface AnalysisProgressProps {
  currentStep: number; // 1: Analyzing Business, 2: Generating Summary, 3: Finding Topics, 4: Done
  stepDetail?: string;
  isCompleted: boolean;
  onContinue: () => void;
  error?: string | null;
  onRetry?: () => void;
}

const STEPS = [
  {
    step: 1,
    title: "Analyzing Business",
    desc: "Fetching website pages, headings, and business signals",
  },
  {
    step: 2,
    title: "Generating Summary",
    desc: "Extracting company identity, edge, and target audience",
  },
  {
    step: 3,
    title: "Finding Topics",
    desc: "Discovering high-relevance search topics and queries",
  },
];

export function AnalysisProgress({
  currentStep,
  stepDetail,
  isCompleted,
  onContinue,
  error,
  onRetry,
}: AnalysisProgressProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mx-auto my-8 w-full max-w-[560px] rounded-2xl border border-line bg-surface p-8 shadow-overlay"
    >
      <div className="flex flex-col items-center text-center">
        {/* Header Icon */}
        <div className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-soft text-brand-strong">
          {error ? (
            <AlertTriangle className="h-8 w-8 text-critical" />
          ) : isCompleted ? (
            <CheckCircle2 className="h-8 w-8 text-positive" />
          ) : (
            <Sparkles className="h-8 w-8 animate-pulse text-brand" />
          )}
          {!isCompleted && !error && (
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
              <span className="relative inline-flex h-4 w-4 rounded-full bg-brand" />
            </span>
          )}
        </div>

        <h2 className="text-2xl font-bold text-ink">
          {error
            ? "Analysis could not be completed"
            : isCompleted
            ? "Business summary ready!"
            : "Generating business summary"}
        </h2>
        <p className="mt-2 text-support text-ink-2 max-w-[42ch]">
          {error
            ? error
            : isCompleted
            ? "We've gathered insights about your business. Review and customize them in the next step."
            : stepDetail || "Our AI is reading your website structure and market focus."}
        </p>

        {/* 3-Step Progress Tracker */}
        <div className="mt-8 w-full space-y-3.5 text-left">
          {STEPS.map((s) => {
            const isDone = isCompleted || currentStep > s.step;
            const isCurrent = !isCompleted && currentStep === s.step;

            return (
              <motion.div
                key={s.step}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: s.step * 0.1 }}
                className={`flex items-start gap-3.5 rounded-xl border p-4 transition-all ${
                  isCurrent
                    ? "border-brand-strong/40 bg-brand-soft/40 shadow-2xs"
                    : isDone
                    ? "border-line bg-surface-2/40"
                    : "border-line/50 bg-surface/40 opacity-60"
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {isDone ? (
                    <CheckCircle2 className="h-5 w-5 text-positive" />
                  ) : isCurrent ? (
                    <Loader2 className="h-5 w-5 animate-spin text-brand" />
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-line-strong text-caption text-ink-3 flex items-center justify-center font-medium">
                      {s.step}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-body font-semibold ${
                        isDone || isCurrent ? "text-ink" : "text-ink-3"
                      }`}
                    >
                      {s.title}
                    </span>
                    {isCurrent && (
                      <span className="text-caption font-medium text-brand-strong uppercase tracking-wide">
                        In progress
                      </span>
                    )}
                    {isDone && (
                      <span className="text-caption font-medium text-positive">Done</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-caption text-ink-2">{s.desc}</p>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Action Controls */}
        <div className="mt-8 w-full">
          {error ? (
            <div className="flex gap-3">
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="flex-1 flex items-center justify-center gap-2 rounded-control bg-ink px-4 py-3 text-body font-semibold text-white hover:bg-ink-2 transition-all shadow-sm"
                >
                  <RotateCw className="h-4 w-4" />
                  <span>Try again</span>
                </button>
              )}
              <button
                type="button"
                onClick={onContinue}
                className="flex-1 rounded-control border border-line bg-surface px-4 py-3 text-body font-semibold text-ink hover:bg-surface-2 transition-all"
              >
                Enter manually
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={!isCompleted}
              onClick={onContinue}
              className={`w-full flex items-center justify-center gap-2 rounded-control px-6 py-3.5 text-body font-semibold transition-all ${
                isCompleted
                  ? "bg-ink text-white hover:bg-ink-2 shadow-md cursor-pointer"
                  : "bg-surface-3 text-ink-3 border border-line cursor-not-allowed opacity-60"
              }`}
            >
              <span>Continue to Business Summary</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
