import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => { throw new Error("no db in tests"); }) }));
vi.mock("@/lib/settings", () => ({ getSetting: vi.fn(async () => true) }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

import { buildSearchResultRow, publicFailureText, type TrackedKeyword } from "@/lib/run-pipeline";
import { ProviderUnavailableError } from "@/lib/provider-status";
import type { ChatGPTCheckResult } from "@/lib/chatgpt-check";
import type { SerpResult } from "@/types/search";

// Per-keyword failure text reaches the project's organization: the /api/run-client response,
// the Run button, and analysis_jobs.stages_data. It must never carry the provider's own text.
const kw: TrackedKeyword = { id: "k1", keyword: "plumber dubai", domain: "acme.com", brand: "Acme", location: "ae", track_type: "both", client_id: "c1" };
const serpOk: SerpResult = {
  keyword: "plumber dubai",
  domain: "acme.com",
  location: "ae",
  position: 4,
  rankingUrl: "https://acme.com/",
  rankingTitle: "Acme",
  serpFeatures: [],
  organicResults: [],
  provider: "serpapi",
};
const fulfilled = <T,>(value: T) => ({ status: "fulfilled" as const, value });
const rejected = (reason: unknown) => ({ status: "rejected" as const, reason });
const LEAKS = /api_key|sk_live|secret|serpapi\.com|openai\.com|HTTP \d{3}|<html|stack|ECONNREFUSED|10\.0\.0\.|relation|constraint|Internal Server Error/i;

describe("per-keyword failure text is fixed wording, never provider text", () => {
  afterEach(() => vi.restoreAllMocks());

  it("a rejected rank / AI answer check → fixed text by failure type; the raw error is only logged", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = buildSearchResultRow({
      kw,
      agencyId: "a1",
      clientId: "c1",
      rankTrackingEnabled: true,
      serp: rejected(new Error("GET https://serpapi.com/search?q=x&api_key=sk_live_abc123 failed: HTTP 500 <html>Internal Server Error</html>")),
      aio: rejected(new ProviderUnavailableError("serpapi", "PROVIDER_RATE_LIMITED", "429 from https://serpapi.com/search.json?api_key=secret")),
      gpt: null,
    });
    if (out.kind !== "no_data" && out.kind !== "row") throw new Error(`unexpected ${out.kind}`);
    expect(out.failures).toEqual([
      "Google rank: the provider couldn't complete the check",
      "Google AI answer: the provider is rate limited, try again later",
    ]);
    for (const f of out.failures) expect(f).not.toMatch(LEAKS);
    // Diagnostics are kept server-side.
    expect(JSON.stringify(log.mock.calls)).toMatch(/api_key=sk_live_abc123/);
  });

  it("a failed ChatGPT check (raw upstream body in skipped_reason) → fixed text", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const gpt: ChatGPTCheckResult = {
      checked: false,
      response: null,
      brand_cited: null,
      brand_mentioned: null,
      mention_count: null,
      competitors: [],
      cited_urls: [],
      entity_match: null,
      entity_actual: null,
      skipped_reason: 'HTTP 401 {"error":{"message":"Incorrect API key provided: sk-proj-abc***","type":"invalid_request_error"}}',
      status: "check_failed",
      failure_reason: "PROVIDER_AUTH_FAILED",
      provider: "openai",
      model: "gpt-4o-mini",
      checked_at: new Date().toISOString(),
    };
    const out = buildSearchResultRow({ kw, agencyId: "a1", clientId: "c1", rankTrackingEnabled: true, serp: fulfilled(serpOk), aio: null, gpt: fulfilled(gpt) });
    if (out.kind !== "row") throw new Error("expected a row");
    expect(out.failures).toEqual(["ChatGPT: the provider rejected our credentials"]);
    expect(out.failures.join()).not.toMatch(/sk-proj|Incorrect API key|invalid_request_error|HTTP 401/);
  });

  it("every failure type has its own wording, and an unknown one falls back", () => {
    const reasons = ["PROVIDER_NOT_CONFIGURED", "PROVIDER_AUTH_FAILED", "PROVIDER_RATE_LIMITED", "PROVIDER_TIMEOUT", "PROVIDER_ERROR", "INVALID_RESPONSE"] as const;
    const texts = reasons.map((r) => publicFailureText(r));
    expect(new Set(texts).size).toBe(reasons.length);
    expect(publicFailureText(undefined)).toBe("the check couldn't be completed");
    for (const t of texts) expect(t).not.toMatch(LEAKS);
  });
});
