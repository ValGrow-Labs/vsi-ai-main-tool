"use client";

import { useState, useEffect, type ReactNode } from "react";
import { Edit3, Check, X } from "lucide-react";
import { matchLocationOption } from "./location";

interface BusinessInfoCardProps {
  title: string;
  icon?: ReactNode;
  value: string;
  subValue?: string;
  onSave?: (newValue: string, newSubValue?: string) => void;
  editable?: boolean;
  type?: "text" | "select-location";
  locationOptions?: Array<{ code: string; label: string; country: string }>;
}

export function BusinessInfoCard({
  title,
  icon,
  value,
  subValue,
  onSave,
  editable = true,
  type = "text",
  locationOptions = [],
}: BusinessInfoCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [editSubValue, setEditSubValue] = useState(subValue || "");

  // Sync state when props change outside of editing
  useEffect(() => {
    if (!isEditing) {
      setEditValue(value);
      setEditSubValue(subValue || "");
    }
  }, [value, subValue, isEditing]);

  // Robust location matching against country name, label, code, and common aliases
  const matchedCode = matchLocationOption(editSubValue)?.code;
  const matchedLoc = locationOptions.find((loc) => loc.code === matchedCode);

  // No recognised market: nothing is pre-selected; the user has to choose one.
  const currentLocValue = matchedLoc ? matchedLoc.country : "";

  function handleSave() {
    const finalValue = editValue.trim();
    const finalSubValue = type === "select-location"
      ? (currentLocValue || editSubValue || "").trim()
      : (editSubValue || "").trim();

    if (onSave) {
      onSave(finalValue, finalSubValue || undefined);
    }
    setEditValue(finalValue);
    setEditSubValue(finalSubValue);
    setIsEditing(false);
  }

  function handleCancel() {
    setEditValue(value);
    setEditSubValue(subValue || "");
    setIsEditing(false);
  }

  return (
    <div className="group relative rounded-panel border border-line bg-surface p-5 transition-all hover:border-line-strong hover:shadow-subtle">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-support font-medium text-ink-3">
          {icon}
          <span>{title}</span>
        </div>

        {editable && !isEditing && (
          <button
            type="button"
            onClick={() => {
              setEditValue(value);
              setEditSubValue(subValue || "");
              setIsEditing(true);
            }}
            className="flex items-center gap-1 rounded-control bg-surface-2 px-2.5 py-1 text-caption font-medium text-ink-2 transition-colors hover:bg-brand-soft hover:text-brand-strong"
          >
            <Edit3 className="h-3.5 w-3.5" />
            <span>Edit</span>
          </button>
        )}
      </div>

      <div className="mt-3">
        {isEditing ? (
          <div className="space-y-3 pt-1">
            {type === "select-location" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-caption text-ink-3">Language</label>
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSave();
                      }
                    }}
                    className="h-9 w-full rounded-control border border-line-strong bg-surface px-2.5 text-body text-ink focus:border-brand focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-caption text-ink-3">Country / Location</label>
                  <select
                    value={currentLocValue}
                    onChange={(e) => setEditSubValue(e.target.value)}
                    className="h-9 w-full rounded-control border border-line-strong bg-surface px-2.5 text-body text-ink focus:border-brand focus:outline-none"
                  >
                    {!matchedLoc && (
                      <option value="" disabled>
                        Select a country
                      </option>
                    )}
                    {locationOptions.map((loc) => (
                      <option key={loc.code} value={loc.country}>
                        {loc.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSave();
                  }
                }}
                className="h-10 w-full rounded-control border border-line-strong bg-surface px-3 text-body text-ink focus:border-brand focus:outline-none"
                autoFocus
              />
            )}

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleSave}
                className="flex items-center gap-1.5 rounded-control bg-ink px-3 py-1.5 text-caption font-medium text-white hover:bg-ink-2"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Save</span>
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-1.5 text-caption font-medium text-ink-2 hover:bg-surface-2"
              >
                <X className="h-3.5 w-3.5" />
                <span>Cancel</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-body font-semibold text-ink sm:text-base">{value || "Not set"}</p>
            {subValue && (
              <p className="text-support font-medium text-brand-strong">{subValue}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
