"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ShieldCheck,
  Search,
  Bot,
  TrendingUp,
  CheckCircle2,
  Sparkles,
  Layers,
  Globe,
  BarChart3,
  Check,
} from "lucide-react";
import { LandingNav } from "./LandingNav";
import { HeroFold } from "./HeroFold";
import { Hero3DCard } from "./Hero3DCard";
import { WorkspaceTabs, type WorkspaceTabId } from "./WorkspaceTabs";
import { SearchVsGeoSimulator } from "./SearchVsGeoSimulator";
import { SiteAuditInteractive } from "./SiteAuditInteractive";
import { BentoFeatures } from "./BentoFeatures";
import { PricingComparison } from "./PricingComparison";
import { CallToAction } from "./CallToAction";
import { LandingFooter } from "./LandingFooter";
import { VSI_COLORS } from "./tokens";

export function LandingPage() {
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTabId>("site-audit");

  return (
    <div className="min-h-screen bg-[#FFFFFF] text-[#202124] antialiased selection:bg-[#F8F5ED] selection:text-[#8B6818] overflow-x-clip w-full">
      {/* ===================================================================== */}
      {/* 1. Navigation Bar (Sticky, White, Minimal typography, Gold CTA)       */}
      {/* ===================================================================== */}
      <LandingNav />

      {/* Main Page Content */}
      <main className="pt-16 sm:pt-18 pb-12 sm:pb-16 w-full overflow-x-clip">
        {/* ===================================================================== */}
        {/* 2. Hero Section First Fold (Headline, Search Bar, AI Platform Icons)  */}
        {/* ===================================================================== */}
        <HeroFold />

        {/* ===================================================================== */}
        {/* 3D Intelligence Card Preview with Interactive Sliding Line Tabs       */}
        {/* ===================================================================== */}
        <section id="overview" className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-20 sm:pb-28 scroll-mt-24">
          <div className="flex flex-col items-center text-center max-w-3xl mx-auto mb-6">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8B6818] bg-[#F8F5ED] px-3.5 py-1 rounded-full border border-[#C6AD70]/40 mb-2.5">
              Live Workspace Telemetry
            </span>
            <h2 className="text-xl sm:text-3xl font-bold tracking-tight text-[#202124]">
              Unified Search & Generative AI Dashboard
            </h2>
            <p className="text-xs sm:text-sm text-[#6B7280] mt-1">
              Select a module below to inspect real-time technical health, keyword rankings, and AI presence.
            </p>
          </div>

          {/* Interactive animated tab bar with moving gold line (Video Style) */}
          <WorkspaceTabs
            activeTab={activeWorkspaceTab}
            onTabChange={setActiveWorkspaceTab}
          />

          {/* 3D Workspace Preview Card */}
          <Hero3DCard activeTab={activeWorkspaceTab} />
        </section>

        {/* Subsequent Platform Sections with Subtle Contrast Transition */}
        <div className="space-y-20 sm:space-y-28 lg:space-y-36 bg-[#F4F5F7]/50 pt-16 sm:pt-20 border-t border-[#E5E7EB]/80">
          {/* ===================================================================== */}
          {/* Multi-Engine Search vs GEO Radar Simulator                            */}
          {/* ===================================================================== */}
          <section id="radar-simulator" className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 scroll-mt-24">
            <div className="text-center max-w-3xl mx-auto mb-10">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFFFFF] border border-[#E5E7EB] text-xs font-semibold text-[#8B6818] mb-3">
                <Bot className="w-3.5 h-3.5" />
                <span>Multi-Engine Real-Time Telemetry</span>
              </div>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-[#202124] tracking-tight">
                Traditional SEO Alone Is No Longer Enough
              </h2>
              <p className="mt-3 text-sm sm:text-base text-[#6B7280] leading-relaxed">
                Modern buyers consult conversational AI engines before clicking web links. VSI synchronizes your traditional Google ranking telemetry with Generative Engine Optimization (GEO).
              </p>
            </div>

            <SearchVsGeoSimulator />
          </section>

          {/* ===================================================================== */}
          {/* Site Audit Diagnoser & Transformation Engine                          */}
          {/* ===================================================================== */}
          <section id="site-audit" className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 scroll-mt-24">
            <div className="text-center max-w-3xl mx-auto mb-10">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFFFFF] border border-[#E5E7EB] text-xs font-semibold text-[#8B6818] mb-3">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Technical Health Engine</span>
              </div>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-[#202124] tracking-tight">
                Algorithmic Site Auditing With Zero Guesswork
              </h2>
              <p className="mt-3 text-sm sm:text-base text-[#6B7280] leading-relaxed">
                Find technical problems hurting your rankings and test how resolving them directly restores your Website Health Score and traffic velocity.
              </p>
            </div>

            <SiteAuditInteractive />
          </section>

          {/* ===================================================================== */}
          {/* Bento Grid of Core Capabilities                                       */}
          {/* ===================================================================== */}
          <section id="platform" className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 scroll-mt-24">
            <div className="text-center max-w-3xl mx-auto mb-10">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFFFFF] border border-[#E5E7EB] text-xs font-semibold text-[#8B6818] mb-3">
                <Layers className="w-3.5 h-3.5" />
                <span>Engineered For High Growth</span>
              </div>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-[#202124] tracking-tight">
                Built for Search Architects & High-Velocity Marketing Teams
              </h2>
              <p className="mt-3 text-sm sm:text-base text-[#6B7280] leading-relaxed">
                Every feature is built around verifiable data, zero fluff, and direct developer implementation.
              </p>
            </div>

            <BentoFeatures />
          </section>

          {/* ===================================================================== */}
          {/* Competitor Share of Voice & Benchmarking                              */}
          {/* ===================================================================== */}
          <section id="competitors" className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 scroll-mt-24">
            <div className="bg-[#FFFFFF] rounded-2xl border border-[#E5E7EB] p-8 sm:p-12 shadow-xs">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                <div className="lg:col-span-5 space-y-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#8B6818]">
                    Market Intelligence
                  </span>
                  <h3 className="text-2xl sm:text-3xl font-extrabold text-[#202124] tracking-tight">
                    Outmaneuver Competitors Across Every Channel
                  </h3>
                  <p className="text-sm text-[#6B7280] leading-relaxed">
                    Monitor keyword overlaps, content gaps, and entity citation rates. Automatically discover queries where competitors are losing share to your domain.
                  </p>
                  <div className="pt-2 space-y-2.5 text-xs text-[#202124]">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#16805D]" />
                      <span>Real-time competitor ranking movement alerts</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#16805D]" />
                      <span>Generative AI citation gap & missing entity analysis</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#16805D]" />
                      <span>Shareable white-label competitive audit reports</span>
                    </div>
                  </div>
                </div>

                {/* Benchmarking preview card */}
                <div className="lg:col-span-7 bg-[#FAF8F5] rounded-xl border border-[#E5E7EB] p-6 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-[#EEF0F2]">
                    <span className="text-xs font-bold text-[#202124] uppercase tracking-wider">
                      Search Visibility Index Comparison
                    </span>
                    <span className="text-xs font-semibold text-[#8B6818]">
                      Last 30 Days
                    </span>
                  </div>

                  <div className="space-y-3">
                    <div className="p-3 bg-white rounded-lg border border-[#E5E7EB] flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#8B6818]" />
                        <span className="text-xs font-bold text-[#202124]">
                          Your Website (acmecloud-infra.io)
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="font-mono font-bold text-[#16805D]">+18.4%</span>
                        <span className="px-2 py-0.5 rounded bg-[#F8F5ED] text-[#8B6818] font-bold">
                          Score: 92
                        </span>
                      </div>
                    </div>

                    <div className="p-3 bg-white rounded-lg border border-[#E5E7EB] flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#9CA3AF]" />
                        <span className="text-xs font-semibold text-[#6B7280]">
                          Competitor Alpha (cloudlegacy.net)
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="font-mono text-[#C2413B]">-4.2%</span>
                        <span className="px-2 py-0.5 rounded bg-[#F4F5F7] text-[#6B7280] font-semibold">
                          Score: 71
                        </span>
                      </div>
                    </div>

                    <div className="p-3 bg-white rounded-lg border border-[#E5E7EB] flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#9CA3AF]" />
                        <span className="text-xs font-semibold text-[#6B7280]">
                          Competitor Beta (infraflow.co)
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="font-mono text-[#6B7280]">+1.1%</span>
                        <span className="px-2 py-0.5 rounded bg-[#F4F5F7] text-[#6B7280] font-semibold">
                          Score: 68
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ===================================================================== */}
          {/* Pricing Comparison                                                    */}
          {/* ===================================================================== */}
          <section id="pricing" className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-10">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FFFFFF] border border-[#E5E7EB] text-xs font-semibold text-[#8B6818] mb-3">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Transparent Enterprise Pricing</span>
              </div>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-[#202124] tracking-tight">
                Simple, Predictable Plans For Any Scale
              </h2>
              <p className="mt-3 text-sm sm:text-base text-[#6B7280] leading-relaxed">
                Every plan includes full technical auditing, AI citation tracking, and automated task prioritization.
              </p>
            </div>

            <PricingComparison />
          </section>

          {/* ===================================================================== */}
          {/* Call To Action                                                        */}
          {/* ===================================================================== */}
          <section className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pb-12">
            <CallToAction />
          </section>
        </div>

        {/* Global Enterprise Footer */}
        <LandingFooter />
      </main>
    </div>
  );
}
