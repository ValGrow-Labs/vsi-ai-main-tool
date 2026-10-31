"use client";

import React, { useRef, useState, useEffect } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  AnimatePresence,
} from "framer-motion";
import {
  TrendingUp,
  ShieldCheck,
  Search,
  Sparkles,
  Bot,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  Layers,
  Globe,
  Activity,
  ChevronRight,
  ArrowRight,
  Gauge,
  Crown,
  FileText,
  Clock,
  Zap,
} from "lucide-react";
import { VSI_COLORS } from "./tokens";
import type { WorkspaceTabId } from "./WorkspaceTabs";

export function Hero3DCard({
  activeTab = "site-audit",
}: {
  activeTab?: WorkspaceTabId;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Motion values for gentle 3D tilt on the main workspace window
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  const springConfig = { damping: 28, stiffness: 200, mass: 0.5 };
  const smoothMouseX = useSpring(mouseX, springConfig);
  const smoothMouseY = useSpring(mouseY, springConfig);

  const rotateX = useTransform(smoothMouseY, [0, 1], [6, -6]);
  const rotateY = useTransform(smoothMouseX, [0, 1], [-7, 7]);

  const sheenX = useTransform(smoothMouseX, [0, 1], ["0%", "100%"]);
  const sheenY = useTransform(smoothMouseY, [0, 1], ["0%", "100%"]);

  const handleMouseMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isMobile || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    mouseX.set(0.5);
    mouseY.set(0.5);
  };

  return (
    <div className="relative w-full max-w-[1360px] mx-auto py-6 sm:py-10 px-2 sm:px-4 flex flex-col items-center justify-center">
      {/* =================================================================== */}
      {/* Background Organic Shape & Hand-Drawn Doodle Accents (Video Style)  */}
      {/* =================================================================== */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
        {/* Large Warm Organic Blob Backdrop */}
        <div
          className="w-[85%] max-w-[1100px] h-[520px] rounded-[70px] sm:rounded-[100px] opacity-80 transition-all duration-700"
          style={{
            background:
              "radial-gradient(ellipse at 50% 50%, rgba(248, 245, 237, 0.95) 0%, rgba(244, 240, 228, 0.75) 60%, rgba(251, 248, 240, 0.2) 100%)",
            transform: "rotate(-1.5deg) scale(1.02)",
          }}
        />

        {/* Decorative Hand-drawn Golden Arrow (Pointing to Top-Right Card) */}
        <svg
          className="hidden xl:block absolute right-24 top-2 w-28 h-28 text-[#8B6818]/60 transition-transform duration-500"
          viewBox="0 0 120 120"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M 30 15 Q 75 25 85 75 Q 88 88 92 98" />
          <path d="M 80 92 L 93 100 L 98 84" />
        </svg>

        {/* Decorative Golden Starburst Doodles */}
        <svg
          className="hidden xl:block absolute left-20 bottom-8 w-16 h-16 text-[#C6AD70]/70"
          viewBox="0 0 60 60"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M 30 5 L 30 55" />
          <path d="M 5 30 L 55 30" />
          <path d="M 12 12 L 48 48" />
          <path d="M 48 12 L 12 48" />
        </svg>

        {/* Decorative Curved Swoop on Top Left */}
        <svg
          className="hidden xl:block absolute left-28 top-8 w-24 h-24 text-[#C6AD70]/50"
          viewBox="0 0 100 100"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <path d="M 15 80 Q 25 25 85 20" />
        </svg>
      </div>

      {/* =================================================================== */}
      {/* Central Showcase Wrapper with Desktop Satellite Cards Around It     */}
      {/* =================================================================== */}
      <div className="relative w-full flex items-center justify-center perspective-[1200px]">
        {/* ================================================================= */}
        {/* SATELLITE CARD 1: TOP-LEFT (Video Style)                          */}
        {/* ================================================================= */}
        <div className="hidden xl:block absolute -left-6 2xl:-left-12 top-4 w-64 z-30 pointer-events-auto">
          <AnimatePresence mode="wait">
            {activeTab === "site-audit" && (
              <motion.div
                key="sat-tl-audit"
                initial={{ opacity: 0, x: -20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -16, scale: 0.95 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="p-4.5 rounded-2xl bg-white border border-[#E5E7EB] shadow-[0_12px_32px_rgba(32,33,36,0.08)] space-y-3"
              >
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                    Pages Crawled
                  </span>
                  <div className="text-2xl font-extrabold text-[#202124] tracking-tight mt-0.5">
                    4,820
                  </div>
                </div>

                <div className="space-y-1.5 pt-1 border-t border-[#EEF0F2] text-xs">
                  <div className="flex items-center justify-between text-[#202124]">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#16805D]" />
                      Successful (200)
                    </span>
                    <span className="font-mono font-bold text-[#16805D]">
                      4,731
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[#202124]">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#B7791F]" />
                      Redirected (301)
                    </span>
                    <span className="font-mono font-medium text-[#6B7280]">
                      62
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[#202124]">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#C2413B]" />
                      Broken (404)
                    </span>
                    <span className="font-mono font-bold text-[#C2413B]">
                      21
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[#202124]">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#9CA3AF]" />
                      Blocked Rules
                    </span>
                    <span className="font-mono font-medium text-[#6B7280]">
                      6
                    </span>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "search-visibility" && (
              <motion.div
                key="sat-tl-search"
                initial={{ opacity: 0, x: -20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -16, scale: 0.95 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="p-4.5 rounded-2xl bg-white border border-[#E5E7EB] shadow-[0_12px_32px_rgba(32,33,36,0.08)] space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                    SERP Pixel Depth
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#F8F5ED] text-[#8B6818]">
                    Above Fold
                  </span>
                </div>

                <div className="divide-y divide-[#EEF0F2] text-xs">
                  <div className="py-1.5 flex items-center justify-between">
                    <span className="font-bold text-[#202124]">#1 SERP</span>
                    <span className="font-mono text-[#6B7280]">178 px</span>
                    <span className="text-[10px] font-semibold text-[#16805D] bg-[#16805D]/10 px-1.5 py-0.5 rounded">
                      Above
                    </span>
                  </div>
                  <div className="py-1.5 flex items-center justify-between">
                    <span className="font-bold text-[#202124]">#2 SERP</span>
                    <span className="font-mono text-[#6B7280]">247 px</span>
                    <span className="text-[10px] font-semibold text-[#16805D] bg-[#16805D]/10 px-1.5 py-0.5 rounded">
                      Above
                    </span>
                  </div>
                  <div className="py-1.5 flex items-center justify-between">
                    <span className="font-bold text-[#202124]">#3 SERP</span>
                    <span className="font-mono text-[#6B7280]">310 px</span>
                    <span className="text-[10px] font-semibold text-[#16805D] bg-[#16805D]/10 px-1.5 py-0.5 rounded">
                      Above
                    </span>
                  </div>
                  <div className="py-1.5 flex items-center justify-between">
                    <span className="font-bold text-[#6B7280]">#6 SERP</span>
                    <span className="font-mono text-[#6B7280]">830 px</span>
                    <span className="text-[10px] font-medium text-[#6B7280] bg-[#F4F5F7] px-1.5 py-0.5 rounded">
                      Below
                    </span>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "ai-visibility" && (
              <motion.div
                key="sat-tl-ai"
                initial={{ opacity: 0, x: -20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -16, scale: 0.95 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="p-4.5 rounded-2xl bg-white border border-[#E5E7EB] shadow-[0_12px_32px_rgba(32,33,36,0.08)] space-y-2.5"
              >
                <div className="flex items-center justify-between pb-1 border-b border-[#EEF0F2]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                    AI Model Rank
                  </span>
                  <div className="flex items-center gap-1 text-[10px] text-[#6B7280]">
                    <span>GPT</span>
                    <span>·</span>
                    <span>Gemini</span>
                    <span>·</span>
                    <span>Perplexity</span>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-[#FAF8F5]">
                    <span className="font-medium text-[#202124] truncate max-w-[120px]">
                      pricing comparison
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono font-bold text-[#8B6818]">
                      1.00 <Crown className="w-3 h-3 text-[#B59A55]" />
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-[#FAF8F5]">
                    <span className="font-medium text-[#202124] truncate max-w-[120px]">
                      best small team tools
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono font-bold text-[#8B6818]">
                      1.00 <Crown className="w-3 h-3 text-[#B59A55]" />
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded-lg bg-[#FAF8F5]">
                    <span className="font-medium text-[#202124] truncate max-w-[120px]">
                      how to switch tools
                    </span>
                    <span className="inline-flex items-center gap-1 font-mono font-bold text-[#8B6818]">
                      1.00 <Crown className="w-3 h-3 text-[#B59A55]" />
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-1.5 rounded-lg">
                    <span className="font-medium text-[#6B7280] truncate max-w-[120px]">
                      soc2 cloud compliance
                    </span>
                    <span className="font-mono text-[#6B7280]">1.20</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ================================================================= */}
        {/* SATELLITE CARD 2: BOTTOM-LEFT (Video Style)                       */}
        {/* ================================================================= */}
        <div className="hidden xl:block absolute -left-8 2xl:-left-16 bottom-6 w-64 z-30 pointer-events-auto">
          <AnimatePresence mode="wait">
            {activeTab === "site-audit" && (
              <motion.div
                key="sat-bl-audit"
                initial={{ opacity: 0, x: -20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -16, scale: 0.95 }}
                transition={{ duration: 0.35, ease: "easeOut", delay: 0.05 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="p-4.5 rounded-2xl bg-white border border-[#E5E7EB] shadow-[0_12px_32px_rgba(32,33,36,0.08)] space-y-2.5"
              >
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                    Issues Prioritized
                  </span>
                  <div className="text-xl font-extrabold text-[#202124] tracking-tight mt-0.5">
                    12 Actionable Items
                  </div>
                </div>

                <div className="space-y-1.5 pt-1 border-t border-[#EEF0F2] text-[11px]">
                  <div className="p-1.5 rounded bg-[#C2413B]/5 border border-[#C2413B]/20 text-[#C2413B] font-medium flex items-center justify-between">
                    <span>Critical Issues</span>
                    <span className="font-bold font-mono">3 Items</span>
                  </div>
                  <div className="p-1.5 rounded bg-[#B7791F]/5 border border-[#B7791F]/20 text-[#B7791F] font-medium flex items-center justify-between">
                    <span>Warnings Detected</span>
                    <span className="font-bold font-mono">9 Items</span>
                  </div>
                  <div className="p-1.5 rounded bg-[#16805D]/5 border border-[#16805D]/20 text-[#16805D] font-medium flex items-center justify-between">
                    <span>Passed Verifications</span>
                    <span className="font-bold font-mono">42 Checks</span>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "search-visibility" && (
              <motion.div
                key="sat-bl-search"
                initial={{ opacity: 0, x: -20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -16, scale: 0.95 }}
                transition={{ duration: 0.35, ease: "easeOut", delay: 0.05 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="p-4.5 rounded-2xl bg-white border border-[#E5E7EB] shadow-[0_12px_32px_rgba(32,33,36,0.08)] space-y-2"
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                  Organic Traffic Value
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-[#202124] tracking-tight">
                    $184,200
                  </span>
                  <span className="text-xs font-bold text-[#16805D]">+14.2%</span>
                </div>
                <p className="text-[11px] text-[#6B7280] leading-relaxed">
                  Calculated against Google Ads commercial CPC equivalent terms.
                </p>
                <div className="w-full bg-[#EEF0F2] h-1.5 rounded-full overflow-hidden mt-1">
                  <div className="bg-[#8B6818] h-full rounded-full w-[78%]" />
                </div>
              </motion.div>
            )}

            {activeTab === "ai-visibility" && (
              <motion.div
                key="sat-bl-ai"
                initial={{ opacity: 0, x: -20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: -16, scale: 0.95 }}
                transition={{ duration: 0.35, ease: "easeOut", delay: 0.05 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="p-4.5 rounded-2xl bg-white border border-[#E5E7EB] shadow-[0_12px_32px_rgba(32,33,36,0.08)] space-y-2.5"
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                  Sentiment Across Platforms
                </span>

                <div className="flex items-center justify-between text-[11px] text-[#6B7280]">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#16805D]" /> Positive
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#B7791F]" /> Neutral
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#C2413B]" /> Negative
                  </span>
                </div>

                {/* 3 platform vertical comparative bars */}
                <div className="flex items-end justify-around h-20 pt-2 border-t border-[#EEF0F2]">
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-6 h-16 rounded bg-[#EEF0F2] flex flex-col justify-end overflow-hidden">
                      <div className="w-full bg-[#C2413B] h-[4%]" />
                      <div className="w-full bg-[#B7791F] h-[14%]" />
                      <div className="w-full bg-[#16805D] h-[82%]" />
                    </div>
                    <span className="text-[10px] text-[#6B7280]">ChatGPT</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-6 h-16 rounded bg-[#EEF0F2] flex flex-col justify-end overflow-hidden">
                      <div className="w-full bg-[#C2413B] h-[6%]" />
                      <div className="w-full bg-[#B7791F] h-[18%]" />
                      <div className="w-full bg-[#16805D] h-[76%]" />
                    </div>
                    <span className="text-[10px] text-[#6B7280]">Gemini</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-6 h-16 rounded bg-[#EEF0F2] flex flex-col justify-end overflow-hidden">
                      <div className="w-full bg-[#C2413B] h-[5%]" />
                      <div className="w-full bg-[#B7791F] h-[16%]" />
                      <div className="w-full bg-[#16805D] h-[79%]" />
                    </div>
                    <span className="text-[10px] text-[#6B7280]">Google AI</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ================================================================= */}
        {/* SATELLITE CARD 3: TOP-RIGHT (Video Style)                         */}
        {/* ================================================================= */}
        <div className="hidden xl:block absolute -right-6 2xl:-right-12 top-4 w-68 z-30 pointer-events-auto">
          <AnimatePresence mode="wait">
            {activeTab === "site-audit" && (
              <motion.div
                key="sat-tr-audit"
                initial={{ opacity: 0, x: 20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 16, scale: 0.95 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="p-4.5 rounded-2xl bg-white border border-[#E5E7EB] shadow-[0_12px_32px_rgba(32,33,36,0.08)] space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                    Core Web Vitals
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#16805D]/10 text-[#16805D]">
                    PASSING
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="text-[11px] font-medium text-[#6B7280]">
                    Desktop LCP Hydration
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-extrabold text-[#202124] tracking-tight">
                      1.10s
                    </span>
                    <span className="text-xs font-bold text-[#16805D]">
                      GREAT
                    </span>
                  </div>
                </div>

                {/* Performance timing scale */}
                <div className="space-y-1 pt-1">
                  <div className="w-full bg-[#EEF0F2] h-2 rounded-full overflow-hidden flex">
                    <div className="w-[30%] bg-[#16805D] h-full" />
                    <div className="w-[40%] bg-[#EEF0F2] h-full" />
                    <div className="w-[30%] bg-[#EEF0F2] h-full" />
                  </div>
                  <div className="flex justify-between text-[9px] text-[#9CA3AF] font-mono">
                    <span>0s</span>
                    <span className="text-[#16805D] font-bold">1.10s</span>
                    <span>2.5s</span>
                    <span>4s</span>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "search-visibility" && (
              <motion.div
                key="sat-tr-search"
                initial={{ opacity: 0, x: 20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 16, scale: 0.95 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="p-4.5 rounded-2xl bg-white border border-[#E5E7EB] shadow-[0_12px_32px_rgba(32,33,36,0.08)] space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                    Tracked Competitors
                  </span>
                  <span className="text-[10px] text-[#8B6818] font-semibold">
                    Top 3 Focus
                  </span>
                </div>

                <div className="divide-y divide-[#EEF0F2] text-xs">
                  <div className="py-1.5 flex items-center justify-between">
                    <span className="font-semibold text-[#202124] truncate max-w-[130px]">
                      northpeak.com
                    </span>
                    <span className="font-mono text-[#C2413B] font-bold">
                      61,240 gap
                    </span>
                  </div>
                  <div className="py-1.5 flex items-center justify-between">
                    <span className="font-semibold text-[#202124] truncate max-w-[130px]">
                      luminalabs.io
                    </span>
                    <span className="font-mono text-[#6B7280]">28,900</span>
                  </div>
                  <div className="py-1.5 flex items-center justify-between">
                    <span className="font-semibold text-[#202124] truncate max-w-[130px]">
                      vertexhq.com
                    </span>
                    <span className="font-mono text-[#6B7280]">26,540</span>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "ai-visibility" && (
              <motion.div
                key="sat-tr-ai"
                initial={{ opacity: 0, x: 20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 16, scale: 0.95 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="p-4.5 rounded-2xl bg-white border border-[#E5E7EB] shadow-[0_12px_32px_rgba(32,33,36,0.08)] space-y-2.5"
              >
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                    Citation Ranking
                  </span>
                  <p className="text-[11px] text-[#6B7280] mt-0.5">
                    AI citation share across your industry
                  </p>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="p-1.5 rounded-lg bg-[#F8F5ED] border border-[#C6AD70]/40 flex items-center justify-between">
                    <span className="font-bold text-[#8B6818]">
                      Your Brand (You)
                    </span>
                    <span className="font-mono font-bold text-[#8B6818]">
                      34.2%
                    </span>
                  </div>
                  <div className="px-1.5 py-1 flex items-center justify-between text-[#202124]">
                    <span>Northpeak</span>
                    <span className="font-mono text-[#6B7280]">21.0%</span>
                  </div>
                  <div className="px-1.5 py-1 flex items-center justify-between text-[#202124]">
                    <span>Lumina</span>
                    <span className="font-mono text-[#6B7280]">14.5%</span>
                  </div>
                  <div className="px-1.5 py-1 flex items-center justify-between text-[#202124]">
                    <span>Vertex</span>
                    <span className="font-mono text-[#6B7280]">8.2%</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ================================================================= */}
        {/* SATELLITE CARD 4: BOTTOM-RIGHT (Video Style)                      */}
        {/* ================================================================= */}
        <div className="hidden xl:block absolute -right-8 2xl:-right-16 bottom-6 w-68 z-30 pointer-events-auto">
          <AnimatePresence mode="wait">
            {activeTab === "site-audit" && (
              <motion.div
                key="sat-br-audit"
                initial={{ opacity: 0, x: 20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 16, scale: 0.95 }}
                transition={{ duration: 0.35, ease: "easeOut", delay: 0.05 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="p-4.5 rounded-2xl bg-white border border-[#E5E7EB] shadow-[0_12px_32px_rgba(32,33,36,0.08)] space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                    Mobile Latency
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#16805D]/10 text-[#16805D]">
                    OPTIMAL
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="text-[11px] font-medium text-[#6B7280]">
                    Mobile Speed Index
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-extrabold text-[#202124] tracking-tight">
                      1.85s
                    </span>
                    <span className="text-xs font-bold text-[#16805D]">
                      GOOD
                    </span>
                  </div>
                </div>

                <div className="w-full bg-[#EEF0F2] h-2 rounded-full overflow-hidden flex">
                  <div className="w-[45%] bg-[#16805D] h-full" />
                  <div className="w-[55%] bg-[#EEF0F2] h-full" />
                </div>
              </motion.div>
            )}

            {activeTab === "search-visibility" && (
              <motion.div
                key="sat-br-search"
                initial={{ opacity: 0, x: 20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 16, scale: 0.95 }}
                transition={{ duration: 0.35, ease: "easeOut", delay: 0.05 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="p-4.5 rounded-2xl bg-white border border-[#E5E7EB] shadow-[0_12px_32px_rgba(32,33,36,0.08)] space-y-2"
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                  Ranking Velocity
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-[#202124] tracking-tight">
                    +18 Keywords
                  </span>
                </div>
                <p className="text-[11px] text-[#6B7280]">
                  Entered Top 3 SERP within the last 14 days of algorithmic tracking.
                </p>
                <div className="pt-1 flex items-center gap-1.5 text-xs text-[#16805D] font-bold">
                  <TrendingUp className="w-3.5 h-3.5" /> High Momentum Cluster
                </div>
              </motion.div>
            )}

            {activeTab === "ai-visibility" && (
              <motion.div
                key="sat-br-ai"
                initial={{ opacity: 0, x: 20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 16, scale: 0.95 }}
                transition={{ duration: 0.35, ease: "easeOut", delay: 0.05 }}
                whileHover={{ y: -4, transition: { duration: 0.2 } }}
                className="p-4.5 rounded-2xl bg-white border border-[#E5E7EB] shadow-[0_12px_32px_rgba(32,33,36,0.08)] space-y-2.5"
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                  Share of Voice (GEO)
                </span>

                <div className="flex items-center gap-4">
                  {/* Mini Donut Graph */}
                  <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                      <circle
                        cx="18"
                        cy="18"
                        r="14"
                        fill="transparent"
                        stroke="#EEF0F2"
                        strokeWidth="4"
                      />
                      <circle
                        cx="18"
                        cy="18"
                        r="14"
                        fill="transparent"
                        stroke="#8B6818"
                        strokeWidth="4"
                        strokeDasharray="34 100"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute text-[11px] font-extrabold text-[#202124]">
                      34%
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px]">
                    <div className="flex items-center gap-1.5 text-[#202124] font-semibold">
                      <span className="w-2 h-2 rounded-full bg-[#8B6818]" />
                      Your Brand: 34.2%
                    </div>
                    <div className="flex items-center gap-1.5 text-[#6B7280]">
                      <span className="w-2 h-2 rounded-full bg-[#9CA3AF]" />
                      Northpeak: 21.0%
                    </div>
                    <div className="flex items-center gap-1.5 text-[#6B7280]">
                      <span className="w-2 h-2 rounded-full bg-[#EEF0F2]" />
                      Others: 44.8%
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ================================================================= */}
        {/* MAIN BROWSER / DASHBOARD WINDOW (Center Showcase)                 */}
        {/* ================================================================= */}
        <motion.div
          ref={cardRef}
          onPointerMove={handleMouseMove}
          onPointerEnter={() => setIsHovered(true)}
          onPointerLeave={handleMouseLeave}
          style={{
            rotateX: isMobile ? 1 : rotateX,
            rotateY: isMobile ? 0 : rotateY,
            transformStyle: "preserve-3d",
          }}
          className="relative w-full max-w-[890px] 2xl:max-w-[940px] bg-[#FFFFFF] rounded-2xl border border-[#E5E7EB] shadow-[0_20px_50px_-15px_rgba(32,33,36,0.1),0_4px_16px_-2px_rgba(32,33,36,0.05)] overflow-hidden cursor-crosshair z-20"
        >
          {/* Dynamic Light Sheen overlay */}
          <motion.div
            className="pointer-events-none absolute inset-0 z-40 transition-opacity duration-300 mix-blend-soft-light"
            style={{
              opacity: isHovered ? 0.35 : 0.08,
              background: `radial-gradient(600px circle at ${sheenX} ${sheenY}, rgba(255, 255, 255, 0.8), transparent 80%)`,
            }}
          />

          {/* Browser Top Navigation Bar */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#EEF0F2] bg-[#FAF8F5]/90">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E5E7EB]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#E5E7EB]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#E5E7EB]" />
              <span className="ml-3 font-mono text-[11px] text-[#6B7280] tracking-wide flex items-center gap-1.5">
                <Globe className="w-3 h-3 text-[#8B6818]" />
                vsi.intelligence/live-workspace
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#16805D]/10 text-[#16805D]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#16805D] animate-pulse" />
                Real-Time Crawl Active
              </span>
            </div>
          </div>

          {/* =============================================================== */}
          {/* Dynamic Content Per Active Tab (Exact Video Structure)          */}
          {/* =============================================================== */}
          <div className="p-4 sm:p-6 lg:p-7 space-y-6">
            {/* Header Information Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#EEF0F2]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#F8F5ED] border border-[#C6AD70]/40 flex items-center justify-center text-[#8B6818] shadow-xs">
                  {activeTab === "site-audit" ? (
                    <ShieldCheck className="w-5 h-5" />
                  ) : activeTab === "search-visibility" ? (
                    <Search className="w-5 h-5" />
                  ) : (
                    <Bot className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-[#202124]">
                      acmecloud-infra.io
                    </h3>
                    <span className="px-2 py-0.5 rounded-sm bg-[#F4F5F7] text-[#6B7280] text-[10px] font-semibold border border-[#E5E7EB]">
                      Production Cluster
                    </span>
                  </div>
                  <p className="text-xs text-[#6B7280]">
                    Multi-Engine Search & AI Presence Audit · Last crawl: 2 mins ago
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="text-[11px] text-[#6B7280] font-medium hidden sm:inline">
                  Selected Module:
                </span>
                <span className="px-2.5 py-1 rounded-md bg-[#F8F5ED] border border-[#C6AD70]/40 text-[#8B6818] text-xs font-bold">
                  {activeTab === "site-audit"
                    ? "Site Audit Engine"
                    : activeTab === "search-visibility"
                    ? "Search Visibility"
                    : "AI Visibility (GEO)"}
                </span>
              </div>
            </div>

            {/* TAB CONTENT: SITE AUDIT */}
            {activeTab === "site-audit" && (
              <motion.div
                key="content-audit"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                {/* AI Summary and Quick Assist Box (Video Style) */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <div className="lg:col-span-8 p-4 rounded-xl bg-[#FAF8F5] border border-[#E5E7EB] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-[#8B6818] uppercase tracking-wide">
                        <Sparkles className="w-3.5 h-3.5" />
                        AI Summary of Technical Health
                      </span>
                      <span className="text-[10px] text-[#9CA3AF]">
                        Real-Time Analysis
                      </span>
                    </div>
                    <p className="text-xs text-[#202124] leading-relaxed">
                      Your technical health score holds at <strong>94/100</strong> (+12 pts). Core Web Vitals and Schema are optimal. Resolving 3 high-priority robots.txt directives and canonical links will restore 100% crawl accessibility for AI engines.
                    </p>
                  </div>

                  <div className="lg:col-span-4 p-4 rounded-xl bg-white border border-[#E5E7EB] flex flex-col justify-between space-y-2">
                    <span className="text-xs font-bold text-[#202124]">
                      Prioritized Action
                    </span>
                    <p className="text-[11px] text-[#6B7280]">
                      3 critical issues require immediate resolution.
                    </p>
                    <button
                      type="button"
                      className="w-full py-1.5 px-3 rounded-lg bg-[#8B6818] text-white text-xs font-semibold hover:bg-[#785913] transition-colors flex items-center justify-center gap-1"
                    >
                      <span>Run Fix Simulator</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Metric Cards Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl border border-[#8B6818] bg-[#FBF8F0]/80 shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#8B6818]">
                        Website Health Score
                      </span>
                      <span className="w-6 h-6 rounded-md bg-[#16805D]/10 text-[#16805D] flex items-center justify-center">
                        <ShieldCheck className="w-3.5 h-3.5" />
                      </span>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-[#202124] tabular-nums">
                        94
                      </span>
                      <span className="text-xs text-[#6B7280]">/ 100</span>
                      <span className="ml-auto text-xs font-bold text-[#16805D]">
                        +12 pts
                      </span>
                    </div>
                    <div className="mt-2 w-full bg-[#EEF0F2] h-1.5 rounded-full overflow-hidden">
                      <div className="bg-[#16805D] h-full w-[94%]" />
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-[#E5E7EB] bg-white shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[#6B7280]">
                        SEO Issues Discovered
                      </span>
                      <span className="w-6 h-6 rounded-md bg-[#B7791F]/10 text-[#B7791F] flex items-center justify-center">
                        <AlertTriangle className="w-3.5 h-3.5" />
                      </span>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-[#202124] tabular-nums">
                        12
                      </span>
                      <span className="text-xs text-[#6B7280]">total</span>
                      <span className="ml-auto text-[11px] font-semibold text-[#B7791F]">
                        3 critical
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#6B7280]">
                      <span>9 warnings</span>
                      <span>·</span>
                      <span className="text-[#16805D] font-medium">42 passed</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-[#E5E7EB] bg-white shadow-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[#6B7280]">
                        AI Crawler Permissions
                      </span>
                      <span className="w-6 h-6 rounded-md bg-[#8B6818]/10 text-[#8B6818] flex items-center justify-center">
                        <Bot className="w-3.5 h-3.5" />
                      </span>
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-[#202124] tabular-nums">
                        100%
                      </span>
                      <span className="ml-auto text-[11px] font-bold text-[#16805D]">
                        Optimal
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[#6B7280]">
                      <span className="px-1 py-0.5 rounded bg-[#FAF8F5] border border-[#EEF0F2]">GPTBot</span>
                      <span className="px-1 py-0.5 rounded bg-[#FAF8F5] border border-[#EEF0F2]">Perplexity</span>
                      <span className="px-1 py-0.5 rounded bg-[#FAF8F5] border border-[#EEF0F2]">Claude</span>
                    </div>
                  </div>
                </div>

                {/* Audit Architecture Checklist Table */}
                <div className="rounded-xl border border-[#E5E7EB] bg-white overflow-hidden">
                  <div className="px-4 py-2.5 bg-[#FAF8F5] border-b border-[#EEF0F2] flex items-center justify-between text-xs">
                    <span className="font-bold text-[#202124] uppercase tracking-wider text-[11px]">
                      Architecture Checks & Findings
                    </span>
                    <span className="text-[#6B7280]">
                      42 passing · 3 prioritized fixes
                    </span>
                  </div>
                  <div className="divide-y divide-[#EEF0F2] text-xs">
                    <div className="px-4 py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full bg-[#16805D]" />
                        <div>
                          <span className="font-semibold text-[#202124] block">
                            Core Web Vitals LCP Benchmark
                          </span>
                          <span className="text-[11px] text-[#6B7280]">
                            Passing 1.1s benchmark · Mobile hydration threshold optimal
                          </span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#16805D]/10 text-[#16805D]">
                        100/100 Passed
                      </span>
                    </div>

                    <div className="px-4 py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full bg-[#8B6818]" />
                        <div>
                          <span className="font-semibold text-[#202124] block">
                            Knowledge Graph Schema (JSON-LD)
                          </span>
                          <span className="text-[11px] text-[#6B7280]">
                            Entity linking enabled for Perplexity & Google AI Overviews
                          </span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F8F5ED] text-[#8B6818] border border-[#C6AD70]/40">
                        +24 Citations
                      </span>
                    </div>

                    <div className="px-4 py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full bg-[#16805D]" />
                        <div>
                          <span className="font-semibold text-[#202124] block">
                            Robots.txt AI Engine Directives
                          </span>
                          <span className="text-[11px] text-[#6B7280]">
                            GPTBot, PerplexityBot, and ClaudeBot allowed for index verification
                          </span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#16805D]/10 text-[#16805D]">
                        200 OK
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB CONTENT: SEARCH VISIBILITY */}
            {activeTab === "search-visibility" && (
              <motion.div
                key="content-search"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                {/* Movement Stats Banner (Video Frame 0 / 20 Style) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl bg-[#FAF8F5] border border-[#E5E7EB]">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                      Keywords Moved Up
                    </span>
                    <div className="text-xl font-extrabold text-[#16805D] flex items-center gap-1 mt-0.5">
                      31 <TrendingUp className="w-3.5 h-3.5" />
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                      Keywords Moved Down
                    </span>
                    <div className="text-xl font-extrabold text-[#C2413B] mt-0.5">
                      4
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                      Unchanged
                    </span>
                    <div className="text-xl font-extrabold text-[#202124] mt-0.5">
                      107
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                      Top 3 Rankings
                    </span>
                    <div className="text-xl font-extrabold text-[#8B6818] mt-0.5">
                      142 <span className="text-xs text-[#6B7280] font-normal">/ 300</span>
                    </div>
                  </div>
                </div>

                {/* Charts Row: Average Position & Tracked Keywords Donut */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  {/* Left 7 cols: Average Position Line Trend */}
                  <div className="lg:col-span-7 p-4 rounded-xl border border-[#E5E7EB] bg-white flex flex-col justify-between space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-[#202124]">
                          Average Position
                        </span>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <span className="text-xs text-[#6B7280] line-through">5.60</span>
                          <span className="text-xl font-extrabold text-[#202124]">2.10</span>
                          <span className="text-xs font-bold text-[#16805D]">+3.50</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-[#6B7280]">Last 30 days</span>
                    </div>

                    {/* Smooth SVG Trend Line */}
                    <div className="w-full h-24 pt-2">
                      <svg className="w-full h-full" viewBox="0 0 300 80" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#8B6818" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#8B6818" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>
                        <path
                          d="M 0,65 Q 40,55 80,48 T 160,32 T 240,18 L 300,12 L 300,80 L 0,80 Z"
                          fill="url(#chartGradient)"
                        />
                        <path
                          d="M 0,65 Q 40,55 80,48 T 160,32 T 240,18 L 300,12"
                          fill="none"
                          stroke="#8B6818"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                  </div>

                  {/* Right 5 cols: Tracked Keywords Segment */}
                  <div className="lg:col-span-5 p-4 rounded-xl border border-[#E5E7EB] bg-white flex flex-col justify-between space-y-2">
                    <span className="text-xs font-bold text-[#202124]">
                      Tracked Keywords
                    </span>

                    <div className="flex items-center gap-3">
                      <div className="relative w-16 h-16 shrink-0 flex items-center justify-center">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                          <circle cx="18" cy="18" r="14" fill="transparent" stroke="#EEF0F2" strokeWidth="4" />
                          <circle cx="18" cy="18" r="14" fill="transparent" stroke="#16805D" strokeWidth="4" strokeDasharray="48 100" />
                          <circle cx="18" cy="18" r="14" fill="transparent" stroke="#8B6818" strokeWidth="4" strokeDasharray="34 100" strokeDashoffset="-48" />
                        </svg>
                        <span className="absolute text-xs font-bold text-[#202124]">142</span>
                      </div>

                      <div className="space-y-1 text-[11px] flex-1">
                        <div className="flex items-center justify-between text-[#202124]">
                          <span className="flex items-center gap-1.5 font-medium">
                            <span className="w-2 h-2 rounded-full bg-[#16805D]" /> Top 3
                          </span>
                          <span className="font-mono font-bold text-[#16805D]">54</span>
                        </div>
                        <div className="flex items-center justify-between text-[#202124]">
                          <span className="flex items-center gap-1.5 font-medium">
                            <span className="w-2 h-2 rounded-full bg-[#8B6818]" /> Top 10
                          </span>
                          <span className="font-mono font-bold text-[#8B6818]">48</span>
                        </div>
                        <div className="flex items-center justify-between text-[#6B7280]">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-[#9CA3AF]" /> Top 100
                          </span>
                          <span className="font-mono">40</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rank Tracking Keywords Table */}
                <div className="rounded-xl border border-[#E5E7EB] bg-white overflow-hidden">
                  <div className="px-4 py-2.5 bg-[#FAF8F5] border-b border-[#EEF0F2] flex items-center justify-between text-[11px]">
                    <span className="font-bold text-[#202124] uppercase tracking-wider">
                      Target Keyword Rankings
                    </span>
                    <span className="text-[#6B7280]">Showing 4 of 142 results</span>
                  </div>
                  <div className="divide-y divide-[#EEF0F2] text-xs">
                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-[#202124] block">
                          enterprise cloud infrastructure security
                        </span>
                        <span className="text-[11px] text-[#6B7280]">
                          Vol: 14.2K · KD: 42 · Commercial Intent
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-[#16805D]">Pos #2 (+3)</span>
                        <span className="px-2 py-0.5 rounded bg-[#F8F5ED] text-[#8B6818] font-bold text-[10px]">
                          Top 3
                        </span>
                      </div>
                    </div>

                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-[#202124] block">
                          soc2 compliance automation software
                        </span>
                        <span className="text-[11px] text-[#6B7280]">
                          Vol: 8.9K · KD: 56 · High Intent
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-[#16805D]">Pos #1 (Dominant)</span>
                        <span className="px-2 py-0.5 rounded bg-[#16805D]/10 text-[#16805D] font-bold text-[10px]">
                          Rank #1
                        </span>
                      </div>
                    </div>

                    <div className="px-4 py-2.5 flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-[#202124] block">
                          real-time b2b revops data pipeline
                        </span>
                        <span className="text-[11px] text-[#6B7280]">
                          Vol: 6.1K · KD: 38 · Commercial
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-[#8B6818]">Pos #3 (+4)</span>
                        <span className="px-2 py-0.5 rounded bg-[#F8F5ED] text-[#8B6818] font-bold text-[10px]">
                          Top 3
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB CONTENT: AI VISIBILITY (GEO) */}
            {activeTab === "ai-visibility" && (
              <motion.div
                key="content-ai"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                {/* AI Search Metrics Banner (Video Frame 10 Style) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl border border-[#8B6818] bg-[#FBF8F0]/80 shadow-xs space-y-1">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#8B6818]">
                      Brand Visibility (GEO)
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-[#202124]">
                        88.6%
                      </span>
                      <span className="text-xs font-bold text-[#16805D]">
                        +4% this month
                      </span>
                    </div>
                    <p className="text-[11px] text-[#6B7280]">
                      Present in 88.6% of buyer recommendation prompts
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-[#E5E7EB] bg-white shadow-xs space-y-1">
                    <span className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider">
                      Share of Voice
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-[#202124]">
                        34.2%
                      </span>
                      <span className="text-xs font-bold text-[#16805D]">
                        Industry Leader
                      </span>
                    </div>
                    <p className="text-[11px] text-[#6B7280]">
                      Outranking nearest competitor by +13.2%
                    </p>
                  </div>

                  <div className="p-4 rounded-xl border border-[#E5E7EB] bg-white shadow-xs space-y-1">
                    <span className="text-[11px] font-medium text-[#6B7280] uppercase tracking-wider">
                      AI Brand Sentiment
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-[#202124]">
                        Positive
                      </span>
                      <span className="text-xs font-bold text-[#16805D]">
                        96% Rating
                      </span>
                    </div>
                    <p className="text-[11px] text-[#6B7280]">
                      Consistently cited as high-reliability provider
                    </p>
                  </div>
                </div>

                {/* AI Executive Summary Box (Video Frame 10 Style) */}
                <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E5E7EB] space-y-1.5">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-[#8B6818] uppercase tracking-wide">
                    <Sparkles className="w-3.5 h-3.5" />
                    AI Summary of Generative Presence
                  </span>
                  <p className="text-xs text-[#202124] leading-relaxed">
                    Your brand appears in <strong>88.6% of conversational AI responses</strong> across Perplexity, ChatGPT Search, and Gemini. Perplexity ranks your domain as the <strong>#1 authoritative source</strong> for cloud infrastructure security.
                  </p>
                </div>

                {/* Brands Visibility by Topic Matrix (Exact Table from Video Frame 10) */}
                <div className="rounded-xl border border-[#E5E7EB] bg-white overflow-hidden">
                  <div className="px-4 py-2.5 bg-[#FAF8F5] border-b border-[#EEF0F2] flex items-center justify-between text-xs">
                    <span className="font-bold text-[#202124] uppercase tracking-wider text-[11px]">
                      Brands Visibility by Topic Matrix
                    </span>
                    <span className="text-[#6B7280] flex items-center gap-1">
                      <span>ChatGPT</span> · <span>Gemini</span> · <span>Perplexity</span>
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-[#EEF0F2] text-[10px] text-[#6B7280] uppercase tracking-wider bg-white">
                          <th className="py-2.5 px-4 font-bold">Topics</th>
                          <th className="py-2.5 px-3 font-bold text-[#8B6818]">#1 Citation</th>
                          <th className="py-2.5 px-3 font-medium">#2 Competitor</th>
                          <th className="py-2.5 px-3 font-medium">#3 Competitor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#EEF0F2]">
                        <tr className="hover:bg-[#FAF8F5]">
                          <td className="py-2.5 px-4 font-semibold text-[#202124]">
                            pricing comparison
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#F8F5ED] text-[#8B6818] font-bold border border-[#C6AD70]/40">
                              Your brand (You) · 68%
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-[#6B7280]">
                            Northpeak · 32%
                          </td>
                          <td className="py-2.5 px-3 text-[#6B7280]">
                            Lumina · 26%
                          </td>
                        </tr>

                        <tr className="hover:bg-[#FAF8F5]">
                          <td className="py-2.5 px-4 font-semibold text-[#202124]">
                            best tools for small teams
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#F8F5ED] text-[#8B6818] font-bold border border-[#C6AD70]/40">
                              Your brand (You) · 54%
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-[#6B7280]">
                            Lumina · 41%
                          </td>
                          <td className="py-2.5 px-3 text-[#6B7280]">
                            Vertex · 18%
                          </td>
                        </tr>

                        <tr className="hover:bg-[#FAF8F5]">
                          <td className="py-2.5 px-4 font-semibold text-[#202124]">
                            how to switch platforms
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#F8F5ED] text-[#8B6818] font-bold border border-[#C6AD70]/40">
                              Your brand (You) · 61%
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-[#6B7280]">
                            Vertex · 29%
                          </td>
                          <td className="py-2.5 px-3 text-[#6B7280]">
                            Meridian · 16%
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Bottom Telemetry Bar */}
          <div className="px-6 py-2.5 bg-[#FAF8F5] border-t border-[#EEF0F2] flex flex-wrap items-center justify-between text-[11px] text-[#6B7280]">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#8B6818]" />
              Enterprise Telemetry v4.2 · Dual-Engine Organic & GEO Intelligence
            </span>
            <span className="font-mono text-[#8B6818] hidden sm:inline">
              Move cursor over workspace for 3D multi-plane depth
            </span>
          </div>
        </motion.div>
      </div>

      {/* =================================================================== */}
      {/* Mobile & Tablet Companion Cards Grid (For Screens < xl)            */}
      {/* =================================================================== */}
      <div className="xl:hidden w-full max-w-[890px] mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {activeTab === "site-audit" && (
          <>
            <div className="p-3.5 sm:p-4 rounded-xl bg-white border border-[#E5E7EB] shadow-xs space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                Pages Crawled Breakdown
              </span>
              <div className="text-xl font-extrabold text-[#202124]">4,820 URLs</div>
              <div className="text-[11px] text-[#16805D] font-semibold">
                4,731 Successful (200 OK) · 21 Broken
              </div>
            </div>

            <div className="p-3.5 sm:p-4 rounded-xl bg-white border border-[#E5E7EB] shadow-xs space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                Issues Prioritized
              </span>
              <div className="text-xl font-extrabold text-[#202124]">12 Items</div>
              <div className="text-[11px] text-[#C2413B] font-semibold">
                3 Critical · 9 Warnings · 42 Passed
              </div>
            </div>

            <div className="p-3.5 sm:p-4 rounded-xl bg-white border border-[#E5E7EB] shadow-xs space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                Core Web Vitals LCP
              </span>
              <div className="text-xl font-extrabold text-[#202124]">1.10s Benchmark</div>
              <div className="text-[11px] text-[#16805D] font-semibold">
                Desktop fast threshold optimal
              </div>
            </div>

            <div className="p-3.5 sm:p-4 rounded-xl bg-white border border-[#E5E7EB] shadow-xs space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                Mobile Speed Index
              </span>
              <div className="text-xl font-extrabold text-[#202124]">1.85s Latency</div>
              <div className="text-[11px] text-[#16805D] font-semibold">
                Passing Google mobile requirement
              </div>
            </div>
          </>
        )}

        {activeTab === "search-visibility" && (
          <>
            <div className="p-3.5 sm:p-4 rounded-xl bg-white border border-[#E5E7EB] shadow-xs space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                SERP Pixel Depth
              </span>
              <div className="text-xl font-extrabold text-[#202124]">178 px Above Fold</div>
              <div className="text-[11px] text-[#16805D] font-semibold">
                Position #1 for top commercial terms
              </div>
            </div>

            <div className="p-3.5 sm:p-4 rounded-xl bg-white border border-[#E5E7EB] shadow-xs space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                Organic Traffic Value
              </span>
              <div className="text-xl font-extrabold text-[#202124]">$184,200 / mo</div>
              <div className="text-[11px] text-[#16805D] font-semibold">
                +14.2% monthly ranking gains
              </div>
            </div>

            <div className="p-3.5 sm:p-4 rounded-xl bg-white border border-[#E5E7EB] shadow-xs space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                Tracked Competitors
              </span>
              <div className="text-xl font-extrabold text-[#202124]">61,240 Gap</div>
              <div className="text-[11px] text-[#8B6818] font-semibold">
                Northpeak keyword gap opportunity
              </div>
            </div>

            <div className="p-3.5 sm:p-4 rounded-xl bg-white border border-[#E5E7EB] shadow-xs space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                Ranking Velocity
              </span>
              <div className="text-xl font-extrabold text-[#202124]">+18 Keywords</div>
              <div className="text-[11px] text-[#16805D] font-semibold">
                New Top 3 SERP additions
              </div>
            </div>
          </>
        )}

        {activeTab === "ai-visibility" && (
          <>
            <div className="p-3.5 sm:p-4 rounded-xl bg-white border border-[#E5E7EB] shadow-xs space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                AI Model Rankings
              </span>
              <div className="text-xl font-extrabold text-[#202124]">1.00 👑 Rank</div>
              <div className="text-[11px] text-[#8B6818] font-semibold">
                Leader on ChatGPT, Gemini & Perplexity
              </div>
            </div>

            <div className="p-3.5 sm:p-4 rounded-xl bg-white border border-[#E5E7EB] shadow-xs space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                Sentiment Across LLMs
              </span>
              <div className="text-xl font-extrabold text-[#202124]">82% Positive</div>
              <div className="text-[11px] text-[#16805D] font-semibold">
                Zero negative source citations
              </div>
            </div>

            <div className="p-3.5 sm:p-4 rounded-xl bg-white border border-[#E5E7EB] shadow-xs space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                Citation Ranking
              </span>
              <div className="text-xl font-extrabold text-[#202124]">34.2% Market Share</div>
              <div className="text-[11px] text-[#8B6818] font-semibold">
                #1 Cited across commercial prompts
              </div>
            </div>

            <div className="p-3.5 sm:p-4 rounded-xl bg-white border border-[#E5E7EB] shadow-xs space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
                Share of Voice (GEO)
              </span>
              <div className="text-xl font-extrabold text-[#202124]">34% Dominance</div>
              <div className="text-[11px] text-[#16805D] font-semibold">
                Outranking nearest competitor by +13%
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
