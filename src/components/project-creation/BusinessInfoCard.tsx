"use client";

import { useState, useEffect, type ReactNode } from "react";
import { Edit3, Check, X } from "lucide-react";
import { LocationModal } from "./LocationModal";

interface BusinessInfoCardProps {
  title: string;
  icon?: ReactNode;
  value: string;
  subValue?: string;
  locationCode?: string;
  onSave?: (newValue: string, newSubValue?: string, newCode?: string) => void;
  editable?: boolean;
  type?: "text" | "select-location";
  isAiGenerated?: boolean;
}

export function BusinessInfoCard({
  title,
  icon,
  value,
  subValue,
  locationCode,
  onSave,
  editable = true,
  type = "text",
  isAiGenerated = false,
}: BusinessInfoCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setEditValue(value);
    }
  }, [value, isEditing]);

  function handleSave() {
    const finalVal = editValue.trim();
    if (onSave) {
      onSave(finalVal, subValue);
    }
    setIsEditing(false);
  }

  function handleCancel() {
    setEditValue(value);
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
              if (type === "select-location") {
                setIsModalOpen(true);
              } else {
                setEditValue(value);
                setIsEditing(true);
              }
            }}
            className="flex items-center gap-1 rounded-control bg-surface-2 px-2.5 py-1 text-caption font-medium text-ink-2 transition-colors hover:bg-brand-soft hover:text-brand-strong cursor-pointer"
          >
            <Edit3 className="h-3.5 w-3.5" />
            <span>Edit</span>
          </button>
        )}
      </div>

      <div className="mt-3">
        {isEditing ? (
          <div className="space-y-3 pt-1">
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSave();
                } else if (e.key === "Escape") {
                  handleCancel();
                }
              }}
              autoFocus
              className="h-9 w-full rounded-control border border-line-strong bg-surface px-2.5 text-body text-ink focus:border-brand focus:outline-none"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSave}
                className="flex items-center gap-1.5 rounded-control bg-ink px-3 py-1.5 text-caption font-semibold text-white hover:bg-ink-2 transition-colors cursor-pointer"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Save</span>
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center gap-1.5 rounded-control border border-line bg-surface px-3 py-1.5 text-caption font-medium text-ink-2 hover:bg-surface-2 transition-colors cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                <span>Cancel</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="text-body font-medium text-ink">
            {type === "select-location" ? (
              <div className="flex flex-wrap items-center gap-2">
                <span>{value || <span className="italic text-ink-3">Language not set</span>}</span>
                {subValue ? (
                  <>
                    <span className="text-ink-3">•</span>
                    <span>{subValue}</span>
                  </>
                ) : (
                  <>
                    <span className="text-ink-3">•</span>
                    <span className="italic text-ink-3">Location not set</span>
                  </>
                )}
              </div>
            ) : value ? (
              <span>{value}</span>
            ) : (
              <span className="italic text-ink-3">Not set</span>
            )}
          </div>
        )}
      </div>

      {type === "select-location" && (
        <LocationModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          currentLanguage={value}
          currentLocation={subValue || ""}
          currentLocationCode={locationCode || ""}
          onSave={(lang, loc, code) => {
            if (onSave) {
              onSave(lang, loc, code);
            }
          }}
        />
      )}
    </div>
  );
}
