/**
 * The analysis progress page's calls to /api/jobs/analysis.
 *
 * An analysis makes paid search and AI provider calls, so opening the page never starts one:
 * `fetchAnalysisStatus` only reads (GET), and a project with no analysis yet is reported as
 * "not_started" for the page to offer a Start button. `startAnalysis` (POST) is called only from
 * that button. Ownership and the one-running-analysis-per-project rule stay on the server
 * (the route and migration 040's unique index); a second start answers 409 already_running,
 * which is treated as "started".
 */

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export type AnalysisStatus<Job> =
  | { kind: "job"; job: Job }
  | { kind: "not_started" }
  | { kind: "error"; message: string };

export type StartResult = { ok: true; alreadyRunning: boolean } | { ok: false; message: string };

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: { message?: unknown } | string } | null;
  const message = typeof body?.error === "string" ? body.error : body?.error?.message;
  // The route only sends fixed, user-facing text; anything else falls back.
  return typeof message === "string" && message ? message : fallback;
}

/** GET only: the latest analysis for the project, or "not_started". Never starts anything. */
export async function fetchAnalysisStatus<Job>(fetchFn: FetchFn, clientId: string): Promise<AnalysisStatus<Job>> {
  try {
    const res = await fetchFn(`/api/jobs/analysis?client_id=${encodeURIComponent(clientId)}`);
    if (res.status === 404) return { kind: "not_started" };
    if (!res.ok) return { kind: "error", message: await errorMessage(res, "Unable to load analysis status.") };
    const data = (await res.json().catch(() => null)) as { job?: Job } | null;
    return data?.job ? { kind: "job", job: data.job } : { kind: "not_started" };
  } catch {
    return { kind: "error", message: "Unable to load analysis status." };
  }
}

/** POST: starts an analysis. Only ever called from an explicit user action. */
export async function startAnalysis(fetchFn: FetchFn, clientId: string): Promise<StartResult> {
  try {
    const res = await fetchFn("/api/jobs/analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId }),
    });
    if (res.ok) return { ok: true, alreadyRunning: false };
    if (res.status === 409) return { ok: true, alreadyRunning: true };
    return { ok: false, message: await errorMessage(res, "The analysis couldn't be started. Please try again.") };
  } catch {
    return { ok: false, message: "The analysis couldn't be started. Check your connection and try again." };
  }
}
