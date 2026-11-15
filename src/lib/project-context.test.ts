import { beforeEach, describe, expect, it, vi } from "vitest";

// A recording stand-in for the Supabase client, and a per-request cache() like React's on the server.
const state: {
  rows: Record<string, unknown>[];
  error: { code: string } | null;
  queries: string[];
  sessionDelay: number;
  cookie: string | null;
} = { rows: [], error: null, queries: [], sessionDelay: 0, cookie: null };

vi.mock("react", async (orig) => {
  const r: Record<string, unknown> = await orig();
  const stores: Map<string, Promise<unknown>>[] = (globalThis as { __stores?: Map<string, Promise<unknown>>[] }).__stores ?? [];
  (globalThis as { __stores?: Map<string, Promise<unknown>>[] }).__stores = stores;
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
  cookies: async () => ({ get: (n: string) => (n === "vsi_project" && state.cookie ? { name: n, value: state.cookie } : undefined) }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      const b: Record<string, unknown> = {};
      b.select = (cols: string) => { state.queries.push(`${table}:${cols.slice(0, 20)}`); return b; };
      b.order = () => b;
      b.eq = (col: string, val: string) => { state.queries.push(`${table}.eq(${col},${val})`); return b; };
      b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: state.error ? null : state.rows, error: state.error }).then(res);
      return b;
    },
  }),
}));
vi.mock("@/lib/auth", () => ({
  isDummySupabase: () => false,
  requireAgency: async () => {
    await new Promise((r) => setTimeout(r, state.sessionDelay));
    state.queries.push("session-resolved");
    return session();
  },
}));

const AGENCY = "agency-a";
const OTHER = "agency-b";
const session = (over: Record<string, unknown> = {}) => ({ userId: "u1", role: "pilot", agencyId: AGENCY, ...over });
const row = (id: string, agency: string, name = id) => ({ id, name, website: `https://${id}.example`, brand_name: null, service_type: "seo_geo", default_location: "ae", country: null, agency_id: agency, agencies: { name: `Org ${agency}`, display_name: null } });

async function fresh() {
  ((globalThis as { __stores?: Map<string, Promise<unknown>>[] }).__stores ?? []).forEach((s) => s.clear());
  vi.resetModules();
  return import("./project-context");
}

describe("project context", () => {
  beforeEach(() => {
    state.rows = [row("p1", AGENCY), row("p2", AGENCY)];
    state.error = null;
    state.queries = [];
    state.sessionDelay = 0;
    state.cookie = null;
  });

  it("returns a member's own organization's projects, mapped as before", async () => {
    const { getProjectContext } = await fresh();
    const ctx = await getProjectContext(session() as never);
    expect(ctx.projects.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(ctx.projects[0]).toMatchObject({ name: "p1", website: "https://p1.example", agencyId: AGENCY, agencyName: null });
    expect(ctx.active?.id).toBe("p1");
    expect(ctx.error).toBeNull();
  });

  it("still applies the organization filter itself: another organization's rows are never returned to a member", async () => {
    state.rows = [row("p1", AGENCY), row("leak", OTHER)];
    const { getProjectContext } = await fresh();
    const ctx = await getProjectContext(session() as never);
    expect(ctx.projects.map((p) => p.id)).toEqual(["p1"]);
  });

  it("lets a platform admin see every organization's projects, with the organization name", async () => {
    state.rows = [row("p1", AGENCY), row("p3", OTHER)];
    const { getProjectContext } = await fresh();
    const ctx = await getProjectContext(session({ role: "super_admin", agencyId: null }) as never);
    expect(ctx.projects.map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(ctx.projects[1].agencyName).toBe(`Org ${OTHER}`);
  });

  it("reports a load failure and returns no projects", async () => {
    state.error = { code: "57014" };
    const { getProjectContext } = await fresh();
    const ctx = await getProjectContext(session() as never);
    expect(ctx.projects).toEqual([]);
    expect(ctx.active).toBeNull();
    expect(ctx.error).toBe("We couldn't load your projects right now.");
  });

  it("picks the project from the override, then the cookie, then the first project", async () => {
    const { getProjectContext } = await fresh();
    state.cookie = "p2";
    expect((await getProjectContext(session() as never)).active?.id).toBe("p2");
    expect((await getProjectContext(session() as never, "p1")).active?.id).toBe("p1");
    state.cookie = "not-mine";
    expect((await getProjectContext(session() as never)).active?.id).toBe("p1");
  });

  it("reads the project list once per request, however many callers ask", async () => {
    const { startProjectLoad, getProjectContext } = await fresh();
    startProjectLoad();
    startProjectLoad();
    await getProjectContext(session() as never);
    await getProjectContext(session() as never, "p2");
    expect(state.queries.filter((q) => q.startsWith("clients:"))).toHaveLength(1);
  });

  it("starts the project read before the session lookup has finished", async () => {
    state.sessionDelay = 30;
    const { requireProjectContext } = await fresh();
    const result = await requireProjectContext();
    expect(result.active?.id).toBe("p1");
    expect(state.queries.findIndex((q) => q.startsWith("clients:"))).toBeLessThan(state.queries.indexOf("session-resolved"));
  });

  it("sends no organization filter to the database: the database's own row-level rules decide what is visible", async () => {
    const { getProjectContext } = await fresh();
    await getProjectContext(session() as never);
    expect(state.queries.some((q) => q.startsWith("clients.eq("))).toBe(false);
  });

  it("prioritizes country India over legacy default_location ae", async () => {
    state.rows = [{ ...row("p1", AGENCY), default_location: "ae", country: "India" }];
    const { getProjectContext } = await fresh();
    const ctx = await getProjectContext(session() as never);
    expect(ctx.projects[0].defaultLocation).toBe("in");
    expect(ctx.projects[0].country).toBe("India");
  });
});
