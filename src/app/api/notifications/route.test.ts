/**
 * Notifications: every operation is scoped to the verified session user;
 * signed out → 401, disabled → 403; DB errors are reported, never faked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Call = { table: string; op: string; filters: [string, unknown][]; payload?: unknown };
const calls: Call[] = [];
let result: { data: unknown; error: unknown } = { data: [], error: null };

function builder(table: string, op: string, payload?: unknown) {
  const call: Call = { table, op, filters: [], payload };
  calls.push(call);
  const b: Record<string, unknown> = {
    eq: (col: string, v: unknown) => (call.filters.push([col, v]), b),
    order: () => b,
    select: () => b,
    single: () => b,
    then: (res: (v: unknown) => unknown) => Promise.resolve(result).then(res),
  };
  return b;
}
const supabase = {
  from: (table: string) => ({
    select: () => builder(table, "select"),
    delete: () => builder(table, "delete"),
    update: (p: unknown) => builder(table, "update", p),
    insert: (p: unknown) => builder(table, "insert", p),
  }),
};
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => supabase) }));

const requireSessionApi = vi.fn();
vi.mock("@/lib/auth", () => ({ requireSessionApi, isDummySupabase: () => false }));

const denied = (status: number, code: string) => new Response(JSON.stringify({ code }), { status });
const USER_A = "aaaaaaaa-0000-4000-8000-000000000001";

beforeEach(() => {
  calls.length = 0;
  result = { data: [], error: null };
  requireSessionApi.mockResolvedValue({ userId: USER_A, email: "a@example.com" });
});

describe("/api/notifications", () => {
  it("signed out → 401 and no database call", async () => {
    requireSessionApi.mockResolvedValue(denied(401, "unauthenticated"));
    const { GET } = await import("./route");
    expect((await GET()).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("disabled account with a valid session → 403 on every method", async () => {
    requireSessionApi.mockResolvedValue(denied(403, "account_disabled"));
    const mod = await import("./route");
    const req = (method: string) => new NextRequest("http://x/api/notifications", { method, body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify({ id: "n1" }) });
    expect((await mod.GET()).status).toBe(403);
    expect((await mod.DELETE()).status).toBe(403);
    expect((await mod.POST(req("POST"))).status).toBe(403);
    expect((await mod.PATCH(req("PATCH"))).status).toBe(403);
    expect(calls).toHaveLength(0);
  });

  it("reads, deletes and updates only the session user's rows (never a client-supplied user)", async () => {
    const mod = await import("./route");
    await mod.GET();
    await mod.DELETE();
    await mod.PATCH(new NextRequest("http://x", { method: "PATCH", body: JSON.stringify({ id: "n1", userId: "someone-else" }) }));
    for (const c of calls) expect(c.filters).toContainEqual(["user_id", USER_A]);
  });

  it("inserts with the session user as owner, ignoring any user id in the body", async () => {
    result = { data: { id: "n1", user_id: USER_A, title: "t", message: "m", created_at: "2026-09-27T00:00:00Z" }, error: null };
    const { POST } = await import("./route");
    await POST(new NextRequest("http://x", { method: "POST", body: JSON.stringify({ title: "t", message: "m", user_id: "someone-else", userId: "someone-else" }) }));
    expect(calls[0]).toMatchObject({ op: "insert", payload: expect.objectContaining({ user_id: USER_A }) });
  });

  it("a database error is an error, with no raw database text", async () => {
    result = { data: null, error: { message: "relation public.notifications internal detail" } };
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("internal detail");
  });
});

describe("/api/notifications/[id]", () => {
  const ctx = { params: Promise.resolve({ id: "n1" }) };
  it("disabled → 403; another user's notification → 404 (owner filter)", async () => {
    const { DELETE } = await import("./[id]/route");
    requireSessionApi.mockResolvedValueOnce(denied(403, "account_disabled"));
    expect((await DELETE(new NextRequest("http://x", { method: "DELETE" }), ctx)).status).toBe(403);
    result = { data: [], error: null }; // owner filter matched nothing
    const res = await DELETE(new NextRequest("http://x", { method: "DELETE" }), ctx);
    expect(res.status).toBe(404);
    expect(calls.at(-1)?.filters).toContainEqual(["user_id", USER_A]);
  });
});
