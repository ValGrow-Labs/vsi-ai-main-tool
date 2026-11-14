"use client";

import { useState, useEffect, type FormEvent } from "react";
import { Plus, X, Tag, Check, ThumbsUp, ThumbsDown, RotateCw } from "lucide-react";

interface TopicItem {
  id: string;
  name: string;
  selected: boolean;
}

interface SuggestedTopicsProps {
  initialTopics: string[];
  onChange: (topics: string[]) => void;
  maxLimit?: number;
  analyzed?: boolean;
  isAiGenerated?: boolean;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
}

export function SuggestedTopics({
  initialTopics,
  onChange,
  maxLimit = 10,
  analyzed = true,
  isAiGenerated = false,
  onRegenerate,
  isRegenerating = false,
}: SuggestedTopicsProps) {
  // Pre-select top 5 topics by default if 5 or more are present
  const [items, setItems] = useState<TopicItem[]>(() =>
    initialTopics.map((t, idx) => ({
      id: `topic_${idx}_${Date.now()}`,
      name: t,
      selected: idx < 5,
    }))
  );
  const [newTopicInput, setNewTopicInput] = useState("");
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  // Sync if initialTopics changes externally (e.g. from regeneration)
  useEffect(() => {
    setItems(
      initialTopics.map((t, idx) => ({
        id: `topic_${idx}_${Date.now()}`,
        name: t,
        selected: idx < 5,
      }))
    );
    setFeedback(null);
  }, [initialTopics]);

  const selectedCount = items.filter((i) => i.selected).length;

  function notifyChange(newItems: TopicItem[]) {
    setItems(newItems);
    onChange(newItems.filter((i) => i.selected).map((i) => i.name));
  }

  function toggleTopic(id: string) {
    const next = items.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item));
    notifyChange(next);
  }

  function removeTopic(id: string) {
    const next = items.filter((item) => item.id !== id);
    notifyChange(next);
  }

  function addTopic(e: FormEvent) {
    e.preventDefault();
    const trimmed = newTopicInput.trim();
    if (!trimmed || items.length >= maxLimit) return;
    if (items.some((i) => i.name.toLowerCase() === trimmed.toLowerCase())) {
      setNewTopicInput("");
      return;
    }
    const newItem: TopicItem = { id: `topic_custom_${Date.now()}`, name: trimmed, selected: true };
    const next = [...items, newItem];
    setNewTopicInput("");
    notifyChange(next);
  }

  function handleThumbsDown() {
    setFeedback("down");
    if (onRegenerate) {
      onRegenerate();
    }
  }

  return (
    <div className="rounded-panel border border-line bg-surface p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div className="flex items-center gap-2 text-support font-medium text-ink">
          <Tag className="h-4 w-4 text-brand-strong" />
          <h3 className="font-semibold text-ink">Suggested Topics</h3>
        </div>

        <div className="flex items-center gap-2">
          {/* Thumbs Feedback */}
          <div className="flex items-center gap-1 border-r border-line pr-2">
            <button
              type="button"
              onClick={() => setFeedback("up")}
              title="Good suggestions"
              className={`rounded-lg p-1 text-ink-3 transition-colors hover:text-ink cursor-pointer ${
                feedback === "up" ? "bg-positive-soft text-positive" : "hover:bg-surface-2"
              }`}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleThumbsDown}
              title="Bad suggestions (regenerate)"
              className={`rounded-lg p-1 text-ink-3 transition-colors hover:text-critical cursor-pointer ${
                feedback === "down" ? "bg-critical-soft text-critical" : "hover:bg-surface-2"
              }`}
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Regenerate Button */}
          {onRegenerate && (
            <button
              type="button"
              disabled={isRegenerating}
              onClick={onRegenerate}
              className="flex items-center gap-1 rounded-control bg-surface-2 px-2.5 py-1 text-caption font-medium text-ink-2 hover:bg-brand-soft hover:text-brand-strong transition-colors cursor-pointer disabled:opacity-50"
            >
              <RotateCw className={`h-3 w-3 ${isRegenerating ? "animate-spin text-brand" : ""}`} />
              <span>{isRegenerating ? "Regenerating..." : "Regenerate"}</span>
            </button>
          )}

          <span className="rounded-full bg-brand-soft px-2.5 py-0.5 font-mono text-caption font-semibold text-brand-strong">
            {selectedCount}/{maxLimit} topics selected
          </span>
        </div>
      </div>

      <p className="text-support text-ink-2">
        {analyzed
          ? "We detected these key business topics from your website. Top 5 are pre-selected for your SEO and GEO focus. You can add or remove up to 10."
          : "Add the key topics your business wants to be found for (up to 10)."}
      </p>

      {/* Chip list */}
      <div className="flex flex-wrap gap-2 pt-1">
        {items.map((item) => (
          <div
            key={item.id}
            className={`group flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-support transition-all ${
              item.selected
                ? "border-brand-strong/40 bg-brand-soft text-brand-strong font-medium shadow-2xs"
                : "border-line bg-surface-2 text-ink-3 hover:border-line-strong hover:text-ink"
            }`}
          >
            <button
              type="button"
              onClick={() => toggleTopic(item.id)}
              className="flex items-center gap-1.5 text-left focus:outline-none cursor-pointer"
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  item.selected ? "border-brand-strong bg-brand-strong text-white" : "border-line-strong bg-surface"
                }`}
              >
                {item.selected && <Check className="h-3 w-3" />}
              </span>
              <span>{item.name}</span>
            </button>

            <button
              type="button"
              onClick={() => removeTopic(item.id)}
              aria-label={`Remove topic ${item.name}`}
              className="ml-1 rounded p-0.5 text-ink-3 hover:bg-black/5 hover:text-critical cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {items.length === 0 && (
          <p className="text-support italic text-ink-3">No topics selected. Add one below.</p>
        )}
      </div>

      {/* Add Topic form */}
      {items.length < maxLimit && (
        <form onSubmit={addTopic} className="flex items-center gap-2 pt-2">
          <input
            type="text"
            placeholder="Add a topic (e.g. Footwear)"
            value={newTopicInput}
            onChange={(e) => setNewTopicInput(e.target.value)}
            className="h-9 w-full max-w-xs rounded-control border border-line-strong bg-surface px-3 text-support text-ink placeholder:text-ink-3 focus:border-brand focus:outline-none"
          />
          <button
            type="submit"
            disabled={!newTopicInput.trim()}
            className="flex h-9 items-center gap-1.5 rounded-control bg-surface-2 px-3 text-support font-medium text-ink border border-line hover:bg-brand-soft hover:text-brand-strong disabled:opacity-40 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Add topic</span>
          </button>
        </form>
      )}
    </div>
  );
}
