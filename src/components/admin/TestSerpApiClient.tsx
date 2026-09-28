"use client";

import { useState } from "react";

interface EngineResult {
  status: number;
  tookMs: number;
  creditsUsed: number;
  expanded?: boolean;
  bodyExcerpt: {
    ai_overview?: unknown;
    text_blocks?: unknown;
    references?: unknown;
    reconstructed_markdown?: unknown;
    error?: string;
    search_metadata?: { status?: string };
  };
  error?: string;
}

interface TestResponse {
  keyword: string;
  gl: string;
  hl: string;
  ai_mode: EngineResult;
}

function summarise(r: EngineResult): { label: string; tone: "ok" | "empty" | "fail" } {
  if (r.error) return { label: `error: ${r.error}`, tone: "fail" };
  if (r.status >= 400) return { label: `HTTP ${r.status}`, tone: "fail" };

  const b = r.bodyExcerpt;
  const blocks = Array.isArray(b.text_blocks) ? b.text_blocks.length : 0;
  const refs = Array.isArray(b.references) ? b.references.length : 0;
  if (blocks === 0 && refs === 0) return { label: "no AI Mode data for this query", tone: "empty" };
  return { label: `${blocks} blocks · ${refs} references`, tone: "ok" };
}

export default function TestSerpApiClient() {
  const [keyword, setKeyword] = useState("");
  const [gl, setGl] = useState("ae");
  const [hl, setHl] = useState("en");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TestResponse | null>(null);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/test-serpapi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: keyword.trim(), gl, hl }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `HTTP ${res.status}`);
      } else {
        setResult(await res.json());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  const toneClass: Record<"ok" | "empty" | "fail", string> = {
    ok: "bg-positive-soft border-line text-positive",
    empty: "bg-attention-soft border-line text-attention",
    fail: "bg-critical-soft border-line text-critical",
  };

  const cards = result
    ? [
        {
          key: "ai_mode" as const,
          data: result.ai_mode,
          title: "AI Mode response",
          subtitle: "engine=google_ai_mode - diagnostic only. Run checks use engine=google (Google AI Overview), not this.",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <form onSubmit={run} className="rounded-panel border border-line bg-surface p-6 text-ink">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-7">
            <label className="block text-support font-medium text-ink-3 mb-1.5">Query</label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="best seo agency dubai"
              className="w-full rounded-panel border border-line bg-surface-2 px-3.5 py-2.5 text-body text-ink placeholder:text-ink-3 focus:border-line-strong focus:bg-surface focus:outline-none font-medium transition-colors"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-support font-medium text-ink-3 mb-1.5">gl</label>
            <input
              type="text"
              value={gl}
              onChange={(e) => setGl(e.target.value)}
              className="w-full rounded-panel border border-line bg-surface-2 px-3.5 py-2.5 text-body text-ink focus:border-line-strong focus:bg-surface focus:outline-none font-medium transition-colors"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-support font-medium text-ink-3 mb-1.5">hl</label>
            <input
              type="text"
              value={hl}
              onChange={(e) => setHl(e.target.value)}
              className="w-full rounded-panel border border-line bg-surface-2 px-3.5 py-2.5 text-body text-ink focus:border-line-strong focus:bg-surface focus:outline-none font-medium transition-colors"
            />
          </div>
          <div className="sm:col-span-1 flex items-end">
            <button
              type="submit"
              disabled={loading || !keyword.trim()}
              className="w-full rounded-panel bg-ink px-3 py-2.5 text-body font-medium text-white hover:bg-ink-2 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {loading ? "..." : "Test"}
            </button>
          </div>
        </div>
        <p className="text-support text-ink-3 font-medium mt-3">
          Burns 1 SerpApi credit per test. Same query within 1h is free (SerpApi cache).
        </p>
      </form>

      {error && (
        <div className="rounded-panel border border-line bg-critical-soft px-4 py-3 text-body font-medium text-critical">{error}</div>
      )}

      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {cards.map(({ key, data, title, subtitle }) => {
            const s = summarise(data);
            return (
              <div key={key} className="rounded-panel border border-line bg-surface p-6 text-ink">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="text-body font-medium text-ink">{title}</p>
                    <p className="text-support text-ink-3 font-medium mt-0.5">{subtitle}</p>
                  </div>
                  <div className="text-right shrink-0 text-support text-ink-3 font-medium">
                    <p>{data.tookMs}ms · HTTP {data.status || "-"}</p>
                    <p className="mt-0.5 text-brand-strong font-medium">{data.creditsUsed} credit{data.creditsUsed !== 1 ? "s" : ""}</p>
                  </div>
                </div>
                <div className={`rounded-panel border px-3.5 py-2 text-support font-medium mb-4 ${toneClass[s.tone]}`}>
                  {s.label}
                </div>
                <pre className="text-support text-ink bg-surface-2 border border-line rounded-panel p-4 overflow-x-auto max-h-96 overflow-y-auto">
                  {JSON.stringify(data.bodyExcerpt, null, 2)}
                </pre>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
