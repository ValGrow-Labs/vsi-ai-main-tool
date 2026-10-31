"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Search, ArrowRight, Sparkles, CheckCircle2, Loader2 } from "lucide-react";
import { VSI_COLORS } from "./tokens";

/* -------------------------------------------------------------------------- */
/* Authentic Platform Vector Glyphs                                           */
/* -------------------------------------------------------------------------- */

const GoogleGlyph = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
    />
  </svg>
);

const ChatGPTGlyph = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 fill-current" aria-hidden="true">
    <path d="M22.28 9.37a5.98 5.98 0 0 0-.52-4.94 6.07 6.07 0 0 0-6.49-2.82 6.07 6.07 0 0 0-4.66-2.08 6.08 6.08 0 0 0-5.78 4.2A6.03 6.03 0 0 0 .84 7.3a6.07 6.07 0 0 0 .97 7.08 6.04 6.04 0 0 0 .52 4.94 6.07 6.07 0 0 0 6.49 2.82 6.05 6.05 0 0 0 4.66 2.08 6.08 6.08 0 0 0 5.78-4.2 6.04 6.04 0 0 0 3.99-3.57 6.07 6.07 0 0 0-.97-7.08zM12.01 22a4.57 4.57 0 0 1-3.32-1.45l.13-.07 4.19-2.42a.77.77 0 0 0 .39-.67v-5.91l1.78 1.03v4.9A4.59 4.59 0 0 1 12 22zm-7.66-3.83a4.54 4.54 0 0 1-.61-3.57l.14.08 4.19 2.42c.24.14.4.38.4.66v2.96a4.57 4.57 0 0 1-4.12-2.55zm-1.8-9.04a4.57 4.57 0 0 1 2.7-2.12v4.99a.77.77 0 0 0 .39.67l4.19 2.42-1.78 1.03-4.24-2.45a4.58 4.58 0 0 1-1.26-4.54zm13.12 2.65l-4.19-2.42a.77.77 0 0 0-.78 0l-4.19 2.42-1.78-1.03 4.24-2.45a4.57 4.57 0 0 1 6.64 2.12v4.99a.77.77 0 0 0-.39-.67l-3.55-2.05v-1.91zm2.34 6.39a4.57 4.57 0 0 1-2.7 2.12v-4.99a.77.77 0 0 0-.39-.67l-4.19-2.42 1.78-1.03 4.24 2.45c.66 1.34.75 2.92.17 4.41l1.09.13zm1.8-9.04l-.14-.08-4.19-2.42a.77.77 0 0 0-.4-.66v-2.96a4.57 4.57 0 0 1 4.73 6.12z" />
  </svg>
);

const GeminiGlyph = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 fill-current" aria-hidden="true">
    <path d="M12 0C12 6.627 6.627 12 0 12c6.627 0 12 5.373 12 12 0-6.627 5.373-12 12-12-6.627 0-12-5.373-12-12z" />
  </svg>
);

const PerplexityGlyph = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 fill-none stroke-current" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07" />
    <circle cx="12" cy="12" r="3.5" fill="currentColor" />
  </svg>
);

const ClaudeGlyph = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 fill-current" aria-hidden="true">
    <path d="M12 2.5l2.2 6.8h7.1l-5.7 4.2 2.2 6.8-5.8-4.2-5.8 4.2 2.2-6.8-5.7-4.2h7.1z" />
  </svg>
);

/* -------------------------------------------------------------------------- */
/* Hero Fold Component                                                        */
/* -------------------------------------------------------------------------- */

export function HeroFold() {
  const [url, setUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAnalyze = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    let targetDomain = url.trim();
    if (!targetDomain) {
      targetDomain = "example.com";
    }

    targetDomain = targetDomain.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
    setIsSubmitting(true);

    setTimeout(() => {
      window.location.href = `/login?mode=signup&domain=${encodeURIComponent(targetDomain)}`;
    }, 600);
  };

  const platforms = [
    { name: "Google", Glyph: GoogleGlyph, highlight: "hover:text-[#8B6818]" },
    { name: "ChatGPT", Glyph: ChatGPTGlyph, highlight: "hover:text-[#8B6818]" },
    { name: "Gemini", Glyph: GeminiGlyph, highlight: "hover:text-[#8B6818]" },
    { name: "Perplexity", Glyph: PerplexityGlyph, highlight: "hover:text-[#8B6818]" },
    { name: "Claude", Glyph: ClaudeGlyph, highlight: "hover:text-[#8B6818]" },
  ];

  return (
    <section className="relative w-full pt-10 sm:pt-16 lg:pt-20 pb-16 sm:pb-24 lg:pb-28 overflow-hidden bg-[#FFFFFF]">
      {/* ===================================================================== */}
      {/* Animated Subtle Muted Gold Curved SVG Strokes                         */}
      {/* ===================================================================== */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden flex items-center justify-center">
        {/* Ambient Top Subtle Warm Cream Glow */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[820px] h-[380px] opacity-60 blur-[110px] rounded-full pointer-events-none"
          style={{
            background: "radial-gradient(circle, rgba(198, 173, 112, 0.2) 0%, rgba(248, 245, 237, 0.75) 60%, transparent 100%)",
          }}
        />

        {/* Dynamic Curved SVG Vector */}
        <svg
          className="absolute w-[1280px] h-[660px] max-w-none -top-10 left-1/2 -translate-x-1/2 opacity-80"
          viewBox="0 0 1200 640"
          fill="none"
        >
          <motion.path
            d="M 60 220 C 300 80, 520 80, 720 180 C 920 280, 1080 210, 1140 120"
            stroke="url(#gold-grad-1)"
            strokeWidth="2.5"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.85 }}
            transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
          />
          <motion.path
            d="M 120 480 C 340 560, 680 540, 880 440 C 1040 360, 1120 420, 1180 460"
            stroke="url(#gold-grad-2)"
            strokeWidth="1.8"
            strokeDasharray="6 8"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.55 }}
            transition={{ duration: 2.2, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          />

          <defs>
            <linearGradient id="gold-grad-1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8B6818" stopOpacity="0" />
              <stop offset="35%" stopColor="#8B6818" stopOpacity="0.85" />
              <stop offset="70%" stopColor="#C6AD70" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#8B6818" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="gold-grad-2" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8B6818" stopOpacity="0" />
              <stop offset="50%" stopColor="#B59A55" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#8B6818" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Main Container with generous maxWidth to prevent collisions */}
      <div className="relative z-10 max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* =================================================================== */}
        {/* Subtle Floating Decorative Elements (Safely Positioned Outside Text) */}
        {/* =================================================================== */}
        <div className="hidden xl:block pointer-events-none">
          {/* Left Floating Badge: Perplexity #1 Source */}
          <motion.div
            initial={{ opacity: 0, x: -20, y: 0 }}
            animate={{ opacity: 1, x: 0, y: [0, -6, 0] }}
            transition={{
              opacity: { duration: 0.8, delay: 0.4 },
              x: { duration: 0.8, delay: 0.4 },
              y: { repeat: Infinity, duration: 4.2, ease: "easeInOut" },
            }}
            className="absolute left-4 2xl:left-12 top-24 bg-[#FFFFFF] border border-[#E5E7EB] rounded-full px-3.5 py-1.5 shadow-[0_8px_24px_rgba(32,33,36,0.05)] flex items-center gap-2"
          >
            <span className="w-2 h-2 rounded-full bg-[#16805D] animate-pulse" />
            <span className="text-[12px] font-semibold text-[#202124] flex items-center gap-1.5">
              <PerplexityGlyph />
              Perplexity #1 Citation
            </span>
          </motion.div>

          {/* Right Floating Badge: Google AI Overview */}
          <motion.div
            initial={{ opacity: 0, x: 20, y: 0 }}
            animate={{ opacity: 1, x: 0, y: [0, 6, 0] }}
            transition={{
              opacity: { duration: 0.8, delay: 0.5 },
              x: { duration: 0.8, delay: 0.5 },
              y: { repeat: Infinity, duration: 4.8, ease: "easeInOut" },
            }}
            className="absolute right-4 2xl:right-12 top-28 bg-[#FFFFFF] border border-[#E5E7EB] rounded-full px-3.5 py-1.5 shadow-[0_8px_24px_rgba(32,33,36,0.05)] flex items-center gap-2"
          >
            <span className="w-2 h-2 rounded-full bg-[#8B6818] animate-ping" />
            <span className="text-[12px] font-semibold text-[#202124] flex items-center gap-1.5">
              <GeminiGlyph />
              AI Overview Featured
            </span>
          </motion.div>
        </div>

        {/* =================================================================== */}
        {/* Main Centered Content Column                                        */}
        {/* =================================================================== */}
        <div className="flex flex-col items-center text-center max-w-5xl mx-auto">
          {/* Eyebrow Badge */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#FFFFFF] border border-[#E5E7EB] shadow-xs text-xs font-semibold text-[#8B6818] mb-6"
          >
            <span className="w-2 h-2 rounded-full bg-[#8B6818]" />
            <span>ValGrow Search Intelligence (VSI) · Next-Gen SEO & GEO</span>
          </motion.div>

          {/* ================================================================= */}
          {/* Main Headline (Clean 2-Line Alignment, No Orphaned Words)        */}
          {/* ================================================================= */}
          <motion.div
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
            className="w-full px-2"
          >
            <h1 className="text-[28px] sm:text-[44px] md:text-[54px] lg:text-[64px] xl:text-[72px] font-extrabold tracking-[-0.03em] text-[#202124] leading-[1.15] text-center max-w-4xl lg:max-w-5xl mx-auto break-words">
              <span className="block whitespace-normal lg:whitespace-nowrap">
                Dominate Google Search.
              </span>
              <span className="block mt-1 sm:mt-2.5 whitespace-normal lg:whitespace-nowrap">
                Be the Trusted Answer in{" "}
                <span className="relative inline-block text-[#8B6818] whitespace-nowrap">
                  AI.
                  {/* Animated Hand-Drawn Muted Gold Curved Underline */}
                  <svg
                    className="absolute -bottom-2 sm:-bottom-3.5 left-0 w-full h-[14px] sm:h-[18px] text-[#8B6818] overflow-visible pointer-events-none"
                    viewBox="0 0 100 20"
                    fill="none"
                  >
                    <motion.path
                      d="M 2 14 C 28 4, 72 4, 98 12 C 78 17, 36 18, 12 16"
                      stroke="currentColor"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 1.1, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    />
                  </svg>
                </span>
              </span>
            </h1>
          </motion.div>

          {/* ================================================================= */}
          {/* Supporting Text (Balanced and Centered)                           */}
          {/* ================================================================= */}
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6 sm:mt-8 text-base sm:text-lg lg:text-[19px] leading-relaxed text-[#6B7280] max-w-2xl sm:max-w-3xl font-normal text-center mx-auto [text-wrap:balance]"
          >
            ValGrow Search Intelligence unifies deep technical site auditing with Generative Engine Optimization (GEO)—turning your organic search rankings and AI citations into predictable business growth.
          </motion.p>

          {/* ================================================================= */}
          {/* Search Input Bar                                                  */}
          {/* ================================================================= */}
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.75, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-2xl sm:max-w-2xl lg:max-w-3xl mt-8 sm:mt-10 mx-auto"
          >
            <form
              onSubmit={handleAnalyze}
              className="relative flex flex-col sm:flex-row items-center bg-[#FFFFFF] rounded-2xl sm:rounded-full p-2 sm:p-2 border border-[#E5E7EB] shadow-[0_12px_36px_-8px_rgba(32,33,36,0.06),0_2px_8px_-2px_rgba(32,33,36,0.03)] hover:border-[#D1D5DB] focus-within:border-[#8B6818] focus-within:ring-4 focus-within:ring-[#8B6818]/15 transition-all duration-200"
            >
              {/* Left Search Icon */}
              <div className="hidden sm:flex items-center pl-4 pr-1 text-[#9CA3AF] pointer-events-none">
                <Search className="w-5 h-5 text-[#9CA3AF]" strokeWidth={2} />
              </div>

              {/* URL Input Field */}
              <div className="relative w-full flex-1 flex items-center">
                <div className="sm:hidden pl-3 text-[#9CA3AF] pointer-events-none">
                  <Search className="w-4 h-4 text-[#9CA3AF]" strokeWidth={2} />
                </div>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Enter your website URL to audit your SEO & AI presence..."
                  className="w-full h-11 sm:h-12 pl-2 sm:pl-2 pr-3 text-sm sm:text-base text-[#202124] placeholder:text-[#9CA3AF] bg-transparent border-0 focus:outline-none focus:ring-0"
                />
              </div>

              {/* Muted Gold CTA Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto h-11 sm:h-12 px-6 sm:px-7 rounded-xl sm:rounded-full bg-[#8B6818] text-white text-sm sm:text-[15px] font-semibold hover:bg-[#785913] active:translate-y-px transition-all duration-150 flex items-center justify-center gap-2 shrink-0 shadow-xs hover:shadow-[0_4px_16px_rgba(139,104,24,0.32)] cursor-pointer disabled:opacity-80"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <>
                    <span>Analyze Now</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </motion.div>

          {/* ================================================================= */}
          {/* AI Platform Indicators (Google | ChatGPT | Gemini | etc.)         */}
          {/* ================================================================= */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.42 }}
            className="mt-7 sm:mt-9 flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-4 gap-y-2 text-xs sm:text-[13px] text-[#6B7280]"
          >
            <span className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-[#9CA3AF] mr-1 hidden md:inline-block">
              Monitored across:
            </span>

            {platforms.map((platform, idx) => {
              const { name, Glyph, highlight } = platform;
              return (
                <React.Fragment key={name}>
                  <div
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-colors duration-150 text-[#202124] hover:text-[#8B6818] hover:bg-[#F8F5ED] cursor-default ${highlight}`}
                  >
                    <Glyph />
                    <span className="font-medium text-xs sm:text-[13px]">{name}</span>
                  </div>
                  {idx < platforms.length - 1 && (
                    <span className="text-[#E5E7EB] select-none font-light" aria-hidden="true">
                      |
                    </span>
                  )}
                </React.Fragment>
              );
            })}
          </motion.div>

          {/* Trust Highlights Line */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.52 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-5 sm:gap-8 text-xs text-[#6B7280] pt-2"
          >
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#16805D]" />
              Auditing 4.2M+ enterprise URLs
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#16805D]" />
              Sub-minute SERP & GEO polling
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#16805D]" />
              SOC2 Type II & WCAG AA certified
            </span>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
