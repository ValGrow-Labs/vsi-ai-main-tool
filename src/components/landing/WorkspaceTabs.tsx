"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Search, Bot } from "lucide-react";
import { VSI_COLORS } from "./tokens";

export type WorkspaceTabId = "site-audit" | "search-visibility" | "ai-visibility";

interface WorkspaceTabItem {
  id: WorkspaceTabId;
  label: string;
  shortDescription: string;
}

const TABS: WorkspaceTabItem[] = [
  {
    id: "site-audit",
    label: "Site Audit",
    shortDescription: "Core Web Vitals, Crawlability, and Schema Architecture",
  },
  {
    id: "search-visibility",
    label: "Search Visibility",
    shortDescription: "Google SERP Keyword Rank Tracking and Market Share",
  },
  {
    id: "ai-visibility",
    label: "AI Visibility",
    shortDescription: "Generative Citations across Perplexity, ChatGPT, and Gemini",
  },
];

interface WorkspaceTabsProps {
  activeTab: WorkspaceTabId;
  onTabChange: (tab: WorkspaceTabId) => void;
}

export function WorkspaceTabs({ activeTab, onTabChange }: WorkspaceTabsProps) {
  return (
    <div className="w-full max-w-4xl mx-auto mb-8 sm:mb-10">
      {/* Container with full-width bottom baseline divider */}
      <div className="relative border-b border-[#E5E7EB] overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex items-center justify-around sm:justify-center gap-2 sm:gap-12 md:gap-16 lg:gap-24 min-w-max sm:min-w-0 mx-auto px-2">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className="relative pb-3 sm:pb-3.5 pt-1 px-2.5 sm:px-3 text-center group cursor-pointer focus:outline-none shrink-0"
              >
                {/* Tab Label */}
                <span
                  className={`text-sm sm:text-base md:text-[17px] tracking-tight transition-colors duration-200 block ${
                    isActive
                      ? "font-bold text-[#202124]"
                      : "font-medium text-[#6B7280] group-hover:text-[#202124]"
                  }`}
                >
                  {tab.label}
                </span>

                {/* Animated Gold Underline that Glides Smoothly (Video Style) */}
                {isActive && (
                  <motion.div
                    layoutId="activeWorkspaceTabUnderline"
                    className="absolute bottom-0 inset-x-0 h-[2.5px] sm:h-[3px] bg-[#8B6818] rounded-full z-10"
                    transition={{
                      type: "spring",
                      stiffness: 420,
                      damping: 32,
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

