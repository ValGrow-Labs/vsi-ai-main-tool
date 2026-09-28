import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Result = { data?: unknown; error?: unknown; count?: number | null };

const state: {
  session: Record<string, unknown> | null;
  calls: string[];
  results: Record<string, Result>;
  updatePayload: Record<string, unknown> | null;
} = { session: null, calls: [], results: {}, updatePayload: null };

vi.mock("@/lib/auth", () => ({
  requireAgencyApi: async () => {
    if (!state.session) return Response.json({ error: "Sign in again to continue." }, { status: 401 });
    if (!state.session.agencyId) return Response.json({ error: "Create your organization first." }, { status: 403 });
    return state.session;
  },
}));

vi.mock("@/lib/auth-rules", () => ({ currentCookieSessionAllowed: () => false }));

/** A chainable fake query: records each call; awaiting it yields the result for "<table>.<op>". */
function query(table: string) {
  let op = "select";
  const b: Record<string, unknown> = {};
  const rec = (name: string) => (...args: unknown[]) => {
    state.calls.push(`${table}.${name}(${args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(",")})`);
    return b;
  };
  b.select = rec("select");
  b.eq = rec("eq");
  b.update = (payload: Record<string, unknown>) => {
    op = "update";
    state.updatePayload = payload;
    return rec("update")(payload);
  };
  b.maybeSingle = () => Promise.resolve(state.results[`${table}.${op}`] ?? { data: null, error: null });
  b.then = (res: (v: Result) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(state.results[`${table}.${op}`] ?? { data: null, error: null }).then(res, rej);
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: (t: string) => query(t) }),
}));

const { GET, POST } = await import("./route");

const member = {
  userId: "u1",
  email: "pat@acme.test",
  fullName: "Pat",
  role: "pilot",
  agencyId: "org-1",
  agencyName: "Acme",
  branding: { displayName: null, logoUrl: null, primaryColor: null, supportEmail: null, reportFooter: null },
};

const post = (body: unknown) =>
  POST(new NextRequest("http://x.test/api/agency/settings", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  state.session = member;
  state.calls = [];
  state.results = {};
  state.updatePayload = null;
});

describe("GET /api/agency/settings", () => {
  it("answers 401 in JSON when nobody is signed in", async () => {
    state.session = null;
    const res = await GET(new NextRequest("http://x.test/api/agency/settings"));
    expect(res.status).toBe(401);
  });

  it("answers 403 for a user with no organization, never a stand-in one", async () => {
    state.session = { ...member, agencyId: null, agencyName: null };
    const res = await GET(new NextRequest("http://x.test/api/agency/settings"));
    expect(res.status).toBe(403);
    expect(state.calls).toEqual([]);
  });

  it("reads only the session's organization and returns its real values (empty when unset)", async () => {
    state.results["agencies.select"] = {
      data: { id: "org-1", name: "Acme", display_name: null, support_email: "hi@acme.test", logo_url: null, is_pilot: true, max_keywords: 25, max_clients: 1 },
      error: null,
    };
    const res = await GET(new NextRequest("http://x.test/api/agency/settings"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(state.calls).toContain("agencies.eq(id,org-1)");
    expect(json.organization).toMatchObject({ id: "org-1", name: "Acme", display_name: null, support_email: "hi@acme.test", maxKeywords: 25, maxClients: 1, isPilot: true });
    expect(json.user).toEqual({ email: "pat@acme.test", fullName: "Pat", role: "pilot" });
    expect(json.canEdit).toBe(false);
    expect(JSON.stringify(json)).not.toMatch(/valgrow|00000000-0000/i);
  });

  it("counts usage for the session's organization only, and reports unknown counts as null", async () => {
    state.results["agencies.select"] = { data: { id: "org-1", name: "Acme" }, error: null };
    state.results["clients.select"] = { count: 3, error: null };
    state.results["tracked_keywords.select"] = { count: 12, error: null };
    state.results["reports.select"] = { count: null, error: { message: "boom" } };
    const res = await GET(new NextRequest("http://x.test/api/agency/settings?include=usage"));
    const json = await res.json();
    expect(json.usage).toEqual({ clients: 3, activeKeywords: 12, reports: null });
    expect(state.calls).toContain("clients.eq(agency_id,org-1)");
    expect(state.calls).toContain("tracked_keywords.eq(agency_id,org-1)");
    expect(state.calls).toContain("reports.eq(agency_id,org-1)");
  });

  it("reports a load failure instead of inventing values", async () => {
    state.results["agencies.select"] = { data: null, error: { code: "XX000", message: "down" } };
    const res = await GET(new NextRequest("http://x.test/api/agency/settings"));
    expect(res.status).toBe(500);
  });
});

describe("POST /api/agency/settings", () => {
  it("updates only the session's organization and says ok when a row changed", async () => {
    state.results["agencies.update"] = { data: [{ id: "org-1" }], error: null };
    const res = await post({ display_name: "Acme Ltd" });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(state.calls).toContain("agencies.eq(id,org-1)");
    expect(state.updatePayload).toEqual({ display_name: "Acme Ltd" });
  });

  it("does not wipe the logo when it wasn't sent", async () => {
    state.results["agencies.update"] = { data: [{ id: "org-1" }], error: null };
    await post({ display_name: "Acme Ltd", support_email: "hi@acme.test" });
    expect(state.updatePayload && "logo_url" in state.updatePayload).toBe(false);
  });

  it("answers 403, not ok:true, when the update touched no rows (RLS)", async () => {
    state.results["agencies.update"] = { data: [], error: null };
    const res = await post({ display_name: "Acme Ltd" });
    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.ok).toBeUndefined();
    expect(json.error).toMatch(/platform admin/);
  });

  it("answers 500 when the database fails", async () => {
    state.results["agencies.update"] = { data: null, error: { code: "XX000", message: "down" } };
    const res = await post({ display_name: "Acme Ltd" });
    expect(res.status).toBe(500);
  });

  it("refuses invalid values with 400 instead of dropping them", async () => {
    const res = await post({ support_email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(state.updatePayload).toBeNull();
  });

  it("answers 401 in JSON for an anonymous caller", async () => {
    state.session = null;
    const res = await post({ display_name: "x" });
    expect(res.status).toBe(401);
  });
});
