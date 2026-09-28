import type { AuditCoverage, AuditFailureReason, AuditStatus, FetchFailureKind, PageFacts } from "./types";

/**
 * Pure rules for how much of a site VSI could read, and what that means for
 * the audit as a whole. Kept free of I/O so it can be unit-tested and used by
 * the UI.
 */

/** The website answered, but refused VSI's crawler. Not a broken page. */
export const BLOCKED_STATUSES = new Set([401, 403, 429]);

/**
 * Audit becomes "partial" when at least this share of the pages VSI tried
 * couldn't be read because of VSI's fetch (timeout/DNS/network) or because
 * the site refused the crawler.
 */
export const PARTIAL_UNREADABLE_SHARE = 1 / 3;

/**
 * Score policy: a health score is calculated only when the homepage loaded
 * AND at least this share of the attempted pages gave VSI a real answer
 * (loaded, or a real HTTP error from the site). Otherwise the audit has no
 * score, because a score over a fraction of the site would look complete.
 */
export const MIN_ANSWERED_SHARE_FOR_SCORE = 0.5;

export type PageOutcome = "loaded" | "site_error" | "blocked" | "fetch_failed" | "not_html";

export function pageOutcome(p: PageFacts): PageOutcome {
  if (p.fetchError) return "fetch_failed";
  if (p.status >= 400) return BLOCKED_STATUSES.has(p.status) ? "blocked" : "site_error";
  if (p.status === 0) return "fetch_failed";
  return p.isHtml ? "loaded" : "not_html";
}

export function isLoaded(p: PageFacts | undefined): boolean {
  return !!p && pageOutcome(p) === "loaded";
}

/** `pages[0]` is always the homepage. */
export function computeCoverage(pages: PageFacts[]): AuditCoverage {
  const c: AuditCoverage = {
    pagesAttempted: pages.length,
    pagesLoaded: 0,
    homepageLoaded: isLoaded(pages[0]),
    siteErrors: 0,
    blocked: 0,
    fetchFailures: 0,
    notHtml: 0,
  };
  for (const p of pages) {
    const o = pageOutcome(p);
    if (o === "loaded") c.pagesLoaded++;
    else if (o === "site_error") c.siteErrors++;
    else if (o === "blocked") c.blocked++;
    else if (o === "fetch_failed") c.fetchFailures++;
    else c.notHtml++;
  }
  return c;
}

export function decideAuditStatus(c: AuditCoverage): AuditStatus {
  if (c.pagesLoaded === 0) return "failed";
  if (!c.homepageLoaded) return "partial";
  if (c.pagesAttempted > 0 && (c.fetchFailures + c.blocked) / c.pagesAttempted >= PARTIAL_UNREADABLE_SHARE) return "partial";
  return "completed";
}

export function canScore(c: AuditCoverage): boolean {
  if (!c.homepageLoaded || c.pagesLoaded === 0 || c.pagesAttempted === 0) return false;
  const answered = c.pagesAttempted - c.fetchFailures - c.blocked;
  return answered / c.pagesAttempted >= MIN_ANSWERED_SHARE_FOR_SCORE;
}

/** Classify an error thrown by safeFetch / fetch. */
export function classifyFetchError(e: unknown): FetchFailureKind {
  if (!(e instanceof Error)) return "network";
  if (e.name === "UnsafeUrlError") return "unsafe";
  if (e.name === "TimeoutError" || e.name === "AbortError") return "timeout";
  const code =
    (e as { code?: unknown }).code ?? ((e as { cause?: unknown }).cause as { code?: unknown } | undefined)?.code;
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || code === "EAI_NONAME" || code === "EAI_FAIL") return "dns";
  if (code === "UND_ERR_CONNECT_TIMEOUT" || code === "UND_ERR_HEADERS_TIMEOUT" || code === "ETIMEDOUT") return "timeout";
  return "network";
}

export const FETCH_FAILURE_TEXT: Record<FetchFailureKind, string> = {
  timeout: "Timed out",
  dns: "Address not found",
  network: "Couldn't connect",
  unsafe: "Not allowed",
};

/** Why nothing loaded, judged from the homepage (pages[0]). */
export function auditFailureReason(home: PageFacts | undefined): AuditFailureReason {
  if (!home) return "network";
  const o = pageOutcome(home);
  if (o === "fetch_failed") return home.fetchErrorKind ?? "network";
  if (o === "blocked") return "blocked";
  if (o === "site_error") return "site_error";
  return "not_html";
}

export function failureMessage(reason: AuditFailureReason, host: string, home?: PageFacts): string {
  const lead = `We couldn't load any pages from your website (${host})`;
  switch (reason) {
    case "timeout":
      return `${lead}: it didn't respond in time. Check that the site is online, then run the audit again.`;
    case "dns":
      return `${lead}: the address couldn't be found. Check the website address in project settings.`;
    case "unsafe":
      return `${lead}: ${home?.fetchError?.replace(/\.$/, "") ?? "the address can't be checked"}.`;
    case "network":
      return `${lead}: we couldn't connect to it. Check that the site is online, then run the audit again.`;
    case "blocked":
      return `${lead}: it refused our checker (HTTP ${home?.status ?? 403}). It may block automated visitors; ask your developer or host to allow it.`;
    case "site_error":
      return `${lead}: the homepage returned an error (HTTP ${home?.status ?? "error"}).`;
    case "not_html":
      return `${lead}: the homepage didn't return a web page.`;
  }
}
