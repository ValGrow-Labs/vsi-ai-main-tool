"use client";

import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepFooterProps {
  currentStep: number;
  totalSteps?: number;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  isSubmitting?: boolean;
  canContinue?: boolean;
  hintText?: string;
  className?: string;
}

export function StepFooter({
  currentStep,
  totalSteps = 4,
  onBack,
  onNext,
  nextLabel,
  isSubmitting = false,
  canContinue = true,
  hintText = "You can change these settings later.",
  className,
}: StepFooterProps) {
  const isLastStep = currentStep === totalSteps;
  const defaultLabel = isLastStep ? "Start Analysis" : "Continue";
  const label = nextLabel || defaultLabel;

  return (
    <div
      className={cn(
        "sticky bottom-0 z-30 w-full border-t border-line bg-surface/95 px-4 py-4 backdrop-blur-md sm:px-6 lg:px-8",
        className
      )}
    >
      <div className="mx-auto flex w-full max-w-[1040px] items-center justify-between gap-4">
        {/* Left: Back button, hint & step counter */}
        <div className="flex items-center gap-3 sm:gap-4">
          {currentStep > 1 ? (
            <button
              type="button"
              onClick={onBack}
              disabled={isSubmitting}
              className="flex h-10 items-center gap-2 rounded-control border border-line bg-surface px-4 text-support font-medium text-ink transition-colors hover:bg-surface-2 disabled:opacity-50 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </button>
          ) : (
            <div />
          )}

          <div className="hidden sm:flex items-center gap-3">
            <span className="font-mono text-caption font-semibold text-ink-3">
              Step {currentStep} of {totalSteps}
            </span>
            <span className="text-caption text-ink-3">•</span>
            <span className="text-caption text-ink-2">{hintText}</span>
          </div>
        </div>

        {/* Right: Continue / Start Analysis button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onNext}
            disabled={isSubmitting || !canContinue}
            className={`flex h-11 items-center justify-center gap-2 rounded-xl px-6 text-body font-semibold text-white shadow-sm transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer ${
              isLastStep
                ? "bg-brand-strong hover:bg-brand text-white font-semibold shadow-md"
                : "bg-ink hover:bg-ink-2"
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Setting up project...</span>
              </>
            ) : isLastStep ? (
              <>
                <span>{label}</span>
              </>
            ) : (
              <>
                <span>{label}</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
