import fs from "fs";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import { fetchAnalysisStatus, startAnalysis } from "./analysis-status";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Records every call; answers GET and POST separately. */
function api(get: () => Response, post: () => Response = () => json({ jobId: "j1", status: "in_progress" }, 202)) {
  return vi.fn(async (_url: string, init?: RequestInit) => ((init?.method ?? "GET") === "POST" ? post() : get()));
}
const posts = (f: ReturnType<typeof api>) => f.mock.calls.filter(([, init]) => init?.method === "POST");

const JOB = {
  id: "j1",
  client_id: CLIENT,
  status: "in_progress",
  stage: "website_analysis",
  stage_statuses: { website_analysis: "in_progress", seo_analysis: "pending", competitor_analysis: "pending", geo_analysis: "pending", results_prep: "pending" },
  error_message: null,
  stages_data: {},
};

describe("analysis page: opening it never starts an analysis", () => {
  it("3. no job (404) → not_started, and no POST /api/jobs/analysis — however often it is polled or reloaded", async () => {
    const f = api(() => json({ error: { code: "not_found", message: "Analysis job not found." } }, 404));
    for (let i = 0; i < 5; i++) expect(await fetchAnalysisStatus(f, CLIENT)).toEqual({ kind: "not_started" });
    expect(posts(f)).toHaveLength(0);
    expect(f.mock.calls.every(([url, init]) => url === `/api/jobs/analysis?client_id=${CLIENT}` && !init)).toBe(true);
  });

  it("5. an existing job still renders (returned as-is)", async () => {
    const f = api(() => json({ job: JOB }));
    expect(await fetchAnalysisStatus(f, CLIENT)).toEqual({ kind: "job", job: JOB });
    expect(posts(f)).toHaveLength(0);
  });

  it("6. setup required / server errors → an error state with the route's fixed text, no POST", async () => {
    const setup = api(() => json({ error: { code: "setup_required", message: "Analysis tracking needs a one-time database update (migration 040) before it can run." } }, 503));
    expect(await fetchAnalysisStatus(setup, CLIENT)).toMatchObject({ kind: "error", message: expect.stringMatching(/one-time database update/) });
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await fetchAnalysisStatus(down, CLIENT)).toEqual({ kind: "error", message: "Unable to load analysis status." });
    expect(posts(setup)).toHaveLength(0);
  });
});

describe("analysis page: the Start button", () => {
  it("4. explicit start → exactly one POST /api/jobs/analysis for this project", async () => {
    const f = api(() => json({}, 404));
    expect(await startAnalysis(f, CLIENT)).toEqual({ ok: true, alreadyRunning: false });
    expect(posts(f)).toHaveLength(1);
    const [url, init] = posts(f)[0];
    expect(url).toBe("/api/jobs/analysis");
    expect(JSON.parse(String(init?.body))).toEqual({ client_id: CLIENT });
  });

  it("a start while one is already running (409) is treated as started, not an error (no duplicate job)", async () => {
    const f = api(() => json({}, 404), () => json({ error: { code: "already_running", message: "An analysis is already running for this project." }, jobId: "j1" }, 409));
    expect(await startAnalysis(f, CLIENT)).toEqual({ ok: true, alreadyRunning: true });
  });

  it("a refused start shows the route's message; an unreadable one a fixed message", async () => {
    const notYours = api(() => json({}, 404), () => json({ error: { code: "not_found", message: "Project not found." } }, 404));
    expect(await startAnalysis(notYours, CLIENT)).toEqual({ ok: false, message: "Project not found." });
    const garbage = api(() => json({}, 404), () => new Response("<html>502</html>", { status: 502 }));
    expect(await startAnalysis(garbage, CLIENT)).toEqual({ ok: false, message: "The analysis couldn't be started. Please try again." });
  });
});

describe("analysis page wiring (source guard)", () => {
  const page = fs.readFileSync(path.join(process.cwd(), "src/app/dashboard/clients/[id]/analysis/page.tsx"), "utf8");

  it("the page only POSTs through startAnalysis, and only from the Start button handler", () => {
    expect(page).not.toMatch(/method:\s*"POST"/);
    expect(page.match(/startAnalysis\(/g)).toHaveLength(1);
    const handler = page.slice(page.indexOf("async function handleStart"), page.indexOf("async function handleRetry"));
    expect(handler).toContain("startAnalysis(");
    expect(page).toMatch(/onClick=\{handleStart\}/);
  });

  it("status polling uses the read-only helper", () => {
    const check = page.slice(page.indexOf("async function checkJobStatus"), page.indexOf("useEffect("));
    expect(check).toContain("fetchAnalysisStatus");
    expect(check).not.toContain("startAnalysis");
  });
});
