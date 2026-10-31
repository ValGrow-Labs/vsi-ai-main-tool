"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Globe,
  Shield,
  ArrowRight,
  ShieldCheck,
  Bot,
  Search,
  Sparkles,
  Activity,
  Layers,
  CheckCircle2,
  Lock,
  Cpu,
  FileCode,
  BarChart3,
  ExternalLink,
} from "lucide-react";
import { VSI_COLORS } from "./tokens";

export function LandingFooter() {
  const [auditDomain, setAuditDomain] = useState("");

  const handleAuditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDomain = auditDomain.trim().replace(/^https?:\/\//i, "");
    const target = cleanDomain
      ? `/login?mode=signup&domain=${encodeURIComponent(cleanDomain)}`
      : "/login?mode=signup";
    window.location.href = target;
  };

  return (
    <footer className="w-full bg-[#FFFFFF] border-t border-[#E5E7EB] mt-20 sm:mt-28">
      {/* =================================================================== */}
      {/* 1. Live Search & AI Engine Telemetry Status Ribbon                 */}
      {/* =================================================================== */}
      <div className="border-b border-[#EEF0F2] bg-[#FAF8F5]/80 py-3.5 px-4 sm:px-6 lg:px-8">
        <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#16805D] animate-pulse" />
            <span className="font-bold text-[#202124]">
              Multi-Engine Telemetry Active:
            </span>
            <span className="text-[#6B7280] hidden sm:inline">
              Continuous sub-minute monitoring across search and AI systems
            </span>
          </div>

          {/* Engine Status Indicators */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-[11px] font-medium text-[#202124]">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white border border-[#E5E7EB]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#16805D]" />
              Google SERP (Top 3)
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white border border-[#E5E7EB]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#16805D]" />
              Perplexity Pro Radar
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white border border-[#E5E7EB]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#16805D]" />
              ChatGPT Search 4o
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white border border-[#E5E7EB]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#16805D]" />
              Google AI Overviews
            </span>
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* 2. Main Footer Navigation & Brand Architecture Grid                 */}
      {/* =================================================================== */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-14 lg:py-20">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 lg:gap-14 pb-14 border-b border-[#EEF0F2]">
          {/* Left Column: Brand Intelligence, Value Proposition & Trust (md:col-span-4) */}
          <div className="md:col-span-4 space-y-6">
            <Link href="/" className="inline-flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-md bg-[#8B6818] flex items-center justify-center text-white font-bold text-lg shadow-xs group-hover:scale-105 transition-transform">
                <span>V</span>
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-lg text-[#202124] tracking-tight">
                    VSI
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#F8F5ED] text-[#8B6818] border border-[#C6AD70]/40">
                    SEO & GEO
                  </span>
                </div>
                <span className="text-[11px] text-[#6B7280]">
                  ValGrow Search Intelligence
                </span>
              </div>
            </Link>

            <p className="text-xs sm:text-sm text-[#6B7280] leading-relaxed">
              The enterprise Search & Generative AI Intelligence platform. VSI bridges traditional organic Google SERP rank tracking with real-time Generative Engine Optimization (GEO)—empowering search architects to dominate both search results and AI citations.
            </p>

            {/* Instant Domain Audit Quick Launcher */}
            <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E5E7EB] space-y-2.5">
              <span className="text-xs font-bold text-[#202124] block">
                Instant Dual-Engine Audit
              </span>
              <p className="text-[11px] text-[#6B7280]">
                Analyze technical site health and AI citations in under 60 seconds.
              </p>
              <form onSubmit={handleAuditSubmit} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={auditDomain}
                  onChange={(e) => setAuditDomain(e.target.value)}
                  placeholder="yourwebsite.com"
                  className="w-full flex-1 h-9 px-3 rounded-lg border border-[#E5E7EB] bg-white text-xs text-[#202124] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-1 focus:ring-[#8B6818]"
                />
                <button
                  type="submit"
                  className="w-full sm:w-auto h-9 px-3.5 rounded-lg bg-[#8B6818] text-white text-xs font-bold hover:bg-[#785913] transition-colors flex items-center justify-center gap-1 shrink-0 shadow-xs cursor-pointer"
                >
                  <span>Audit</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </form>
            </div>

            {/* Enterprise Security Badges */}
            <div className="pt-2 flex flex-wrap items-center gap-2.5 text-[11px] text-[#6B7280]">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#F4F5F7] border border-[#E5E7EB]">
                <ShieldCheck className="w-3.5 h-3.5 text-[#16805D]" />
                SOC2 Type II
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#F4F5F7] border border-[#E5E7EB]">
                <Lock className="w-3.5 h-3.5 text-[#8B6818]" />
                Zero-Training Privacy
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#F4F5F7] border border-[#E5E7EB]">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#3567A8]" />
                WCAG 2.1 AA
              </span>
            </div>
          </div>

          {/* Right Columns: Structured Navigation Links (md:col-span-8) */}
          <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-8 lg:gap-10">
            {/* Nav Column 1: Core Capabilities */}
            <div className="space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[#202124] block">
                Platform Capabilities
              </span>
              <ul className="space-y-2.5 text-xs sm:text-sm text-[#6B7280]">
                <li>
                  <Link href="#overview" className="hover:text-[#8B6818] transition-colors block">
                    <span className="font-semibold text-[#202124] block">Command Center Overview</span>
                    <span className="text-[11px] text-[#9CA3AF]">Unified search & GEO telemetry</span>
                  </Link>
                </li>
                <li>
                  <Link href="#site-audit" className="hover:text-[#8B6818] transition-colors block">
                    <span className="font-semibold text-[#202124] block">Technical Site Audit</span>
                    <span className="text-[11px] text-[#9CA3AF]">Core Web Vitals & Schema JSON-LD</span>
                  </Link>
                </li>
                <li>
                  <Link href="#radar-simulator" className="hover:text-[#8B6818] transition-colors block">
                    <span className="font-semibold text-[#202124] block">Search & GEO Radar</span>
                    <span className="text-[11px] text-[#9CA3AF]">Google Top 3 & AI Citation tracking</span>
                  </Link>
                </li>
                <li>
                  <Link href="#competitors" className="hover:text-[#8B6818] transition-colors block">
                    <span className="font-semibold text-[#202124] block">Competitor Benchmarking</span>
                    <span className="text-[11px] text-[#9CA3AF]">Citation gaps & keyword overlap</span>
                  </Link>
                </li>
                <li>
                  <Link href="#platform" className="hover:text-[#8B6818] transition-colors block">
                    <span className="font-semibold text-[#202124] block">Next Action Engine</span>
                    <span className="text-[11px] text-[#9CA3AF]">Impact-scored developer code fixes</span>
                  </Link>
                </li>
              </ul>
            </div>

            {/* Nav Column 2: Supported Search & AI Engines */}
            <div className="space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[#202124] block">
                Search & AI Coverage
              </span>
              <ul className="space-y-2.5 text-xs sm:text-sm text-[#6B7280]">
                <li>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#202124]">Google Search SERP</span>
                    <span className="text-[10px] text-[#16805D] font-bold">Top 3</span>
                  </div>
                  <span className="text-[11px] text-[#9CA3AF] block">Commercial intent & pixel depth</span>
                </li>
                <li>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#202124]">Perplexity Pro Search</span>
                    <span className="text-[10px] text-[#8B6818] font-bold">Cited #1</span>
                  </div>
                  <span className="text-[11px] text-[#9CA3AF] block">Authority reference link tracking</span>
                </li>
                <li>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#202124]">ChatGPT Search 4o</span>
                    <span className="text-[10px] text-[#16805D] font-bold">Verified</span>
                  </div>
                  <span className="text-[11px] text-[#9CA3AF] block">Buyer recommendation synthesis</span>
                </li>
                <li>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#202124]">Google AI Overviews</span>
                    <span className="text-[10px] text-[#3567A8] font-bold">Carousels</span>
                  </div>
                  <span className="text-[11px] text-[#9CA3AF] block">Featured knowledge snippet inclusion</span>
                </li>
                <li>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#202124]">Claude 3.5 & Gemini</span>
                    <span className="text-[10px] text-[#6B7280] font-bold">Sub-min</span>
                  </div>
                  <span className="text-[11px] text-[#9CA3AF] block">Entity and sentiment radar</span>
                </li>
              </ul>
            </div>

            {/* Nav Column 3: Resources & Secure Access */}
            <div className="space-y-4">
              <span className="text-xs font-bold uppercase tracking-wider text-[#202124] block">
                Resources & Security
              </span>
              <ul className="space-y-2 text-xs sm:text-sm text-[#6B7280]">
                <li>
                  <Link href="/login" className="hover:text-[#8B6818] transition-colors flex items-center justify-between">
                    <span>Client Dashboard</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#9CA3AF]" />
                  </Link>
                </li>
                <li>
                  <Link href="/login?mode=signup" className="hover:text-[#8B6818] transition-colors flex items-center justify-between">
                    <span>Start Free Audit</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#9CA3AF]" />
                  </Link>
                </li>
                <li>
                  <Link href="#pricing" className="hover:text-[#8B6818] transition-colors flex items-center justify-between">
                    <span>Enterprise Pricing</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#9CA3AF]" />
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-[#8B6818] transition-colors flex items-center justify-between">
                    <span>Privacy Policy & SOC2</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#9CA3AF]" />
                  </Link>
                </li>
                <li>
                  <Link href="/login" className="hover:text-[#8B6818] transition-colors flex items-center justify-between">
                    <span>API & Webhook Docs</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#9CA3AF]" />
                  </Link>
                </li>
              </ul>

              {/* White-Label Client Reports Notice */}
              <div className="pt-2">
                <div className="p-3 rounded-lg bg-[#F8F5ED] border border-[#C6AD70]/40 text-xs">
                  <span className="font-bold text-[#8B6818] block">
                    White-Label Reporting
                  </span>
                  <p className="text-[11px] text-[#6B7280] mt-0.5">
                    Generate token-secured, client-ready PDF summaries with your agency branding.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* 3. Bottom Legal, Security & Copyright Bar                          */}
        {/* =================================================================== */}
        <div className="pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-[#9CA3AF]">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 text-center sm:text-left">
            <span className="text-[#6B7280] font-medium">
              © {new Date().getFullYear()} ValGrow Search Intelligence (VSI). All rights reserved.
            </span>
            <span className="hidden sm:inline">·</span>
            <span>Enterprise Search & Generative Engine Optimization</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-[11px]">
            <span className="flex items-center gap-1.5 text-[#16805D] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#16805D]" />
              SOC2 Type II Certified
            </span>
            <span>·</span>
            <span className="flex items-center gap-1.5 text-[#202124]">
              WCAG 2.1 AA Compliant
            </span>
            <span>·</span>
            <Link href="/privacy" className="hover:text-[#8B6818] transition-colors">
              Data Privacy & Security
            </Link>
            <span>·</span>
            <Link href="/login" className="hover:text-[#8B6818] transition-colors">
              Platform Status
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
