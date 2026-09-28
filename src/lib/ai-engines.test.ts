/**
 * The Google AI result VSI collects is Google AI Overview (SerpAPI
 * engine=google), and it is labelled as such everywhere. No network calls.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => { throw new Error("no db in tests"); }) }));
vi.mock("@/lib/settings", () => ({ getSetting: vi.fn(async () => null) }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

import { AI_ENGINES, AI_ENGINE_IDS, AI_OVERVIEW, GOOGLE_AI_OVERVIEW, aiEngineLabel } from "@/lib/ai-engines";
import { fetchAIO } from "@/lib/serpapi";
import { answerBreakdown, computeGeo, engineResult, ENGINES, type GeoRow } from "@/lib/geo";
import { buildSearchResultRow, type TrackedKeyword } from "@/lib/run-pipeline";
import { VSI_CHAT_SYSTEM_PROMPT } from "@/lib/chat-prompt";
import { GAP_CLASSIFICATIONS } from "@/types/search";

let fetchMock: ReturnType<typeof vi.fn>;
const savedKey = process.env.SERPAPI_KEY;
beforeEach(() => {
  process.env.SERPAPI_KEY = "test-key";
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  if (savedKey === undefined) delete process.env.SERPAPI_KEY;
  else process.env.SERPAPI_KEY = savedKey;
  vi.unstubAllGlobals();
});

const row = (o: Partial<GeoRow>): GeoRow => ({
  tracked_keyword_id: "k1", keyword: "q", created_at: "2026-09-27T00:00:00Z",
  aio_present: null, mentioned_in_text: null, client_cited: null, cited_domains: null,
  chatgpt_checked: false, chatgpt_brand_mentioned: null, chatgpt_brand_cited: null, chatgpt_competitors: null, chatgpt_cited_urls: null,
  ...o,
});
const kw: TrackedKeyword = { id: "k1", keyword: "q", domain: "acme.com", brand: "Acme", location: "ae", track_type: "geo", client_id: "c1" };

describe("1–2. the Google request is SerpAPI engine=google and is represented as Google AI Overview", () => {
  it("calls SerpAPI with engine=google, never engine=google_ai_mode", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ai_overview: { text_blocks: [{ type: "paragraph", snippet: "Acme is good." }], references: [{ index: 0, link: "https://acme.com/" }] } })),
    );
    const res = await fetchAIO("q", "acme.com", "Acme", "ae");
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.hostname).toBe("serpapi.com");
    expect(url.searchParams.get("engine")).toBe("google");
    expect(fetchMock.mock.calls.map((c) => String(c[0])).join()).not.toContain("google_ai_mode");
    expect(res).toMatchObject({ engine: "google_ai_overview", provider: "serpapi", aioPresent: true, mentionedInText: true, clientCited: true });
  });

  it("the page_token follow-up uses engine=google_ai_overview (still AI Overview)", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ai_overview: { page_token: "tok" } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ai_overview: { text_blocks: [{ type: "paragraph", snippet: "x" }] } })));
    await fetchAIO("q", "acme.com", "Acme", "ae");
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("engine")).toBe("google_ai_overview");
  });

  it("the central mapping names it Google AI Overview, from SerpAPI engine=google", () => {
    expect(AI_ENGINES.google_ai_overview).toMatchObject({ label: "Google AI Overview", shortLabel: "AI Overview", provider: "serpapi", providerEngine: "google" });
    expect(GOOGLE_AI_OVERVIEW).toBe("Google AI Overview");
    expect(AI_OVERVIEW).toBe("AI Overview");
  });
});

describe("4–6. engines and labels", () => {
  it("exactly two engines: Google AI Overview and ChatGPT (ChatGPT stays separate)", () => {
    expect(AI_ENGINE_IDS).toEqual(["google_ai_overview", "chatgpt"]);
    expect(ENGINES.map((e) => [e.id, e.label])).toEqual([
      ["google_ai_overview", "Google AI Overview"],
      ["chatgpt", "ChatGPT"],
    ]);
  });
  it("every label comes from the mapping", () => {
    expect(aiEngineLabel("google_ai_overview")).toBe(GOOGLE_AI_OVERVIEW);
    expect(aiEngineLabel("google_ai_overview", true)).toBe(AI_OVERVIEW);
    expect(aiEngineLabel("chatgpt")).toBe("ChatGPT");
    const s = computeGeo([row({ aio_present: true, mentioned_in_text: true })], { domain: "acme.com", enabled: { google_ai_overview: true, chatgpt: true } });
    expect(s.engines.map((e) => e.label)).toEqual(["Google AI Overview", "ChatGPT"]);
  });
  it("the AI Chat system prompt says Google AI Overview and that AI Mode is not checked", () => {
    expect(VSI_CHAT_SYSTEM_PROMPT).toContain("VSI checks Google rankings, Google AI Overview and ChatGPT");
    expect(VSI_CHAT_SYSTEM_PROMPT).toContain("It does not check Google AI Mode");
  });
  it("gap classification copy talks about the AI Overview", () => {
    for (const g of Object.values(GAP_CLASSIFICATIONS)) expect(g.description).not.toMatch(/AI Mode/);
  });
  it("a Google result plus its legacy ai_overview_* copy is counted once", () => {
    const s = computeGeo(
      [row({ aio_present: true, mentioned_in_text: true, client_cited: true, cited_domains: ["acme.com"], ai_overview_present: true, ai_overview_client_cited: true, ai_overview_cited_domains: ["acme.com"] })],
      { domain: "acme.com", enabled: { google_ai_overview: true, chatgpt: true } },
    );
    expect(s.engines).toHaveLength(2);
    expect(s).toMatchObject({ answered: 1, appears: 1, mentions: 1, citations: 1 });
    expect(answerBreakdown(s).total).toBe(1);
  });
});

describe("7–9. historical data, failures and provenance", () => {
  it("existing rows (no provenance) with Google data are read as Google AI Overview", () => {
    const legacy = row({ aio_present: true, mentioned_in_text: false, client_cited: true, cited_domains: ["acme.com"] });
    expect(engineResult(legacy, "google_ai_overview")).toMatchObject({ answered: true, linked: true, appears: true });
  });
  it("a failed Google check stays check_failed and is not a Google result", () => {
    const out = buildSearchResultRow({
      kw, agencyId: "a1", clientId: "c1", rankTrackingEnabled: false,
      serp: null,
      aio: { status: "rejected", reason: new Error("SerpApi HTTP status 500") },
      gpt: {
        status: "fulfilled",
        value: { checked: true, response: "r", brand_cited: false, brand_mentioned: false, mention_count: 0, competitors: [], cited_urls: [], entity_match: null, entity_actual: null, status: "answered", provider: "openai", model: "gpt-4o-mini", checked_at: "2026-09-27T00:00:00Z" },
      },
    });
    if (out.kind !== "row") throw new Error("expected a row (ChatGPT answered)");
    expect(out.row).toMatchObject({ aio_present: null, mentioned_in_text: null, client_cited: null });
    const p = out.row.check_provenance as Record<string, Record<string, unknown>>;
    expect(p.google_ai_overview).toMatchObject({ status: "check_failed", engine: "google_ai_overview", provider_engine: "google" });
    expect(engineResult(out.row as unknown as GeoRow, "google_ai_overview")).toBeNull();
    expect(engineResult(out.row as unknown as GeoRow, "chatgpt")).toMatchObject({ answered: true });
  });
  it("provenance records engine, provider, provider engine, status and time", () => {
    const out = buildSearchResultRow({
      kw, agencyId: "a1", clientId: "c1", rankTrackingEnabled: false, serp: null, gpt: null,
      aio: { status: "fulfilled", value: { keyword: "q", domain: "acme.com", brand: "Acme", location: "ae", aioPresent: true, aioSnippet: "a", aioFullText: "a", aioBlocks: [], citations: [], citedDomains: [], clientCited: false, mentionedInText: false, engine: "google_ai_overview", provider: "serpapi" } },
      now: "2026-09-27T10:00:00Z",
    });
    if (out.kind !== "row") throw new Error("expected a row");
    const p = out.row.check_provenance as Record<string, Record<string, unknown>>;
    expect(p.google_ai_overview).toEqual({ status: "answered", engine: "google_ai_overview", provider_engine: "google", provider: "serpapi", checked_at: "2026-09-27T10:00:00Z" });
    expect(p).not.toHaveProperty("google_ai_mode");
  });
});

describe("3. no code path labels the result as Google AI Mode", () => {
  // Legitimate remaining mentions, each explained:
  const ALLOWED: Record<string, RegExp> = {
    // Admin-only diagnostic that genuinely calls SerpAPI engine=google_ai_mode, labelled "diagnostic only".
    "src/app/api/admin/test-serpapi/route.ts": /google_ai_mode|Google AI Mode engine/,
    "src/components/admin/TestSerpApiClient.tsx": /AI Mode|google_ai_mode/,
    // States that VSI does NOT call / check Google AI Mode.
    "src/lib/ai-engines.ts": /does NOT call Google AI Mode|google_ai_mode/,
    "src/lib/serpapi.ts": /NOT Google AI Mode/,
    "src/lib/chat-prompt.ts": /does not check Google AI Mode/,
  };
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) files.push(full);
    }
  };
  walk(path.resolve(__dirname, ".."));

  it("scans the source", () => expect(files.length).toBeGreaterThan(100));
  it('"AI Mode" / google_ai_mode appear only in the allowed places', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const rel = path.relative(path.resolve(__dirname, "../.."), f).split(path.sep).join("/");
      readFileSync(f, "utf8").split(/\r?\n/).forEach((line, i) => {
        if (!/AI Mode|google_ai_mode/.test(line)) return;
        if (ALLOWED[rel]?.test(line)) return;
        offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
