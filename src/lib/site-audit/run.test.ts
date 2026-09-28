import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * runSiteAudit end to end with safeFetch mocked: no real network calls.
 * Each test registers per-URL responses; unknown URLs return 404.
 */
type Reply =
  | { status: number; body?: string; contentType?: string }
  | { throws: "timeout" | "dns" | "network" };

const replies = new Map<string, Reply>();

vi.mock("@/lib/net/safe-fetch", () => {
  class UnsafeUrlError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "UnsafeUrlError";
    }
  }
  return {
    UnsafeUrlError,
    safeFetch: vi.fn(async (url: string) => {
      const r = replies.get(url) ?? { status: 404, body: "", contentType: "text/html" };
      if ("throws" in r) {
        if (r.throws === "timeout") throw Object.assign(new Error("The operation timed out."), { name: "TimeoutError" });
        if (r.throws === "dns") throw Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });
        throw new TypeError("fetch failed");
      }
      return {
        url,
        status: r.status,
        ok: r.status >= 200 && r.status < 300,
        contentType: r.contentType ?? "text/html; charset=utf-8",
        body: r.body ?? "",
        truncated: false,
      };
    }),
  };
});

import { runSiteAudit } from "./run";
import { auditRowUpdate } from "./store";

const HOME = "https://example.com/";

function html(title: string, links: string[] = [], extraHead = "") {
  return `<!doctype html><html lang="en"><head><title>${title}</title>
<meta name="description" content="A perfectly reasonable description of this page that is long enough to pass.">
<meta name="viewport" content="width=device-width">${extraHead}
<script type="application/ld+json">{"@type":"LocalBusiness"}</script></head>
<body><h1>${title}</h1><h2>How does it work?</h2><h2>What does it cost?</h2>
${links.map((l) => `<a href="${l}">x</a>`).join("")}</body></html>`;
}

const sitemap = (urls: string[]) => `<urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`;

beforeEach(() => {
  replies.clear();
  replies.set("https://example.com/robots.txt", { status: 200, body: "User-agent: *\nAllow: /", contentType: "text/plain" });
});

describe("runSiteAudit outcome", () => {
  it("fails with no score and no passing checks when the homepage is blocked (403) and nothing else loads", async () => {
    replies.set(HOME, { status: 403, body: "Forbidden" });
    const out = await runSiteAudit("example.com");
    expect(out.status).toBe("failed");
    expect(out.score).toBeNull();
    expect(out.failure?.reason).toBe("blocked");
    expect(out.failure?.message).toMatch(/couldn't load any pages/i);
    expect(out.checks.some((c) => c.status === "pass")).toBe(false);
    expect(out.coverage).toMatchObject({ pagesLoaded: 0, blocked: 1, siteErrors: 0 });

    const row = auditRowUpdate(out);
    expect(row).toMatchObject({ status: "failed", score: null, checks: [] });
    expect(row.error_message).toMatch(/403/);
  });

  it("fails with a DNS reason when the site address can't be found", async () => {
    replies.set(HOME, { throws: "dns" });
    replies.set("http://example.com/", { throws: "dns" });
    const out = await runSiteAudit("example.com");
    expect(out).toMatchObject({ status: "failed", score: null, checks: [] });
    expect(out.failure?.reason).toBe("dns");
  });

  it("fails with a timeout reason when the homepage never answers", async () => {
    replies.set(HOME, { throws: "timeout" });
    replies.set("http://example.com/", { throws: "timeout" });
    const out = await runSiteAudit("example.com");
    expect(out.status).toBe("failed");
    expect(out.failure?.reason).toBe("timeout");
    expect(out.coverage.fetchFailures).toBe(1);
  });

  it("does not count VSI timeouts/network failures as the site's page errors", async () => {
    const others = ["a", "b", "c", "d", "e", "f"].map((p) => `https://example.com/${p}`);
    replies.set(HOME, { status: 200, body: html("Example home page title", others) });
    replies.set("https://example.com/sitemap.xml", { status: 200, body: sitemap(others), contentType: "application/xml" });
    for (const u of others.slice(0, 4)) replies.set(u, { status: 200, body: html(`Page ${u.slice(-1)} with a good title`) });
    replies.set(others[4], { throws: "timeout" });
    replies.set(others[5], { throws: "network" });

    const out = await runSiteAudit("example.com");
    const pageErrors = out.checks.find((c) => c.id === "page_errors")!;
    expect(pageErrors.status).toBe("pass");
    expect(pageErrors.count).toBe(0);
    expect(pageErrors.affected).not.toContain(others[4]);
    expect(pageErrors.detail.couldNotFetch).toBe(2);
    expect(out.coverage).toMatchObject({ fetchFailures: 2, siteErrors: 0, pagesLoaded: 5 });
    // 2 of 7 unreadable is below the partial threshold: still a normal, scored audit.
    expect(out.status).toBe("completed");
    expect(out.score).not.toBeNull();
  });

  it("counts real HTTP errors from the site as page errors", async () => {
    const others = ["https://example.com/gone"];
    replies.set(HOME, { status: 200, body: html("Example home page title", others) });
    replies.set(others[0], { status: 500 });
    const out = await runSiteAudit("example.com");
    const pageErrors = out.checks.find((c) => c.id === "page_errors")!;
    expect(pageErrors).toMatchObject({ status: "warning", count: 1, affected: others });
  });

  it("is partial when the homepage fails but other pages load: per-page checks use loaded pages only, homepage checks not_checked, no score", async () => {
    const others = ["https://example.com/a", "https://example.com/b"];
    replies.set(HOME, { status: 403, body: "Forbidden" });
    replies.set("https://example.com/sitemap.xml", { status: 200, body: sitemap(others), contentType: "application/xml" });
    replies.set(others[0], { status: 200, body: html("Page a with a good title") });
    replies.set(others[1], { status: 200, body: "<html><head></head><body>no title</body></html>" });

    const out = await runSiteAudit("example.com", { targetLanguage: "en" });
    expect(out.status).toBe("partial");
    expect(out.score).toBeNull();
    const byId = Object.fromEntries(out.checks.map((c) => [c.id, c]));
    expect(byId.page_titles).toMatchObject({ status: "fail", total: 2, affected: [others[1]] });
    expect(byId.geo_compatibility.status).toBe("not_checked");
    expect(byId.indexable.status).toBe("not_checked");
    // The 403 is a refusal, not a broken page.
    expect(byId.page_errors.affected).not.toContain(HOME);
    expect(byId.page_errors.detail.auditStatus).toBe("partial");

    const row = auditRowUpdate(out);
    expect(row).toMatchObject({ status: "completed", score: null });
  });

  it("is partial but still scored when the homepage loads and a large share of other pages time out", async () => {
    const others = ["a", "b", "c", "d"].map((p) => `https://example.com/${p}`);
    replies.set(HOME, { status: 200, body: html("Example home page title", others) });
    replies.set(others[0], { status: 200, body: html("Page a with a good title") });
    replies.set(others[1], { status: 200, body: html("Page b with a good title") });
    replies.set(others[2], { throws: "timeout" });
    replies.set(others[3], { throws: "timeout" });
    const out = await runSiteAudit("example.com");
    // 2 of 5 pages unreadable (>= 1/3) -> partial; 3 of 5 answered (>= 1/2) -> scored.
    expect(out.status).toBe("partial");
    expect(out.score).not.toBeNull();
  });

  it("leaves a normal healthy audit completed and scored", async () => {
    const others = ["https://example.com/a"];
    replies.set(HOME, { status: 200, body: html("Example home page title", others) });
    replies.set("https://example.com/sitemap.xml", { status: 200, body: sitemap(others), contentType: "application/xml" });
    replies.set(others[0], { status: 200, body: html("Page a with a good title") });
    const out = await runSiteAudit("example.com");
    expect(out.status).toBe("completed");
    expect(out.failure).toBeNull();
    expect(out.score).toBe(100);
    expect(out.checks.filter((c) => c.status === "fail" || c.status === "warning")).toEqual([]);
  });

  it("marks the crawler check not_checked when robots.txt times out", async () => {
    replies.set(HOME, { status: 200, body: html("Example home page title") });
    replies.set("https://example.com/robots.txt", { throws: "timeout" });
    const out = await runSiteAudit("example.com");
    expect(out.checks.find((c) => c.id === "ai_crawlers")?.status).toBe("not_checked");
  });
});
