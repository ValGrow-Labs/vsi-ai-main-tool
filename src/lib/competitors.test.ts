import { describe, expect, it } from "vitest";
import { computeGooglePresence, mergeCompetitors } from "./competitors";
import { computeGeo } from "./geo";

describe("competitors", () => {
  const google = computeGooglePresence(
    [
      { keywordId: "a", keyword: "a", results: [{ position: 1, domain: "rival.com" }, { position: 2, domain: "example.com" }, { position: 12, domain: "far.com" }] },
      { keywordId: "b", keyword: "b", results: [{ position: 4, url: "https://www.rival.com/x" }, { position: 5, domain: "reddit.com" }] },
    ],
    "example.com",
  );

  it("counts top-10 appearances per search, excluding you and positions past 10", () => {
    expect(google.get("rival.com")).toEqual({ top10: 2, best: 1 });
    expect(google.has("example.com")).toBe(false);
    expect(google.has("far.com")).toBe(false);
  });

  it("merges with AI presence and leaves platforms out", () => {
    const geo = computeGeo(
      [
        {
          tracked_keyword_id: "a", keyword: "a", created_at: "2026-09-10",
          aio_present: true, mentioned_in_text: false, client_cited: false, cited_domains: ["other.com"],
          ai_overview_present: null, ai_overview_client_cited: null, ai_overview_cited_domains: null,
          chatgpt_checked: false, chatgpt_brand_mentioned: null, chatgpt_brand_cited: null, chatgpt_competitors: null, chatgpt_cited_urls: null,
        },
      ],
      { domain: "example.com", enabled: { google_ai_overview: true, chatgpt: true } },
    );
    const merged = mergeCompetitors(geo, google);
    expect(merged.map((m) => m.domain)).toEqual(["rival.com", "other.com"]);
    expect(merged.find((m) => m.domain === "other.com")).toMatchObject({ aiAnswers: 1, aiGapSearches: 1, googleTop10: 0 });
  });

  it("always lists competitors you added, and never invents numbers for unseen ones", () => {
    const merged = mergeCompetitors(null, google, ["https://www.rival.com", "quiet.com"]);
    const rival = merged.find((m) => m.domain === "rival.com");
    const quiet = merged.find((m) => m.domain === "quiet.com");
    expect(rival).toMatchObject({ tracked: true, seen: true, googleTop10: 2, bestPosition: 1 });
    expect(quiet).toMatchObject({ tracked: true, seen: false, aiAnswers: 0, googleTop10: 0, bestPosition: null });
    // Competitors you added come first.
    expect(merged.slice(0, 2).every((m) => m.tracked)).toBe(true);
  });

  it("folds subdomains into a tracked competitor without double counting", () => {
    const g = computeGooglePresence(
      [{ keywordId: "a", keyword: "a", results: [{ position: 3, domain: "blog.rival.com" }, { position: 6, domain: "rival.com" }] }],
      "example.com",
    );
    const merged = mergeCompetitors(null, g, ["rival.com"]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ domain: "rival.com", googleTop10: 1, bestPosition: 3, tracked: true });
  });
});
