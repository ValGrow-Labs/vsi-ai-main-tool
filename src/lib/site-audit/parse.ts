import { parse } from "node-html-parser";
import type { FetchFailureKind, PageFacts } from "./types";

const QUESTION_START = /^(how|what|why|when|where|who|which|can|do|does|is|are|should|will)\b/i;
const SKIP_LINK = /\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4|mp3|docx?|xlsx?|pptx?)(\?|$)/i;

function collectJsonLdTypes(raw: string, out: Set<string>) {
  try {
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === "object") {
        const obj = node as Record<string, unknown>;
        const t = obj["@type"];
        if (typeof t === "string") out.add(t);
        if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && out.add(x));
        if (obj["@graph"]) walk(obj["@graph"]);
      }
    };
    walk(JSON.parse(raw));
  } catch {
    /* malformed JSON-LD is treated as absent */
  }
}

/** Same-site link normalisation: absolute URL without hash, or null if external. */
export function toInternalUrl(href: string, pageUrl: string, siteHost: string): string | null {
  if (!href || href.startsWith("#") || /^(mailto|tel|javascript|data):/i.test(href)) return null;
  let u: URL;
  try {
    u = new URL(href, pageUrl);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\./, "");
  if (host !== siteHost) return null;
  if (SKIP_LINK.test(u.pathname)) return null;
  u.hash = "";
  return u.toString();
}

export function parsePage(html: string, url: string, status: number, siteHost: string, responseTimeMs = 0): PageFacts {
  const root = parse(html, { comment: false, blockTextElements: { script: true, style: true, noscript: false, pre: true } });

  const htmlLang = root.querySelector("html")?.getAttribute("lang")?.trim() || null;
  const canonical = root.querySelector('link[rel="canonical"]')?.getAttribute("href")?.trim() || null;

  const hreflangs: Array<{ lang: string; href: string }> = [];
  root.querySelectorAll('link[rel="alternate"][hreflang]').forEach((link) => {
    const lang = link.getAttribute("hreflang")?.trim();
    const href = link.getAttribute("href")?.trim();
    if (lang && href) hreflangs.push({ lang, href });
  });

  const title = root.querySelector("title")?.text.trim() || null;
  const metaDescription = root.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() || null;
  const robotsMeta = (root.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "").toLowerCase();
  const hasViewport = !!root.querySelector('meta[name="viewport"]');

  const headings = root.querySelectorAll("h1, h2, h3, h4");
  const h1Elements = root.querySelectorAll("h1");
  const h1Count = h1Elements.length;
  const h1Texts = h1Elements.map((h) => h.text.trim()).filter(Boolean);
  const headingTexts = headings.map((h) => h.text.trim()).filter(Boolean).slice(0, 30);

  const questionHeadings = headings.filter((h) => {
    const text = h.text.trim();
    return text.endsWith("?") || QUESTION_START.test(text);
  }).length;

  const types = new Set<string>();
  root.querySelectorAll('script[type="application/ld+json"]').forEach((s) => collectJsonLdTypes(s.rawText, types));

  const images = root.querySelectorAll("img");
  const imagesMissingAlt = images.filter((img) => {
    const alt = img.getAttribute("alt");
    return alt === undefined || alt === null;
  }).length;

  const links = new Set<string>();
  root.querySelectorAll("a[href]").forEach((a) => {
    const internal = toInternalUrl(a.getAttribute("href") ?? "", url, siteHost);
    if (internal) links.add(internal);
  });

  const bodyText = root.querySelector("body")?.structuredText ?? "";
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
  const bodyTextSample = bodyText.slice(0, 3000);

  return {
    url,
    status,
    fetchError: null,
    fetchErrorKind: null,
    isHtml: true,
    title,
    metaDescription,
    h1Count,
    headingCount: headings.length,
    questionHeadings,
    hasViewport,
    noindex: robotsMeta.includes("noindex"),
    jsonLdTypes: [...types],
    imagesTotal: images.length,
    imagesMissingAlt,
    internalLinks: [...links].slice(0, 150),
    wordCount,
    htmlLang,
    canonical,
    hreflangs,
    h1Texts,
    headingTexts,
    bodyTextSample,
    responseTimeMs,
  };
}

export function failedPage(url: string, status: number, fetchError: string | null, fetchErrorKind: FetchFailureKind | null = null): PageFacts {
  return {
    url,
    status,
    fetchError,
    fetchErrorKind: fetchError ? (fetchErrorKind ?? "network") : null,
    isHtml: false,
    title: null,
    metaDescription: null,
    h1Count: 0,
    headingCount: 0,
    questionHeadings: 0,
    hasViewport: false,
    noindex: false,
    jsonLdTypes: [],
    imagesTotal: 0,
    imagesMissingAlt: 0,
    internalLinks: [],
    wordCount: 0,
    htmlLang: null,
    canonical: null,
    hreflangs: [],
    h1Texts: [],
    headingTexts: [],
    bodyTextSample: "",
    responseTimeMs: 0,
  };
}


/** <loc> entries from a sitemap or sitemap index. */
export function parseSitemap(xml: string): { urls: string[]; childSitemaps: string[] } {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
  const isIndex = /<sitemapindex/i.test(xml);
  return isIndex ? { urls: [], childSitemaps: locs } : { urls: locs, childSitemaps: [] };
}
