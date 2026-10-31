"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ArrowRight, Sparkles, CheckCircle2 } from "lucide-react";
import { VSI_COLORS } from "./tokens";

type TierName = "Starter" | "Professional" | "Enterprise";

interface Tier {
  id: string;
  name: TierName;
  description: string;
  priceMonthly: number;
  priceAnnual: number;
  badge?: string | null;
  features: string[];
  ctaText: string;
}

const TIERS: Tier[] = [
  {
    id: "starter",
    name: "Starter",
    description: "For startups, indie founders, and growing sites wanting technical SEO clarity & health scans.",
    priceMonthly: 89,
    priceAnnual: 69,
    badge: null,
    features: [
      "Up to 5,000 crawled pages / audit",
      "200 Google SERP tracked keywords",
      "Weekly technical health scans",
      "Basic Generative AI citation monitor",
      "1 workspace & 2 team members",
      "Standard email support",
    ],
    ctaText: "Start Starter Plan",
  },
  {
    id: "professional",
    name: "Professional",
    description: "For high-growth SaaS and modern marketing teams needing full search and GEO intelligence.",
    priceMonthly: 219,
    priceAnnual: 179,
    badge: "Most Popular for Growth",
    features: [
      "Up to 50,000 crawled pages / audit",
      "1,500 daily Google SERP keywords",
      "Full GEO Radar (Perplexity, ChatGPT, Gemini)",
      "Automated developer fix guides & code snippets",
      "Head-to-head competitor benchmarking (up to 5)",
      "Daily automated crawls & alert webhooks",
      "Unlimited client shareable audit links",
      "Priority technical support",
    ],
    ctaText: "Start Free 14-Day Audit",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "For agencies, multi-brand portfolios, and enterprise security compliance requirements.",
    priceMonthly: 549,
    priceAnnual: 449,
    badge: "Agency & Enterprise",
    features: [
      "Up to 500,000 crawled pages / audit",
      "Unlimited tracked keywords & clusters",
      "Multi-engine custom prompt simulation",
      "White-label client reporting & custom domain",
      "Dedicated API access & webhook triggers",
      "Unlimited team seats & role-based RLS permissions",
      "99.9% uptime SLA & dedicated account strategist",
    ],
    ctaText: "Contact Enterprise Sales",
  },
];

export function PricingComparison() {
  const [annualBilling, setAnnualBilling] = useState(true);
  const [selectedTier, setSelectedTier] = useState<TierName>("Professional");

  return (
    <div className="w-full">
      {/* =================================================================== */}
      {/* Interactive Billing Frequency Selector (100% Clickable)             */}
      {/* =================================================================== */}
      <div className="flex items-center justify-center mb-10 sm:mb-12">
        <div className="inline-flex items-center p-1.5 rounded-full bg-[#FAF8F5] border border-[#E5E7EB] shadow-xs">
          {/* Monthly Button */}
          <button
            type="button"
            onClick={() => setAnnualBilling(false)}
            className={`px-4 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer ${
              !annualBilling
                ? "bg-[#8B6818] text-white shadow-xs"
                : "text-[#6B7280] hover:text-[#202124]"
            }`}
          >
            Monthly billing
          </button>

          {/* Annual Button with 20% Discount Badge */}
          <button
            type="button"
            onClick={() => setAnnualBilling(true)}
            className={`px-4 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 flex items-center gap-2 cursor-pointer ${
              annualBilling
                ? "bg-[#8B6818] text-white shadow-xs"
                : "text-[#6B7280] hover:text-[#202124]"
            }`}
          >
            <span>Annual billing</span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${
                annualBilling
                  ? "bg-white text-[#8B6818]"
                  : "bg-[#F8F5ED] text-[#8B6818] border border-[#C6AD70]/50"
              }`}
            >
              Save 20%
            </span>
          </button>
        </div>
      </div>

      {/* =================================================================== */}
      {/* Pricing Cards Grid (Clickable Tier Selection)                       */}
      {/* =================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 items-stretch max-w-6xl mx-auto">
        {TIERS.map((tier) => {
          const isSelected = selectedTier === tier.name;
          const price = annualBilling ? tier.priceAnnual : tier.priceMonthly;

          return (
            <div
              key={tier.name}
              onClick={() => setSelectedTier(tier.name)}
              className={`rounded-2xl p-6 sm:p-8 flex flex-col justify-between transition-all duration-200 cursor-pointer relative ${
                isSelected
                  ? "bg-[#FFFFFF] border-2 border-[#8B6818] shadow-[0_12px_36px_-6px_rgba(139,104,24,0.18)] lg:-translate-y-2 ring-2 ring-[#8B6818]/10"
                  : "bg-[#FFFFFF] border border-[#E5E7EB] shadow-xs hover:border-[#8B6818]/50 hover:shadow-md hover:bg-[#FAF8F5]/30"
              }`}
            >
              {/* Top Badge: Fixed with whitespace-nowrap to prevent line breaks */}
              {tier.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
                  <span className="px-3.5 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase bg-[#8B6818] text-white shadow-xs whitespace-nowrap inline-block">
                    {tier.badge}
                  </span>
                </div>
              )}

              <div>
                {/* Header Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xl font-bold text-[#202124]">
                      {tier.name}
                    </h4>
                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-[#8B6818]" />
                    )}
                  </div>
                  {isSelected ? (
                    <span className="flex items-center gap-1 text-xs font-bold text-[#8B6818] bg-[#F8F5ED] px-2 py-0.5 rounded-full border border-[#C6AD70]/40">
                      <Sparkles className="w-3.5 h-3.5 text-[#8B6818]" />
                      Selected
                    </span>
                  ) : (
                    <span className="text-[11px] text-[#9CA3AF] hover:text-[#8B6818] font-medium">
                      Click to select
                    </span>
                  )}
                </div>

                <p className="text-xs sm:text-sm text-[#6B7280] mt-2.5 min-h-[42px] leading-relaxed">
                  {tier.description}
                </p>

                {/* Animated Price Section */}
                <div className="mt-6 pb-6 border-b border-[#EEF0F2] flex items-baseline gap-1.5">
                  <span className="text-4xl sm:text-5xl font-extrabold tracking-tight text-[#202124] tabular-nums">
                    ${price}
                  </span>
                  <div className="flex flex-col text-[11px] text-[#6B7280] font-medium leading-tight">
                    <span>/ month</span>
                    <span className="text-[#8B6818] font-semibold">
                      {annualBilling ? "billed annually" : "billed monthly"}
                    </span>
                  </div>
                </div>

                {/* Feature Checklist */}
                <ul className="mt-6 space-y-3">
                  {tier.features.map((feat) => (
                    <li
                      key={feat}
                      className="flex items-start gap-2.5 text-xs sm:text-sm text-[#202124]"
                    >
                      <Check className="w-4 h-4 text-[#16805D] shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action Button */}
              <div className="mt-8 pt-6 border-t border-[#EEF0F2]">
                <Link
                  href={`/login?mode=signup&plan=${tier.id}&billing=${annualBilling ? "annual" : "monthly"}`}
                  onClick={(e) => e.stopPropagation()}
                  className={`w-full h-11 flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all duration-150 shadow-xs cursor-pointer ${
                    isSelected
                      ? "bg-[#8B6818] text-white hover:bg-[#785913] hover:shadow-[0_4px_16px_rgba(139,104,24,0.3)] active:translate-y-px"
                      : "bg-[#FFFFFF] border border-[#E5E7EB] text-[#202124] hover:bg-[#8B6818] hover:text-white hover:border-[#8B6818]"
                  }`}
                >
                  <span>{tier.ctaText}</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <span className="block text-center text-[11px] text-[#6B7280] mt-2.5">
                  {tier.id === "enterprise"
                    ? "Custom SLA & dedicated account strategist"
                    : "No credit card required for 14-day evaluation"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
