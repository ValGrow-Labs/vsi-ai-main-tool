"use client";

import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import type { Location, RunCheckResult } from "@/types/search";
import { LOCATIONS } from "@/types/search";
import CitationCard from "@/components/CitationCard";
import GapMetrics from "@/components/GapMetrics";
import type { CitationContent } from "@/app/api/citation-content/route";
import { normaliseDomain } from "@/lib/url-input";
import { useActiveProject } from "@/components/layout/ProjectProvider";
import type { ProjectSummary } from "@/lib/project-types";
import { matchLocationOption } from "@/components/project-creation/location";
import { Search, Link2, Building2, MapPin, CheckCircle2, AlertCircle, XCircle, Loader2, ArrowRight, ChevronDown, TrendingUp, MessageSquareText, Sparkles, RotateCw } from "lucide-react";

export interface SuggestedSearchItem {
  query: string;
  category: "step2_topic" | "ai_prompt" | "commercial";
  categoryLabel: string;
}

type CitationMap = Record<string, CitationContent | "loading" | "error">;

const POSITIVE = { border: "border-positive/30", bg: "bg-positive-soft", badge: "bg-surface text-positive", dot: "bg-positive", text: "text-positive" };
const ATTENTION = { border: "border-attention/30", bg: "bg-attention-soft", badge: "bg-surface text-attention", dot: "bg-attention", text: "text-attention" };
const CRITICAL = { border: "border-critical/30", bg: "bg-critical-soft", badge: "bg-surface text-critical", dot: "bg-critical", text: "text-critical" };

const GAP_STYLES: Record<string, { border: string; bg: string; badge: string; dot: string; text: string }> = {
  strong_visibility: POSITIVE,
  seo_plus_citation: POSITIVE,
  ai_visible: POSITIVE,
  partial_visibility: ATTENTION,
  ai_mention_only: ATTENTION,
  citation_only: ATTENTION,
  seo_only: ATTENTION,
  weak_double_loss: CRITICAL,
};

const getGapStyle = (label: string) => GAP_STYLES[label] ?? GAP_STYLES.weak_double_loss;

export default function LiveSearchCheckView({
  defaultProject,
  initialSearches = [],
}: {
  defaultProject?: ProjectSummary | null;
  initialSearches?: SuggestedSearchItem[];
} = {}) {
  const searchParams = useSearchParams();
  const contextProject = useActiveProject();
  const project = defaultProject || contextProject;

  const resolveInitialLocation = (): Location => {
    const locParam = searchParams.get("loc");
    if (locParam && locParam in LOCATIONS) return locParam as Location;
    if (project?.country) {
      const match = matchLocationOption(project.country);
      if (match?.code && match.code in LOCATIONS) return match.code as Location;
    }
    if (project?.defaultLocation && project.defaultLocation in LOCATIONS) return project.defaultLocation as Location;
    return "in";
  };

  const initialKw = searchParams.get("kw") || searchParams.get("q") || "";
  // Start from the active project so users don't retype what VSI already knows.
  const initialDomain = searchParams.get("domain") || (project?.website ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");

  const [keyword, setKeyword] = useState(initialKw);
  const [domain, setDomain] = useState(initialDomain);
  const [brand, setBrand] = useState(project?.brandName || project?.name || "");
  const [location, setLocation] = useState<Location>(resolveInitialLocation);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunCheckResult | null>(null);
  const [citationMap, setCitationMap] = useState<CitationMap>({});

  const [suggestedSearches, setSuggestedSearches] = useState<SuggestedSearchItem[]>(initialSearches);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<"all" | "step2_topic" | "ai_prompt" | "commercial">("all");

  useEffect(() => {
    if (initialSearches.length > 0) {
      setSuggestedSearches(initialSearches);
      return;
    }
    const targetDomain = domain || (project?.website ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (targetDomain) {
      fetchSuggestedSearches(false);
    }
  }, [project?.id, project?.website]);

  async function fetchSuggestedSearches(isFresh = false) {
    const targetDomain = domain || (project?.website ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (!targetDomain) return;

    setLoadingSuggestions(true);
    try {
      const countryLabel = LOCATIONS[location]?.label || "United States";
      const res = await fetch("/api/check/suggest-searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: targetDomain,
          brandName: brand || project?.brandName || project?.name,
          country: countryLabel,
          projectId: project?.id,
          fresh: isFresh,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.searches) && data.searches.length > 0) {
          setSuggestedSearches(data.searches);
        }
      }
    } catch (e) {
      console.warn("[LiveSearchCheckView] failed to fetch suggested searches:", e);
    } finally {
      setLoadingSuggestions(false);
    }
  }

  function handleSelectSearch(query: string, autoRun = false) {
    setKeyword(query);
    setError(null);
    const searchInput = document.getElementById("check-keyword");
    if (searchInput) {
      searchInput.focus();
      searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (autoRun) {
      setTimeout(() => {
        const form = document.querySelector("form");
        if (form) form.requestSubmit();
      }, 100);
    }
  }

  const filteredSearches =
    selectedFilter === "all"
      ? suggestedSearches
      : suggestedSearches.filter((s) => s.category === selectedFilter);

  useEffect(() => {
    if (project) {
      const resolved =
        (project.country ? (matchLocationOption(project.country)?.code as Location) : null) ||
        (project.defaultLocation && project.defaultLocation in LOCATIONS ? (project.defaultLocation as Location) : null) ||
        "in";
      if (!searchParams.get("loc")) {
        setLocation(resolved);
      }
      if (project.website) {
        setDomain(project.website.replace(/^https?:\/\//, "").replace(/\/$/, ""));
      }
      if (project.brandName || project.name) {
        setBrand(project.brandName || project.name);
      }
    }
  }, [project?.id, project?.country, project?.defaultLocation, project?.website, project?.brandName, project?.name, searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) { setError("Please enter a keyword to check."); return; }
    if (!domain.trim()) { setError("Please enter your website domain."); return; }
    if (!brand.trim()) { setError("Please enter your brand or company name."); return; }

    const normalisedDomain = normaliseDomain(domain);
    if (!normalisedDomain) {
      setError("Enter a valid domain like example.com (without https://)");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setCitationMap({});

    try {
      const payload = { keyword: keyword.trim(), domain: normalisedDomain.domain, brand: brand.trim(), location };
      const res = await fetch("/api/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `Request failed (${res.status})`);
      }
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Data unavailable for this query.");
      setResult(data as RunCheckResult);

      if (data.citations?.length) {
        const initialMap: CitationMap = {};
        data.citations.forEach((c: { url: string }) => { initialMap[c.url] = "loading"; });
        setCitationMap(initialMap);
        data.citations.forEach((c: { url: string; sourceName: string }) => {
          fetch("/api/citation-content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: c.url, analyze: false }) })
            .then((r) => r.ok ? r.json() : Promise.reject())
            .then((content: CitationContent) => { setCitationMap((prev) => ({ ...prev, [c.url]: content })); })
            .catch(() => { setCitationMap((prev) => ({ ...prev, [c.url]: "error" })); });
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const gap = result?.status ?? null;
  const gapStyle = gap ? getGapStyle(gap.label) : null;

  const searchPlaceholder =
    location === "in"
      ? "e.g. best smartphone brand in India"
      : location === "ae"
      ? "e.g. best SEO agency Dubai"
      : location === "us"
      ? "e.g. best running shoes"
      : location === "uk"
      ? "e.g. best coffee roasters London"
      : location === "sg"
      ? "e.g. top fintech startups Singapore"
      : location === "lk"
      ? "e.g. best tea brands Sri Lanka"
      : "e.g. best SEO agency";

  return (
    <div className="space-y-8 pb-16">

      {/* ── 1. MAIN SEARCH CARD ── */}
      <div className="bg-surface dark:bg-surface rounded-panel border border-line p-4 sm:p-6 md:p-8">

        <form onSubmit={handleSubmit}>
          {/* Input Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">

            {/* Keyword */}
            <div>
              <label htmlFor="check-keyword" className="block text-caption font-semibold text-ink-3 mb-1.5">
                Search <span className="text-critical">*</span>
              </label>
              <div className="flex items-center gap-2 bg-surface-2 dark:bg-surface-2/30 border border-line rounded-control px-3 py-2.5 focus-within:border-line-strong focus-within:bg-surface dark:focus-within:bg-surface focus-within:ring-2 focus-within:ring-ink/10 transition-all">
                <Search size={15} className="text-ink-3 shrink-0" />
                <input
                  id="check-keyword"
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder={searchPlaceholder}
                  required
                  className="flex-1 bg-transparent text-body font-medium text-ink placeholder:text-ink-3/50 focus:outline-none min-w-0"
                />
              </div>
            </div>

            {/* Domain */}
            <div>
              <label htmlFor="check-domain" className="block text-caption font-semibold text-ink-3 mb-1.5">
                Your website <span className="text-critical">*</span>
              </label>
              <div className="flex items-center gap-2 bg-surface-2 dark:bg-surface-2/30 border border-line rounded-control px-3 py-2.5 focus-within:border-line-strong focus-within:bg-surface dark:focus-within:bg-surface focus-within:ring-2 focus-within:ring-ink/10 transition-all">
                <Link2 size={15} className="text-ink-3 shrink-0" />
                <input
                  id="check-domain"
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="e.g. valgrowlabs.com"
                  required
                  className="flex-1 bg-transparent text-body font-medium text-ink placeholder:text-ink-3/50 focus:outline-none min-w-0"
                />
              </div>
            </div>

            {/* Brand */}
            <div>
              <label htmlFor="check-brand" className="block text-caption font-semibold text-ink-3 mb-1.5">
                Business name <span className="text-critical">*</span>
              </label>
              <div className="flex items-center gap-2 bg-surface-2 dark:bg-surface-2/30 border border-line rounded-control px-3 py-2.5 focus-within:border-line-strong focus-within:bg-surface dark:focus-within:bg-surface focus-within:ring-2 focus-within:ring-ink/10 transition-all">
                <Building2 size={15} className="text-ink-3 shrink-0" />
                <input
                  id="check-brand"
                  type="text"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="e.g. Valgrow Labs"
                  required
                  className="flex-1 bg-transparent text-body font-medium text-ink placeholder:text-ink-3/50 focus:outline-none min-w-0"
                />
              </div>
            </div>

            {/* Location */}
            <div>
              <label htmlFor="check-location" className="block text-caption font-semibold text-ink-3 mb-1.5">
                Country <span className="text-critical">*</span>
              </label>
              <div className="flex items-center gap-2 bg-surface-2 dark:bg-surface-2/30 border border-line rounded-control px-3 py-2.5 focus-within:border-line-strong focus-within:bg-surface dark:focus-within:bg-surface focus-within:ring-2 focus-within:ring-ink/10 transition-all">
                <MapPin size={15} className="text-ink-3 shrink-0" />
                <div className="flex-1 relative min-w-0">
                  <select
                    id="check-location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value as Location)}
                    className="w-full bg-transparent text-body font-medium text-ink focus:outline-none appearance-none cursor-pointer pr-5"
                  >
                    {(Object.entries(LOCATIONS) as [Location, typeof LOCATIONS[Location]][]).map(([key, val]) => (
                      <option key={key} value={key} className="bg-surface text-ink">{val.label}</option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="absolute right-0 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
                </div>
              </div>
            </div>

          </div>

          {/* Submit Action Row */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-6 pt-5 border-t border-line">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-caption text-ink-3">
              <span className="flex items-center gap-1.5 font-medium text-ink">
                <CheckCircle2 size={14} className="text-positive" />
                Organic Google SERP
              </span>
              <span className="flex items-center gap-1.5 font-medium text-ink">
                <CheckCircle2 size={14} className="text-positive" />
                AI Overview Mentions
              </span>
              <span className="flex items-center gap-1.5 font-medium text-ink">
                <CheckCircle2 size={14} className="text-positive" />
                Competitor Citations
              </span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-control bg-ink hover:bg-ink-2 text-white text-body font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0 cursor-pointer shadow-2xs"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Checking Google &amp; AI…</span>
                </>
              ) : (
                <>
                  <span>Run Live Check</span>
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>
        </form>

        {/* Error notice */}
        {error && (
          <div className="mt-4 flex items-start gap-3 bg-critical-soft border border-critical/30 dark:border-critical/30 rounded-panel px-4 py-3 text-body text-critical dark:text-critical">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p className="font-medium">{error}</p>
          </div>
        )}
      </div>

      {/* ── 2. SUGGESTED SEARCHES & STEP 2 TOPICS ── */}
      {suggestedSearches.length > 0 && !loading && (
        <div className="bg-surface dark:bg-surface rounded-panel border border-line p-4 sm:p-6 md:p-7 space-y-5 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-line pb-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand-strong shrink-0" />
                <h2 className="text-body font-semibold text-ink">
                  Recommended Searches for {brand || domain || "Your Business"}
                </h2>
                <span className="rounded-control bg-brand-soft px-2 py-0.5 text-caption font-semibold text-brand-strong shrink-0">
                  {filteredSearches.length} available
                </span>
              </div>
              <p className="text-caption text-ink-3">
                Select any search query or AI prompt below to test where Google and AI Overviews place your business.
              </p>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
              {/* Category Filter Tabs */}
              <div className="flex items-center rounded-control bg-surface-2 p-1 text-caption font-medium border border-line shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedFilter("all")}
                  className={`px-2.5 py-1 rounded-control transition-colors cursor-pointer whitespace-nowrap ${
                    selectedFilter === "all" ? "bg-surface text-ink font-semibold shadow-2xs" : "text-ink-3 hover:text-ink"
                  }`}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFilter("step2_topic")}
                  className={`px-2.5 py-1 rounded-control transition-colors cursor-pointer whitespace-nowrap ${
                    selectedFilter === "step2_topic" ? "bg-surface text-ink font-semibold shadow-2xs" : "text-ink-3 hover:text-ink"
                  }`}
                >
                  Step 2 Topics
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFilter("ai_prompt")}
                  className={`px-2.5 py-1 rounded-control transition-colors cursor-pointer whitespace-nowrap ${
                    selectedFilter === "ai_prompt" ? "bg-surface text-ink font-semibold shadow-2xs" : "text-ink-3 hover:text-ink"
                  }`}
                >
                  AI Prompts
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFilter("commercial")}
                  className={`px-2.5 py-1 rounded-control transition-colors cursor-pointer whitespace-nowrap ${
                    selectedFilter === "commercial" ? "bg-surface text-ink font-semibold shadow-2xs" : "text-ink-3 hover:text-ink"
                  }`}
                >
                  High Intent
                </button>
              </div>

              {/* Refresh Button */}
              <button
                type="button"
                disabled={loadingSuggestions}
                onClick={() => fetchSuggestedSearches(true)}
                title="Generate fresh real search queries with AI"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-control bg-surface-2 hover:bg-brand-soft hover:text-brand-strong border border-line text-caption font-medium text-ink-2 transition-colors disabled:opacity-50 cursor-pointer shrink-0"
              >
                <RotateCw className={`h-3.5 w-3.5 ${loadingSuggestions ? "animate-spin text-brand" : ""}`} />
                <span className="hidden sm:inline">{loadingSuggestions ? "Generating..." : "Refresh"}</span>
              </button>
            </div>
          </div>

          {/* Search Pills Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredSearches.map((item, idx) => (
              <div
                key={`${item.query}-${idx}`}
                className="group flex items-start justify-between gap-3 p-3.5 rounded-control border border-line bg-surface-2/40 hover:bg-surface hover:border-brand-strong/40 hover:shadow-sm transition-all"
              >
                <button
                  type="button"
                  onClick={() => handleSelectSearch(item.query, false)}
                  className="flex-1 text-left min-w-0 cursor-pointer focus:outline-none"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-caption font-medium px-2 py-0.5 rounded-control text-[11px] ${
                        item.category === "step2_topic"
                          ? "bg-brand-soft text-brand-strong border border-brand/20"
                          : item.category === "ai_prompt"
                          ? "bg-surface-2 text-ink-2 border border-line"
                          : "bg-positive-soft text-positive border border-positive/20"
                      }`}
                    >
                      {item.categoryLabel}
                    </span>
                  </div>
                  <p className="text-body font-medium text-ink group-hover:text-brand-strong transition-colors line-clamp-2">
                    {item.query}
                  </p>
                </button>

                <div className="flex items-center gap-1 shrink-0 self-center">
                  <button
                    type="button"
                    onClick={() => handleSelectSearch(item.query, true)}
                    disabled={loading}
                    title="Run live check immediately"
                    className="flex items-center gap-1 px-2.5 py-1 rounded-control bg-ink hover:bg-ink-2 text-white text-caption font-semibold transition-all disabled:opacity-40 cursor-pointer shadow-2xs"
                  >
                    <span>Check</span>
                    <ArrowRight size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!result && !loading && !error && (
        <p className="text-support text-ink-3">
          You'll see Google's top results for the search, the AI answer if Google shows one, whether it names or links to your
          business, and which other websites it links to. A live check uses search credits.
        </p>
      )}

      {/* ── 3. LOADING STATE ── */}
      {loading && (
        <div className="bg-surface dark:bg-surface border border-line rounded-panel p-12 flex flex-col items-center justify-center gap-4 text-center">
          <div className="w-12 h-12 rounded-full border-2 border-line border-t-ink animate-spin" />
          <div>
            <p className="text-body font-semibold text-ink">Checking Google Search &amp; AI Overviews</p>
            <p className="text-caption text-ink-3 mt-1">Connecting to live Google data and scraping AI citations…</p>
          </div>
        </div>
      )}

      {/* ── 4. RESULTS DASHBOARD (when check has been run) ── */}
      {result && gap && gapStyle && (
        <div className="space-y-5 animate-fadeIn">

          {/* Status Banner */}
          <div className={`rounded-panel border ${gapStyle.border} ${gapStyle.bg} px-6 py-4 flex items-center justify-between gap-4 flex-wrap `}>
            <div className="flex items-center gap-3">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${gapStyle.dot}`} />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-body font-semibold ${gapStyle.text}`}>{gap.title}</p>
                  {result.isDemo && (
                    <span className="text-caption font-semibold px-2 py-0.5 rounded bg-surface-2 text-ink-3 tracking-wide">
                      Demo Data
                    </span>
                  )}
                </div>
                <p className="text-caption text-ink-3 mt-0.5">{gap.description}</p>
              </div>
            </div>
            <span className={`text-caption font-semibold px-3.5 py-1.5 rounded-control ${gapStyle.badge} `}>
              {gap.label.replace(/_/g, " ")}
            </span>
          </div>

          {/* Ranking + AI Side-by-Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Google Ranking Card */}
            <div className="bg-surface dark:bg-surface border border-line rounded-panel p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-control bg-surface-2 dark:bg-surface-2 flex items-center justify-center text-ink">
                    <TrendingUp size={16} />
                  </div>
                  <div>
                    <h3 className="text-body font-semibold text-ink">Google Organic SERP</h3>
                    <p className="text-caption text-ink-3">Standard search results</p>
                  </div>
                </div>
                <span className="text-caption text-ink-3 bg-surface-2 px-2 py-0.5 rounded">
                  {location.toUpperCase()}
                </span>
              </div>

              {result.googleRank !== null ? (
                <div className="flex items-baseline gap-2 mb-4 p-3 bg-surface-2 dark:bg-surface-2/30 rounded-control border border-line">
                  <span className="text-3xl font-semibold text-ink">#{result.googleRank}</span>
                  <span className="text-caption text-ink-3">for {result.domain}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2.5 p-3 rounded-control bg-critical-soft border border-critical/30 dark:border-critical/30 mb-4">
                  <XCircle className="w-4 h-4 text-critical shrink-0" />
                  <p className="text-caption font-medium text-critical dark:text-critical">
                    Not found in top Google results for this query.
                  </p>
                </div>
              )}

              {result.organicResults.length > 0 && (
                <div className="space-y-2">
                  <p className="text-caption font-semibold text-ink-3 tracking-wide">Top 10 Ranked Results</p>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {result.organicResults.map((r) => (
                      <div
                        key={r.url}
                        className={`flex items-center gap-3 rounded-control px-3 py-2 text-caption border ${
                          r.isClient
                            ? "bg-brand-soft border-brand/40 dark:border-brand/40"
                            : "bg-surface-2 dark:bg-surface-2/30 border-line"
                        }`}
                      >
                        <span className={`shrink-0 w-5 h-5 flex items-center justify-center rounded text-caption font-semibold ${
                          r.isClient ? "bg-ink text-white" : "bg-surface-2 text-ink-3"
                        }`}>
                          {r.position}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={`font-semibold truncate ${r.isClient ? "text-brand-strong" : "text-ink"}`}>
                            {r.title}
                          </p>
                          <p className="text-caption text-ink-3 truncate">{r.domain}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* AI Visibility Card */}
            <div className="bg-surface dark:bg-surface border border-line rounded-panel p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-control bg-brand-soft flex items-center justify-center text-brand-strong">
                    <MessageSquareText size={16} />
                  </div>
                  <div>
                    <h3 className="text-body font-semibold text-ink">AI Overview Visibility</h3>
                    <p className="text-caption text-ink-3">Google AI Overview detection</p>
                  </div>
                </div>
                <span className={`text-caption font-semibold px-2.5 py-1 rounded-full ${
                  result.aioPresent
                    ? "bg-positive-soft text-positive dark:text-positive"
                    : "bg-surface-2 text-ink-2 dark:bg-surface-2 dark:text-ink-3"
                }`}>
                  {result.aioPresent ? "AI Overview Triggered" : "No AI Overview"}
                </span>
              </div>

              <div className="flex items-center gap-2.5 mb-4 p-3 bg-surface-2 dark:bg-surface-2/30 rounded-control border border-line">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${result.aioPresent ? "bg-positive" : "bg-ink-3"}`} />
                <p className="text-caption font-medium text-ink">
                  {result.aioPresent
                    ? "Google generated an AI Overview answer for this search."
                    : "No AI Overview was generated for this search."}
                </p>
              </div>

              {result.aioPresent && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                  <div className={`flex items-center gap-2 text-caption px-3 py-2 rounded-control border font-medium ${
                    result.brandCited
                      ? "bg-positive-soft border-positive/30 text-positive dark:border-positive/30 dark:text-positive"
                      : "bg-surface-2 border-line text-ink-3 dark:bg-surface-2/40"
                  }`}>
                    {result.brandCited ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                    {result.brandCited
                      ? `Cited source (#${result.clientCitationPosition})`
                      : "Not cited as a source"}
                  </div>
                  <div className={`flex items-center gap-2 text-caption px-3 py-2 rounded-control border font-medium ${
                    result.brandMentioned
                      ? "bg-brand-soft border-brand/40 text-brand-strong dark:border-brand/40"
                      : "bg-surface-2 border-line text-ink-3 dark:bg-surface-2/40"
                  }`}>
                    {result.brandMentioned ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                    {result.brandMentioned ? "Mentioned in AI text" : "Not mentioned in text"}
                  </div>
                </div>
              )}

              {result.aioBlocks.length > 0 && (
                <div className="border-t border-line pt-4">
                  <p className="text-caption font-semibold text-ink-3 tracking-wide mb-2">AI Answer Preview</p>
                  <div className="bg-surface-2 dark:bg-surface-2/30 border border-line rounded-control p-3.5 space-y-2 max-h-52 overflow-y-auto">
                    {result.aioBlocks.map((block, i) =>
                      block.type === "paragraph" ? (
                        <p key={i} className="text-caption text-ink leading-relaxed">{block.snippet}</p>
                      ) : block.type === "list" && block.list ? (
                        <ul key={i} className="space-y-1 pl-1">
                          {block.list.map((item, j) => (
                            <li key={j} className="flex gap-2 text-caption text-ink leading-relaxed">
                              <span className="text-brand-strong shrink-0 font-semibold">•</span>
                              <span>{item.snippet}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Gap Metrics Visual Summary */}
          <GapMetrics
            serp={result.serp}
            aio={result.aio}
            uniqueCompetitorsCount={result.uniqueCompetitorsCount}
            totalCitationsCount={result.totalCitationsCount}
          />

          {/* AI Overview Citations */}
          {result.aioPresent && result.citations.length > 0 && (
            <div className="bg-surface dark:bg-surface border border-line rounded-panel p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-body font-semibold text-ink">AI Overview Citations &amp; Competitor Sources</h3>
                  <p className="text-caption text-ink-3 mt-0.5">
                    Sources and domains referenced by Google AI Overview for this search query.
                  </p>
                </div>
                <span className="text-caption font-medium text-ink-3 bg-surface-2 dark:bg-surface-2 px-2.5 py-1 rounded-control border border-line">
                  {result.uniqueCompetitorsCount} competitors · {result.totalCitationsCount} citations
                </span>
              </div>
              <div className="space-y-2.5">
                {result.citations.map((c) => {
                  const cData = citationMap[c.url];
                  return (
                    <CitationCard
                      key={c.url}
                      citation={c}
                      keyword={keyword}
                      clientBrand={brand || domain}
                      preloaded={cData instanceof Object && cData !== null && typeof cData !== "string" ? cData as CitationContent : null}
                      loadingPreload={cData === "loading"}
                    />
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
