import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Result = { data?: unknown; error?: unknown };

const state: {
  session: Record<string, unknown> | null;
  calls: string[];
  results: Record<string, Result>;
  inserted: Record<string, unknown> | null;
  updated: Record<string, unknown> | null;
} = { session: null, calls: [], results: {}, inserted: null, updated: null };

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, requireSessionApi: async () => state.session ?? actual.apiAuthError.signedOut() };
});

function query(table: string) {
  let op = "select";
  const b: Record<string, unknown> = {};
  const rec = (name: string) => (...args: unknown[]) => {
    state.calls.push(`${table}.${name}(${args.map((a) => (typeof a === "object" ? "{…}" : String(a))).join(",")})`);
    return b;
  };
  const result = () => Promise.resolve(state.results[`${table}.${op}`] ?? { data: null, error: null });
  b.select = rec("select");
  b.eq = rec("eq");
  b.order = rec("order");
  b.insert = (row: Record<string, unknown>) => {
    op = "insert";
    state.inserted = row;
    return rec("insert")(row);
  };
  b.update = (row: Record<string, unknown>) => {
    op = "update";
    state.updated = row;
    return rec("update")(row);
  };
  b.delete = () => {
    op = "delete";
    return rec("delete")();
  };
  b.single = () => result();
  b.then = (res: (v: Result) => unknown, rej: (e: unknown) => unknown) => result().then(res, rej);
  return b;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: (t: string) => query(t) }),
}));

const { GET, POST, PATCH, DELETE } = await import("./route");

const user = { userId: "user-1", email: "pat@acme.test", fullName: "Pat Doe", role: "pilot", agencyId: "org-1" };

const req = (method: string, body?: unknown, qs = "") =>
  new NextRequest(`http://x.test/api/messages${qs}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });

beforeEach(() => {
  state.session = user;
  state.calls = [];
  state.results = {};
  state.inserted = null;
  state.updated = null;
});

describe("/api/messages", () => {
  it("answers 401 to every method when nobody is signed in", async () => {
    state.session = null;
    expect((await GET()).status).toBe(401);
    expect((await POST(req("POST", { to: "a@b.test" }))).status).toBe(401);
    expect((await PATCH(req("PATCH", { id: "m1", status: "read" }))).status).toBe(401);
    expect((await DELETE(req("DELETE", undefined, "?id=m1"))).status).toBe(401);
    expect(state.calls).toEqual([]);
  });

  it("lists only the signed-in user's messages", async () => {
    state.results["messages.select"] = { data: [{ id: "m1", sender: { name: "Pat Doe", email: "pat@acme.test" }, folder: "sent" }], error: null };
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(state.calls).toContain("messages.eq(user_id,user-1)");
    expect(json.messages).toHaveLength(1);
  });

  it("reports a database error instead of returning a shared fallback list", async () => {
    state.results["messages.select"] = { data: null, error: { message: "down" } };
    const res = await GET();
    const json = await res.json();
    expect(res.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.messages).toBeUndefined();
  });

  it("stores a message with the user's id and real identity as the sender", async () => {
    state.results["messages.insert"] = { data: { id: "m1", sender: { name: "Pat Doe", email: "pat@acme.test" } }, error: null };
    const res = await POST(
      req("POST", { to: "client@x.test", subject: "Hi", body: "Hello", folder: "sent", sender: { name: "Me (Admin)", email: "admin@searchintel.com" } }),
    );
    expect(res.status).toBe(201);
    expect(state.inserted).toMatchObject({
      user_id: "user-1",
      sender: { name: "Pat Doe", email: "pat@acme.test" },
      recipient: { name: "client@x.test", email: "client@x.test" },
      folder: "sent",
    });
    expect(JSON.stringify(state.inserted)).not.toMatch(/searchintel|Me \(Admin\)|example\.com/);
  });

  it("does not report success when the insert fails", async () => {
    state.results["messages.insert"] = { data: null, error: { message: "rls" } };
    const res = await POST(req("POST", { to: "client@x.test", body: "Hello" }));
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });

  it("updates only the user's own message and answers 404 when none matched", async () => {
    state.results["messages.update"] = { data: [], error: null };
    const res = await PATCH(req("PATCH", { id: "someone-elses", folder: "trash" }));
    expect(res.status).toBe(404);
    expect(state.calls).toContain("messages.eq(user_id,user-1)");
    expect(state.updated).not.toHaveProperty("sender");
    expect(state.updated).not.toHaveProperty("user_id");
  });

  it("deletes only the user's own message", async () => {
    state.results["messages.delete"] = { data: [{ id: "m1" }], error: null };
    const res = await DELETE(req("DELETE", undefined, "?id=m1"));
    expect(res.status).toBe(200);
    expect(state.calls).toContain("messages.eq(id,m1)");
    expect(state.calls).toContain("messages.eq(user_id,user-1)");
  });
});

describe("/api/messages id handling (no cross-user oracle)", () => {
  const A_ID = "msg-owned-by-user-a";

  async function snapshot(res: Response) {
    return { status: res.status, body: await res.text(), headers: [...res.headers.entries()].sort() };
  }

  it("user B's PATCH on A's id answers exactly like a random id", async () => {
    // The filter by user_id means neither query matches for B.
    state.results["messages.update"] = { data: [], error: null };
    const onA = await snapshot(await PATCH(req("PATCH", { id: A_ID, subject: "pwned" })));
    const onRandom = await snapshot(await PATCH(req("PATCH", { id: "msg-does-not-exist-123", subject: "pwned" })));
    expect(onA.status).toBe(404);
    expect(onA).toEqual(onRandom);
    expect(onA.body).not.toMatch(/subject|sender|recipient|user_id/);
  });

  it("user B's DELETE on A's id answers exactly like a random id", async () => {
    state.results["messages.delete"] = { data: [], error: null };
    const onA = await snapshot(await DELETE(req("DELETE", undefined, `?id=${A_ID}`)));
    const onRandom = await snapshot(await DELETE(req("DELETE", undefined, "?id=nope")));
    expect(onA.status).toBe(404);
    expect(onA).toEqual(onRandom);
  });

  it("filters by the session user before the id, on every lookup", async () => {
    state.results["messages.update"] = { data: [], error: null };
    await PATCH(req("PATCH", { id: A_ID, folder: "trash" }));
    const eqs = state.calls.filter((c) => c.startsWith("messages.eq"));
    expect(eqs).toEqual(["messages.eq(user_id,user-1)", `messages.eq(id,${A_ID})`]);
  });

  it("an overlong id is the same 404 without touching the database", async () => {
    state.results["messages.update"] = { data: [], error: null };
    const long = await snapshot(await PATCH(req("PATCH", { id: "x".repeat(500), subject: "s" })));
    expect(long.status).toBe(404);
    expect(state.calls).toEqual([]);
  });

  it("POST ignores a client-chosen id (even one belonging to another user) and uses a fresh server id", async () => {
    state.results["messages.insert"] = { data: { id: "server-id", sender: { name: "Pat Doe", email: "pat@acme.test" } }, error: null };
    const res = await POST(req("POST", { id: A_ID, to: "c@x.test", body: "hi", folder: "drafts" }));
    expect(res.status).toBe(201);
    expect(state.inserted?.id).not.toBe(A_ID);
    expect(String(state.inserted?.id)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // A's row is never targeted: no update/delete, only one insert.
    expect(state.calls.some((c) => c.includes(A_ID))).toBe(false);
  });

  it("two POSTs get different ids", async () => {
    state.results["messages.insert"] = { data: { id: "x" }, error: null };
    await POST(req("POST", { body: "a" }));
    const first = state.inserted?.id;
    await POST(req("POST", { body: "b" }));
    expect(state.inserted?.id).not.toBe(first);
  });

  it("a database error (e.g. duplicate key) is a generic 500 that reveals nothing", async () => {
    state.results["messages.insert"] = { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint messages_pkey" } };
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(req("POST", { body: "hi" }));
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toMatch(/23505|duplicate|messages_pkey|constraint/);
  });

  it("a disabled account gets 403, not data", async () => {
    const { apiAuthError } = await import("@/lib/auth");
    state.session = apiAuthError.disabled() as unknown as Record<string, unknown>;
    expect((await GET()).status).toBe(403);
  });
});
