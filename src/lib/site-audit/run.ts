import "server-only";
import { normaliseDomain } from "@/lib/url-input";
import { safeFetch, UnsafeUrlError, type SafeFetchResult } from "@/lib/net/safe-fetch";
import { failedPage, parsePage, parseSitemap } from "./parse";
import { analyzeRobots } from "./robots";
import { evaluateChecks, scoreChecks } from "./checks";
import {
  auditFailureReason,
  BLOCKED_STATUSES,
  canScore,
  classifyFetchError,
  computeCoverage,
  decideAuditStatus,
  failureMessage,
  FETCH_FAILURE_TEXT,
} from "./outcome";
import type { AuditOutcome, BrokenLink, FetchFailureKind, PageFacts, SeoSetupInput } from "./types";

export class SiteAuditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiteAuditError";
  }
}

const MAX_PAGES = 10;
const MAX_LINKS_TO_VERIFY = 60;
/** Statuses that mean "restricted", not "broken". */
const NOT_BROKEN = new Set([401, 403, 405, 429]);

type FetchOutcome =
  | (SafeFetchResult & { responseTimeMs: number })
  | { error: string; kind: FetchFailureKind; responseTimeMs: number };

async function tryFetch(url: string, opts?: Parameters<typeof safeFetch>[1]): Promise<FetchOutcome> {
  const start = Date.now();
  try {
    const res = await safeFetch(url, opts);
    return { ...res, responseTimeMs: Date.now() - start };
  } catch (e) {
    const responseTimeMs = Date.now() - start;
    const kind = classifyFetchError(e);
    if (e instanceof UnsafeUrlError) return { error: e.message, kind, responseTimeMs };
    return { error: FETCH_FAILURE_TEXT[kind], kind, responseTimeMs };
  }
}


async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

function pathDepth(url: string): number {
  try {
    return new URL(url).pathname.split("/").filter(Boolean).length;
  } catch {
    return 99;
  }
}

async function loadSitemapUrls(
  origin: string,
  declared: string[],
  siteHost: string,
): Promise<{ found: boolean; checked: boolean; urls: string[] }> {
  const candidates = declared.length > 0 ? declared.slice(0, 2) : [`${origin}/sitemap.xml`];
  const urls: string[] = [];
  let found = false;
  // "checked" means the site gave a real answer for at least one candidate
  // (e.g. 404), so a missing sitemap is proven rather than assumed.
  let checked = false;
  for (const sm of candidates) {
    const res = await tryFetch(sm, { timeoutMs: 8000, maxBytes: 3_000_000 });
    if ("error" in res) continue;
    if (!BLOCKED_STATUSES.has(res.status) && res.status < 500) checked = true;
    if (!res.ok) continue;
    found = true;
    const parsed = parseSitemap(res.body);
    urls.push(...parsed.urls);
    if (parsed.childSitemaps[0]) {
      const child = await tryFetch(parsed.childSitemaps[0], { timeoutMs: 8000, maxBytes: 3_000_000 });
      if (!("error" in child) && child.ok) urls.push(...parseSitemap(child.body).urls);
    }
  }
  const sameSite = urls.filter((u) => {
    try {
      return new URL(u).hostname.replace(/^www\./, "") === siteHost;
    } catch {
      return false;
    }
  });
  return { found, checked: checked || found, urls: sameSite };
}

/**
 * Audit a website: homepage + up to 9 more pages (from the sitemap, falling
 * back to homepage links), robots.txt, sitemap, and the internal links found
 * on those pages. Every request goes through safeFetch (public hosts only).
 *
 * Never throws for an unreachable site: the result carries an explicit
 * `status` (completed / partial / failed, see outcome.ts). A failed audit has
 * no checks and no score. Throws SiteAuditError only for an invalid address.
 */
export async function runSiteAudit(domainInput: string, seoSetup?: SeoSetupInput): Promise<AuditOutcome> {
  const normalised = normaliseDomain(domainInput);
  if (!normalised) throw new SiteAuditError("The project's website address isn't valid. Update it in project settings.");
  const siteHost = normalised.domain;

  // Homepage: prefer https, fall back to http.
  let home = await tryFetch(`https://${siteHost}/`);
  if ("error" in home) home = await tryFetch(`http://${siteHost}/`);
  if ("error" in home) {
    // Nothing answered at all: stop here rather than crawl a dead site.
    const homePage = failedPage(`https://${siteHost}/`, 0, home.error, home.kind);
    return failedOutcome(siteHost, [homePage]);
  }

  const homepageUrl = home.url;
  const origin = new URL(homepageUrl).origin;
  const finalHost = new URL(homepageUrl).hostname.replace(/^www\./, "");
  const host = finalHost === siteHost ? siteHost : finalHost;

  const homeFacts: PageFacts =
    home.ok && /html/i.test(home.contentType)
      ? parsePage(home.body, homepageUrl, home.status, host, home.responseTimeMs)
      : failedPage(homepageUrl, home.status, null);

  const robotsRes = await tryFetch(`${origin}/robots.txt`, { timeoutMs: 8000, maxBytes: 500_000 });
  const robotsText = !("error" in robotsRes) && robotsRes.ok && !/html/i.test(robotsRes.contentType) ? robotsRes.body : null;
  const robots = analyzeRobots(robotsText);
  // A 2xx or a 404/410 is a real answer about robots.txt; a timeout, a refusal
  // or a server error means we don't know what it says.
  const robotsChecked =
    !("error" in robotsRes) && (robotsRes.ok || robotsRes.status === 404 || robotsRes.status === 410);

  const sitemap = await loadSitemapUrls(origin, robots.sitemaps, host);

  // Pick pages: shallow sitemap URLs first, then links from the homepage.
  const seen = new Set<string>([homepageUrl.replace(/\/$/, "")]);
  const picks: string[] = [];
  const pool = [...sitemap.urls.sort((a, b) => pathDepth(a) - pathDepth(b)), ...homeFacts.internalLinks];
  for (const u of pool) {
    const key = u.replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    picks.push(u);
    if (picks.length >= MAX_PAGES - 1) break;
  }

  const others = await mapLimit(picks, 4, async (url): Promise<PageFacts> => {
    const res = await tryFetch(url);
    if ("error" in res) return failedPage(url, 0, res.error, res.kind);
    if (!res.ok || !/html/i.test(res.contentType)) return failedPage(res.url, res.status, null);
    return parsePage(res.body, res.url, res.status, host, res.responseTimeMs);
  });
  const pages = [homeFacts, ...others];

  const coverage = computeCoverage(pages);
  if (decideAuditStatus(coverage) === "failed") return failedOutcome(siteHost, pages, homepageUrl);

  // Verify internal links that weren't already fetched as pages.
  const knownStatus = new Map(pages.map((p) => [p.url.replace(/\/$/, ""), p.status]));
  const linkSources = new Map<string, string>();
  for (const p of pages) {
    for (const link of p.internalLinks) {
      const key = link.replace(/\/$/, "");
      if (!knownStatus.has(key) && !linkSources.has(key)) linkSources.set(key, p.url);
    }
  }
  const toVerify = [...linkSources.entries()].slice(0, MAX_LINKS_TO_VERIFY);
  const verified = await mapLimit(toVerify, 6, async ([url, foundOn]) => {
    let res = await tryFetch(url, { method: "HEAD", timeoutMs: 8000 });
    if (!("error" in res) && (res.status === 405 || res.status === 501)) {
      res = await tryFetch(url, { timeoutMs: 8000, maxBytes: 50_000 });
    }
    return { url, foundOn, res };
  });

  const brokenLinks: BrokenLink[] = [];
  for (const { url, foundOn, res } of verified) {
    if ("error" in res) continue; // network hiccups aren't proof a link is broken
    if (res.status >= 400 && !NOT_BROKEN.has(res.status)) brokenLinks.push({ url, status: res.status, foundOn });
  }
  // Scanned pages that fail are reported by the page_errors check instead.

  const checks = evaluateChecks({
    homepageUrl,
    pages,
    robots,
    sitemapFound: sitemap.found,
    brokenLinks,
    linksChecked: verified.length,
    seoSetup,
    robotsChecked,
    sitemapChecked: sitemap.checked,
  });
  return {
    status: decideAuditStatus(coverage),
    domain: siteHost,
    homepageUrl,
    score: canScore(coverage) ? scoreChecks(checks) : null,
    coverage,
    failure: null,
    pages,
    robots,
    sitemapFound: sitemap.found,
    brokenLinks,
    checks,
  };
}

/** No page loaded: no checks, no score, and a reason the user can act on. */
function failedOutcome(host: string, pages: PageFacts[], homepageUrl = pages[0]?.url ?? `https://${host}/`): AuditOutcome {
  const reason = auditFailureReason(pages[0]);
  return {
    status: "failed",
    domain: host,
    homepageUrl,
    score: null,
    coverage: computeCoverage(pages),
    failure: { reason, message: failureMessage(reason, host, pages[0]) },
    pages,
    robots: analyzeRobots(null),
    sitemapFound: false,
    brokenLinks: [],
    checks: [],
  };
}

