"use client";

import React from "react";
import {
  ShieldCheck,
  Search,
  Bot,
  Users,
  ListChecks,
  FileText,
  BarChart2,
  TrendingUp,
  ArrowRight,
  Sparkles,
  Layers,
  CheckCircle2,
} from "lucide-react";
import { VSI_COLORS } from "./tokens";

export function BentoFeatures() {
  return (
    <div className="w-full space-y-6">
      {/* Grid of 4 Core Pillars */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Bento 1: Generative Engine Optimization (GEO) (md:col-span-7) */}
        <div className="md:col-span-7 bg-[#FFFFFF] rounded-2xl border border-[#E5E7EB] p-6 sm:p-8 flex flex-col justify-between shadow-xs relative overflow-hidden group hover:border-[#8B6818]/40 transition-colors">
          <div>
            <div className="flex items-center justify-between">
              <span className="w-10 h-10 rounded-xl bg-[#F8F5ED] border border-[#C6AD70]/40 flex items-center justify-center text-[#8B6818]">
                <Bot className="w-5 h-5" />
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#F8F5ED] text-[#8B6818] border border-[#C6AD70]/40">
                Next-Gen Search
              </span>
            </div>

            <h3 className="text-xl sm:text-2xl font-bold text-[#202124] tracking-tight mt-5">
              Generative Engine Optimization (GEO)
            </h3>
            <p className="text-sm text-[#6B7280] mt-2 leading-relaxed max-w-[55ch]">
              Over 35% of high-intent purchase searches now resolve inside AI answers. Track your brand citations and entity authoritativeness across Perplexity, ChatGPT Search, Claude, and Google AI Overviews.
            </p>
          </div>

          {/* Mini Interactive Preview Graphic */}
          <div className="mt-6 p-4 rounded-xl bg-[#FAF8F5] border border-[#EEF0F2] space-y-2.5">
            <div className="flex items-center justify-between text-xs text-[#202124] font-semibold">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#8B6818]" />
                Perplexity Pro Engine Synthesis
              </span>
              <span className="text-[#16805D] font-mono">Rank #1 Citation</span>
            </div>
            <div className="text-xs text-[#6B7280] bg-white p-2.5 rounded-lg border border-[#E5E7EB] leading-relaxed">
              &ldquo;...VSI identified <strong className="text-[#202124]">Acme Cloud</strong> as the leading zero-trust enterprise infrastructure provider with 99.99% uptime.&rdquo;
            </div>
            <div className="flex items-center justify-between text-[11px] text-[#6B7280] pt-1">
              <span>Citation Confidence: 96%</span>
              <span className="text-[#8B6818] font-medium">+24% share this month</span>
            </div>
          </div>
        </div>

        {/* Bento 2: Technical Site Audit & Crawl (md:col-span-5) */}
        <div className="md:col-span-5 bg-[#FFFFFF] rounded-2xl border border-[#E5E7EB] p-6 sm:p-8 flex flex-col justify-between shadow-xs group hover:border-[#8B6818]/40 transition-colors">
          <div>
            <div className="flex items-center justify-between">
              <span className="w-10 h-10 rounded-xl bg-[#F8F5ED] border border-[#C6AD70]/40 flex items-center justify-center text-[#8B6818]">
                <ShieldCheck className="w-5 h-5" />
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#16805D]/10 text-[#16805D]">
                Health 94/100
              </span>
            </div>

            <h3 className="text-xl sm:text-2xl font-bold text-[#202124] tracking-tight mt-5">
              Deep Technical Site Auditing
            </h3>
            <p className="text-sm text-[#6B7280] mt-2 leading-relaxed">
              Scan hundreds of pages for broken redirect chains, missing canonicals, Core Web Vitals latency, and AI crawler blocking rules.
            </p>
          </div>

          <div className="mt-6 space-y-2">
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#FAF8F5] text-xs">
              <span className="text-[#202124] font-medium">Core Web Vitals (LCP / CLS)</span>
              <span className="text-[#16805D] font-semibold">Passing (1.1s)</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#FAF8F5] text-xs">
              <span className="text-[#202124] font-medium">Canonical Hierarchy</span>
              <span className="text-[#16805D] font-semibold">100% Valid</span>
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#FAF8F5] text-xs">
              <span className="text-[#202124] font-medium">Robots.txt AI Directives</span>
              <span className="text-[#16805D] font-semibold">Optimized</span>
            </div>
          </div>
        </div>

        {/* Bento 3: Competitor Benchmarking (md:col-span-5) */}
        <div className="md:col-span-5 bg-[#FFFFFF] rounded-2xl border border-[#E5E7EB] p-6 sm:p-8 flex flex-col justify-between shadow-xs group hover:border-[#8B6818]/40 transition-colors">
          <div>
            <div className="flex items-center justify-between">
              <span className="w-10 h-10 rounded-xl bg-[#F8F5ED] border border-[#C6AD70]/40 flex items-center justify-center text-[#8B6818]">
                <Users className="w-5 h-5" />
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#3567A8]/10 text-[#3567A8]">
                Head-to-Head
              </span>
            </div>

            <h3 className="text-xl sm:text-2xl font-bold text-[#202124] tracking-tight mt-5">
              Competitor Share of Voice
            </h3>
            <p className="text-sm text-[#6B7280] mt-2 leading-relaxed">
              Directly benchmark keyword positions, backlink velocity, and AI engine citation share against your top 5 market competitors.
            </p>
          </div>

          <div className="mt-6 p-4 rounded-xl bg-[#FAF8F5] border border-[#EEF0F2] space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-[#202124]">Your Domain (Acme)</span>
                <span className="font-mono text-[#8B6818] font-bold">58% Share</span>
              </div>
              <div className="w-full bg-[#EEF0F2] h-2 rounded-full overflow-hidden">
                <div className="bg-[#8B6818] h-full rounded-full" style={{ width: "58%" }} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-[#6B7280]">Competitor A (Legacy)</span>
                <span className="font-mono text-[#6B7280]">26% Share</span>
              </div>
              <div className="w-full bg-[#EEF0F2] h-2 rounded-full overflow-hidden">
                <div className="bg-[#9CA3AF] h-full rounded-full" style={{ width: "26%" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Bento 4: Prioritized Next Actions & Developer Fixes (md:col-span-7) */}
        <div className="md:col-span-7 bg-[#FFFFFF] rounded-2xl border border-[#E5E7EB] p-6 sm:p-8 flex flex-col justify-between shadow-xs group hover:border-[#8B6818]/40 transition-colors">
          <div>
            <div className="flex items-center justify-between">
              <span className="w-10 h-10 rounded-xl bg-[#F8F5ED] border border-[#C6AD70]/40 flex items-center justify-center text-[#8B6818]">
                <ListChecks className="w-5 h-5" />
              </span>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-[#8B6818] text-white">
                Zero Fluff
              </span>
            </div>

            <h3 className="text-xl sm:text-2xl font-bold text-[#202124] tracking-tight mt-5">
              Prioritized Action Engine & Developer Fixes
            </h3>
            <p className="text-sm text-[#6B7280] mt-2 leading-relaxed max-w-[55ch]">
              VSI doesn&apos;t just dump raw data on you. It translates complex crawler telemetry into ranked, actionable tasks with exact code snippets, impact estimates, and verifiable results.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#EEF0F2] flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#16805D] shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-semibold text-[#202124] block">
                  Step-by-Step Code Guides
                </span>
                <span className="text-[11px] text-[#6B7280]">
                  Ready-to-paste Next.js, WordPress, and Shopify code snippets.
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#EEF0F2] flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#16805D] shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-semibold text-[#202124] block">
                  Instant Report Generation
                </span>
                <span className="text-[11px] text-[#6B7280]">
                  Shareable client and executive audit links with token security.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

