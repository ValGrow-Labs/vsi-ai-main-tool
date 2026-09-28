import "server-only";
import { assertPublicUrl, safeFetch } from "@/lib/net/safe-fetch";

export interface FirecrawlResult {
  markdown: string;
  title: string | null;
  description: string | null;
  url: string;
  wordCount: number;
  source: "firecrawl" | "fallback";
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

function htmlToMarkdown(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
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
    userAgent: "Mozilla/5.0 (compatible; VSI/1.0)",
    accept: "text/html",
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = res.body;
  const markdown = htmlToMarkdown(html);

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);

  return {
    markdown: markdown.slice(0, 8000),
    title: titleMatch?.[1]?.trim() ?? null,
    description: descMatch?.[1]?.trim() ?? null,
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

