import { describe, expect, it } from "vitest";
import { parsePage, parseSitemap, toInternalUrl, failedPage } from "./parse";
import { analyzeRobots } from "./robots";
import { evaluateChecks, isAuditProblem, scoreChecks } from "./checks";
import { canScore, classifyFetchError, computeCoverage, decideAuditStatus } from "./outcome";
import { auditFinding, auditPriority } from "./findings";
import { auditConclusion, auditCoverage, checkEvidence, checkHeadline, coverageNote } from "./copy";
import type { PageFacts } from "./types";

const SITE = "example.com";

const goodHtml = `<!doctype html><html><head>
<title>Example Plumbing | Emergency plumbers in Dubai</title>
<meta name="description" content="Licensed emergency plumbers in Dubai. Same-day repairs, fixed prices and a 12-month guarantee on all work.">
<meta name="viewport" content="width=device-width">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"LocalBusiness","name":"Example"},{"@type":"FAQPage"}]}</script>
</head><body>
<h1>Emergency plumbers in Dubai</h1>
<h2>How fast can you arrive?</h2><p>Within 60 minutes.</p>
<h2>What does a call-out cost?</h2>
<img src="a.jpg" alt="Van"><img src="b.jpg">
<a href="/services">Services</a><a href="https://www.example.com/about#team">About</a>
<a href="https://other.com/">Other</a><a href="mailto:x@example.com">Mail</a><a href="/brochure.pdf">PDF</a>
</body></html>`;

describe("parsePage", () => {
  const page = parsePage(goodHtml, "https://example.com/", 200, SITE);

  it("reads title, description and viewport", () => {
    expect(page.title).toBe("Example Plumbing | Emergency plumbers in Dubai");
    expect(page.metaDescription).toContain("Licensed emergency plumbers");
    expect(page.hasViewport).toBe(true);
  });

  it("counts headings and question headings", () => {
    expect(page.h1Count).toBe(1);
    expect(page.questionHeadings).toBe(2);
  });

  it("collects JSON-LD types including @graph", () => {
    expect(page.jsonLdTypes).toEqual(expect.arrayContaining(["LocalBusiness", "FAQPage"]));
  });

  it("counts images without alt text", () => {
    expect(page.imagesTotal).toBe(2);
    expect(page.imagesMissingAlt).toBe(1);
  });

  it("keeps only internal, crawlable links without fragments", () => {
    expect(page.internalLinks.sort()).toEqual(["https://example.com/services", "https://www.example.com/about"]);
  });

  it("detects noindex", () => {
    const p = parsePage('<html><head><meta name="robots" content="NOINDEX, follow"></head><body></body></html>', "https://example.com/x", 200, SITE);
    expect(p.noindex).toBe(true);
  });
});

describe("toInternalUrl", () => {
  it("rejects other hosts and non-web schemes", () => {
    expect(toInternalUrl("https://evil.com/", "https://example.com/", SITE)).toBeNull();
    expect(toInternalUrl("javascript:alert(1)", "https://example.com/", SITE)).toBeNull();
    expect(toInternalUrl("#top", "https://example.com/", SITE)).toBeNull();
  });
});

describe("parseSitemap", () => {
  it("reads urls and sitemap indexes", () => {
    expect(parseSitemap("<urlset><url><loc>https://example.com/a</loc></url></urlset>").urls).toEqual(["https://example.com/a"]);
    expect(parseSitemap("<sitemapindex><sitemap><loc>https://example.com/s1.xml</loc></sitemap></sitemapindex>").childSitemaps).toEqual([
      "https://example.com/s1.xml",
    ]);
  });
});

describe("analyzeRobots", () => {
  it("treats a missing robots.txt as allowing everyone", () => {
    expect(analyzeRobots(null)).toMatchObject({ found: false, blockedAgents: [], blocksEveryone: false });
  });

  it("finds AI crawlers blocked by name", () => {
    const r = analyzeRobots("User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml");
    expect(r.blockedAgents).toEqual(["GPTBot"]);
    expect(r.blocksEveryone).toBe(false);
    expect(r.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
  });

  it("applies a blanket block to every crawler without its own group", () => {
    const r = analyzeRobots("User-agent: *\nDisallow: /\n\nUser-agent: ClaudeBot\nAllow: /");
    expect(r.blocksEveryone).toBe(true);
    expect(r.blockedAgents).not.toContain("ClaudeBot");
    expect(r.blockedAgents).toContain("GPTBot");
  });

  it("ignores partial disallows", () => {
    expect(analyzeRobots("User-agent: *\nDisallow: /admin").blockedAgents).toEqual([]);
  });

  it("groups consecutive user-agent lines", () => {
    const r = analyzeRobots("User-agent: GPTBot\nUser-agent: CCBot\nDisallow: /");
    expect(r.blockedAgents).toEqual(["GPTBot", "CCBot"]);
  });
});

function page(overrides: Partial<PageFacts>): PageFacts {
  return { ...parsePage(goodHtml, "https://example.com/", 200, SITE), ...overrides };
}

describe("evaluateChecks", () => {
  const cleanRobots = analyzeRobots("User-agent: *\nAllow: /");

  it("passes a healthy site", () => {
    const checks = evaluateChecks({
      homepageUrl: "https://example.com/",
      pages: [page({})],
      robots: cleanRobots,
      sitemapFound: true,
      brokenLinks: [],
    });
    expect(checks.filter((c) => c.status !== "pass" && c.status !== "not_checked").map((c) => c.id)).toEqual(["image_alt"]);
    // Nothing to compare against: honest not_checked instead of a pass (MO-03/MO-04).
    expect(checks.filter((c) => c.status === "not_checked").map((c) => c.id)).toEqual(["topic_coverage", "geo_compatibility"]);
    expect(scoreChecks(checks)).toBe(99);
  });

  it("flags broken links, missing titles and blocked AI crawlers", () => {
    const checks = evaluateChecks({
      homepageUrl: "http://example.com/",
      pages: [page({}), page({ url: "https://example.com/b", title: null, h1Count: 0 })],
      robots: analyzeRobots("User-agent: GPTBot\nDisallow: /"),
      sitemapFound: false,
      brokenLinks: [{ url: "https://example.com/old", status: 404, foundOn: "https://example.com/" }],
    });
    const byId = Object.fromEntries(checks.map((c) => [c.id, c]));
    expect(byId.https.status).toBe("fail");
    expect(byId.broken_links).toMatchObject({ status: "fail", count: 1 });
    expect(byId.page_titles).toMatchObject({ status: "fail", count: 1 });
    expect(byId.headings).toMatchObject({ status: "warning", affected: ["https://example.com/b"] });
    expect(byId.ai_crawlers).toMatchObject({ status: "warning", affected: ["GPTBot"] });
    expect(byId.sitemap.status).toBe("warning");
  });

  it("fails page errors when the homepage can't load", () => {
    const checks = evaluateChecks({
      homepageUrl: "https://example.com/",
      pages: [failedPage("https://example.com/", 500, null)],
      robots: cleanRobots,
      sitemapFound: true,
      brokenLinks: [],
    });
    expect(checks.find((c) => c.id === "page_errors")).toMatchObject({ status: "fail", impact: "high" });
  });

  it("evaluates topic coverage against tracked keywords", () => {
    const checks = evaluateChecks({
      homepageUrl: "https://example.com/",
      pages: [page({})],
      robots: cleanRobots,
      sitemapFound: true,
      brokenLinks: [],
      seoSetup: {
        trackedKeywords: ["emergency plumbers", "unrelated keyword query"],
      },
    });
    const topicCheck = checks.find((c) => c.id === "topic_coverage");
    expect(topicCheck).toBeDefined();
    expect(topicCheck?.detail.coveredKeywords).toEqual(["emergency plumbers"]);
    expect(topicCheck?.detail.missingKeywords).toEqual(["unrelated keyword query"]);
    expect(topicCheck?.status).toBe("warning");
  });

  it("evaluates regional and language compatibility against seoSetup", () => {
    const checks = evaluateChecks({
      homepageUrl: "https://example.com/",
      pages: [page({ htmlLang: "en" })],
      robots: cleanRobots,
      sitemapFound: true,
      brokenLinks: [],
      seoSetup: {
        targetCountry: "US",
        targetLanguage: "en",
      },
    });
    const geoCheck = checks.find((c) => c.id === "geo_compatibility");
    expect(geoCheck).toBeDefined();
    expect(geoCheck?.status).toBe("pass");
  });
});


describe("audits with missing pages", () => {
  const cleanRobots = analyzeRobots("User-agent: *\nAllow: /");
  const base = { homepageUrl: "https://example.com/", robots: cleanRobots, sitemapFound: true, brokenLinks: [] };

  it("never reports a per-page check as pass when no page loaded (blocked homepage)", () => {
    const checks = evaluateChecks({ ...base, pages: [failedPage("https://example.com/", 403, null)] });
    const perPage = ["indexable", "broken_links", "page_titles", "meta_descriptions", "headings", "structured_data", "answer_content", "image_alt", "mobile_viewport", "geo_compatibility", "page_errors"];
    for (const id of perPage) expect(checks.find((c) => c.id === id)?.status, id).toBe("not_checked");
    const coverage = computeCoverage([failedPage("https://example.com/", 403, null)]);
    expect(decideAuditStatus(coverage)).toBe("failed");
    expect(canScore(coverage)).toBe(false);
  });

  it("does not count VSI fetch failures as page errors", () => {
    const pages = [page({}), failedPage("https://example.com/slow", 0, "Timed out", "timeout"), failedPage("https://example.com/x", 0, "Address not found", "dns")];
    const pe = evaluateChecks({ ...base, pages }).find((c) => c.id === "page_errors")!;
    expect(pe).toMatchObject({ status: "pass", count: 0, total: 1 });
    expect(pe.detail).toMatchObject({ couldNotFetch: 2, auditStatus: "partial" });
  });

  it("evaluates per-page checks over loaded pages only and skips homepage checks when the homepage failed", () => {
    const pages = [failedPage("https://example.com/", 0, "Timed out", "timeout"), page({ url: "https://example.com/a", title: null })];
    const byId = Object.fromEntries(evaluateChecks({ ...base, pages, seoSetup: { targetLanguage: "en" } }).map((c) => [c.id, c]));
    expect(byId.page_titles).toMatchObject({ status: "fail", total: 1, affected: ["https://example.com/a"] });
    expect(byId.geo_compatibility.status).toBe("not_checked");
    expect(byId.indexable.status).toBe("not_checked");
    // Business markup found on another page is real evidence.
    expect(byId.structured_data.status).toBe("pass");
    const coverage = computeCoverage(pages);
    expect(decideAuditStatus(coverage)).toBe("partial");
    expect(canScore(coverage)).toBe(false);
  });

  it("gives not_checked no penalty and no credit", () => {
    const checks = evaluateChecks({ ...base, pages: [page({})] });
    const withNotChecked = checks.map((c) => (c.id === "image_alt" ? { ...c, status: "not_checked" as const } : c));
    expect(scoreChecks(withNotChecked)).toBe(100);
    expect(isAuditProblem({ status: "not_checked" })).toBe(false);
  });

  it("never turns a not_checked check into a Next Action", () => {
    const c = evaluateChecks({ ...base, pages: [failedPage("https://example.com/", 403, null)] }).find((x) => x.id === "page_titles")!;
    const f = auditFinding(c, "client-1");
    expect(f.draft).toBeNull();
    expect(f.tone).toBe("neutral");
    expect(auditPriority(c)).toBe(0);
    expect(checkHeadline(c)).toBe("Page titles: not checked");
    expect(checkEvidence(c)).toMatch(/couldn't load any pages/);
  });

  it("describes partial coverage and never praises an unscored or partial audit", () => {
    const pages = [page({}), failedPage("https://example.com/a", 0, "Timed out", "timeout")];
    const checks = evaluateChecks({ ...base, pages });
    expect(auditCoverage(checks)).toMatchObject({ status: "partial", pagesLoaded: 1, pagesAttempted: 2, couldNotFetch: 1 });
    expect(coverageNote(auditCoverage(checks))).toMatch(/1 of the 2 pages/);
    expect(auditConclusion(null, 0, 0)).toMatch(/no health score/);
    expect(auditConclusion(95, 0, 0, 2)).not.toMatch(/good shape/);
    expect(auditConclusion(90, 1, 0, 1)).not.toMatch(/good shape/);
  });

  it("classifies fetch errors", () => {
    expect(classifyFetchError(Object.assign(new Error("x"), { name: "TimeoutError" }))).toBe("timeout");
    expect(classifyFetchError(Object.assign(new Error("x"), { code: "ENOTFOUND" }))).toBe("dns");
    expect(classifyFetchError(Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }))).toBe("dns");
    expect(classifyFetchError(Object.assign(new Error("x"), { name: "UnsafeUrlError" }))).toBe("unsafe");
    expect(classifyFetchError(new TypeError("fetch failed"))).toBe("network");
  });
});
