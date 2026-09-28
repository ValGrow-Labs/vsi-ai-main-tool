"use client";

import { useState } from "react";
import { Building2, Globe, Layers, MapPin, Sparkles, FileText, Edit3, Check, X } from "lucide-react";
import { motion } from "framer-motion";
import { BusinessInfoCard } from "./BusinessInfoCard";
import { SuggestedTopics } from "./SuggestedTopics";
import { SitemapInput } from "./SitemapInput";
import { TargetCustomers } from "./TargetCustomers";
import { LOCATION_OPTIONS, resolveLocation } from "./location";

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
  /** False when automatic analysis couldn't be completed and the user enters the details. */
  analyzed?: boolean;
  onUpdate: (updated: BusinessData) => void;
}

export function BusinessSummary({ data, analyzed = true, onUpdate }: BusinessSummaryProps) {
  const [editingAdvantage, setEditingAdvantage] = useState(false);
  const [advantageInput, setAdvantageInput] = useState(data.competitiveAdvantage);

  const [editingAbout, setEditingAbout] = useState(false);
  const [aboutInput, setAboutInput] = useState(data.aboutBusiness);

  function updateField<K extends keyof BusinessData>(key: K, value: BusinessData[K]) {
    const next = { ...data, [key]: value };
    onUpdate(next);
  }

  function updateFields(patch: Partial<BusinessData>) {
    const next = { ...data, ...patch };
    onUpdate(next);
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
          Your business summary
        </h1>
        <p className="max-w-[70ch] text-base leading-relaxed text-ink-2">
          {analyzed
            ? "Review the information we found about your business. We'll use it to personalize your SEO and GEO analysis."
            : "Enter the details of your business. We'll use them to personalize your SEO and GEO analysis."}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* LEFT COLUMN */}
        <div className="space-y-5">
          <BusinessInfoCard
            title="Brand"
            icon={<Building2 className="h-4 w-4" />}
            value={data.brandName}
            onSave={(newVal) => updateField("brandName", newVal)}
          />

          <BusinessInfoCard
            title="Website Domain"
            icon={<Globe className="h-4 w-4" />}
            value={data.domain}
            editable={false}
          />

          <BusinessInfoCard
            title="Business Type"
            icon={<Layers className="h-4 w-4" />}
            value={data.businessType}
            onSave={(newVal) => updateField("businessType", newVal)}
          />

          <BusinessInfoCard
            title="Language & Location"
            icon={<MapPin className="h-4 w-4" />}
            value={data.language}
            subValue={data.location}
            type="select-location"
            locationOptions={LOCATION_OPTIONS}
            onSave={(newLang, newLoc) => {
              const resolved = resolveLocation(newLoc, data.location, data.locationCode);
              const resolvedLanguage = newLang && newLang.trim() ? newLang.trim() : data.language;

              updateFields({
                language: resolvedLanguage,
                location: resolved.location,
                locationCode: resolved.locationCode,
              });
            }}
          />

          {/* Competitive Advantage Card */}
          <div className="rounded-panel border border-line bg-surface p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-support font-medium text-ink">
                <Sparkles className="h-4 w-4 text-brand-strong" />
                <h3 className="font-semibold text-ink">Competitive Advantage</h3>
              </div>
              {!editingAdvantage && (
                <button
                  type="button"
                  onClick={() => {
                    setAdvantageInput(data.competitiveAdvantage);
                    setEditingAdvantage(true);
                  }}
                  className="flex items-center gap-1 rounded-control bg-surface-2 px-2.5 py-1 text-caption font-medium text-ink-2 hover:bg-brand-soft hover:text-brand-strong"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>Edit</span>
                </button>
              )}
            </div>

            {editingAdvantage ? (
              <div className="space-y-3 pt-1">
                <textarea
                  rows={3}
                  value={advantageInput}
                  onChange={(e) => setAdvantageInput(e.target.value)}
                  className="w-full rounded-control border border-line-strong bg-surface p-3 text-body text-ink focus:border-brand focus:outline-none"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      updateField("competitiveAdvantage", advantageInput.trim());
                      setEditingAdvantage(false);
                    }}
                    className="flex items-center gap-1.5 rounded-control bg-ink px-3 py-1.5 text-caption font-medium text-white hover:bg-ink-2"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Save</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingAdvantage(false)}
                    className="flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-1.5 text-caption font-medium text-ink-2 hover:bg-surface-2"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Cancel</span>
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-body text-ink-2 leading-relaxed">
                {data.competitiveAdvantage || "No competitive advantage specified yet."}
              </p>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-5">
          <SuggestedTopics
            analyzed={analyzed}
            initialTopics={data.suggestedTopics}
            onChange={(newTopics) => updateField("suggestedTopics", newTopics)}
          />

          <SitemapInput
            initialSitemap={data.sitemapUrl}
            onChange={(sitemaps) => updateField("sitemapUrl", sitemaps[0] || "")}
          />

          {/* About the Business Card */}
          <div className="rounded-panel border border-line bg-surface p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-support font-medium text-ink">
                <FileText className="h-4 w-4 text-brand-strong" />
                <h3 className="font-semibold text-ink">About the Business</h3>
              </div>
              {!editingAbout && (
                <button
                  type="button"
                  onClick={() => {
                    setAboutInput(data.aboutBusiness);
                    setEditingAbout(true);
                  }}
                  className="flex items-center gap-1 rounded-control bg-surface-2 px-2.5 py-1 text-caption font-medium text-ink-2 hover:bg-brand-soft hover:text-brand-strong"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>Edit</span>
                </button>
              )}
            </div>

            {editingAbout ? (
              <div className="space-y-3 pt-1">
                <textarea
                  rows={3}
                  value={aboutInput}
                  onChange={(e) => setAboutInput(e.target.value)}
                  className="w-full rounded-control border border-line-strong bg-surface p-3 text-body text-ink focus:border-brand focus:outline-none"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      updateField("aboutBusiness", aboutInput.trim());
                      setEditingAbout(false);
                    }}
                    className="flex items-center gap-1.5 rounded-control bg-ink px-3 py-1.5 text-caption font-medium text-white hover:bg-ink-2"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Save</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingAbout(false)}
                    className="flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-1.5 text-caption font-medium text-ink-2 hover:bg-surface-2"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Cancel</span>
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-body text-ink-2 leading-relaxed">
                {data.aboutBusiness || "No business description detected yet."}
              </p>
            )}
          </div>

          <TargetCustomers
            initialCustomers={data.targetCustomers}
            onChange={(customers) => updateField("targetCustomers", customers)}
          />
        </div>
      </div>
    </motion.div>
  );
}
