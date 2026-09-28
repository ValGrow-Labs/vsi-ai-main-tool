/**
 * `not_checked`: VSI couldn't gather the data this check needs (pages didn't
 * load, homepage unavailable, nothing configured to compare against). It is
 * never a pass: it adds no penalty and no credit to the score, and never
 * becomes a Next Action.
 */
export type CheckStatus = "pass" | "warning" | "fail" | "not_checked";
export type Impact = "high" | "medium" | "low";

/**
 * Outcome of a whole audit run.
 * - completed: the homepage and most pages loaded; every check is meaningful.
 * - partial: some pages loaded, but the homepage didn't or VSI couldn't fetch a
 *   large share of pages. Checks that need missing data are `not_checked`.
 * - failed: no page loaded at all. No checks, no score.
 */
export type AuditStatus = "completed" | "partial" | "failed";

/** Why VSI itself couldn't fetch a page (not the website's fault). */
export type FetchFailureKind = "timeout" | "dns" | "network" | "unsafe";

/** Why a failed audit couldn't load any page. */
export type AuditFailureReason = FetchFailureKind | "blocked" | "site_error" | "not_html";
export type CheckId =
  | "https"
  | "ai_crawlers"
  | "indexable"
  | "page_errors"
  | "broken_links"
  | "page_titles"
  | "meta_descriptions"
  | "headings"
  | "structured_data"
  | "answer_content"
  | "image_alt"
  | "sitemap"
  | "mobile_viewport"
  | "topic_coverage"
  | "geo_compatibility";

export interface SeoSetupInput {
  trackedKeywords?: string[];
  targetCountry?: string | null;
  targetLanguage?: string | null;
}

/** Facts extracted from one fetched page. */
export interface PageFacts {
  url: string;
  status: number;
  /** Set when the page couldn't be fetched at all (timeout, DNS, blocked). */
  fetchError: string | null;
  /** Classification of `fetchError`. Absent on audits stored before it existed. */
  fetchErrorKind?: FetchFailureKind | null;
  isHtml: boolean;
  title: string | null;
  metaDescription: string | null;
  h1Count: number;
  headingCount: number;
  questionHeadings: number;
  hasViewport: boolean;
  noindex: boolean;
  jsonLdTypes: string[];
  imagesTotal: number;
  imagesMissingAlt: number;
  internalLinks: string[];
  wordCount: number;
  /** Observable semantic & technical facts */
  htmlLang: string | null;
  canonical: string | null;
  hreflangs: Array<{ lang: string; href: string }>;
  h1Texts: string[];
  headingTexts: string[];
  bodyTextSample: string;
  responseTimeMs: number;
}


export interface RobotsFacts {
  found: boolean;
  /** AI crawlers that are disallowed from the whole site. */
  blockedAgents: string[];
  /** `User-agent: *` disallows the whole site. */
  blocksEveryone: boolean;
  sitemaps: string[];
}

export interface BrokenLink {
  url: string;
  status: number | null;
  foundOn: string;
}

export interface CheckResult {
  id: CheckId;
  status: CheckStatus;
  impact: Impact;
  /** Number of affected items (pages, links, crawlers). */
  count: number;
  /** Items checked, when meaningful (e.g. pages scanned). */
  total: number;
  /** Affected URLs or names, capped. */
  affected: string[];
  /** Measured values for technical details. */
  detail: Record<string, string | number | boolean | string[] | null>;
}

/** How much of the site VSI could actually read. */
export interface AuditCoverage {
  pagesAttempted: number;
  /** HTML pages that returned a success status: the only pages per-page checks use. */
  pagesLoaded: number;
  homepageLoaded: boolean;
  /** HTTP 4xx/5xx returned by the website (except 401/403/429). Real page errors. */
  siteErrors: number;
  /** 401/403/429: the website refused VSI's crawler. Not counted as page errors. */
  blocked: number;
  /** Timeouts, DNS and network failures on VSI's side. Not counted as page errors. */
  fetchFailures: number;
  /** Responded, but not with a web page (e.g. PDF, JSON). */
  notHtml: number;
}

export interface AuditOutcome {
  status: AuditStatus;
  domain: string;
  homepageUrl: string;
  /** Null when there wasn't enough loaded data to score (see scorePolicy in run.ts). */
  score: number | null;
  coverage: AuditCoverage;
  /** Set only when status is "failed". */
  failure: { reason: AuditFailureReason; message: string } | null;
  pages: PageFacts[];
  robots: RobotsFacts;
  sitemapFound: boolean;
  brokenLinks: BrokenLink[];
  checks: CheckResult[];
}
