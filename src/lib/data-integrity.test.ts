/**
 * Data-integrity guarantees: a failed or unconfigured provider never produces
 * a result that looks real — no fake rows, metrics, findings or tasks.
 * All provider calls are mocked; no network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => { throw new Error("no db in tests"); }) }));
vi.mock("@/lib/settings", () => ({ getSetting: vi.fn(async (key: string) => (key === "openai_chatgpt_model" ? "gpt-4o-mini" : key === "openai_search_enabled" ? false : true)) }));
vi.mock("@/lib/track", () => ({ track: vi.fn() }));

import { fetchRank, fetchBulkRanks } from "@/lib/serper";
import { fetchAIO } from "@/lib/serpapi";
import { searchSerpApi, SerpApiError } from "@/lib/serpapi-service";
import { runChatGPTCheck, findCompetitorMentions, type ChatGPTCheckResult } from "@/lib/chatgpt-check";
import { buildSearchResultRow, type TrackedKeyword } from "@/lib/run-pipeline";
import { computeSearch, searchFindings, type RankRow } from "@/lib/search";
import { computeGeo, type GeoRow } from "@/lib/geo";
import { geoFindings } from "@/lib/geo-findings";
import { isComparableSnapshot, runOutcomeVerification } from "@/lib/task-outcome";
import { ProviderUnavailableError } from "@/lib/provider-status";
import { buildBrandTokens, matchesBrand } from "@/lib/brand-match";
import { detectPlatform } from "@/types/search";
import { hostMatchesDomain } from "@/lib/url-input";
import { OpenAIProvider, UnconfiguredAIProvider, extractCitationsAndMentions } from "@/lib/providers/ai-providers";
import { UnconfiguredSearchProvider } from "@/lib/providers/search-providers";
import type { SerpResult, AIOResult } from "@/types/search";

const ENV_KEYS = ["SERPAPI_KEY", "SERPAPI_API_KEY", "SERPER_API_KEY", "SEARCHAPI_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY", "VSI_ALLOW_DEMO_DATA"];
const saved: Record<string, string | undefined> = {};
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  fetchMock = vi.fn(async () => {
    throw new Error("unexpected network call");
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const kw: TrackedKeyword = { id: "k1", keyword: "plumber dubai", domain: "acme.com", brand: "Acme", location: "ae", track_type: "both", client_id: "c1" };
const serpOk = (position: number | null): SerpResult => ({
  keyword: "plumber dubai",
  domain: "acme.com",
  location: "ae",
  position,
  rankingUrl: position ? "https://acme.com/" : null,
  rankingTitle: position ? "Acme" : null,
  serpFeatures: [],
  organicResults: [{ position: 1, title: "x", url: "https://rival.com/", domain: "rival.com", snippet: null, isClient: false, platform: "other" }],
  provider: "serpapi",
});
const aioOk = (mentioned: boolean): AIOResult => ({
  keyword: "plumber dubai",
  domain: "acme.com",
  brand: "Acme",
  location: "ae",
  aioPresent: true,
  aioSnippet: "answer",
  aioFullText: "answer",
  aioBlocks: [],
  citations: [],
  citedDomains: ["rival.com"],
  clientCited: false,
  mentionedInText: mentioned,
  engine: "google_ai_overview",
  provider: "serpapi",
});
const gptAnswered = (mentioned: boolean): ChatGPTCheckResult => ({
  checked: true,
  response: "ChatGPT answer",
  brand_cited: false,
  brand_mentioned: mentioned,
  mention_count: mentioned ? 1 : 0,
  competitors: [],
  cited_urls: [],
  entity_match: null,
  entity_actual: null,
  status: "answered",
  provider: "openai",
  model: "gpt-4o-mini",
  checked_at: "2026-09-27T00:00:00Z",
});
const fulfilled = <T,>(value: T) => ({ status: "fulfilled" as const, value });
const rejected = (reason: unknown) => ({ status: "rejected" as const, reason });

// ── 1–3: search providers ─────────────────────────────────────────────

describe("1. missing SERP API key → no fake results", () => {
  it("fetchRank throws PROVIDER_NOT_CONFIGURED and makes no call", async () => {
    await expect(fetchRank("plumber", "acme.com", "ae")).rejects.toMatchObject({ reason: "PROVIDER_NOT_CONFIGURED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("fetchAIO throws instead of inventing an AI answer", async () => {
    await expect(fetchAIO("plumber", "acme.com", "Acme", "ae")).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("searchSerpApi throws SEARCH_UNAVAILABLE instead of success:true with invented results", async () => {
    await expect(searchSerpApi("plumber")).rejects.toMatchObject({ code: "SEARCH_UNAVAILABLE", statusCode: 503 });
    await expect(searchSerpApi("plumber")).rejects.toBeInstanceOf(SerpApiError);
  });
  it("fetchBulkRanks throws instead of returning invented positions", async () => {
    await expect(fetchBulkRanks("plumber", ["acme.com"], "ae")).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
  it("keys for other vendors are never sent to SerpAPI", async () => {
    process.env.SEARCHAPI_KEY = "searchapi-key";
    await expect(fetchRank("plumber", "acme.com", "ae")).rejects.toMatchObject({ reason: "PROVIDER_NOT_CONFIGURED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("demo data needs VSI_ALLOW_DEMO_DATA and is never available in production", async () => {
    process.env.VSI_ALLOW_DEMO_DATA = "true";
    vi.stubEnv("NODE_ENV", "production");
    await expect(fetchRank("plumber", "acme.com", "ae")).rejects.toBeInstanceOf(ProviderUnavailableError);
    vi.stubEnv("NODE_ENV", "development");
    const demo = await fetchRank("plumber", "acme.com", "ae");
    expect(demo.isDemo).toBe(true);
    expect(demo.organicResults.every((r) => r.domain.endsWith(".example"))).toBe(true);
  });
  it("demo results are never stored", () => {
    const out = buildSearchResultRow({ kw, agencyId: "a1", clientId: "c1", rankTrackingEnabled: true, serp: fulfilled({ ...serpOk(null), isDemo: true }), aio: null, gpt: null });
    expect(out.kind).toBe("demo");
  });
});

describe("2–3. SERP timeout / rate limit → CHECK_FAILED", () => {
  beforeEach(() => {
    process.env.SERPAPI_KEY = "k";
  });
  it("timeout is a typed failure", async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }));
    const err = await fetchRank("plumber", "acme.com", "ae").catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    const out = buildSearchResultRow({ kw, agencyId: "a1", clientId: "c1", rankTrackingEnabled: true, serp: rejected(err), aio: null, gpt: null });
    // Nothing real was observed → no row at all.
    expect(out.kind).toBe("no_data");
  });
  it("rate limit is PROVIDER_RATE_LIMITED", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "rate" }, 429));
    await expect(fetchRank("plumber", "acme.com", "ae")).rejects.toMatchObject({ reason: "PROVIDER_RATE_LIMITED" });
  });
  it("an unparseable response is INVALID_RESPONSE, not an empty result", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>not json", { status: 200 }));
    await expect(fetchRank("plumber", "acme.com", "ae")).rejects.toMatchObject({ reason: "INVALID_RESPONSE" });
  });
  it("a real response still works and matches only the exact host", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ organic_results: [{ position: 1, link: "https://notacme.com/" }, { position: 2, link: "https://acme.com.evil.io/" }, { position: 3, link: "https://www.acme.com/x" }] }),
    );
    const r = await fetchRank("plumber", "acme.com", "ae");
    expect(r.position).toBe(3);
    expect(r.provider).toBe("serpapi");
  });
});

// ── 4–6: AI providers ─────────────────────────────────────────────────

describe("4. missing AI provider key → no fake AI answer", () => {
  it("ChatGPT check is not checked, with no call", async () => {
    const r = await runChatGPTCheck({ keyword: "q", clientBrand: "Acme", clientDomain: "acme.com" });
    expect(r).toMatchObject({ checked: false, status: "not_checked", brand_mentioned: null, provider: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("an OpenRouter key alone is never used or labelled as ChatGPT", async () => {
    process.env.OPENROUTER_API_KEY = "or-key";
    const r = await runChatGPTCheck({ keyword: "q", clientBrand: "Acme", clientDomain: "acme.com" });
    expect(r.status).toBe("not_checked");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("unconfigured provider abstractions throw instead of returning 'not visible'", async () => {
    await expect(new UnconfiguredAIProvider().generateResponse()).rejects.toBeInstanceOf(ProviderUnavailableError);
    await expect(new UnconfiguredSearchProvider().search()).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
});

describe("5–6. AI provider error / parse failure → no checked=true, mentioned=false row", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "k";
  });
  it("HTTP error is check_failed and stores no ChatGPT result", async () => {
    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 500 }));
    const r = await runChatGPTCheck({ keyword: "q", clientBrand: "Acme", clientDomain: "acme.com" });
    expect(r).toMatchObject({ checked: false, status: "check_failed", brand_mentioned: null });
    const out = buildSearchResultRow({ kw, agencyId: "a1", clientId: "c1", rankTrackingEnabled: true, serp: fulfilled(serpOk(4)), aio: null, gpt: fulfilled(r) });
    expect(out.kind).toBe("row");
    if (out.kind !== "row") return;
    expect(out.row).toMatchObject({ chatgpt_checked: false, chatgpt_brand_mentioned: null, chatgpt_brand_cited: null });
    expect((out.row.check_provenance as Record<string, { status: string }>).chatgpt.status).toBe("check_failed");
  });
  it("invalid JSON is check_failed (INVALID_RESPONSE)", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not json", { status: 200 }));
    const r = await runChatGPTCheck({ keyword: "q", clientBrand: "Acme", clientDomain: "acme.com" });
    expect(r).toMatchObject({ status: "check_failed", failure_reason: "INVALID_RESPONSE", brand_mentioned: null });
  });
  it("empty answer text is check_failed, not 'not mentioned'", async () => {
    fetchMock.mockResolvedValueOnce(json({ choices: [{ message: { content: "" } }] }));
    const r = await runChatGPTCheck({ keyword: "q", clientBrand: "Acme", clientDomain: "acme.com" });
    expect(r).toMatchObject({ status: "check_failed", brand_mentioned: null });
  });
  it("the provider abstraction throws on error instead of returning brandMentioned:false", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { message: "bad" } }));
    await expect(new OpenAIProvider().generateResponse("q", "Acme", "acme.com", [])).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
  it("a failed Google AI fetch leaves the AI fields NULL (not checked)", () => {
    const out = buildSearchResultRow({ kw, agencyId: "a1", clientId: "c1", rankTrackingEnabled: true, serp: fulfilled(serpOk(4)), aio: rejected(new Error("SerpApi HTTP status 500")), gpt: null });
    if (out.kind !== "row") throw new Error("expected a row");
    expect(out.row).toMatchObject({ aio_present: null, mentioned_in_text: null, client_cited: null });
    expect(out.failures.join()).toMatch(/Google AI answer/);
  });
});

// ── 10–11: rank failures ──────────────────────────────────────────────

describe("10. failed rank lookup → rank NULL + check_failed", () => {
  it("stores the AI result but marks the rank as failed, with no stored SERP", () => {
    const out = buildSearchResultRow({ kw, agencyId: "a1", clientId: "c1", rankTrackingEnabled: true, serp: rejected(new ProviderUnavailableError("serpapi", "PROVIDER_TIMEOUT")), aio: fulfilled(aioOk(true)), gpt: null });
    if (out.kind !== "row") throw new Error("expected a row");
    expect(out.row).toMatchObject({ rank_position: null, rank_status: "check_failed", serp_results_json: null, aio_present: true });
  });
  it("rank tracking off → not_checked, never 'not found'", () => {
    const out = buildSearchResultRow({ kw, agencyId: "a1", clientId: "c1", rankTrackingEnabled: false, serp: null, aio: fulfilled(aioOk(true)), gpt: null });
    if (out.kind !== "row") throw new Error("expected a row");
    expect(out.row.rank_status).toBe("not_checked");
    expect(out.row.serp_results_json).toBeNull();
  });
});

const rankRow = (created_at: string, rank_position: number | null, extra: Partial<RankRow> = {}): RankRow => ({
  tracked_keyword_id: "k1",
  keyword: "plumber dubai",
  created_at,
  rank_position,
  rank_url: null,
  ...extra,
});

describe("11. failed rank lookup does not overwrite the previous valid rank", () => {
  const rows = [
    rankRow("2026-09-20T08:00:00Z", 4, { rank_status: "found" }),
    rankRow("2026-09-27T08:00:00Z", null, { rank_status: "check_failed" }),
  ];
  const s = computeSearch(rows, new Set(["k1"]));
  it("keeps position 4 as the latest real observation", () => {
    expect(s.searches[0]).toMatchObject({ position: 4, change: null, movement: null });
    expect(s).toMatchObject({ ranked: 1, notFound: 0, declined: 0 });
  });
  it("legacy rows without a status: NULL rank + no stored results is not a 'not found'", () => {
    const legacy = computeSearch([rankRow("2026-09-20T08:00:00Z", 4), rankRow("2026-09-27T08:00:00Z", null, { serp_first: null })], new Set(["k1"]));
    expect(legacy.searches[0].position).toBe(4);
    const realNotFound = computeSearch([rankRow("2026-09-20T08:00:00Z", 4), rankRow("2026-09-27T08:00:00Z", null, { serp_first: { position: 1 } })], new Set(["k1"]));
    expect(realNotFound.searches[0]).toMatchObject({ position: null, movement: "dropped_out", change: null });
  });
  it("no numeric sentinel: dropping out is a movement, not a -96 change", () => {
    const s2 = computeSearch([rankRow("2026-09-20T08:00:00Z", 4, { rank_status: "found" }), rankRow("2026-09-27T08:00:00Z", null, { rank_status: "not_found" })], new Set(["k1"]));
    expect(s2.searches[0].change).toBeNull();
    expect(s2.searches[0].movement).toBe("dropped_out");
  });
});

// ── 13: provenance ────────────────────────────────────────────────────

describe("13. provider results keep engine/provider/model provenance", () => {
  it("each engine is stored only from its own provider, with provenance", () => {
    const out = buildSearchResultRow({ kw, agencyId: "a1", clientId: "c1", rankTrackingEnabled: true, serp: fulfilled(serpOk(4)), aio: fulfilled(aioOk(false)), gpt: fulfilled(gptAnswered(true)) });
    if (out.kind !== "row") throw new Error("expected a row");
    const p = out.row.check_provenance as Record<string, Record<string, unknown>>;
    expect(p.rank).toMatchObject({ status: "found", provider: "serpapi", engine: "google_organic" });
    expect(p.google_ai_overview).toMatchObject({ status: "answered", provider: "serpapi", engine: "google_ai_overview", provider_engine: "google" });
    expect(p.chatgpt).toMatchObject({ status: "answered", provider: "openai", model: "gpt-4o-mini", engine: "chatgpt" });
    expect(Object.keys(p).sort()).toEqual(["chatgpt", "google_ai_overview", "rank"]);
    // The ChatGPT answer never lands in the Google fields, and vice versa.
    expect(out.row.aio_full_text).toBe("answer");
    expect(out.row.chatgpt_response).toBe("ChatGPT answer");
    expect(out.row.mentioned_in_text).toBe(false);
    expect(out.row.chatgpt_brand_mentioned).toBe(true);
    // The legacy ai_overview_* columns are never filled: one Google request, one engine.
    expect(out.row.ai_overview_present).toBeNull();
    expect(out.row.ai_overview_full_text).toBeNull();
  });
  it("every check failed → no row at all", () => {
    const out = buildSearchResultRow({
      kw, agencyId: "a1", clientId: "c1", rankTrackingEnabled: true,
      serp: rejected(new Error("timeout")), aio: rejected(new Error("500")),
      gpt: fulfilled({ ...gptAnswered(false), checked: false, status: "check_failed", response: null, brand_mentioned: null }),
    });
    expect(out.kind).toBe("no_data");
  });
});

// ── 14–16: failures cannot create findings, tasks or change visibility ─

describe("14. a failed provider result cannot generate a Next Action", () => {
  it("failed rank rows produce no search findings", () => {
    const s = computeSearch([rankRow("2026-09-20T08:00:00Z", null, { rank_status: "check_failed" }), rankRow("2026-09-27T08:00:00Z", null, { rank_status: "check_failed" })], new Set(["k1"]));
    expect(s.tracked).toBe(0);
    expect(searchFindings(s, "c1")).toEqual([]);
  });
  it("failed AI checks produce no AI findings", () => {
    const failed: GeoRow = geoRow({ aio_present: null, chatgpt_checked: false });
    const s = computeGeo([failed], { domain: "acme.com", enabled: { google_ai_overview: true, chatgpt: true } });
    expect(geoFindings(s, "c1")).toEqual([]);
  });
});

describe("15. a failed provider result cannot generate or judge a task", () => {
  it("a snapshot with a failed rank or unchecked AI is not comparable", () => {
    expect(isComparableSnapshot({ rank_position: null, client_cited: null, gap_label: "weak_double_loss", aio_present: true, rank_status: "check_failed" })).toBe(false);
    expect(isComparableSnapshot({ rank_position: 3, client_cited: null, gap_label: "seo_only", aio_present: null, rank_status: "found" })).toBe(false);
    expect(isComparableSnapshot({ rank_position: 3, client_cited: false, gap_label: "seo_only", aio_present: true, rank_status: "found" })).toBe(true);
  });
  it("runOutcomeVerification changes no task when the latest row is a failed check", async () => {
    const update = vi.fn();
    const supabase = {
      from: vi.fn((table: string) => {
        if (table === "tasks") return { select: () => ({ eq: () => ({ eq: () => ({ is: async () => ({ data: [{ id: "t1", context_snapshot: { gapLabel: "seo_only", clientCited: true } }] }) }) }) }), update };
        return { select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { rank_position: null, client_cited: false, gap_label: "weak_double_loss", aio_present: null, rank_status: "check_failed", serp_first: null }, error: null }) }) }) }) }) };
      }),
    };
    const res = await runOutcomeVerification(supabase as never, "k1");
    expect(res).toEqual({ checked: 0, updated: 0 });
    expect(update).not.toHaveBeenCalled();
  });
});

function geoRow(o: Partial<GeoRow>): GeoRow {
  return {
    tracked_keyword_id: "k1", keyword: "a", created_at: "2026-09-27T00:00:00Z",
    aio_present: null, mentioned_in_text: null, client_cited: null, cited_domains: null,
    ai_overview_present: null, ai_overview_client_cited: null, ai_overview_cited_domains: null,
    chatgpt_checked: false, chatgpt_brand_mentioned: null, chatgpt_brand_cited: null, chatgpt_competitors: null, chatgpt_cited_urls: null,
    ...o,
  };
}

describe("16. a failed provider result cannot affect the visibility percentage", () => {
  const enabled = { google_ai_overview: true, chatgpt: true };
  const real = [
    geoRow({ tracked_keyword_id: "k1", keyword: "a", aio_present: true, mentioned_in_text: true }),
    geoRow({ tracked_keyword_id: "k2", keyword: "b", aio_present: true, mentioned_in_text: false }),
  ];
  it("adding a failed check for a third search leaves visibility at 50%", () => {
    const base = computeGeo(real, { domain: "acme.com", enabled });
    const withFailed = computeGeo([...real, geoRow({ tracked_keyword_id: "k3", keyword: "c" })], { domain: "acme.com", enabled });
    expect(base.visibility).toBe(50);
    expect(withFailed.visibility).toBe(50);
    expect(withFailed.answered).toBe(2);
  });
  it("a ChatGPT mention of a different organisation doesn't count", () => {
    const s = computeGeo([geoRow({ chatgpt_checked: true, chatgpt_brand_mentioned: true, chatgpt_entity_match: false })], { domain: "acme.com", enabled });
    expect(s.visibility).toBe(0);
  });
});

// ── matching rules behind "no fake mentions / competitors" ────────────

describe("matching never invents mentions, citations or competitors", () => {
  const tokens = buildBrandTokens({ brand: "Acme Analytics", domain: "acmeanalytics.com" });
  it.each([
    ["Use Google Analytics to measure traffic.", false],
    ["Acmecorp Logistics ships worldwide.", false],
    ["Try ACME ANALYTICS for dashboards.", true],
    ["see acmeanalytics.com for pricing", true],
  ])("brand match: %s → %s", (text, expected) => {
    expect(matchesBrand(text, tokens)).toBe(expected);
  });
  it("short brand inside another word is not a mention", () => {
    expect(matchesBrand("Innovative teams use many tools.", buildBrandTokens({ brand: "Nova", domain: "novahq.com" }))).toBe(false);
  });
  it("platform detection uses exact hosts (netflix.com is not X)", () => {
    expect(detectPlatform("netflix.com")).toBe("other");
    expect(detectPlatform("x.com")).toBe("twitter");
    expect(detectPlatform("en.wikipedia.org")).toBe("wikipedia");
  });
  it("host matching rejects look-alikes and empty hosts", () => {
    expect(hostMatchesDomain("notacme.com", "acme.com")).toBe(false);
    expect(hostMatchesDomain("acme.com.evil.io", "acme.com")).toBe(false);
    expect(hostMatchesDomain("", "acme.com")).toBe(false);
    expect(hostMatchesDomain("https://blog.acme.com/x", "acme.com")).toBe(true);
  });
  it("ChatGPT competitors come only from the project's list", () => {
    expect(findCompetitorMentions("Check the newsite for tenets of good design; Vladimir helps.", [])).toEqual([]);
    expect(findCompetitorMentions("Tableau and Looker lead.", [{ domain: "tableau.com" }])).toEqual(["tableau.com"]);
  });
  it("the model-answer parser cites only the exact host", () => {
    const r = extractCitationsAndMentions("See https://flipkart.pissedconsumer.com/x and https://x.io/?ref=flipkart.com", "Flipkart", "flipkart.com", []);
    expect(r.isTargetCited).toBe(false);
  });
});
