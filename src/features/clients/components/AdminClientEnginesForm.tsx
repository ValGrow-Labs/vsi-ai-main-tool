"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AI_ENGINES, GOOGLE_AI_OVERVIEW } from "@/lib/ai-engines";

type Tri = boolean | null;

interface Initial {
 ai_mode_enabled: Tri;
 ai_overview_enabled: Tri;
 rank_tracking_enabled: Tri;
 chatgpt_enabled: Tri;
 llm_mentions_enabled: Tri;
}

interface Props { clientId: string; initial: Initial }

const ENGINES: { key: keyof Initial; label: string; description: string; note?: string }[] = [
 { key: "rank_tracking_enabled", label: "Google rankings", description: "The project's position in Google results, plus the top 10 results." },
 { key: "ai_mode_enabled", label: GOOGLE_AI_OVERVIEW, description: `${AI_ENGINES.google_ai_overview.description}, and the sources it cites. The main AI visibility signal.` },
 { key: "chatgpt_enabled", label: "ChatGPT", description: "Asks ChatGPT each search and checks whether the answer names or links to the business." },
 { key: "llm_mentions_enabled", label: "Other AI assistants", description: "Mentions across other assistants. No provider is connected yet, so leave this off.", note: "Not available yet" },
];

function TriToggle({
 value, onChange, label, description, note,
}: { value: Tri; onChange: (v: Tri) => void; label: string; description: string; note?: string }) {
 const options: { v: Tri; text: string }[] = [
 { v: null, text: "Default" },
 { v: true, text: "On" },
 { v: false, text: "Off" },
 ];
 return (
 <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
 <div className="min-w-0">
 <p className="text-body font-medium text-ink">
 {label}
 {note && <span className="ml-2 text-caption font-normal text-ink-3">{note}</span>}
 </p>
 <p className="text-support text-ink-3">{description}</p>
 </div>
 <div role="radiogroup" aria-label={label} className="flex shrink-0 rounded-control border border-line bg-surface-2 p-0.5">
 {options.map((o) => (
 <button
 key={String(o.v)}
 type="button"
 role="radio"
 aria-checked={value === o.v}
 onClick={() => onChange(o.v)}
 className={`rounded px-3 py-1 text-support transition-colors ${value === o.v ? "bg-surface font-medium text-ink " : "text-ink-3 hover:text-ink"}`}
 >
 {o.text}
 </button>
 ))}
 </div>
 </div>
 );
}

export default function AdminClientEnginesForm({ clientId, initial }: Props) {
 const router = useRouter();
 const [, startTransition] = useTransition();
 const [state, setState] = useState<Initial>(initial);
 const [saving, setSaving] = useState(false);
 const [saved, setSaved] = useState(false);
 const [error, setError] = useState<string | null>(null);

 async function save() {
 setSaving(true);
 setError(null);
 setSaved(false);
 try {
 const res = await fetch(`/api/admin/clients/${clientId}/engines`, {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify(state),
 });
 if (!res.ok) {
 const data = await res.json().catch(() => ({}));
 setError(data.error ?? "That didn't work. Please try again.");
 return;
 }
 setSaved(true);
 startTransition(() => router.refresh());
 setTimeout(() => setSaved(false), 3000);
 } finally {
 setSaving(false);
 }
 }

 return (
 <div className="space-y-3">
 <p className="text-support text-ink-3">Default follows the platform setting. On or Off applies to this project only, from the next check.</p>
 <div className="divide-y divide-line border-y border-line">
 {ENGINES.map((e) => (
 <TriToggle
 key={e.key}
 label={e.label}
 description={e.description}
 note={e.note}
 value={state[e.key]}
 onChange={(v) => setState((s) => ({ ...s, [e.key]: v }))}
 />
 ))}
 </div>
 <div className="flex flex-wrap items-center gap-3 pt-1">
 <button
 onClick={save}
 disabled={saving}
 className="h-9 rounded-control bg-ink px-3.5 text-body font-medium text-white hover:bg-ink-2 disabled:opacity-50"
 >
 {saving ? "Saving" : "Save engines"}
 </button>
 {saved && <span className="text-support text-positive">Saved. Changes apply from the next check.</span>}
 {error && <span role="alert" className="text-support text-critical">{error}</span>}
 </div>
 </div>
 );
}
