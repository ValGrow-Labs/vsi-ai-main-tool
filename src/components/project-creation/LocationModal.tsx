"use client";

import { useState, useMemo } from "react";
import { X, Search, Check, Globe, MapPin } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { LOCATION_OPTIONS, type LocationOption } from "./location";

interface LocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLanguage: string;
  currentLocation: string;
  currentLocationCode: string;
  onSave: (language: string, location: string, locationCode: string) => void;
}

const COMMON_LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Arabic",
  "Hindi",
  "Portuguese",
  "Italian",
  "Japanese",
  "Chinese (Simplified)",
  "Dutch",
];

export function LocationModal({
  isOpen,
  onClose,
  currentLanguage,
  currentLocation,
  currentLocationCode,
  onSave,
}: LocationModalProps) {
  const [selectedLang, setSelectedLang] = useState(currentLanguage || "English");
  const [selectedLocCode, setSelectedLocCode] = useState(currentLocationCode || "");
  const [selectedLocName, setSelectedLocName] = useState(currentLocation || "");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredLocations = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return LOCATION_OPTIONS;
    return LOCATION_OPTIONS.filter(
      (opt) =>
        opt.country.toLowerCase().includes(q) ||
        opt.label.toLowerCase().includes(q) ||
        opt.code.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  function handleSelectLocation(opt: LocationOption) {
    setSelectedLocCode(opt.code);
    setSelectedLocName(opt.country);
  }

  function handleSave() {
    onSave(selectedLang.trim() || "English", selectedLocName, selectedLocCode);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-ink/40 backdrop-blur-xs"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative z-10 w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-overlay space-y-6 max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line pb-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-strong">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-ink">Language &amp; Target Market</h3>
                <p className="text-caption text-ink-2">Select the primary search location and language</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-5 overflow-y-auto pr-1 flex-1">
            {/* Language Selector */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-support font-semibold text-ink">
                <Globe className="h-4 w-4 text-brand-strong" />
                <span>Primary Language</span>
              </label>
              <select
                value={selectedLang}
                onChange={(e) => setSelectedLang(e.target.value)}
                className="w-full rounded-control border border-line-strong bg-surface px-3 py-2.5 text-body text-ink focus:border-brand focus:outline-none"
              >
                {COMMON_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
                {!COMMON_LANGUAGES.includes(selectedLang) && selectedLang && (
                  <option value={selectedLang}>{selectedLang}</option>
                )}
              </select>
            </div>

            {/* Location Searchable List */}
            <div className="space-y-2">
              <label className="flex items-center justify-between text-support font-semibold text-ink">
                <span className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-brand-strong" />
                  <span>Target Country / Market</span>
                </span>
                {selectedLocName && (
                  <span className="text-caption font-medium text-brand-strong">
                    Selected: {selectedLocName}
                  </span>
                )}
              </label>

              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-ink-3" />
                <input
                  type="text"
                  placeholder="Search supported country or code (e.g. United States, ae)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-control border border-line-strong bg-surface pl-9 pr-3 py-2 text-support text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
                />
              </div>

              {/* Location options */}
              <div className="mt-2 grid gap-1.5 max-h-52 overflow-y-auto rounded-xl border border-line bg-surface-2/40 p-1.5">
                {filteredLocations.map((opt) => {
                  const isSelected = selectedLocCode === opt.code;
                  return (
                    <button
                      key={opt.code}
                      type="button"
                      onClick={() => handleSelectLocation(opt)}
                      className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-support transition-colors ${
                        isSelected
                          ? "bg-brand-soft text-brand-strong font-semibold"
                          : "text-ink hover:bg-surface-2"
                      }`}
                    >
                      <div>
                        <span>{opt.country}</span>
                        <span className="ml-2 font-mono text-caption text-ink-3">({opt.code.toUpperCase()})</span>
                      </div>
                      {isSelected && <Check className="h-4 w-4 text-brand-strong" />}
                    </button>
                  );
                })}
                {filteredLocations.length === 0 && (
                  <div className="py-6 text-center text-support text-ink-3">
                    No matching location found.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-control border border-line bg-surface px-4 py-2 text-support font-medium text-ink hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-control bg-ink px-5 py-2 text-support font-semibold text-white hover:bg-ink-2 transition-colors shadow-2xs"
            >
              Save changes
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

