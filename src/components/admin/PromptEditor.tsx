"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  promptKey: string;
  title: string;
  defaultTemplate: string;
  currentTemplate: string;
  variables: string[];
  outputFormat: string;
  isOverride: boolean;
}

export default function PromptEditor({
  promptKey,
  defaultTemplate,
  currentTemplate,
  variables,
  outputFormat,
  isOverride,
}: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState(currentTemplate);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const placeholdersUsed = useMemo(() => {
    const found = new Set<string>();
    const re = /\{\{\s*(\w+)\s*\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(draft)) !== null) found.add(m[1]);
    return found;
  }, [draft]);

  const unknownPlaceholders = useMemo(
    () => Array.from(placeholdersUsed).filter((p) => !variables.includes(p)),
    [placeholdersUsed, variables]
  );

  const missingPlaceholders = useMemo(
    () => variables.filter((v) => !placeholdersUsed.has(v)),
    [variables, placeholdersUsed]
  );

  const dirty = draft !== currentTemplate;

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const res = await fetch(`/api/admin/prompts/${promptKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: draft }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "That didn't save. Please try again.");
      return;
    }
    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 3000);
  }

  async function resetToDefault() {
    if (!confirm("Reset this prompt to the hardcoded default? The current override will be deleted.")) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/prompts/${promptKey}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to reset");
      return;
    }
    setDraft(defaultTemplate);
    router.refresh();
  }

  const samplePreview = useMemo(() => {
    const samples: Record<string, string> = {
      todayLabel: "1 January 2026",
      currentYear: "2026",
      clientBrand: "Sample Brand",
      clientDomain: "samplebrand.com",
      keyword: "best example agency dubai",
      rankPosition: "#4",
      aioPresent: "Yes",
      clientCited: "No",
      mentionedInText: "No",
      gapLabel: "geo invisible",
      competitorList: "competitor-a.com, competitor-b.com, competitor-c.com",
      aioSnippet: "- AIO body excerpt: \"Sample AI Overview response text...\"",
      sourceCount: "3",
      sourceBlocks: "--- Source 1: Example Page\nURL: https://example.com/article\nWord count: 1200\nExcerpt:\n[truncated content excerpt]\n",
    };
    return draft.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, name: string) => samples[name] ?? `«${name}»`);
  }, [draft]);

  return (
    <div className="space-y-6">
      {/* Variables reference */}
      <div className="rounded-panel border border-line bg-surface p-6 text-ink">
        <p className="text-support font-medium text-ink-3 mb-3">Available template variables</p>
        <div className="flex flex-wrap gap-2">
          {variables.map((v) => {
            const used = placeholdersUsed.has(v);
            return (
              <code
                key={v}
                className={`rounded-lg px-2.5 py-1 text-support font-mono font-medium ${
                  used ? "bg-positive-soft text-positive border border-line" : "bg-surface-2 text-ink-2 border border-line"
                }`}
                title={used ? "In use" : "Not yet referenced in template"}
              >
                {`{{${v}}}`}
              </code>
            );
          })}
        </div>
        <p className="text-support text-ink-3 font-medium mt-4">
          <span className="font-medium text-ink">Expected output:</span> {outputFormat}
        </p>
      </div>

      {/* Editor */}
      <div className="rounded-panel border border-line bg-surface p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-body font-medium text-ink">Template</p>
          <span className={`text-support font-medium px-3 py-1 rounded-control ${isOverride ? "bg-surface-2 text-brand-strong border border-line" : "bg-surface-2 text-ink-3 border border-line"}`}>
            {isOverride ? "Editing override" : "Editing default copy"}
          </span>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={22}
          spellCheck={false}
          className="w-full rounded-panel border border-line bg-surface-2 px-4 py-3 text-support text-ink leading-relaxed focus:border-line-strong focus:bg-surface focus:outline-none transition-colors"
        />

        {unknownPlaceholders.length > 0 && (
          <div className="rounded-panel border border-line bg-critical-soft px-4 py-3 text-support font-semibold text-critical">
            <strong>Unknown placeholders:</strong>{" "}
            {unknownPlaceholders.map((p) => `{{${p}}}`).join(", ")} - these will render as empty strings. Remove or fix them.
          </div>
        )}
        {missingPlaceholders.length > 0 && (
          <div className="rounded-panel border border-line bg-surface-2 px-4 py-3 text-support font-semibold text-brand-strong">
            <strong>Not referenced:</strong>{" "}
            {missingPlaceholders.map((p) => `{{${p}}}`).join(", ")} - these variables won&rsquo;t appear in the prompt. That&rsquo;s fine if intentional.
          </div>
        )}
      </div>

      {/* Preview */}
      <div className="rounded-panel border border-line bg-surface p-6">
        <button
          onClick={() => setPreviewOpen((v) => !v)}
          className="flex items-center gap-2 text-body font-medium text-ink hover:text-brand-strong transition-colors"
        >
          <span>{previewOpen ? "▼" : "▶"}</span>
          Preview rendered prompt (with sample values)
        </button>
        {previewOpen && (
          <pre className="mt-4 text-support text-ink bg-surface-2 border border-line rounded-panel p-4 overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap leading-relaxed">
            {samplePreview}
          </pre>
        )}
      </div>

      {error && (
        <div className="rounded-panel border border-line bg-critical-soft px-4 py-3 text-body font-medium text-critical">{error}</div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={resetToDefault}
          disabled={saving || !isOverride}
          className="rounded-panel border border-line bg-surface px-4 py-2.5 text-support font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-40 transition-colors"
        >
          Reset to default
        </button>
        <div className="flex items-center gap-3">
          {saved && <span className="text-support text-positive font-medium">Saved</span>}
          <button
            onClick={save}
            disabled={saving || !dirty}
            className="rounded-panel bg-ink px-5 py-2.5 text-body font-medium text-white hover:bg-ink-2 disabled:opacity-40 transition-colors"
          >
            {saving ? "Saving..." : dirty ? "Save override" : "No changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
