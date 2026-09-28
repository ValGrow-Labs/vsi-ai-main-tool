import { describe, expect, it } from "vitest";
import { computeSearch, searchConclusion, searchFindings, type RankRow } from "./search";

const r = (id: string, keyword: string, created_at: string, rank_position: number | null): RankRow => ({
  tracked_keyword_id: id,
  keyword,
  created_at,
  rank_position,
  rank_url: rank_position ? `https://example.com/${id}` : null,
  rank_status: rank_position === null ? "not_found" : "found",
});

const rows: RankRow[] = [
  r("a", "plumber", "2026-09-01T08:00:00Z", 9),
  r("a", "plumber", "2026-09-10T08:00:00Z", 4),
  r("b", "boiler repair", "2026-09-01T08:00:00Z", 6),
  r("b", "boiler repair", "2026-09-10T08:00:00Z", 14),
  r("c", "gas safety", "2026-09-10T08:00:00Z", null),
  r("d", "untracked", "2026-09-10T08:00:00Z", null),
];
const tracked = new Set(["a", "b", "c"]);

describe("computeSearch", () => {
  const s = computeSearch(rows, tracked);

  it("only includes searches where rank tracking runs", () => {
    expect(s.tracked).toBe(3);
    expect(s.searches.map((x) => x.keyword)).toEqual(["plumber", "boiler repair", "gas safety"]);
  });

  it("computes positions, changes and buckets", () => {
    expect(s.searches[0]).toMatchObject({ position: 4, previous: 9, change: 5 });
    expect(s.searches[1]).toMatchObject({ position: 14, previous: 6, change: -8 });
    expect(s).toMatchObject({ ranked: 2, top10: 1, page2: 1, notFound: 1, averagePosition: 9, improved: 1, declined: 1 });
  });

  it("builds a page-one trend per date", () => {
    expect(s.trend).toEqual([
      { date: "2026-09-01", value: 100 },
      { date: "2026-09-10", value: 33 },
    ]);
  });

  it("writes a plain conclusion", () => {
    expect(searchConclusion(s)).toBe("You're on Google's first page for 1 of 3 searches. 1 search moved up since the last check.");
  });
});

describe("searchFindings", () => {
  const f = searchFindings(computeSearch(rows, tracked), "client-1");

  it("flags drops, missing rankings and page-two opportunities", () => {
    expect(f.map((x) => x.key)).toEqual(["search:dropped", "search:not_found", "search:page_two"]);
  });

  it("links single-search tasks to the search for verification", () => {
    expect(f[0].draft).toMatchObject({ trackedKeywordId: "b", group: "Content" });
  });
});
