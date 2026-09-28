"use client";

import { AI_ENGINES, GOOGLE_AI_OVERVIEW } from "@/lib/ai-engines";
import { useState } from "react";
import { Search, MapPin, Languages, Check, Plus, Trash2, Sparkles, Target } from "lucide-react";
import { motion } from "framer-motion";
import { LOCATIONS, type Location } from "@/types/search";

export interface KeywordSetupItem {
  keyword: string;
  category: string;
  categoryLabel: string;
  selected: boolean;
}

interface AnalysisSetupProps {
  /** False when automatic analysis couldn't be completed and the user set everything up. */
  analyzed?: boolean;
  topics: string[];
  keywords: KeywordSetupItem[];
  location: string;
  /** Empty when no market is known yet: the user must choose one. */
  locationCode: Location | "";
  language: string;
  targetCustomers: string[];
  competitors: string[];
  sitemapUrl: string;
  geoTopics: string[];
  onKeywordsChange: (keywords: KeywordSetupItem[]) => void;
  onLocationChange: (code: Location, name: string) => void;
  onLanguageChange: (lang: string) => void;
}

export function AnalysisSetup({
  analyzed = true,
  topics,
  keywords,
  location,
  locationCode,
  language,
  targetCustomers,
  competitors,
  sitemapUrl,
  geoTopics,
  onKeywordsChange,
  onLocationChange,
  onLanguageChange,
}: AnalysisSetupProps) {
  const [kwList, setKwList] = useState<KeywordSetupItem[]>(keywords);
  const [newKwInput, setNewKwInput] = useState("");

  function notifyKw(next: KeywordSetupItem[]) {
    setKwList(next);
    onKeywordsChange(next);
  }

  function toggleKw(kw: string) {
    const next = kwList.map((item) => (item.keyword === kw ? { ...item, selected: !item.selected } : item));
    notifyKw(next);
  }

  function addKw() {
    const trimmed = newKwInput.trim().toLowerCase();
    if (!trimmed) return;
    if (!kwList.some((k) => k.keyword === trimmed)) {
      const next = [
        ...kwList,
        { keyword: trimmed, category: "primary", categoryLabel: "Custom Query", selected: true },
      ];
      notifyKw(next);
    }
    setNewKwInput("");
  }

  function removeKw(kw: string) {
    const next = kwList.filter((k) => k.keyword !== kw);
    notifyKw(next);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3 }}
      className="space-y-8 py-2"
    >
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Search &amp; SEO Analysis Setup
        </h1>
        <p className="max-w-[70ch] text-base leading-relaxed text-ink-2">
          {analyzed
            ? "We've configured your search setup automatically based on your website. Review and adjust these parameters before we start."
            : "Add the searches you want to track and choose the search location before we start."}
        </p>
      </div>

      {/* Primary Question / Target Topics */}
      <div className="rounded-panel border border-brand/30 bg-brand-soft/40 p-6 space-y-3">
        <div className="flex items-center gap-2 text-brand-strong">
          <Target className="h-5 w-5" />
          <h2 className="text-lg font-semibold text-ink">What do you want people to find you for?</h2>
        </div>
        <p className="text-body text-ink-2">
          These topics help us understand what searches your business should appear for.
        </p>

        <div className="flex flex-wrap gap-2 pt-2">
          {topics.map((t) => (
            <span
              key={t}
              className="rounded-xl border border-brand-strong/30 bg-surface px-3 py-1.5 text-support font-semibold text-brand-strong shadow-2xs"
            >
              {t}
            </span>
          ))}
          {topics.length === 0 && (
            <p className="text-support italic text-ink-3">No topics added.</p>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Keywords Section - 2 Columns */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-panel border border-line bg-surface p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-brand-strong" />
                <h3 className="font-semibold text-ink">Suggested Keywords to Track</h3>
              </div>
              <span className="text-caption font-medium text-ink-3">
                {kwList.filter((k) => k.selected).length} selected
              </span>
            </div>

            {/* Keyword Add Input */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Add custom keyword (e.g. best running shoes)"
                value={newKwInput}
                onChange={(e) => setNewKwInput(e.target.value)}
                className="h-10 w-full rounded-control border border-line-strong bg-surface px-3 text-body text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
              />
              <button
                type="button"
                onClick={addKw}
                disabled={!newKwInput.trim()}
                className="flex h-10 items-center gap-1.5 rounded-control bg-ink px-4 text-support font-medium text-white hover:bg-ink-2 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
                <span>Add</span>
              </button>
            </div>

            {/* Keywords list */}
            <div className="divide-y divide-line rounded-control border border-line bg-surface-2/40 overflow-hidden">
              {kwList.map((item) => (
                <div
                  key={item.keyword}
                  className={`flex items-center justify-between gap-3 px-4 py-2.5 transition-colors ${
                    item.selected ? "bg-surface" : "bg-surface-2/50 opacity-60"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleKw(item.keyword)}
                    className="flex items-center gap-3 text-left focus:outline-none min-w-0"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        item.selected ? "border-brand-strong bg-brand-strong text-white" : "border-line-strong bg-surface"
                      }`}
                    >
                      {item.selected && <Check className="h-3 w-3 stroke-[3]" />}
                    </span>
                    <span className="text-body font-medium text-ink truncate">{item.keyword}</span>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="rounded-control bg-surface-2 px-2 py-0.5 text-caption font-medium text-ink-3">
                      {item.categoryLabel || item.category}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeKw(item.keyword)}
                      className="text-ink-3 hover:text-critical p-1"
                      aria-label={`Remove keyword ${item.keyword}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI / GEO Topics Card */}
          {geoTopics.length > 0 && (
            <div className="rounded-panel border border-line bg-surface p-5 space-y-3">
              <div className="flex items-center gap-2 text-support font-medium text-ink">
                <Sparkles className="h-4 w-4 text-brand-strong" />
                <h3 className="font-semibold text-ink">GEO / AI Search Prompts</h3>
              </div>
              <p className="text-support text-ink-2">
                Questions VSI checks in {GOOGLE_AI_OVERVIEW} and {AI_ENGINES.chatgpt.label}.
              </p>
              <ul className="space-y-2 pt-1">
                {geoTopics.map((promptText, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-body text-ink bg-surface-2 p-2.5 rounded-control">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-soft font-mono text-caption text-brand-strong font-bold">
                      ?
                    </span>
                    <span>{promptText}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Right Sidebar Setup Parameters */}
        <div className="space-y-4">
          <div className="rounded-panel border border-line bg-surface p-5 space-y-4">
            <h3 className="font-semibold text-ink border-b border-line pb-2.5">
              Search Parameters
            </h3>

            {/* Location */}
            <div className="space-y-1.5">
              <label htmlFor="search-loc" className="flex items-center gap-1.5 text-support font-medium text-ink">
                <MapPin className="h-4 w-4 text-ink-3" />
                <span>Search Location</span>
              </label>
              <select
                id="search-loc"
                value={locationCode}
                onChange={(e) => {
                  const code = e.target.value as Location;
                  const locObj = LOCATIONS[code];
                  onLocationChange(code, locObj?.label.split("(")[0].trim() || location);
                }}
                className="h-10 w-full rounded-control border border-line-strong bg-surface px-3 text-body text-ink focus:border-brand focus:outline-none"
              >
                {!locationCode && (
                  <option value="" disabled>
                    Select a location
                  </option>
                )}
                {(Object.entries(LOCATIONS) as [Location, (typeof LOCATIONS)[Location]][]).map(([code, val]) => (
                  <option key={code} value={code}>
                    {val.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Language */}
            <div className="space-y-1.5 pt-1">
              <label htmlFor="search-lang" className="flex items-center gap-1.5 text-support font-medium text-ink">
                <Languages className="h-4 w-4 text-ink-3" />
                <span>Search Language</span>
              </label>
              <select
                id="search-lang"
                value={language}
                onChange={(e) => onLanguageChange(e.target.value)}
                className="h-10 w-full rounded-control border border-line-strong bg-surface px-3 text-body text-ink focus:border-brand focus:outline-none"
              >
                {!language && (
                  <option value="" disabled>
                    Select a language
                  </option>
                )}
                <option value="English">English</option>
                <option value="Spanish">Spanish</option>
                <option value="French">French</option>
                <option value="German">German</option>
                <option value="Arabic">Arabic</option>
              </select>
            </div>

            {/* Summary Highlights */}
            <div className="space-y-3 pt-3 border-t border-line text-support">
              <div>
                <span className="block text-caption text-ink-3 font-medium">Target Audience</span>
                <p className="text-body text-ink font-medium mt-0.5">
                  {targetCustomers.length > 0 ? targetCustomers.join(", ") : "Not specified"}
                </p>
              </div>

              <div>
                <span className="block text-caption text-ink-3 font-medium">Competitors Tracked</span>
                <p className="text-body text-ink font-medium mt-0.5">
                  {competitors.length > 0 ? competitors.join(", ") : "None selected"}
                </p>
              </div>

              {sitemapUrl && (
                <div>
                  <span className="block text-caption text-ink-3 font-medium">Website Sitemap</span>
                  <p className="text-body text-ink font-mono truncate mt-0.5">{sitemapUrl}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
