import "server-only";
import { assertPublicUrl, AUDIT_USER_AGENT, safeFetch } from "@/lib/net/safe-fetch";

export interface FirecrawlResult {
  markdown: string;
  title: string | null;
  description: string | null;
  url: string;
  wordCount: number;
  source: "firecrawl" | "fallback";
}

export interface EnrichedWebsiteScrape {
  domain: string;
  url: string;
  title: string | null;
  description: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogSiteName: string | null;
  headings: string[];
  markdown: string;
  aboutMarkdown: string | null;
  sitemapUrl: string | null;
  wordCount: number;
  isThinContent: boolean;
}

async function scrapeWithFirecrawl(url: string): Promise<FirecrawlResult> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) throw new Error("No Firecrawl key");

  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: true,
      timeout: 30000,
      waitFor: 1000,
    }),
    signal: AbortSignal.timeout(35000),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `Firecrawl ${res.status}`);
  }

  const data = await res.json();
  if (!data.success) throw new Error(data.error ?? "Scrape failed");

  const markdown: string = data.data?.markdown ?? "";
  const metadata = data.data?.metadata ?? {};

  return {
    markdown,
    title: metadata.title ?? null,
    description: metadata.description ?? null,
    url: metadata.url ?? url,
    wordCount: markdown.split(/\s+/).filter(Boolean).length,
    source: "firecrawl",
  };
}

export function extractHtmlMetadata(html: string): {
  title: string | null;
  description: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogSiteName: string | null;
  headings: string[];
} {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const descMatch =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const ogDescMatch =
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);
  const ogTitleMatch =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  const ogSiteNameMatch =
    html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i);

  const headings: string[] = [];
  const headingRe = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = headingRe.exec(html)) !== null && headings.length < 15) {
    const text = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text && text.length > 2 && text.length < 120 && !headings.includes(text)) {
      headings.push(text);
    }
  }

  return {
    title: titleMatch?.[1]?.trim() ?? null,
    description: descMatch?.[1]?.trim() ?? ogDescMatch?.[1]?.trim() ?? null,
    ogTitle: ogTitleMatch?.[1]?.trim() ?? null,
    ogDescription: ogDescMatch?.[1]?.trim() ?? null,
    ogSiteName: ogSiteNameMatch?.[1]?.trim() ?? null,
    headings,
  };
}

function htmlToMarkdown(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, l, t) => `${"#".repeat(Number(l))} ${t.replace(/<[^>]+>/g, "").trim()}\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `- ${t.replace(/<[^>]+>/g, "").trim()}\n`)
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, (_, t) => `${t.replace(/<[^>]+>/g, "").trim()}\n\n`)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function scrapeWithFallback(url: string): Promise<FirecrawlResult> {
  // Public hosts only, pinned to the vetted IP, every redirect re-checked, 12s / 2 MB caps.
  const res = await safeFetch(url, {
    timeoutMs: 12000,
    maxBytes: 2_000_000,
    userAgent: AUDIT_USER_AGENT,
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  });

  const html = res.body || "";
  const meta = extractHtmlMetadata(html);
  const markdown = htmlToMarkdown(html);

  // If HTTP not ok, but we extracted a title or description, treat it as thin content instead of hard failure
  if (!res.ok) {
    if (meta.title || meta.description) {
      return {
        markdown: markdown.slice(0, 8000),
        title: meta.title,
        description: meta.description,
        url: res.url,
        wordCount: markdown.split(/\s+/).filter(Boolean).length,
        source: "fallback",
      };
    }
    throw new Error(`HTTP ${res.status}`);
  }

  return {
    markdown: markdown.slice(0, 8000),
    title: meta.title,
    description: meta.description,
    url: res.url,
    wordCount: markdown.split(/\s+/).filter(Boolean).length,
    source: "fallback",
  };
}

/**
 * Scrape one user- or third-party-supplied URL. The URL must pass the outbound policy (public
 * hosts only; see src/lib/net/safe-fetch.ts) BEFORE anything happens: we never ask Firecrawl to
 * fetch an internal address, and the fallback fetch goes through safeFetch. An UnsafeUrlError is
 * thrown straight to the caller (no fallback attempt).
 */
export async function scrapeUrl(url: string): Promise<FirecrawlResult> {
  const vetted = (await assertPublicUrl(url)).toString();
  try {
    return await scrapeWithFirecrawl(vetted);
  } catch {
    // Firecrawl timed out or failed — use HTML fallback
    return await scrapeWithFallback(vetted);
  }
}

/**
 * Scrape multiple URLs in parallel, returning one result per URL.
 * Failed scrapes are included as { markdown: "", source: "fallback", ... }
 * so the caller can decide how to handle partial data.
 */
export async function scrapeUrlsBatch(
  urls: string[],
  opts: { concurrency?: number } = {}
): Promise<FirecrawlResult[]> {
  const concurrency = Math.min(opts.concurrency ?? 3, 5);
  const results: FirecrawlResult[] = new Array(urls.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const i = nextIndex++;
      if (i >= urls.length) return;
      try {
        results[i] = await scrapeUrl(urls[i]);
      } catch (e) {
        results[i] = {
          markdown: "",
          title: null,
          description: e instanceof Error ? e.message : "scrape failed",
          url: urls[i],
          wordCount: 0,
          source: "fallback",
        };
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);
  return results;
}

/**
 * Scrapes a website for onboarding analysis:
 * 1. Scrapes the homepage (extracting title, meta description, OG tags, headings, visible text).
 * 2. Attempts to scrape /about or /about-us if available.
 * 3. Checks for sitemap.xml.
 * 4. Flags thin content (bot-blocking or client-only JS) so the LLM prompt can compensate.
 */
export async function scrapeWebsiteForAnalysis(domain: string): Promise<EnrichedWebsiteScrape> {
  const normDomain = domain.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const homeUrl = `https://${normDomain}`;
  const homeVetted = (await assertPublicUrl(homeUrl)).toString();

  // 1. Fetch homepage
  let homeRes: FirecrawlResult;
  try {
    homeRes = await scrapeUrl(homeVetted);
  } catch (err) {
    if (err instanceof Error && err.name === "UnsafeUrlError") {
      throw err;
    }
    homeRes = {
      markdown: "",
      title: null,
      description: null,
      url: homeUrl,
      wordCount: 0,
      source: "fallback",
    };
  }

  // 2. Fetch /about or /about-us in parallel with sitemap check (best-effort, short timeout)
  let aboutMarkdown: string | null = null;
  let sitemapUrl: string | null = null;

  const aboutCandidates = [`https://${normDomain}/about`, `https://${normDomain}/about-us`];
  const sitemapCandidates = [`https://${normDomain}/sitemap.xml`];

  const [aboutResult, sitemapResult] = await Promise.allSettled([
    (async () => {
      for (const candidate of aboutCandidates) {
        try {
          const res = await safeFetch(candidate, {
            timeoutMs: 6000,
            maxBytes: 500_000,
            userAgent: AUDIT_USER_AGENT,
          });
          if (res.ok && res.body) {
            const md = htmlToMarkdown(res.body);
            if (md && md.length > 50) return md.slice(0, 3000);
          }
        } catch {
          // ignore candidate failure
        }
      }
      return null;
    })(),
    (async () => {
      for (const candidate of sitemapCandidates) {
        try {
          const res = await safeFetch(candidate, {
            method: "HEAD",
            timeoutMs: 4000,
            userAgent: AUDIT_USER_AGENT,
          });
          if (res.ok || res.status === 200 || res.status === 304) {
            return candidate;
          }
        } catch {
          // ignore
        }
      }
      return null;
    })(),
  ]);

  if (aboutResult.status === "fulfilled" && aboutResult.value) {
    aboutMarkdown = aboutResult.value;
  }
  if (sitemapResult.status === "fulfilled" && sitemapResult.value) {
    sitemapUrl = sitemapResult.value;
  }

  const wordCount = homeRes.wordCount + (aboutMarkdown ? aboutMarkdown.split(/\s+/).filter(Boolean).length : 0);
  const isThinContent = wordCount < 50;

  return {
    domain: normDomain,
    url: homeUrl,
    title: homeRes.title,
    description: homeRes.description,
    ogTitle: null,
    ogDescription: null,
    ogSiteName: null,
    headings: [],
    markdown: homeRes.markdown,
    aboutMarkdown,
    sitemapUrl,
    wordCount,
    isThinContent,
  };
}

