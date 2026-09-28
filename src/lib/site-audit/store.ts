import type { AuditOutcome, CheckResult } from "./types";

/** Postgres "undefined table" or PostgREST "table not in schema cache", i.e. a migration isn't applied yet. */
export function isMissingTableError(err: { code?: string; message?: string } | null | undefined, table = "site_audits"): boolean {
  if (!err) return false;
  if (err.code === "42P01" || err.code === "PGRST205") return true;
  const msg = err.message ?? "";
  return msg.includes(table) && /does not exist|schema cache/i.test(msg);
}

export interface StoredAudit {
  id: string;
  status: "running" | "completed" | "failed";
  domain: string;
  score: number | null;
  pages_scanned: number;
  checks: CheckResult[];
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export type AuditLoad =
  | {
      state: "ok";
      /** Most recent successful audit. */
      completed: StoredAudit | null;
      running: StoredAudit | null;
      /** Set only when the newest finished run failed (newer than `completed`). */
      lastFailed: StoredAudit | null;
      history: Pick<StoredAudit, "id" | "score" | "created_at">[];
    }
  | { state: "setup_required" }
  | { state: "error"; message: string };

/**
 * The site_audits columns to write for a finished run. Shared by the Site
 * Audit route and the analysis runner so both store the same honest state:
 * - failed: status "failed" with the reason, no score, no checks.
 * - partial: status "completed"; the checks carry `not_checked` statuses and
 *   coverage (page_errors detail), and the score is null when there wasn't
 *   enough data (see canScore in outcome.ts).
 * `pages_scanned` counts pages that gave a real answer (loaded or a real HTTP
 * error), not pages VSI couldn't fetch.
 */
export function auditRowUpdate(outcome: AuditOutcome, now = new Date()) {
  const pages = outcome.pages.map(({ internalLinks, ...rest }) => ({ ...rest, linkCount: internalLinks.length }));
  const c = outcome.coverage;
  const answered = c.pagesAttempted - c.fetchFailures - c.blocked;
  if (outcome.status === "failed") {
    return {
      status: "failed" as const,
      domain: outcome.domain,
      score: null,
      pages_scanned: answered,
      checks: [] as CheckResult[],
      pages,
      error_message: outcome.failure?.message ?? "We couldn't load any pages from your website.",
      completed_at: now.toISOString(),
    };
  }
  return {
    status: "completed" as const,
    domain: outcome.domain,
    score: outcome.score,
    pages_scanned: answered,
    checks: outcome.checks,
    pages,
    error_message: null,
    completed_at: now.toISOString(),
  };
}
