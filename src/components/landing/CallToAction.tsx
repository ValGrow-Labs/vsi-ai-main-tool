"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ArrowRight, Search, Bot, ShieldCheck, Sparkles, CheckCircle2 } from "lucide-react";
import { VSI_COLORS } from "./tokens";

export function CallToAction() {
  const [domain, setDomain] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = domain.trim()
      ? `/login?mode=signup&domain=${encodeURIComponent(domain.trim())}`
      : "/login?mode=signup";
    window.location.href = target;
  };

  return (
    <div className="w-full relative rounded-2xl sm:rounded-3xl bg-[#F8F5ED] border border-[#C6AD70]/40 p-6 sm:p-10 lg:p-16 overflow-hidden shadow-xs">
      {/* Subtle line-art geometry in the background (Reference B motif) */}
      <div className="absolute -right-24 -bottom-24 w-96 h-96 rounded-full border border-[#C6AD70]/25 pointer-events-none" />
      <div className="absolute -right-12 -bottom-12 w-72 h-72 rounded-full border border-[#C6AD70]/30 pointer-events-none" />
      <div className="absolute right-12 bottom-12 w-48 h-48 rounded-full border border-[#C6AD70]/20 pointer-events-none" />

      <div className="relative z-10 max-w-3xl mx-auto text-center">
        {/* Eyebrow */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#C6AD70]/40 text-[#8B6818] text-xs font-semibold shadow-xs mb-4">
          <Sparkles className="w-3.5 h-3.5" />
          <span>ValGrow Search Intelligence</span>
        </div>

        {/* Headline from Reference B */}
        <h2 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold text-[#202124] tracking-tight leading-tight">
          Turn search and AI visibility into real business growth.
        </h2>

        <p className="mt-4 text-sm sm:text-base text-[#6B7280] leading-relaxed max-w-2xl mx-auto">
          Start your full technical SEO audit and AI presence check in under 60 seconds. No credit card required.
        </p>

        {/* Interactive Domain Input */}
        <form
          onSubmit={handleSubmit}
          className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-2 max-w-xl mx-auto bg-white p-2 rounded-xl border border-[#E5E7EB] shadow-xs"
        >
          <div className="relative flex-1 w-full flex items-center">
            <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="Enter your website domain (e.g. acme.com)"
              className="w-full h-11 pl-10 pr-3 text-sm text-[#202124] placeholder:text-[#9CA3AF] bg-transparent border-0 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="w-full sm:w-auto h-11 px-6 rounded-lg bg-[#8B6818] text-white text-sm font-semibold hover:bg-[#8B6818]/90 transition-all flex items-center justify-center gap-2 shrink-0 shadow-xs cursor-pointer"
          >
            <span>Run Instant Audit</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Three concise benefits from Reference B */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-6 pt-8 border-t border-[#C6AD70]/30 text-left">
          <div className="flex items-start gap-3">
            <span className="w-8 h-8 rounded-lg bg-white border border-[#C6AD70]/40 flex items-center justify-center text-[#8B6818] shrink-0">
              <Search className="w-4 h-4" />
            </span>
            <div>
              <span className="text-xs font-bold text-[#202124] block">
                Search Visibility
              </span>
              <span className="text-[11px] text-[#6B7280]">
                Track rank movements and organic keyword share.
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="w-8 h-8 rounded-lg bg-white border border-[#C6AD70]/40 flex items-center justify-center text-[#8B6818] shrink-0">
              <Bot className="w-4 h-4" />
            </span>
            <div>
              <span className="text-xs font-bold text-[#202124] block">
                AI Presence
              </span>
              <span className="text-[11px] text-[#6B7280]">
                Track citations in Perplexity, ChatGPT, and Gemini.
              </span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <span className="w-8 h-8 rounded-lg bg-white border border-[#C6AD70]/40 flex items-center justify-center text-[#8B6818] shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </span>
            <div>
              <span className="text-xs font-bold text-[#202124] block">
                Actionable Insights
              </span>
              <span className="text-[11px] text-[#6B7280]">
                Clear step-by-step developer fixes with impact scores.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

