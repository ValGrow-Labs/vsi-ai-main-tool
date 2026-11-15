import { describe, expect, it, vi } from "vitest";

// Runs the REAL dashboard layout and pages against a recording stand-in for Supabase, with a fixed delay per
// request, and checks how many requests are made and how many have to wait for another one to finish.
// Auth is replaced by a stand-in making the same two requests getSession makes (getUser, then the profile read).
// The middleware's own getUser comes before all of this.
const LATENCY = 40;
const TOLERANCE = 15; // timer jitter allowed when deciding that one request started after another finished
const PROJECT = "cccccccc-0000-4000-8000-000000000001";
const AGENCY = "bbbbbbbb-0000-4000-8000-000000000001";

type Rec = { label: string; start: number; end: number };
const state = { t0: 0, log: [] as Rec[], tasks: 0 };
const stores: Map<string, Promise<unknown>>[] = [];

vi.mock("react", async (orig) => {
  const r: Record<string, unknown> = await orig();
  const cache = (fn: (...a: unknown[]) => unknown) => {
    const store = new Map<string, Promise<unknown>>();
    stores.push(store);
    return (...args: unknown[]) => {
      const key = JSON.stringify(args);
      if (!store.has(key)) store.set(key, Promise.resolve(fn(...args)));
      return store.get(key);
    };
  };
  return { ...r, default: { ...(r.default as object), cache }, cache };
});
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (n === "vsi_project" ? { name: n, value: PROJECT } : undefined), has: () => true, getAll: () => [] }),
}));
vi.mock("next/navigation", () => ({
  redirect: (u: string) => { throw new Error("REDIRECT " + u); },
  notFound: () => { throw new Error("NOT_FOUND"); },
  useRouter: () => ({}), usePathname: () => "/", useSearchParams: () => new URLSearchParams(),
}));

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function timed<T>(label: string, value: T): Promise<T> {
  const start = performance.now() - state.t0;
  await delay(LATENCY);
  state.log.push({ label, start, end: performance.now() - state.t0 });
  return value;
}
const clientRows = [1, 2].map((n) => ({ id: n === 1 ? PROJECT : "cccccccc-0000-4000-8000-000000000002", name: "P" + n, website: "https://p" + n + ".example", brand_name: "B", service_type: "seo_geo", default_location: "ae", country: "United Arab Emirates", agency_id: AGENCY, agencies: { name: "Org", display_name: null } }));
function dataFor(table: string, head: boolean, single: boolean) {
  if (head) return { data: null, count: table === "tasks" ? state.tasks : 3, error: null };
  const rows: Record<string, unknown[]> = {
    clients: clientRows,
    agencies: [{ max_clients: null }],
    tasks: Array.from({ length: state.tasks }, (_, i) => ({ id: "t" + i, title: "T", description: null, status: "todo", group_name: "Content", owner: null, impact: null, effort: null, due_date: null, created_at: new Date().toISOString(), completed_at: null, outcome_status: null, outcome_note: null, tracked_keyword_id: null, tracked_keywords: null, priority: 1 })),
  };
  const list = rows[table] ?? [];
  return { data: single ? list[0] ?? null : list, count: list.length, error: null };
}
function builder(table: string) {
  let head = false;
  let single = false;
  const b: Record<string, unknown> = {};
  const chain = () => b;
  for (const m of ["eq", "neq", "gte", "lte", "in", "is", "not", "or", "order", "limit", "range"]) b[m] = chain;
  b.select = (_c?: string, o?: { head?: boolean }) => { head = !!o?.head; return b; };
  b.maybeSingle = () => { single = true; return b; };
  b.single = () => { single = true; return b; };
  b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => timed(table + (head ? ".count" : ".select"), dataFor(table, head, single)).then(res, rej);
  return b;
}
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: (t: string) => builder(t), auth: { getUser: () => timed("auth.getUser", { data: { user: { id: "u1" } } }) } }),
}));
vi.mock("@/lib/auth", async () => {
  const react = (await import("react")) as unknown as { cache: (f: () => unknown) => () => Promise<unknown> };
  const requireAgency = react.cache(async () => {
    await timed("auth.getUser", null);
    await timed("profiles.select", null);
    return { userId: "u1", email: "u@x.test", fullName: "U", role: "pilot", agencyId: AGENCY, agencyName: "Org", isPilot: true, maxKeywords: 10, branding: { displayName: null, logoUrl: null, primaryColor: null, supportEmail: null, reportFooter: null } };
  });
  return { requireAgency, getSession: requireAgency, isDummySupabase: () => false, requireSuperAdmin: requireAgency };
});

/** The number of requests that had to wait for an earlier one to finish (the longest chain). */
function sequentialTrips(log: Rec[]) {
  const sorted = [...log].sort((a, b) => a.start - b.start);
  const depth = new Map<Rec, number>();
  for (const r of sorted) {
    let d = 1;
    for (const p of sorted) if (p !== r && p.end <= r.start + TOLERANCE) d = Math.max(d, (depth.get(p) ?? 1) + 1);
    depth.set(r, d);
  }
  return Math.max(0, ...depth.values());
}

type Component = (props: unknown) => Promise<unknown>;
async function render(pagePath: string | null, opts: { tasks?: number; props?: unknown } = {}) {
  stores.forEach((s) => s.clear());
  state.log = [];
  state.tasks = opts.tasks ?? 0;
  const Layout = (await import("./layout")).default as Component;
  const Page = pagePath ? ((await import(/* @vite-ignore */ pagePath)).default as Component) : null;
  state.t0 = performance.now();
  await Promise.all([Layout({ children: null }), Page ? Page(opts.props ?? { searchParams: Promise.resolve({}), params: Promise.resolve({}) }) : null]);
  return { labels: state.log.map((r) => r.label), trips: sequentialTrips(state.log), requests: state.log.length };
}
const count = (labels: string[], label: string) => labels.filter((l) => l === label).length;

describe("dashboard request sequence", () => {
  it("the layout waits for the profile and then one round of reads: three sequential trips, eight requests", async () => {
    const r = await render(null);
    expect(r.trips).toBe(3);
    expect(r.requests).toBe(8);
    // getUser, the projects read (alongside it), the profile read, then limits + searches + two audit counts + competitors.
    expect(r.labels.filter((l) => l === "clients.select")).toHaveLength(1);
  }, 60000);

  it("the layout no longer counts stored results or tasks, which it never used", async () => {
    const r = await render(null);
    expect(count(r.labels, "search_results.count")).toBe(0);
    expect(count(r.labels, "tasks.count")).toBe(0);
  }, 60000);

  it("Search Visibility adds its own reads without adding a trip", async () => {
    const r = await render("./services/seo/page");
    expect(r.trips).toBe(3);
  }, 60000);

  it("Tasks with tasks: no extra trip", async () => {
    const r = await render("./tasks/page", { tasks: 2 });
    expect(r.trips).toBe(3);
    expect(count(r.labels, "search_results.count")).toBe(0);
  }, 60000);

  it("Tasks, empty state: needs the stored-results count after it knows the list is empty (one extra trip, as before)", async () => {
    const r = await render("./tasks/page", { tasks: 0 });
    expect(r.trips).toBe(4);
    expect(count(r.labels, "search_results.count")).toBe(1);
  }, 60000);

  it("Reports takes the project from the list the layout loads instead of reading it again", async () => {
    const r = await render("./clients/[id]/reports/page", { props: { params: Promise.resolve({ id: PROJECT }) } });
    expect(r.trips).toBe(3);
    expect(count(r.labels, "clients.select")).toBe(1);
  }, 60000);

  it("every page keeps the same shared shape: getUser, then the profile, then everything else", async () => {
    for (const page of ["./page", "./check/page", "./geo/page", "./competitors/page", "./next-actions/page", "./chat/page", "./clients/page"]) {
      const r = await render(page);
      expect(r.trips, page).toBe(3);
    }
  }, 120000);
});
