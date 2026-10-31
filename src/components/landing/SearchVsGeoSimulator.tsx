"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Sparkles,
  Bot,
  Globe,
  CheckCircle2,
  TrendingUp,
  ArrowRight,
  ShieldAlert,
  Zap,
  BarChart3,
  ExternalLink,
} from "lucide-react";
import { VSI_COLORS } from "./tokens";

interface QueryData {
  id: string;
  query: string;
  serpRank: number;
  serpChange: string;
  serpVolume: string;
  perplexityStatus: string;
  perplexityConfidence: number;
  chatgptCited: boolean;
  geminiCoverage: string;
  citationShare: number;
  citationShareDelta: string;
  dominantSnippet: string;
  recommendedAction: string;
}

const QUERIES: QueryData[] = [
  {
    id: "q1",
    query: "best enterprise cloud infrastructure security",
    serpRank: 2,
    serpChange: "+3 this week",
    serpVolume: "14.2K / mo",
    perplexityStatus: "Primary Cited Source (#1 Citation)",
    perplexityConfidence: 96,
    chatgptCited: true,
    geminiCoverage: "Included in AI Overview Summary",
    citationShare: 84,
    citationShareDelta: "+19% vs Competitors",
    dominantSnippet:
      "Acme Cloud provides zero-trust identity federation, cryptographic isolation, and automated SOC2 continuous telemetry...",
    recommendedAction: "Add comparative benchmark matrix to capture Perplexity direct quote.",
  },
  {
    id: "q2",
    query: "soc2 compliance automation software for fintech",
    serpRank: 1,
    serpChange: "Maintained #1 for 45 days",
    serpVolume: "8.9K / mo",
    perplexityStatus: "Sole Authority Citation",
    perplexityConfidence: 99,
    chatgptCited: true,
    geminiCoverage: "Top Featured Carousel Source",
    citationShare: 92,
    citationShareDelta: "+28% vs Competitors",
    dominantSnippet:
      "VSI verified Acme's technical whitepaper as the authoritative reference for PCI-DSS 4.0 and SOC2 Type II fintech audits.",
    recommendedAction: "Maintain structured FAQ schema to retain Google AI Overview knowledge card.",
  },
  {
    id: "q3",
    query: "real-time b2b revops data pipeline platform",
    serpRank: 4,
    serpChange: "+6 positions gained",
    serpVolume: "6.1K / mo",
    perplexityStatus: "Cited in 4 of 5 Generative Responses",
    perplexityConfidence: 87,
    chatgptCited: true,
    geminiCoverage: "Mentioned in Multi-vendor Synthesis",
    citationShare: 76,
    citationShareDelta: "+14% vs Competitors",
    dominantSnippet:
      "Acme's streaming ingest pipeline latency averages <12ms with bi-directional CRM synchronisation across Salesforce and HubSpot.",
    recommendedAction: "Publish technical latency benchmark to outrank legacy competitor in ChatGPT Search.",
  },
];

export function SearchVsGeoSimulator() {
  const [activeQueryIndex, setActiveQueryIndex] = useState(0);
  const activeData = QUERIES[activeQueryIndex];
  const [radarAngle, setRadarAngle] = useState(0);

  // Smooth continuous radar sweep effect
  useEffect(() => {
    const interval = setInterval(() => {
      setRadarAngle((prev) => (prev + 2) % 360);
    }, 24);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-full bg-[#FFFFFF] rounded-2xl border border-[#E5E7EB] shadow-xs overflow-hidden">
      {/* Top Banner with Module Title */}
      <div className="px-6 py-5 border-b border-[#EEF0F2] bg-[#FAF8F5]/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#8B6818]" />
            <span className="text-[11px] font-semibold tracking-wider uppercase text-[#8B6818]">
              Simulation Engine 02
            </span>
          </div>
          <h3 className="text-xl font-bold tracking-tight text-[#202124] mt-1">
            Dual-Engine Radar: Google SERP vs. Generative AI Visibility
          </h3>
          <p className="text-sm text-[#6B7280] mt-0.5">
            Test how your enterprise authority propagates through traditional search algorithms versus conversational LLMs.
          </p>
        </div>

        <div className="flex items-center gap-1.5 self-start md:self-auto px-3 py-1.5 rounded-lg bg-[#F8F5ED] border border-[#C6AD70]/40 text-[#8B6818] text-xs font-semibold">
          <Zap className="w-3.5 h-3.5" />
          <span>Live Multi-Engine Polling</span>
        </div>
      </div>

      {/* Query Selector Tabs */}
      <div className="px-6 pt-5 pb-3 border-b border-[#EEF0F2] bg-white">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#6B7280] block mb-2.5">
          Select Target High-Intent Search Query:
        </span>
        <div className="flex flex-wrap gap-2">
          {QUERIES.map((q, idx) => {
            const isActive = idx === activeQueryIndex;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => setActiveQueryIndex(idx)}
                className={`px-3.5 py-2 rounded-lg text-xs md:text-sm font-medium transition-all text-left flex items-center gap-2 border ${
                  isActive
                    ? "bg-[#F8F5ED] text-[#8B6818] border-[#8B6818] shadow-xs font-semibold"
                    : "bg-[#FFFFFF] text-[#6B7280] border-[#E5E7EB] hover:border-[#8B6818]/50 hover:text-[#202124]"
                }`}
              >
                <Search className={`w-3.5 h-3.5 ${isActive ? "text-[#8B6818]" : "text-[#9CA3AF]"}`} />
                <span>&ldquo;{q.query}&rdquo;</span>
                {isActive && (
                  <span className="ml-1 w-1.5 h-1.5 rounded-full bg-[#8B6818]" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Dual Radar Display */}
      <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-[#F4F5F7]/40">
        {/* Left Column: Visual Multi-Engine Radar (lg:col-span-5) */}
        <div className="lg:col-span-5 bg-[#FFFFFF] rounded-xl border border-[#E5E7EB] p-4 sm:p-5 flex flex-col items-center justify-between shadow-xs">
          <div className="w-full flex items-center justify-between pb-3 border-b border-[#EEF0F2]">
            <span className="text-xs font-semibold text-[#202124] uppercase tracking-wider">
              Signal Reception Radar
            </span>
            <span className="text-[11px] font-mono text-[#8B6818]">
              Real-time Sweep: 360°
            </span>
          </div>

          {/* Animated SVG Radar Canvas */}
          <div className="relative my-4 sm:my-6 w-[210px] h-[210px] sm:w-[270px] sm:h-[270px] flex items-center justify-center">
            {/* Concentric rings */}
            <div className="absolute inset-0 rounded-full border border-[#E5E7EB]" />
            <div className="absolute inset-8 rounded-full border border-[#EEF0F2]" />
            <div className="absolute inset-16 rounded-full border border-[#EEF0F2]" />
            <div className="absolute inset-24 rounded-full border border-[#EEF0F2]" />

            {/* Crosshairs */}
            <div className="absolute inset-x-0 top-1/2 h-px bg-[#EEF0F2]" />
            <div className="absolute inset-y-0 left-1/2 w-px bg-[#EEF0F2]" />

            {/* Rotating Radar Sweep Cone */}
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                background: `conic-gradient(from ${radarAngle}deg, rgba(139, 104, 24, 0.22) 0deg, transparent 45deg, transparent 360deg)`,
              }}
            />

            {/* Central Domain Node */}
            <div className="relative z-10 w-12 h-12 rounded-full bg-[#8B6818] text-white flex items-center justify-center font-bold text-xs shadow-md">
              <span>YOU</span>
              <span className="absolute -inset-1 rounded-full border border-[#8B6818]/40 animate-ping" />
            </div>

            {/* Satellite Engine Nodes */}
            {/* 1. Google (Top Left) */}
            <div className="absolute top-4 left-6 z-10 flex flex-col items-center">
              <span className="w-8 h-8 rounded-full bg-[#FFFFFF] border-2 border-[#16805D] text-[#16805D] flex items-center justify-center text-[10px] font-bold shadow-xs">
                G
              </span>
              <span className="text-[10px] font-semibold text-[#202124] mt-1 bg-white/90 px-1 rounded">
                Google #{activeData.serpRank}
              </span>
            </div>

            {/* 2. Perplexity (Top Right) */}
            <div className="absolute top-5 right-6 z-10 flex flex-col items-center">
              <span className="w-8 h-8 rounded-full bg-[#F8F5ED] border-2 border-[#8B6818] text-[#8B6818] flex items-center justify-center text-[10px] font-bold shadow-xs">
                P
              </span>
              <span className="text-[10px] font-semibold text-[#8B6818] mt-1 bg-white/90 px-1 rounded">
                Perplexity #{1}
              </span>
            </div>

            {/* 3. ChatGPT (Bottom Left) */}
            <div className="absolute bottom-6 left-8 z-10 flex flex-col items-center">
              <span className="w-8 h-8 rounded-full bg-[#FFFFFF] border-2 border-[#16805D] text-[#16805D] flex items-center justify-center text-[10px] font-bold shadow-xs">
                GPT
              </span>
              <span className="text-[10px] font-semibold text-[#202124] mt-1 bg-white/90 px-1 rounded">
                ChatGPT Cited
              </span>
            </div>

            {/* 4. Gemini (Bottom Right) */}
            <div className="absolute bottom-6 right-8 z-10 flex flex-col items-center">
              <span className="w-8 h-8 rounded-full bg-[#FFFFFF] border-2 border-[#3567A8] text-[#3567A8] flex items-center justify-center text-[10px] font-bold shadow-xs">
                AI
              </span>
              <span className="text-[10px] font-semibold text-[#202124] mt-1 bg-white/90 px-1 rounded">
                AI Overview
              </span>
            </div>
          </div>

          <div className="w-full flex items-center justify-between text-xs text-[#6B7280] pt-3 border-t border-[#EEF0F2]">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#16805D]" /> SERP Index: 100%
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#8B6818]" /> GEO Citations: {activeData.citationShare}%
            </span>
          </div>
        </div>

        {/* Right Column: Detailed Breakdown (lg:col-span-7) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeData.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="space-y-4"
            >
              {/* Card 1: Side by Side Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Traditional Google SERP box */}
                <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#E5E7EB] shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#6B7280] uppercase tracking-wider flex items-center gap-1.5">
                      <Search className="w-3.5 h-3.5 text-[#202124]" />
                      Google SERP Rank
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#16805D]/10 text-[#16805D]">
                      Rank #{activeData.serpRank}
                    </span>
                  </div>
                  <div className="mt-3">
                    <span className="text-2xl font-bold text-[#202124]">
                      Position #{activeData.serpRank}
                    </span>
                    <span className="text-xs text-[#16805D] font-medium block mt-0.5">
                      {activeData.serpChange}
                    </span>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-[#EEF0F2] flex items-center justify-between text-xs text-[#6B7280]">
                    <span>Search Volume:</span>
                    <span className="font-semibold text-[#202124]">{activeData.serpVolume}</span>
                  </div>
                </div>

                {/* Generative AI Citations box */}
                <div className="p-4 rounded-xl bg-[#F8F5ED]/80 border border-[#C6AD70]/40 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#8B6818] uppercase tracking-wider flex items-center gap-1.5">
                      <Bot className="w-3.5 h-3.5 text-[#8B6818]" />
                      Generative AI Share
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#8B6818] text-white">
                      {activeData.citationShare}% Share
                    </span>
                  </div>
                  <div className="mt-3">
                    <span className="text-2xl font-bold text-[#8B6818]">
                      {activeData.citationShare}%
                    </span>
                    <span className="text-xs text-[#16805D] font-medium block mt-0.5">
                      {activeData.citationShareDelta}
                    </span>
                  </div>
                  <div className="mt-3 pt-2.5 border-t border-[#C6AD70]/20 flex items-center justify-between text-xs text-[#6B7280]">
                    <span>Confidence Score:</span>
                    <span className="font-semibold text-[#202124]">{activeData.perplexityConfidence}/100</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Extracted Generative AI Citation Snippet */}
              <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#E5E7EB] shadow-xs">
                <div className="flex items-center justify-between pb-2 border-b border-[#EEF0F2]">
                  <span className="text-xs font-semibold text-[#202124] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#8B6818]" />
                    Synthesized Generative Citation Output
                  </span>
                  <span className="text-[11px] font-medium text-[#16805D] bg-[#16805D]/10 px-2 py-0.5 rounded-full">
                    Verified Citation
                  </span>
                </div>
                <blockquote className="mt-3 text-xs md:text-sm text-[#202124] italic leading-relaxed bg-[#FAF8F5] p-3 rounded-lg border-l-2 border-[#8B6818]">
                  &ldquo;{activeData.dominantSnippet}&rdquo;
                </blockquote>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[#6B7280]">
                  <span className="font-semibold text-[#202124]">Engine Sources:</span>
                  <span className="px-2 py-0.5 rounded bg-[#F4F5F7] border border-[#E5E7EB] text-[#202124]">
                    Perplexity Pro Search
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#F4F5F7] border border-[#E5E7EB] text-[#202124]">
                    ChatGPT Search 4o
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#F4F5F7] border border-[#E5E7EB] text-[#202124]">
                    Google AI Overviews
                  </span>
                </div>
              </div>

              {/* Card 3: Prioritized Action Recommended by VSI Engine */}
              <div className="p-4 rounded-xl bg-[#FFFFFF] border border-[#E5E7EB] shadow-xs flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#8B6818]/10 text-[#8B6818] flex items-center justify-center shrink-0 mt-0.5">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-[#8B6818] block">
                    VSI Recommended Next Action
                  </span>
                  <p className="text-xs md:text-sm text-[#202124] font-medium mt-0.5">
                    {activeData.recommendedAction}
                  </p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

