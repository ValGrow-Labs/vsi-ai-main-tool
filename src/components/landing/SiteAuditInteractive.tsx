"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  TrendingUp,
  Cpu,
  FileCode,
  Bot,
  ExternalLink,
} from "lucide-react";
import { VSI_COLORS } from "./tokens";

interface AuditIssue {
  id: string;
  title: string;
  category: string;
  severity: "critical" | "warning";
  explanation: string;
  recommendedFix: string;
  impactScore: number;
  fixed: boolean;
  expanded?: boolean;
}

const INITIAL_ISSUES: AuditIssue[] = [
  {
    id: "iss-1",
    title: "Render-blocking JavaScript inflating Largest Contentful Paint (LCP)",
    category: "Performance / Core Web Vitals",
    severity: "critical",
    explanation:
      "2 third-party script tags block main thread hydration by 2,140ms on mobile. This degrades Google mobile ranking score and prevents real-time crawler indexing.",
    recommendedFix:
      "Add defer/async attributes or dynamically load analytics scripts via Next.js Script strategy='lazyOnload'.",
    impactScore: 16,
    fixed: false,
  },
  {
    id: "iss-2",
    title: "Missing structured Article & Organization JSON-LD Schema",
    category: "Knowledge Graph / GEO",
    severity: "warning",
    explanation:
      "Pages lack canonical Entity markup. Generative AI engines (Perplexity, ChatGPT) require valid JSON-LD schemas to cite authoritativeness in search answers.",
    recommendedFix:
      "Inject schema.org/SoftwareApplication and schema.org/Organization metadata into the <head> of primary templates.",
    impactScore: 8,
    fixed: false,
  },
  {
    id: "iss-3",
    title: "Robots.txt restricts AI search crawlers (GPTBot, PerplexityBot)",
    category: "Crawlability & AI Indexing",
    severity: "warning",
    explanation:
      "Disallow rules accidentally match AI indexing agents, preventing your updated content from appearing in ChatGPT Search and Perplexity queries.",
    recommendedFix:
      "Explicitly allow User-agent: GPTBot and User-agent: PerplexityBot in robots.txt for public docs and product pages.",
    impactScore: 4,
    fixed: false,
  },
];

export function SiteAuditInteractive() {
  const [issues, setIssues] = useState<AuditIssue[]>(INITIAL_ISSUES);
  const [expandedId, setExpandedId] = useState<string | null>("iss-1");
  const [isAuditing, setIsAuditing] = useState(false);

  // Calculate scores based on resolved state
  const baseScore = 68;
  const addedScore = issues.reduce(
    (sum, iss) => (iss.fixed ? sum + iss.impactScore : sum),
    0
  );
  const currentScore = Math.min(100, baseScore + addedScore);

  const criticalCount = issues.filter(
    (i) => !i.fixed && i.severity === "critical"
  ).length;
  const warningCount = issues.filter(
    (i) => !i.fixed && i.severity === "warning"
  ).length;
  const passingCount = 39 + issues.filter((i) => i.fixed).length;

  const toggleFix = (id: string) => {
    setIssues((prev) =>
      prev.map((iss) => (iss.id === id ? { ...iss, fixed: !iss.fixed } : iss))
    );
  };

  const handleRunAudit = () => {
    setIsAuditing(true);
    setTimeout(() => {
      setIsAuditing(false);
    }, 800);
  };

  const resetIssues = () => {
    setIssues(INITIAL_ISSUES);
  };

  // SVG circular arc math for health score
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    circumference - (currentScore / 100) * circumference;

  return (
    <div className="w-full bg-[#FFFFFF] rounded-2xl border border-[#E5E7EB] shadow-xs overflow-hidden">
      {/* Reference A Header */}
      <div className="px-6 py-5 border-b border-[#EEF0F2] bg-[#FAF8F5]/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#8B6818]" />
            <span className="text-[11px] font-semibold tracking-wider uppercase text-[#8B6818]">
              Interactive Diagnoser 03
            </span>
          </div>
          <h3 className="text-xl font-bold tracking-tight text-[#202124] mt-1">
            Site Audit & Technical Health Engine
          </h3>
          <p className="text-sm text-[#6B7280] mt-0.5">
            Find problems that could be hurting your website, and simulate how fixing each one transforms your score.
          </p>
        </div>

        {/* Audit Meta & Action */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right hidden sm:block">
            <span className="text-xs font-semibold text-[#202124] block">
              acmecloud-infra.io
            </span>
            <span className="text-[11px] text-[#6B7280]">
              248 pages checked · Just now
            </span>
          </div>
          <button
            type="button"
            onClick={handleRunAudit}
            disabled={isAuditing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#8B6818] text-white text-xs font-semibold hover:bg-[#8B6818]/90 transition-all shadow-xs disabled:opacity-70 cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isAuditing ? "animate-spin" : ""}`}
            />
            <span>{isAuditing ? "Auditing..." : "Run Again"}</span>
          </button>
        </div>
      </div>

      {/* Reference A Summary Panel */}
      <div className="p-4 sm:p-6 bg-[#FAF8F5]/30 border-b border-[#EEF0F2] grid grid-cols-1 md:grid-cols-12 gap-5 sm:gap-6 items-center">
        {/* Left: Health Score Circle & Interpretation (col-span-5) */}
        <div className="md:col-span-5 flex flex-col sm:flex-row items-center gap-4 sm:gap-5 p-4 rounded-xl bg-white border border-[#E5E7EB] shadow-xs text-center sm:text-left">
          <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
              <circle
                cx="60"
                cy="60"
                r={radius}
                className="stroke-[#EEF0F2]"
                strokeWidth="10"
                fill="none"
              />
              <motion.circle
                cx="60"
                cy="60"
                r={radius}
                stroke={currentScore >= 90 ? "#16805D" : currentScore >= 75 ? "#B7791F" : "#C2413B"}
                strokeWidth="10"
                strokeDasharray={circumference}
                animate={{ strokeDashoffset }}
                transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-extrabold tracking-tight text-[#202124] tabular-nums">
                {currentScore}
              </span>
              <span className="text-[10px] font-semibold text-[#6B7280] uppercase tracking-wider">
                out of 100
              </span>
            </div>
          </div>

          <div>
            <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider block">
              Website Health Score
            </span>
            <p className="text-sm font-bold text-[#202124] mt-1">
              {currentScore >= 90
                ? "Excellent Technical Standing"
                : currentScore >= 75
                ? "Moderate Issues Found"
                : "Critical Technical Debt"}
            </p>
            <p className="text-xs text-[#6B7280] mt-1 leading-relaxed">
              {currentScore >= 90
                ? "All critical search ranking & AI citation bottlenecks resolved."
                : "Resolving highlighted issues restores lost search indexing speed."}
            </p>
          </div>
        </div>

        {/* Right: Metrics Counters & Simulation Trigger (col-span-7) */}
        <div className="md:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Critical Issues */}
          <div className="p-4 rounded-xl bg-white border border-[#E5E7EB] shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#6B7280]">Critical</span>
              <XCircle className="w-4 h-4 text-[#C2413B]" />
            </div>
            <div className="mt-2 text-2xl font-bold text-[#C2413B] tabular-nums">
              {criticalCount}
            </div>
            <span className="text-[11px] text-[#6B7280] mt-0.5 block">
              {criticalCount === 0 ? "Zero critical" : "Needs immediate fix"}
            </span>
          </div>

          {/* Warnings */}
          <div className="p-4 rounded-xl bg-white border border-[#E5E7EB] shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#6B7280]">Warnings</span>
              <AlertTriangle className="w-4 h-4 text-[#B7791F]" />
            </div>
            <div className="mt-2 text-2xl font-bold text-[#B7791F] tabular-nums">
              {warningCount}
            </div>
            <span className="text-[11px] text-[#6B7280] mt-0.5 block">
              {warningCount === 0 ? "All clear" : "SEO opportunities"}
            </span>
          </div>

          {/* Passing Checks */}
          <div className="p-4 rounded-xl bg-white border border-[#E5E7EB] shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#6B7280]">Passing</span>
              <CheckCircle2 className="w-4 h-4 text-[#16805D]" />
            </div>
            <div className="mt-2 text-2xl font-bold text-[#16805D] tabular-nums">
              {passingCount}
            </div>
            <span className="text-[11px] text-[#6B7280] mt-0.5 block">
              Verified checks
            </span>
          </div>
        </div>
      </div>

      {/* Issues Section: "What needs attention" */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-base font-bold text-[#202124]">
              What needs attention
            </h4>
            <p className="text-xs text-[#6B7280]">
              Click &ldquo;Simulate Fix&rdquo; on any issue below to see real-time score recovery and algorithmic impact.
            </p>
          </div>

          {issues.some((i) => i.fixed) && (
            <button
              type="button"
              onClick={resetIssues}
              className="text-xs font-semibold text-[#8B6818] hover:underline"
            >
              Reset Simulation
            </button>
          )}
        </div>

        {/* Minimal Table/List with Subtle Separators */}
        <div className="border border-[#E5E7EB] rounded-xl overflow-hidden divide-y divide-[#EEF0F2]">
          {issues.map((issue) => {
            const isExpanded = expandedId === issue.id;
            return (
              <div
                key={issue.id}
                className={`transition-colors ${
                  issue.fixed
                    ? "bg-[#16805D]/5"
                    : isExpanded
                    ? "bg-[#FBF8F0]/30"
                    : "bg-white hover:bg-[#F4F5F7]/50"
                }`}
              >
                {/* Main Issue Row */}
                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1">
                    <span className="mt-0.5 shrink-0">
                      {issue.fixed ? (
                        <CheckCircle2 className="w-5 h-5 text-[#16805D]" />
                      ) : issue.severity === "critical" ? (
                        <XCircle className="w-5 h-5 text-[#C2413B]" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-[#B7791F]" />
                      )}
                    </span>

                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-sm font-semibold ${
                            issue.fixed
                              ? "text-[#16805D] line-through opacity-80"
                              : "text-[#202124]"
                          }`}
                        >
                          {issue.title}
                        </span>
                        <span className="text-[11px] px-2 py-0.5 rounded-sm bg-[#F4F5F7] text-[#6B7280] border border-[#E5E7EB]">
                          {issue.category}
                        </span>
                        {issue.fixed && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#16805D]/10 text-[#16805D] font-semibold">
                            +{issue.impactScore} pts recovered
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#6B7280] mt-1 leading-relaxed">
                        {issue.explanation}
                      </p>
                    </div>
                  </div>

                  {/* Actions Right */}
                  <div className="flex items-center gap-2.5 self-end sm:self-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleFix(issue.id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                        issue.fixed
                          ? "bg-[#16805D] text-white hover:bg-[#16805D]/90"
                          : "bg-[#8B6818] text-white hover:bg-[#8B6818]/90 shadow-xs"
                      }`}
                    >
                      {issue.fixed ? "Fixed ✓" : "Simulate Fix"}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(isExpanded ? null : issue.id)
                      }
                      className="p-1.5 rounded-md text-[#6B7280] hover:bg-[#EEF0F2]"
                      aria-label="Toggle details"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expanded Details Panel */}
                {isExpanded && (
                  <div className="px-6 py-4 bg-[#FFFFFF] border-t border-[#EEF0F2] text-xs space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="font-semibold text-[#8B6818] uppercase tracking-wider shrink-0 mt-0.5">
                        Recommended Fix:
                      </span>
                      <p className="text-[#202124] leading-relaxed">
                        {issue.recommendedFix}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 text-[11px] text-[#6B7280] pt-1">
                      <span>Category: {issue.category}</span>
                      <span>·</span>
                      <span>Algorithm Target: Google Core Vitals & AI Knowledge Graph</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Projected Impact Footer Bar */}
        <div className="mt-4 p-4 rounded-xl bg-[#F8F5ED] border border-[#C6AD70]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-[#8B6818] text-white flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4" />
            </span>
            <div>
              <span className="font-bold text-[#202124] block">
                Projected Organic & Generative Impact
              </span>
              <span className="text-[#6B7280]">
                Fixing these 3 bottlenecks projects +38% organic impression lift and primary Perplexity source citations.
              </span>
            </div>
          </div>

          <span className="font-mono font-semibold text-[#8B6818] shrink-0">
            Calculated in real-time
          </span>
        </div>
      </div>
    </div>
  );
}

