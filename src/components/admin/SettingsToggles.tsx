"use client";

import { useState } from "react";

interface ToggleConfig {
  key: string;
  title: string;
  description: string;
  experimental?: boolean;
}

interface SelectConfig {
  key: string;
  title: string;
  description: string;
  options: { value: string; label: string }[];
}

const TOGGLES: ToggleConfig[] = [
  {
    key: "chatgpt_api_enabled",
    title: "ChatGPT visibility check",
    description:
      "Master switch for the ChatGPT brand-visibility check across the platform. Each client can still override this from their own engine settings.",
  },
  {
    key: "openai_search_enabled",
    title: "OpenAI live web search",
    description:
      "Uses gpt-4o-mini-search-preview, which grounds answers in live search results (+$30 per 1,000 searches). Leave off for the pilot - the plain gpt-4o-mini model is roughly 75× cheaper and still produces a useful visibility signal.",
    experimental: true,
  },
  {
    key: "openai_reports_enabled",
    title: "Route keyword reports through OpenAI",
    description:
      "Master switch for sending keyword reports (Summary, Detailed, Task List) to OpenAI. Each report type uses the model configured below - typically a cheap model for Summary/Detailed and a stronger one for Task Lists.",
  },
  {
    key: "openai_citation_enabled",
    title: "Route Citation Strategy through OpenAI",
    description:
      "Use OpenAI directly for the Citation Strategy analyser. This is the blueprint every Task List grounds in, so a stronger model is worth the spend.",
  },
];

const SELECTS: SelectConfig[] = [
  {
    key: "openai_chatgpt_model",
    title: "OpenAI model for ChatGPT visibility",
    description:
      "Active model used for the ChatGPT-visibility check when an OpenAI key is configured. Ignored if the live-web-search toggle is on (that forces the search-preview model).",
    options: [
      { value: "gpt-4o-mini", label: "gpt-4o-mini · cheapest" },
      { value: "gpt-4o", label: "gpt-4o · highest quality" },
    ],
  },
  {
    key: "openai_summary_model",
    title: "OpenAI model · Executive Summary + Detailed Strategy",
    description:
      "These reports are short and conversational; the cheap model handles them well. Only used when 'Route keyword reports through OpenAI' is on.",
    options: [
      { value: "gpt-4o-mini", label: "gpt-4o-mini · cheapest (recommended)" },
      { value: "gpt-4o", label: "gpt-4o · overkill for these reports" },
    ],
  },
  {
    key: "openai_tasks_model",
    title: "OpenAI model · Task List reports",
    description:
      "Task tickets need owners, effort, impact, and acceptance criteria. The stronger model produces materially better tickets - worth the spend for the report your team will actually execute.",
    options: [
      { value: "gpt-4o-mini", label: "gpt-4o-mini · cheapest" },
      { value: "gpt-4o", label: "gpt-4o · recommended" },
    ],
  },
  {
    key: "openai_citation_model",
    title: "OpenAI model · Citation Strategy",
    description:
      "The Citation Strategy is the blueprint every Task List grounds in. Stronger model = better patterns and gaps. Only used when 'Route Citation Strategy through OpenAI' is on.",
    options: [
      { value: "gpt-4o-mini", label: "gpt-4o-mini · cheapest" },
      { value: "gpt-4o", label: "gpt-4o · recommended" },
    ],
  },
];

export default function SettingsToggles({ initial }: { initial: Record<string, unknown> }) {
  const [state, setState] = useState<Record<string, unknown>>(initial);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function setKey(key: string, value: unknown) {
    const prev = state[key];
    setState((s) => ({ ...s, [key]: value }));
    setSaving(key);
    setError(null);
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    setSaving(null);
    if (!res.ok) {
      setState((s) => ({ ...s, [key]: prev }));
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "That didn't save. Please try again.");
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="rounded-panel border border-line bg-critical-soft px-4 py-3 text-body text-critical">
          {error}
        </div>
      )}

      <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
      {TOGGLES.map((t) => {
        const value = !!state[t.key];
        return (
          <li key={t.key} className="flex items-start justify-between gap-4 px-4 py-3.5">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p id={`setting-${t.key}`} className="text-body font-medium text-ink">{t.title}</p>
                {t.experimental && <span className="text-caption text-ink-3">Experimental</span>}
              </div>
              <p className="mt-0.5 text-support text-ink-3">{t.description}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={value}
              aria-labelledby={`setting-${t.key}`}
              onClick={() => setKey(t.key, !value)}
              disabled={saving === t.key}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                value ? "bg-ink" : "bg-line"
              } disabled:opacity-50`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform  ${
                  value ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </li>
        );
      })}
      </ul>

      <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
      {SELECTS.map((s) => {
        const current = typeof state[s.key] === "string" ? (state[s.key] as string) : "";
        return (
          <li key={s.key} className="px-4 py-3.5">
            <p className="text-body font-medium text-ink">{s.title}</p>
            <p className="mt-0.5 text-support text-ink-3">{s.description}</p>
            <div role="radiogroup" aria-label={s.title} className="mt-3 flex flex-wrap gap-2">
              {s.options.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setKey(s.key, opt.value)}
                  disabled={saving === s.key}
                  type="button"
                  role="radio"
                  aria-checked={current === opt.value}
                  className={`h-8 rounded-control px-3 text-support transition-colors ${
                    current === opt.value ? "bg-ink font-medium text-white" : "border border-line bg-surface text-ink-2 hover:bg-surface-2 hover:text-ink"
                  } disabled:opacity-50`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </li>
        );
      })}
      </ul>
    </div>
  );
}
