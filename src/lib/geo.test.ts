import { describe, expect, it } from "vitest";
import { answerBreakdown, competitorPresence, computeGeo, engineResult, geoConclusion, highlightBrand, latestPerSearch, type GeoRow } from "./geo";
import { compareCompetitors } from "./geo-compare";
import { geoFindings } from "./geo-findings";

const ALL_ON = { google_ai_overview: true, chatgpt: true };

function row(overrides: Partial<GeoRow>): GeoRow {
  return {
    tracked_keyword_id: "k1",
    keyword: "plumber dubai",
    created_at: "2026-09-10T08:00:00Z",
    aio_present: null,
    mentioned_in_text: null,
    client_cited: null,
    cited_domains: null,
    ai_overview_present: null,
    ai_overview_client_cited: null,
    ai_overview_cited_domains: null,
    chatgpt_checked: false,
    chatgpt_brand_mentioned: null,
    chatgpt_brand_cited: null,
    chatgpt_competitors: null,
    chatgpt_cited_urls: null,
    chatgpt_entity_match: null,
    ...overrides,
  };
}

describe("engineResult", () => {
  it("treats missing data as not checked, never as 'no'", () => {
    expect(engineResult(row({}), "google_ai_overview")).toBeNull();
    expect(engineResult(row({ chatgpt_checked: false }), "chatgpt")).toBeNull();
  });

  it("counts Google AI Overview appearances from name or link", () => {
    expect(engineResult(row({ aio_present: true, mentioned_in_text: true, client_cited: false }), "google_ai_overview")).toMatchObject({
      answered: true,
      named: true,
      linked: false,
      appears: true,
    });
    expect(engineResult(row({ aio_present: false, client_cited: true }), "google_ai_overview")).toMatchObject({ answered: false, appears: false });
  });

  it("never reads the legacy ai_overview_* copy as a second Google engine", () => {
    // Legacy rows held a copy of the same Google request in ai_overview_*: it's ignored.
    const legacy = row({ ai_overview_present: true, ai_overview_client_cited: true, ai_overview_cited_domains: ["example.com"] });
    expect(engineResult(legacy, "google_ai_overview")).toBeNull();
    expect(engineResult(legacy, "chatgpt")).toBeNull();
  });
});

describe("latestPerSearch", () => {
  it("keeps the newest row per search", () => {
    const rows = [
      row({ created_at: "2026-09-01T00:00:00Z", aio_present: false }),
      row({ created_at: "2026-09-10T00:00:00Z", aio_present: true }),
      row({ tracked_keyword_id: "k2", keyword: "a", created_at: "2026-09-02T00:00:00Z" }),
    ];
    const latest = latestPerSearch(rows);
    expect(latest).toHaveLength(2);
    expect(latest.find((r) => r.tracked_keyword_id === "k1")?.aio_present).toBe(true);
  });
});

describe("computeGeo", () => {
  const rows: GeoRow[] = [
    // You're named and linked in the Google AI Overview
    row({ tracked_keyword_id: "k1", keyword: "best plumber", aio_present: true, mentioned_in_text: true, client_cited: true, cited_domains: ["example.com", "rival.com"] }),
    // Not mentioned; rival and reddit are linked
    row({ tracked_keyword_id: "k2", keyword: "emergency plumber", aio_present: true, mentioned_in_text: false, client_cited: false, cited_domains: ["rival.com", "www.reddit.com"] }),
    // ChatGPT names you
    row({ tracked_keyword_id: "k3", keyword: "plumber prices", aio_present: false, chatgpt_checked: true, chatgpt_brand_mentioned: true, chatgpt_brand_cited: false, chatgpt_competitors: ["Rival Plumbing"] }),
    // Never checked by any engine
    row({ tracked_keyword_id: "k4", keyword: "new search" }),
    // Older row for k2 on a previous day: you appeared then
    row({ tracked_keyword_id: "k2", keyword: "emergency plumber", created_at: "2026-09-01T08:00:00Z", aio_present: true, mentioned_in_text: true, client_cited: false, cited_domains: [] }),
  ];
  const s = computeGeo(rows, { domain: "https://www.example.com/", enabled: ALL_ON });

  it("computes visibility over searches that got an AI answer", () => {
    expect(s.searchesTracked).toBe(4);
    expect(s.answered).toBe(3);
    expect(s.appears).toBe(2);
    expect(s.visibility).toBe(67);
    expect(s.early).toBe(true);
  });

  it("counts mentions and citations per answer", () => {
    expect(s.mentions).toBe(2);
    expect(s.citations).toBe(1);
  });

  it("counts competitors the same way as you, excluding your own domain", () => {
    expect(s.competitors.map((c) => c.domain)).toEqual(["rival.com"]);
    expect(s.competitors[0]).toMatchObject({ answers: 2, gapSearches: 1 });
    expect(s.platforms).toEqual([{ name: "Reddit", answers: 1 }]);
  });

  it("counts a competitor once per engine answer, like your own citations", () => {
    const both = computeGeo(
      [
        row({
          aio_present: true,
          client_cited: true,
          cited_domains: ["example.com", "rival.com"],
          chatgpt_checked: true,
          chatgpt_brand_cited: true,
          chatgpt_cited_urls: ["https://example.com/a", "https://rival.com/x", "https://rival.com/y"],
        }),
      ],
      { domain: "example.com", enabled: ALL_ON },
    );
    expect(both.citations).toBe(2);
    expect(both.competitors[0]).toMatchObject({ domain: "rival.com", answers: 2, gapSearches: 0 });
  });

  it("reports engine coverage without inventing unsupported engines", () => {
    expect(s.engines.map((e) => e.id).sort()).toEqual(["chatgpt", "google_ai_overview"]);
    const google = s.engines.find((e) => e.id === "google_ai_overview")!;
    expect(google).toMatchObject({ label: "Google AI Overview", checked: 3, answered: 2, appears: 1 });
  });

  it("builds a trend per check date", () => {
    expect(s.trend).toEqual([
      { date: "2026-09-01", value: 100 },
      { date: "2026-09-10", value: 67 },
    ]);
  });

  it("builds each engine's own trend from the dates it answered", () => {
    expect(s.engines.find((e) => e.id === "google_ai_overview")!.trend).toEqual([
      { date: "2026-09-01", value: 100 },
      { date: "2026-09-10", value: 50 },
    ]);
    expect(s.engines.find((e) => e.id === "chatgpt")!.trend).toEqual([{ date: "2026-09-10", value: 100 }]);
  });

  it("splits engine answers into named, linked, both and neither", () => {
    expect(answerBreakdown(s)).toEqual({ total: 3, namedAndLinked: 1, namedOnly: 1, linkedOnly: 0, neither: 1 });
  });

  it("measures competitor presence over answered searches, ignoring platforms", () => {
    expect(competitorPresence(s)).toBe(67);
    expect(competitorPresence(computeGeo([row({})], { domain: "example.com", enabled: ALL_ON }))).toBeNull();
  });

  it("returns a null visibility when nothing was answered", () => {
    const empty = computeGeo([row({})], { domain: "example.com", enabled: ALL_ON });
    expect(empty.visibility).toBeNull();
    expect(geoConclusion(empty)).toMatch(/None of the searches/);
  });

  it("writes a plain conclusion", () => {
    expect(geoConclusion(s)).toBe("You appear in 2 of 3 AI answers we checked. rival.com is linked more often than you.");
  });
});

describe("geoFindings", () => {
  const s = computeGeo(
    [
      row({ tracked_keyword_id: "k1", keyword: "a", aio_present: true, mentioned_in_text: false, client_cited: false, cited_domains: ["rival.com", "g2.com"] }),
      row({ tracked_keyword_id: "k2", keyword: "b", aio_present: true, mentioned_in_text: false, client_cited: true, cited_domains: ["example.com"] }),
      row({ tracked_keyword_id: "k3", keyword: "c", chatgpt_checked: true, chatgpt_brand_mentioned: true, chatgpt_entity_match: false }),
    ],
    { domain: "example.com", enabled: ALL_ON },
  );
  const findings = geoFindings(s, "client-1");
  const keys = findings.map((f) => f.key);

  it("produces the expected opportunities, most urgent first", () => {
    expect(keys).toEqual(["geo:entity", "geo:not_mentioned", "geo:competitors_linked", "geo:linked_not_named", "geo:platforms"]);
  });

  it("counts a ChatGPT answer about a different organisation with the same name as not mentioned", () => {
    const notMentioned = findings.find((f) => f.key === "geo:not_mentioned")!;
    // k1 (Google AI answer without you) and k3 (ChatGPT named another "you").
    expect(notMentioned.affected.map((a) => a.label).sort()).toEqual(["a", "c"]);
    expect(notMentioned.draft?.trackedKeywordId).toBeNull();
  });

  it("links single-search tasks to that search so they can be verified", () => {
    const single = computeGeo(
      [row({ tracked_keyword_id: "k1", keyword: "a", aio_present: true, mentioned_in_text: false, client_cited: false, cited_domains: ["rival.com"] })],
      { domain: "example.com", enabled: ALL_ON },
    );
    const notMentioned = geoFindings(single, "client-1").find((f) => f.key === "geo:not_mentioned")!;
    expect(notMentioned.draft?.trackedKeywordId).toBe("k1");
    expect(notMentioned.draft?.group).toBe("Content");
  });

  it("uses only valid task groups", () => {
    for (const f of findings) expect(["Content", "Technical", "Off-page"]).toContain(f.draft?.group);
  });

  it("names competitors you track and ranks them higher, without changing the task key", () => {
    const plain = findings.find((f) => f.key === "geo:competitors_linked")!;
    const withTracked = geoFindings(s, "client-1", ["rival.com"]).find((f) => f.key === "geo:competitors_linked")!;
    expect(withTracked.title).toBe("Competitors you track are linked in AI answers instead of you");
    expect(withTracked.priority).toBeGreaterThan(plain.priority);
    expect(withTracked.draft?.findingKey).toBe(plain.draft?.findingKey);
  });
});

describe("highlightBrand", () => {
  it("marks the brand, case-insensitively, and keeps the rest", () => {
    expect(highlightBrand("Try ValGrow or valgrow labs today.", ["valgrow labs", "valgrow"])).toEqual([
      { text: "Try ", you: false },
      { text: "ValGrow", you: true },
      { text: " or ", you: false },
      { text: "valgrow labs", you: true },
      { text: " today.", you: false },
    ]);
  });
  it("escapes regex characters in tokens", () => {
    expect(highlightBrand("a (b+c) d", ["(b+c)"])).toEqual([
      { text: "a ", you: false },
      { text: "(b+c)", you: true },
      { text: " d", you: false },
    ]);
  });
});

describe("compareCompetitors", () => {
  const s = computeGeo(
    [
      row({ tracked_keyword_id: "k1", keyword: "a", aio_present: true, mentioned_in_text: true, client_cited: true, cited_domains: ["example.com", "rival.com"] }),
      row({ tracked_keyword_id: "k2", keyword: "b", aio_present: true, mentioned_in_text: false, client_cited: false, cited_domains: ["rival.com", "www.reddit.com", "other.io"] }),
      row({ tracked_keyword_id: "k3", keyword: "c", aio_present: false, chatgpt_checked: true, chatgpt_brand_mentioned: true, chatgpt_competitors: ["Rival Plumbing"] }),
    ],
    { domain: "example.com", enabled: ALL_ON },
  );

  it("counts you and a tracked competitor the same way", () => {
    const cols = compareCompetitors(s, { projectName: "Example", domain: "example.com", tracked: [{ domain: "https://www.rival.com/", name: "Rival Plumbing" }] });
    expect(cols[0]).toMatchObject({ source: "you", citations: 1, searchesLinked: 1, coverage: 33, chatgptNamed: 1 });
    expect(cols[1]).toMatchObject({ source: "tracked", name: "Rival Plumbing", domain: "rival.com", citations: 2, searchesLinked: 2, coverage: 67, chatgptNamed: 1 });
    expect(cols[2]).toMatchObject({ source: "found", domain: "other.io", citations: 1, chatgptNamed: 0 });
    expect(cols.some((c) => c.domain === "reddit.com")).toBe(false);
  });

  it("shows zero for a tracked competitor AI never linked, and no ChatGPT count when ChatGPT wasn't checked", () => {
    const noChat = computeGeo([row({ aio_present: true, client_cited: true, cited_domains: ["example.com"] })], { domain: "example.com", enabled: ALL_ON });
    const cols = compareCompetitors(noChat, { projectName: "Example", domain: "example.com", tracked: [{ domain: "absent.com", name: null }] });
    expect(cols[1]).toMatchObject({ citations: 0, searchesLinked: 0, coverage: 0, chatgptNamed: null });
  });

  it("never invents competitors", () => {
    const alone = computeGeo([row({ aio_present: true, client_cited: true, cited_domains: ["example.com"] })], { domain: "example.com", enabled: ALL_ON });
    expect(compareCompetitors(alone, { projectName: "Example", domain: "example.com", tracked: [] })).toHaveLength(1);
  });
});
