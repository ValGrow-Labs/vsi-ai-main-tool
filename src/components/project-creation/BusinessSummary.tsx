"use client";

import { useState, useEffect } from "react";
import {
  Building2,
  Globe,
  Layers,
  MapPin,
  Award,
  CheckCircle2,
  FileText,
  Edit3,
  Check,
  X,
  RotateCw,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { motion } from "framer-motion";
import { BusinessInfoCard } from "./BusinessInfoCard";
import { SuggestedTopics } from "./SuggestedTopics";
import { SitemapInput } from "./SitemapInput";
import { TargetCustomers } from "./TargetCustomers";
import { matchLocationOption } from "./location";

export interface BusinessData {
  brandName: string;
  domain: string;
  businessType: string;
  websiteTitle: string;
  metaDescription: string;
  language: string;
  location: string;
  locationCode: string;
  suggestedTopics: string[];
  sitemapUrl: string;
  competitiveAdvantage: string;
  aboutBusiness: string;
  targetCustomers: string[];
}

interface BusinessSummaryProps {
  data: BusinessData;
  analyzed?: boolean;
  onUpdate: (updated: BusinessData) => void;
  onRetryAnalysis?: () => void;
  fallbackReason?: string | null;
}

export function BusinessSummary({
  data,
  analyzed = true,
  onUpdate,
  onRetryAnalysis,
  fallbackReason,
}: BusinessSummaryProps) {
  // Inline editing states for Competitive Advantage & About
  const [editingAdvantage, setEditingAdvantage] = useState(false);
  const [advantageInput, setAdvantageInput] = useState(data.competitiveAdvantage);

  const [editingAbout, setEditingAbout] = useState(false);
  const [aboutInput, setAboutInput] = useState(data.aboutBusiness);
  const [aboutFeedback, setAboutFeedback] = useState<"up" | "down" | null>(null);

  // Section-specific regenerating states
  const [regeneratingSection, setRegeneratingSection] = useState<string | null>(null);

  // Auto-save debounced to localStorage so nothing is lost on back/refresh
  useEffect(() => {
    if (!data.domain) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(`vsi_biz_draft_${data.domain}`, JSON.stringify(data));
      } catch {
        // ignore storage errors
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [data]);

  function updateField<K extends keyof BusinessData>(key: K, value: BusinessData[K]) {
    const next = { ...data, [key]: value };
    onUpdate(next);
  }

  function updateFields(patch: Partial<BusinessData>) {
    const next = { ...data, ...patch };
    if (patch.location || patch.locationCode) {
      const matched = matchLocationOption(patch.locationCode || patch.location || next.locationCode || next.location);
      if (matched) {
        next.location = matched.country;
        next.locationCode = matched.code;
      }
    }
    onUpdate(next);
  }

  // Regenerate a single section with AI
  async function regenerateSection(section: "about" | "topics" | "advantage" | "all") {
    setRegeneratingSection(section);
    try {
      const res = await fetch("/api/analyze-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "regenerate",
          section,
          url: data.domain,
          businessType: data.businessType,
          brandName: data.brandName,
          currentTopics: data.suggestedTopics,
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        if (section === "about" && json.data.aboutBusiness) {
          updateField("aboutBusiness", json.data.aboutBusiness);
          setAboutInput(json.data.aboutBusiness);
          setAboutFeedback(null);
        } else if (section === "topics" && Array.isArray(json.data.suggestedTopics)) {
          updateField("suggestedTopics", json.data.suggestedTopics);
        } else if (section === "advantage" && json.data.competitiveAdvantage) {
          updateField("competitiveAdvantage", json.data.competitiveAdvantage);
          setAdvantageInput(json.data.competitiveAdvantage);
        }
      }
    } catch (err) {
      console.error("Section regeneration failed:", err);
    } finally {
      setRegeneratingSection(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 py-2"
    >
      {/* Page Title & Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Your business summary
          </h1>
          <p className="max-w-[70ch] text-base text-ink-2">
            Review the information we found about your business. We&apos;ll use it to tailor your SEO and GEO plan.
          </p>
        </div>

        {/* Global Regenerate Button */}
        {analyzed && (
          <button
            type="button"
            disabled={regeneratingSection === "all"}
            onClick={() => regenerateSection("all")}
            className="self-start sm:self-center flex items-center gap-2 rounded-control border border-line bg-surface px-3.5 py-2 text-support font-semibold text-ink hover:bg-surface-2 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 text-brand-strong ${regeneratingSection === "all" ? "animate-spin" : ""}`} />
            <span>Regenerate with AI</span>
          </button>
        )}
      </div>

      {/* Status Banner */}
      {!analyzed ? (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning-soft/60 p-4 text-support text-warning-strong">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Automatic analysis couldn&apos;t be completed</p>
              <p className="text-caption text-ink-2 mt-0.5">
                {fallbackReason || "We couldn't read full details from your website. You can fill in the fields below or try again."}
              </p>
            </div>
          </div>
          {onRetryAnalysis && (
            <button
              type="button"
              onClick={onRetryAnalysis}
              className="flex items-center gap-1.5 rounded-control bg-ink px-3 py-1.5 text-caption font-semibold text-white hover:bg-ink-2 transition-colors cursor-pointer shrink-0"
            >
              <RotateCw className="h-3.5 w-3.5" />
              <span>Try again</span>
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-brand/20 bg-brand-soft/40 px-4 py-3 text-support text-ink flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-brand-strong shrink-0" />
            <span className="font-medium text-caption sm:text-support">
              Review the information we found about your business. We&apos;ll use it to tailor your SEO and GEO plan.
            </span>
          </div>
        </div>
      )}

      {/* Cards Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT COLUMN */}
        <div className="space-y-5">
          {/* Brand */}
          <BusinessInfoCard
            title="Brand"
            icon={<Building2 className="h-4 w-4" />}
            value={data.brandName}
            onSave={(newVal) => updateField("brandName", newVal)}
          />

          {/* Website Domain (Read-only) */}
          <BusinessInfoCard
            title="Website Domain"
            icon={<Globe className="h-4 w-4" />}
            value={data.domain}
            editable={false}
          />

          {/* Business Type */}
          <BusinessInfoCard
            title="Business Type"
            icon={<Layers className="h-4 w-4" />}
            value={data.businessType}
            onSave={(newVal) => updateField("businessType", newVal)}
          />

          {/* Language & Location */}
          <BusinessInfoCard
            title="Language & Location"
            icon={<MapPin className="h-4 w-4" />}
            value={data.language}
            subValue={data.location}
            locationCode={data.locationCode}
            type="select-location"
            onSave={(newLang, newLoc, newCode) => {
              const matched = matchLocationOption(newCode || newLoc);
              updateFields({
                language: newLang || data.language,
                location: matched ? matched.country : (newLoc || data.location),
                locationCode: matched ? matched.code : (newCode || data.locationCode),
              });
            }}
          />

          {/* Competitive Advantage Card */}
          <div className="rounded-panel border border-line bg-surface p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2 text-support font-medium text-ink">
                <Award className="h-4 w-4 text-brand-strong" />
                <h3 className="font-semibold text-ink">Competitive Advantage</h3>
              </div>

              <div className="flex items-center gap-2">
                {analyzed && !editingAdvantage && (
                  <button
                    type="button"
                    disabled={regeneratingSection === "advantage"}
                    onClick={() => regenerateSection("advantage")}
                    className="flex items-center gap-1 rounded-control bg-surface-2 px-2.5 py-1 text-caption font-medium text-ink-2 hover:bg-brand-soft hover:text-brand-strong transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RotateCw className={`h-3 w-3 ${regeneratingSection === "advantage" ? "animate-spin text-brand" : ""}`} />
                    <span>{regeneratingSection === "advantage" ? "Regenerating..." : "Regenerate"}</span>
                  </button>
                )}

                {!editingAdvantage && (
                  <button
                    type="button"
                    onClick={() => {
                      setAdvantageInput(data.competitiveAdvantage);
                      setEditingAdvantage(true);
                    }}
                    className="flex items-center gap-1 rounded-control bg-surface-2 px-2.5 py-1 text-caption font-medium text-ink-2 hover:bg-brand-soft hover:text-brand-strong cursor-pointer"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>Edit</span>
                  </button>
                )}
              </div>
            </div>

            {editingAdvantage ? (
              <div className="space-y-3 pt-1">
                <textarea
                  rows={3}
                  value={advantageInput}
                  onChange={(e) => setAdvantageInput(e.target.value)}
                  autoFocus
                  className="w-full rounded-control border border-line-strong bg-surface p-3 text-body text-ink focus:border-brand focus:outline-none"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      updateField("competitiveAdvantage", advantageInput.trim());
                      setEditingAdvantage(false);
                    }}
                    className="flex items-center gap-1.5 rounded-control bg-ink px-3 py-1.5 text-caption font-semibold text-white hover:bg-ink-2 cursor-pointer"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Save</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingAdvantage(false)}
                    className="flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-1.5 text-caption font-medium text-ink-2 hover:bg-surface-2 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Cancel</span>
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-body text-ink-2 leading-relaxed">
                {data.competitiveAdvantage || <span className="italic text-ink-3">Not set</span>}
              </p>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-5">
          {/* Suggested Topics */}
          <SuggestedTopics
            analyzed={analyzed}
            initialTopics={data.suggestedTopics}
            onChange={(newTopics) => updateField("suggestedTopics", newTopics)}
            onRegenerate={() => regenerateSection("topics")}
            isRegenerating={regeneratingSection === "topics"}
          />

          {/* Sitemap Input */}
          <SitemapInput
            initialSitemap={data.sitemapUrl}
            onChange={(sitemaps) => updateField("sitemapUrl", sitemaps[0] || "")}
          />

          {/* About the Business Card */}
          <div className="rounded-panel border border-line bg-surface p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2 text-support font-medium text-ink">
                <FileText className="h-4 w-4 text-brand-strong" />
                <h3 className="font-semibold text-ink">About the Business</h3>
              </div>

              <div className="flex items-center gap-2">
                {/* Thumbs Feedback */}
                <div className="flex items-center gap-1 border-r border-line pr-2">
                  <button
                    type="button"
                    onClick={() => setAboutFeedback("up")}
                    title="Good description"
                    className={`rounded-lg p-1 text-ink-3 transition-colors hover:text-ink cursor-pointer ${
                      aboutFeedback === "up" ? "bg-positive-soft text-positive" : "hover:bg-surface-2"
                    }`}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAboutFeedback("down");
                      regenerateSection("about");
                    }}
                    title="Bad description (regenerate)"
                    className={`rounded-lg p-1 text-ink-3 transition-colors hover:text-critical cursor-pointer ${
                      aboutFeedback === "down" ? "bg-critical-soft text-critical" : "hover:bg-surface-2"
                    }`}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                {analyzed && !editingAbout && (
                  <button
                    type="button"
                    disabled={regeneratingSection === "about"}
                    onClick={() => regenerateSection("about")}
                    className="flex items-center gap-1 rounded-control bg-surface-2 px-2.5 py-1 text-caption font-medium text-ink-2 hover:bg-brand-soft hover:text-brand-strong transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RotateCw className={`h-3 w-3 ${regeneratingSection === "about" ? "animate-spin text-brand" : ""}`} />
                    <span>{regeneratingSection === "about" ? "Regenerating..." : "Regenerate"}</span>
                  </button>
                )}

                {!editingAbout && (
                  <button
                    type="button"
                    onClick={() => {
                      setAboutInput(data.aboutBusiness);
                      setEditingAbout(true);
                    }}
                    className="flex items-center gap-1 rounded-control bg-surface-2 px-2.5 py-1 text-caption font-medium text-ink-2 hover:bg-brand-soft hover:text-brand-strong cursor-pointer"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    <span>Edit</span>
                  </button>
                )}
              </div>
            </div>

            {editingAbout ? (
              <div className="space-y-3 pt-1">
                <textarea
                  rows={3}
                  value={aboutInput}
                  onChange={(e) => setAboutInput(e.target.value)}
                  autoFocus
                  className="w-full rounded-control border border-line-strong bg-surface p-3 text-body text-ink focus:border-brand focus:outline-none"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      updateField("aboutBusiness", aboutInput.trim());
                      setEditingAbout(false);
                    }}
                    className="flex items-center gap-1.5 rounded-control bg-ink px-3 py-1.5 text-caption font-semibold text-white hover:bg-ink-2 cursor-pointer"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Save</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingAbout(false)}
                    className="flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-1.5 text-caption font-medium text-ink-2 hover:bg-surface-2 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Cancel</span>
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-body text-ink-2 leading-relaxed">
                {data.aboutBusiness || <span className="italic text-ink-3">Not set</span>}
              </p>
            )}
          </div>

          {/* Target Customers */}
          <TargetCustomers
            initialCustomers={data.targetCustomers}
            onChange={(customers) => updateField("targetCustomers", customers)}
          />
        </div>
      </div>
    </motion.div>
  );
}
