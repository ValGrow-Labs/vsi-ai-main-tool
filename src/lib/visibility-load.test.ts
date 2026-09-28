import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// A tiny in-memory stand-in for the Supabase query builder: it applies the
// filters the loaders use and returns only the selected columns.
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const queries: { table: string; columns: string }[] = [];
const failing = new Set<string>();
const inFlight = { now: 0, max: 0 };

function query(table: string) {
  let rows = [...(tables[table] ?? [])];
  let columns = "*";
  let max = Infinity;
  const b = {
    select(c: string) {
      columns = c;
      queries.push({ table, columns: c });
      return b;
    },
    eq(k: string, v: unknown) {
      rows = rows.filter((r) => r[k] === v);
      return b;
    },
    gte(k: string, v: string) {
      rows = rows.filter((r) => String(r[k]) >= v);
      return b;
    },
    in(k: string, vs: unknown[]) {
      rows = rows.filter((r) => vs.includes(r[k]));
      return b;
    },
    order(k: string, o: { ascending: boolean }) {
      rows.sort((a, z) => (String(a[k]) < String(z[k]) ? -1 : 1) * (o.ascending ? 1 : -1));
      return b;
    },
    limit(n: number) {
      max = n; // PostgREST applies filters before the limit, whatever the call order.
      return b;
    },
    async maybeSingle() {
      inFlight.now++;
      inFlight.max = Math.max(inFlight.max, inFlight.now);
      await new Promise((r) => setTimeout(r, 5));
      inFlight.now--;
      if (failing.has(table)) return { data: null, error: { code: "57014" } };
      return { data: project(rows)[0] ?? null, error: null };
    },
    then(resolve: (v: { data: Row[] | null; error: { code: string } | null }) => unknown) {
      const result = failing.has(table) ? { data: null, error: { code: "57014" } } : { data: project(rows), error: null };
      return Promise.resolve(result).then(resolve);
    },
  };
  function project(rs: Row[]) {
    rs = rs.slice(0, max);
    if (columns === "*") return rs;
    const cols = columns.split(",").map((c) => c.trim());
    return rs.map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null])));
  }
  return b;
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: query }) }));
vi.mock("@/lib/auth", () => ({ isDummySupabase: () => false }));
vi.mock("@/lib/settings", () => ({ getSetting: async () => true }));

const PROJECT = {
  id: "p1",
  name: "Acme",
  website: "https://acme.com",
  brandName: "Acme",
  serviceType: null,
  defaultLocation: null,
  agencyId: "a1",
  agencyName: null,
};

// Load the modules once, outside the timed tests: a cold import of this module graph can take
// several seconds when the full suite runs in parallel, which used to trip the 5s per-test timeout.
beforeAll(async () => {
  await Promise.all([import("./geo-load"), import("./search-load"), import("./visibility-load"), import("./project-data-load")]);
}, 60_000);

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

beforeEach(() => {
  queries.length = 0;
  failing.clear();
  inFlight.now = inFlight.max = 0;
  tables.clients = [{ id: "p1", rank_tracking_enabled: true, ai_mode_enabled: true, ai_overview_enabled: true, chatgpt_enabled: null }];
  tables.tracked_keywords = [
    { id: "k1", client_id: "p1", is_active: true, track_type: "both" },
    { id: "k2", client_id: "p1", is_active: true, track_type: "seo" },
    { id: "k3", client_id: "p1", is_active: false, track_type: "geo" },
    { id: "k4", client_id: "p1", is_active: true, track_type: "geo" },
  ];
  const base = {
    client_id: "p1",
    gap_label: null,
    ai_overview_present: false,
    ai_overview_client_cited: false,
    ai_overview_cited_domains: [],
    chatgpt_checked: false,
    chatgpt_brand_mentioned: null,
    chatgpt_brand_cited: null,
    chatgpt_competitors: [],
    chatgpt_cited_urls: [],
  };
  tables.search_results = [
    { ...base, id: "r1", tracked_keyword_id: "k1", keyword: "best widgets", created_at: day(1), aio_present: true, mentioned_in_text: true, client_cited: true, cited_domains: ["acme.com", "rival.com"], rank_position: 3, rank_url: "https://acme.com/w", aio_full_text: "Acme makes the best widgets.", citations_json: [{ position: 1, domain: "acme.com", url: "https://acme.com/w", sourceName: "Acme", isClient: true }] },
    { ...base, id: "r2", tracked_keyword_id: "k1", keyword: "best widgets", created_at: day(8), aio_present: true, mentioned_in_text: false, client_cited: false, cited_domains: ["rival.com"], rank_position: 5, rank_url: "https://acme.com/w" },
    { ...base, id: "r3", tracked_keyword_id: "k2", keyword: "widget price", created_at: day(2), aio_present: false, mentioned_in_text: null, client_cited: null, cited_domains: null, rank_position: 12, rank_url: "https://acme.com/p" },
    { ...base, id: "r4", tracked_keyword_id: "k1", keyword: "best widgets", created_at: day(200), aio_present: true, mentioned_in_text: true, client_cited: true, cited_domains: [], rank_position: 1, rank_url: "https://acme.com/w" },
    { ...base, id: "r5", tracked_keyword_id: "k4", keyword: "widget repair", created_at: day(3), aio_present: true, mentioned_in_text: false, client_cited: false, cited_domains: ["rival.com"], rank_position: null, rank_url: null, aio_full_text: "Rival fixes widgets fast.", citations_json: [{ position: 1, domain: "rival.com", url: "https://rival.com", sourceName: "Rival" }] },
    { ...base, id: "x1", client_id: "other", tracked_keyword_id: "k9", keyword: "not mine", created_at: day(1), aio_present: true, mentioned_in_text: true, client_cited: true, cited_domains: [], rank_position: 1, rank_url: null },
  ];
});

describe("loadVisibility", () => {
  it("returns exactly what the separate loaders return", async () => {
    const { loadGeo } = await import("./geo-load");
    const { loadSearch } = await import("./search-load");
    const { loadVisibility } = await import("./visibility-load");

    const [geo, search] = await Promise.all([loadGeo(PROJECT, { evidence: false }), loadSearch(PROJECT)]);
    const combined = await loadVisibility(PROJECT, { evidence: false });

    expect(geo.state === "ok" && geo.summary.searches.length).toBeGreaterThan(0);
    expect(search.state === "ok" && search.summary.searches.length).toBeGreaterThan(0);
    expect(combined).toEqual({ geo, search });
  });

  it("reads recent checks once instead of once per summary", async () => {
    const { loadVisibility } = await import("./visibility-load");
    await loadVisibility(PROJECT, { evidence: false });
    expect(queries.filter((q) => q.table === "search_results")).toHaveLength(1);
    expect(queries.filter((q) => q.table === "tracked_keywords")).toHaveLength(1);
    expect(queries.filter((q) => q.table === "clients")).toHaveLength(1);
  });

  it("reports the same errors as the separate loaders when checks can't be read", async () => {
    const { loadGeo } = await import("./geo-load");
    const { loadSearch } = await import("./search-load");
    const { loadVisibility } = await import("./visibility-load");
    failing.add("search_results");

    const [geo, search] = await Promise.all([loadGeo(PROJECT, { evidence: false }), loadSearch(PROJECT)]);
    const combined = await loadVisibility(PROJECT, { evidence: false });

    expect(geo.state).toBe("error");
    expect(search.state).toBe("error");
    expect(combined).toEqual({ geo, search });
  });
});

describe("AI answer evidence", () => {
  it("returns the answer where you appear and the one where you don't, fetched at the same time", async () => {
    const { loadGeo } = await import("./geo-load");
    const geo = await loadGeo(PROJECT);
    expect(geo.state).toBe("ok");
    if (geo.state !== "ok") return;
    expect(geo.evidence.map((e) => [e.keyword, e.appears])).toEqual([
      ["best widgets", true],
      ["widget repair", false],
    ]);
    expect(geo.evidence[0].sources[0]).toMatchObject({ domain: "acme.com", you: true });
    expect(inFlight.max).toBe(2);
  });
});

describe("mergeColumns", () => {
  it("joins column lists without duplicates", async () => {
    const { mergeColumns } = await import("./project-data-load");
    expect(mergeColumns("a, b,c", "b, d")).toBe("a, b, c, d");
  });
});
