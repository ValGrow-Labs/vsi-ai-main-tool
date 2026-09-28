import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeDb, fakeSupabaseClient, profileRow } from "@/test-utils/fake-supabase";

/*
 * Analysis jobs are isolated per organization in both storage modes:
 *  - database mode: the analysis_jobs table (migration 040);
 *  - memory mode:   local development without that table (never in production: 503 there).
 * The browser's job_id / client_id are never trusted. Supabase is an in-memory fake.
 */

const db = createFakeDb();
const cookieJar: Record<string, string> = {};
const pipeline = vi.fn(async () => {});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    has: (n: string) => n in cookieJar,
    get: (n: string) => (n in cookieJar ? { name: n, value: cookieJar[n] } : undefined),
    getAll: () => Object.entries(cookieJar).map(([name, value]) => ({ name, value })),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => unknown) => void fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeSupabaseClient(db) }));
vi.mock("@/lib/analysis-runner", async (orig) => ({
  ...(await orig<typeof import("@/lib/analysis-runner")>()),
  runFullAnalysisPipeline: pipeline,
}));

const { GET, POST, PATCH } = await import("./route");
const store = await import("@/lib/analysis-runner");

const A1 = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1"; // org A, project 1
const A2 = "a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2"; // org A, project 2
const B1 = "b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1"; // org B, project 1
const JOB_A1 = "0a000000-0000-4000-8000-0000000000a1";
const JOB_B1 = "0b000000-0000-4000-8000-0000000000b1";

const MISSING_TABLE = { code: "42P01", message: 'relation "public.analysis_jobs" does not exist' };

function as(user: "a" | "b" | "admin") {
  const id = `user-${user}`;
  cookieJar["sb-abcd1234-auth-token"] = "token";
  db.user = { id, email: `${id}@example.org` };
  db.tables.profiles = [
    profileRow({ id, agencyId: user === "b" ? "org-b" : "org-a", role: user === "admin" ? "super_admin" : "pilot" }),
  ];
}

const get = (qs: string) => GET(new NextRequest(`http://localhost/api/jobs/analysis?${qs}`));
const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/jobs/analysis", { method: "POST", body: JSON.stringify(body) }));
const patch = (body: unknown) =>
  PATCH(new NextRequest("http://localhost/api/jobs/analysis", { method: "PATCH", body: JSON.stringify(body) }));

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function job(id: string, clientId: string, agencyId: string, status = "completed", updatedMinutesAgo = 1) {
  return {
    id,
    agency_id: agencyId,
    client_id: clientId,
    status,
    stage: status === "completed" ? "completed" : "website_analysis",
    stage_statuses: {},
    error_message: null,
    stages_data: {},
    created_at: minutesAgo(updatedMinutesAgo + 1),
    updated_at: minutesAgo(updatedMinutesAgo),
    completed_at: null,
  };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcd1234.supabase.co");
  vi.stubEnv("NODE_ENV", "development");
  store.resetFallbackJobStore();
  pipeline.mockClear();
  db.errors = {};
  db.tables = {
    clients: [
      { id: A1, agency_id: "org-a", name: "A1", website: "a1.example" },
      { id: A2, agency_id: "org-a", name: "A2", website: "a2.example" },
      { id: B1, agency_id: "org-b", name: "B1", website: "b1.example" },
    ],
    analysis_jobs: [job(JOB_A1, A1, "org-a"), job(JOB_B1, B1, "org-b")],
    site_audits: [],
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("authentication", () => {
  it("signed out: 401 on GET, POST and PATCH", async () => {
    db.user = null;
    delete cookieJar["sb-abcd1234-auth-token"];
    expect((await get(`client_id=${A1}`)).status).toBe(401);
    expect((await post({ client_id: A1 })).status).toBe(401);
    expect((await patch({ client_id: A1 })).status).toBe(401);
    expect(pipeline).not.toHaveBeenCalled();
  });
});

describe("database mode (analysis_jobs exists)", () => {
  it("org A reads its own job by job_id and by client_id", async () => {
    as("a");
    expect((await (await get(`job_id=${JOB_A1}`)).json()).job.id).toBe(JOB_A1);
    expect((await (await get(`client_id=${A1}`)).json()).job.id).toBe(JOB_A1);
  });

  it("org A cannot read org B's job, by job_id or by client_id", async () => {
    as("a");
    expect((await get(`job_id=${JOB_B1}`)).status).toBe(404);
    expect((await get(`client_id=${B1}`)).status).toBe(404);
  });

  it("a job whose agency_id matches but whose project is someone else's is still refused", async () => {
    // A mislabeled row: agency org-a, but project B1 (org B). The project check catches it.
    db.tables.analysis_jobs.push(job("0c000000-0000-4000-8000-0000000000c1", B1, "org-a"));
    as("a");
    expect((await get("job_id=0c000000-0000-4000-8000-0000000000c1")).status).toBe(404);
  });

  it("org A cannot start or restart analysis on org B's project, or restart org B's job", async () => {
    as("a");
    expect((await post({ client_id: B1 })).status).toBe(404);
    expect((await patch({ client_id: B1, job_id: JOB_B1 })).status).toBe(404);
    // Own project in the body, org B's job id: the job is not touched.
    expect((await patch({ client_id: A1, job_id: JOB_B1 })).status).toBe(404);
    expect(db.tables.analysis_jobs.find((j) => j.id === JOB_B1)?.status).toBe("completed");
    expect(pipeline).not.toHaveBeenCalled();
  });

  it("within one organization, each project sees only its own job", async () => {
    db.tables.analysis_jobs.push(job("0a000000-0000-4000-8000-0000000000a2", A2, "org-a"));
    as("a");
    expect((await (await get(`client_id=${A2}`)).json()).job.id).toBe("0a000000-0000-4000-8000-0000000000a2");
    // Project A1's job asked for under project A2: not found.
    expect((await get(`job_id=${JOB_A1}&client_id=${A2}`)).status).toBe(404);
    expect((await patch({ client_id: A2, job_id: JOB_A1 })).status).toBe(404);
  });

  it("a platform admin can read any organization's job", async () => {
    as("admin");
    expect((await get(`job_id=${JOB_B1}`)).status).toBe(200);
  });

  it("starts a job for its own project and records who started it", async () => {
    as("a");
    const res = await post({ client_id: A2 });
    expect(res.status).toBe(202);
    const { jobId } = await res.json();
    const row = db.tables.analysis_jobs.find((j) => j.id === jobId);
    expect(row).toMatchObject({ agency_id: "org-a", client_id: A2, requested_by: "user-a", status: "in_progress" });
    expect(pipeline).toHaveBeenCalledWith(jobId, A2, "org-a", expect.objectContaining({ id: A2 }));
  });

  it("does not start a second job while one is running", async () => {
    db.tables.analysis_jobs.push(job("0a000000-0000-4000-8000-0000000000a9", A2, "org-a", "in_progress", 1));
    as("a");
    const res = await post({ client_id: A2 });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { code: "already_running" }, jobId: "0a000000-0000-4000-8000-0000000000a9" });
    expect((await patch({ client_id: A2, job_id: JOB_A1 })).status).toBe(409);
    expect(pipeline).not.toHaveBeenCalled();
  });

  it("a job stuck 'in progress' long past the run limit no longer blocks a new one", async () => {
    db.tables.analysis_jobs.push(job("0a000000-0000-4000-8000-0000000000a8", A2, "org-a", "in_progress", 30));
    as("a");
    expect((await post({ client_id: A2 })).status).toBe(202);
  });

  it("two simultaneous starts for the same project: one runs, the other is refused", async () => {
    as("a");
    const [r1, r2] = await Promise.all([post({ client_id: A2 }), post({ client_id: A2 })]);
    expect([r1.status, r2.status].sort()).toEqual([202, 409]);
    expect(pipeline).toHaveBeenCalledTimes(1);
  });

  it("restarts its own finished job in place", async () => {
    as("a");
    const res = await patch({ client_id: A1, job_id: JOB_A1 });
    expect(res.status).toBe(200);
    expect(db.tables.analysis_jobs.find((j) => j.id === JOB_A1)?.status).toBe("in_progress");
  });

  it("database errors are a generic 500", async () => {
    db.errors.analysis_jobs = { code: "42501", message: "permission denied for table analysis_jobs" };
    as("a");
    const res = await get(`client_id=${A1}`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("permission denied");
  });

  it("validates input", async () => {
    as("a");
    expect((await get("")).status).toBe(400);
    expect((await get("client_id=nope")).status).toBe(400);
    expect((await get("job_id=../../etc")).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect((await patch({ job_id: JOB_A1 })).status).toBe(400);
  });
});

describe("memory mode (local development, analysis_jobs missing)", () => {
  beforeEach(() => {
    db.errors.analysis_jobs = MISSING_TABLE;
  });

  it("isolates jobs by organization: org B can't read or restart org A's job", async () => {
    as("a");
    const res = await post({ client_id: A1 });
    expect(res.status).toBe(202);
    const { jobId } = await res.json();
    expect(jobId).toMatch(/^job_/);
    expect((await (await get(`job_id=${jobId}`)).json()).job).toMatchObject({ agency_id: "org-a", client_id: A1, requested_by: "user-a" });

    as("b");
    expect((await get(`job_id=${jobId}`)).status).toBe(404);
    expect((await get(`client_id=${A1}`)).status).toBe(404);
    expect((await patch({ client_id: B1, job_id: jobId })).status).toBe(404);
    expect((await patch({ client_id: A1, job_id: jobId })).status).toBe(404);
  });

  it("the store itself refuses a job to another organization", () => {
    store.setFallbackJob({ ...job("job_x", A1, "org-a", "in_progress"), stage: "website_analysis" } as never);
    expect(store.getFallbackJob("job_x", { agencyId: "org-b", isSuperAdmin: false })).toBeNull();
    expect(store.getFallbackJobForClient(A1, { agencyId: "org-b", isSuperAdmin: false })).toBeNull();
    expect(store.getFallbackJob("job_x", { agencyId: "org-a", isSuperAdmin: false })?.id).toBe("job_x");
    expect(store.getFallbackJob("job_x", { agencyId: "org-b", isSuperAdmin: true })?.id).toBe("job_x");
  });

  it("within one organization, a job id from project A1 can't be used under project A2", async () => {
    as("a");
    const { jobId } = await (await post({ client_id: A1 })).json();
    expect((await get(`job_id=${jobId}&client_id=${A2}`)).status).toBe(404);
    expect((await patch({ client_id: A2, job_id: jobId })).status).toBe(404);
  });

  it("does not start a second job while the first is running", async () => {
    as("a");
    expect((await post({ client_id: A1 })).status).toBe(202);
    expect((await post({ client_id: A1 })).status).toBe(409);
  });
});

describe("production without analysis_jobs", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    db.errors.analysis_jobs = MISSING_TABLE;
  });

  it("answers 503 setup_required instead of using a per-process store", async () => {
    as("a");
    const start = await post({ client_id: A1 });
    expect(start.status).toBe(503);
    expect(await start.json()).toMatchObject({ error: { code: "setup_required" } });
    expect((await get(`client_id=${A1}`)).status).toBe(503);
    expect(pipeline).not.toHaveBeenCalled();
  });

  it("still shows a project's latest site audit when there is one", async () => {
    db.tables.site_audits = [{ id: "s1", agency_id: "org-a", client_id: A1, status: "completed", created_at: minutesAgo(5) }];
    as("a");
    expect((await (await get(`client_id=${A1}`)).json()).job.id).toBe("audit_s1");
  });
});
