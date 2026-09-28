import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeDb, fakeSupabaseClient, profileRow } from "@/test-utils/fake-supabase";

/*
 * HTTP status contract for protected APIs, through the real lib/auth helpers:
 *   signed out 401 · disabled 403 account_disabled · no organization 403 no_organization ·
 *   another organization's project/task 404 (same as missing, so ids can't be probed) ·
 *   bad input 400 · no paid provider call unless the caller is allowed.
 * Supabase is an in-memory fake; nothing touches the network.
 */

const db = createFakeDb();
const cookieJar: Record<string, string> = {};
const paid = {
  check: vi.fn(async () => ({ ok: true })),
  runKeywords: vi.fn(async () => ({ ok: true, results: [] })),
  pipeline: vi.fn(async () => {}),
};

vi.mock("next/headers", () => ({
  cookies: async () => ({
    has: (n: string) => n in cookieJar,
    get: (n: string) => (n in cookieJar ? { name: n, value: cookieJar[n] } : undefined),
    getAll: () => Object.entries(cookieJar).map(([name, value]) => ({ name, value })),
    set: () => {},
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: () => {} }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeSupabaseClient(db) }));
vi.mock("@/lib/run-check", () => ({ runCheckPipeline: paid.check }));
vi.mock("@/lib/run-pipeline", () => ({ runKeywordsForClient: paid.runKeywords }));
vi.mock("@/lib/analysis-runner", async (orig) => ({
  ...(await orig<typeof import("@/lib/analysis-runner")>()),
  runFullAnalysisPipeline: paid.pipeline,
}));

const tasks = await import("./tasks/route");
const taskById = await import("./tasks/[id]/route");
const runClient = await import("./run-client/route");
const siteAudit = await import("./site-audit/route");
const keywords = await import("./projects/[id]/keywords/route");
const jobs = await import("./jobs/analysis/route");
const check = await import("./check/route");
const exportRoute = await import("./export/route");
const feedback = await import("./feedback/route");

const PROJECT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TASK_B = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const post = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
const get = (url: string) => new NextRequest(`http://localhost${url}`);
const params = <T,>(p: T) => ({ params: Promise.resolve(p) });

function signIn(profile: Parameters<typeof profileRow>[0] | null) {
  if (!profile) {
    db.user = null;
    delete cookieJar["sb-abcd1234-auth-token"];
    return;
  }
  cookieJar["sb-abcd1234-auth-token"] = "token";
  db.user = { id: profile.id, email: `${profile.id}@example.org` };
  db.tables.profiles = [profileRow(profile)];
}

/** One representative call per protected route, with a body that would otherwise be valid. */
const calls: Record<string, () => Promise<Response>> = {
  "POST /api/tasks": () => tasks.POST(post("/api/tasks", { client_id: PROJECT_A, title: "T", group_name: "content" })),
  "PATCH /api/tasks/[id]": () =>
    taskById.PATCH(new NextRequest("http://localhost/api/tasks/x", { method: "PATCH", body: JSON.stringify({ title: "x" }) }), params({ id: TASK_B })),
  "POST /api/run-client": () => runClient.POST(post("/api/run-client", { client_id: PROJECT_A })),
  "POST /api/site-audit": () => siteAudit.POST(post("/api/site-audit", { client_id: PROJECT_A })),
  "GET /api/projects/[id]/keywords": () => keywords.GET(get(`/api/projects/${PROJECT_A}/keywords`), params({ id: PROJECT_A })),
  "GET /api/jobs/analysis": () => jobs.GET(get(`/api/jobs/analysis?client_id=${PROJECT_A}`)),
  "POST /api/check": () => check.POST(post("/api/check", { keyword: "plumber", domain: "a.example", location: "ae" })),
  "GET /api/export": () => exportRoute.GET(new Request("http://localhost/api/export")),
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcd1234.supabase.co");
  db.tables = {
    clients: [
      { id: PROJECT_A, agency_id: "org-a", name: "A", website: "a.example", brand_name: "A", default_location: "ae" },
      { id: PROJECT_B, agency_id: "org-b", name: "B", website: "b.example", brand_name: "B", default_location: "ae" },
    ],
    tasks: [{ id: TASK_B, agency_id: "org-b", client_id: PROJECT_B, title: "theirs" }],
    search_results: [
      { agency_id: "org-a", keyword: "mine", client_id: PROJECT_A },
      { agency_id: "org-b", keyword: "theirs", client_id: PROJECT_B },
    ],
  };
  db.errors = {};
  signIn(null);
  Object.values(paid).forEach((f) => f.mockClear());
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe.each(Object.entries(calls))("%s", (_name, call) => {
  it("signed out: 401 JSON, no paid call", async () => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "unauthenticated" });
    expect(paid.check).not.toHaveBeenCalled();
    expect(paid.runKeywords).not.toHaveBeenCalled();
  });

  it("disabled user with a valid Supabase session: 403 account_disabled", async () => {
    signIn({ id: "u1", agencyId: "org-a", disabled: true });
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "account_disabled" });
    expect(paid.check).not.toHaveBeenCalled();
  });

  it("signed in without an organization: 403 no_organization (never a 500 NEXT_REDIRECT)", async () => {
    signIn({ id: "u2", agencyId: null });
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "no_organization" });
  });
});

describe("another organization's resources answer 404", () => {
  beforeEach(() => signIn({ id: "ua", agencyId: "org-a" }));

  it("run-client on org B's project, without running any check", async () => {
    const res = await runClient.POST(post("/api/run-client", { client_id: PROJECT_B }));
    expect(res.status).toBe(404);
    expect(paid.runKeywords).not.toHaveBeenCalled();
  });

  it("site-audit, keywords, tasks and jobs on org B's project", async () => {
    expect((await siteAudit.POST(post("/api/site-audit", { client_id: PROJECT_B }))).status).toBe(404);
    expect((await keywords.GET(get("/x"), params({ id: PROJECT_B }))).status).toBe(404);
    expect((await tasks.POST(post("/api/tasks", { client_id: PROJECT_B, title: "T", group_name: "content" }))).status).toBe(404);
    expect((await jobs.GET(get(`/api/jobs/analysis?client_id=${PROJECT_B}`))).status).toBe(404);
  });

  it("editing or deleting org B's task", async () => {
    const patch = await taskById.PATCH(
      new NextRequest("http://localhost/x", { method: "PATCH", body: JSON.stringify({ title: "mine now" }) }),
      params({ id: TASK_B }),
    );
    expect(patch.status).toBe(404);
    const del = await taskById.DELETE(new NextRequest("http://localhost/x", { method: "DELETE" }), params({ id: TASK_B }));
    expect(del.status).toBe(404);
    expect(db.tables.tasks[0]).toMatchObject({ title: "theirs" });
  });

  it("export ignores an agencyId parameter and returns only the caller's rows", async () => {
    const res = await exportRoute.GET(new Request("http://localhost/api/export?agencyId=org-b"));
    const body = await res.json();
    expect(body.data.map((r: { keyword: string }) => r.keyword)).toEqual(["mine"]);
  });
});

describe("validation answers 400", () => {
  beforeEach(() => signIn({ id: "ua", agencyId: "org-a" }));

  it("tasks without a title, run-client / site-audit with a bad id, check without a keyword, jobs without ids", async () => {
    expect((await tasks.POST(post("/api/tasks", { client_id: PROJECT_A, group_name: "content" }))).status).toBe(400);
    expect((await runClient.POST(post("/api/run-client", { client_id: "not-a-uuid" }))).status).toBe(400);
    expect((await siteAudit.POST(post("/api/site-audit", { client_id: 42 }))).status).toBe(400);
    expect((await check.POST(post("/api/check", { domain: "a.example", location: "ae" }))).status).toBe(400);
    expect((await jobs.GET(get("/api/jobs/analysis"))).status).toBe(400);
    expect(paid.check).not.toHaveBeenCalled();
  });

  it("a body that isn't JSON is a 400, not a 500", async () => {
    expect((await tasks.POST(post("/api/tasks", "{not json"))).status).toBe(400);
    expect((await check.POST(post("/api/check", "{not json"))).status).toBe(400);
    expect((await runClient.POST(post("/api/run-client", "{not json"))).status).toBe(400);
  });
});

describe("server failures answer a generic 500", () => {
  it("never includes the database's own error text", async () => {
    signIn({ id: "ua", agencyId: "org-a" });
    db.errors.search_results = { code: "42501", message: "permission denied for table search_results" };
    const res = await exportRoute.GET(new Request("http://localhost/api/export"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("permission denied");
  });
});

describe("routes open to any active user", () => {
  it("feedback works before an organization exists, but not for a disabled user", async () => {
    db.tables.feedback = [{ id: "f1", user_id: "u2", message: "hi" }];
    signIn({ id: "u2", agencyId: null });
    expect((await feedback.GET()).status).toBe(200);
    signIn({ id: "u2", agencyId: null, disabled: true });
    expect((await feedback.GET()).status).toBe(403);
    signIn(null);
    expect((await feedback.GET()).status).toBe(401);
  });
});

describe("an allowed caller reaches the provider", () => {
  it("check runs for an active member", async () => {
    signIn({ id: "ua", agencyId: "org-a" });
    const res = await check.POST(post("/api/check", { keyword: "plumber", domain: "a.example", location: "ae" }));
    expect(res.status).toBe(200);
    expect(paid.check).toHaveBeenCalledTimes(1);
  });
});
