import type { AIOResult, AIOCitation, AIOTextBlock, Location } from "@/types/search";
import { LOCATIONS, detectPlatform } from "@/types/search";
import { buildBrandTokens, matchesBrand } from "@/lib/brand-match";
import { hostMatchesDomain } from "@/lib/url-input";
import { ProviderUnavailableError, demoDataAllowed, serpApiKey } from "@/lib/provider-status";
import { demoAIO } from "@/lib/demo-data";

// ─────────────────────────────────────────
// SerpApi response shape (engine=google + engine=google_ai_overview)
// ─────────────────────────────────────────

interface SerpApiTextBlock {
  type: "paragraph" | "heading" | "list" | "expandable" | "table" | "code_block" | string;
  snippet?: string;
  reference_indexes?: number[];
  list?: SerpApiTextBlock[];        // child blocks for list / expandable
  table?: string[][];               // 2D array of cells for tables in the AI answer
  code?: string;                    // for code_block
  language?: string;                // for code_block
  title?: string;
}

interface SerpApiReference {
  index: number;
  title?: string;
  link: string;
  snippet?: string;
  source?: string;
}

interface SerpApiAIOverview {
  text_blocks?: SerpApiTextBlock[];
  references?: SerpApiReference[];
  page_token?: string;              // present when AIO must be fetched in a follow-up call
  thumbnail?: string;
  error?: string;
}


// ─────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Flatten SerpApi text_blocks into plain text + structured UI blocks. */
function buildTextOutputs(blocks: SerpApiTextBlock[]): {
  snippet: string | null;
  fullText: string | null;
  uiBlocks: AIOTextBlock[];
} {
  const uiBlocks: AIOTextBlock[] = [];
  const allParts: string[] = [];

  function walk(block: SerpApiTextBlock) {
    if (block.type === "paragraph" || block.type === "heading") {
      const text = block.snippet?.trim();
      if (text) {
        uiBlocks.push({ type: "paragraph", snippet: text });
        allParts.push(text);
      }
    } else if (block.type === "list") {
      const listItems: string[] = [];
      for (const item of block.list ?? []) {
        const text = item.snippet?.trim();
        if (text) listItems.push(text);
      }
      if (listItems.length) {
        uiBlocks.push({ type: "list", list: listItems.map((s) => ({ snippet: s })) });
        allParts.push(...listItems);
      }
    } else if (block.type === "table" && block.table) {
      // Flatten table rows into readable lines: "Col1: val1 · Col2: val2"
      const [header, ...rows] = block.table;
      if (header && rows.length) {
        const lines = rows.map((row) =>
          row.map((cell, i) => `${header[i] ?? ""}: ${cell}`).filter((x) => x.trim()).join(" · ")
        ).filter((l) => l.trim());
        if (lines.length) {
          uiBlocks.push({ type: "list", list: lines.map((s) => ({ snippet: s })) });
          allParts.push(...lines);
        }
      }
    } else if (block.type === "code_block" && block.code) {
      const text = block.code.trim();
      if (text) {
        uiBlocks.push({ type: "paragraph", snippet: text });
        allParts.push(text);
      }
    } else if (block.type === "expandable" && block.list) {
      for (const child of block.list) walk(child);
    }
  }

  for (const block of blocks) walk(block);

  const fullText = allParts.join("\n").trim() || null;
  const snippet = allParts.join(" ").slice(0, 500).trim() || null;
  return { snippet, fullText, uiBlocks };
}

/**
 * Google AI Overview via SerpAPI.
 *
 * Calls SerpAPI `engine=google` for the query and reads the response's
 * `ai_overview` block (Google's AI Overview). When Google returns only a
 * `page_token`, a follow-up `engine=google_ai_overview` call fetches the
 * block. This is NOT Google AI Mode (`engine=google_ai_mode`), which VSI
 * does not call. Engine id / label: see src/lib/ai-engines.ts.
 */
async function fetchAIORaw(
  keyword: string,
  loc: typeof LOCATIONS[Location],
  key: string,
): Promise<SerpApiAIOverview | null> {
  const params = new URLSearchParams({
    engine: "google",
    q: keyword,
    gl: loc.gl,
    hl: loc.hl,
    location: loc.location,
    api_key: key,
  });
  const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
    signal: AbortSignal.timeout(30000),
  });
  if (res.status === 401 || res.status === 403) {
    throw new ProviderUnavailableError("serpapi", "PROVIDER_AUTH_FAILED", "SerpAPI authentication error (Invalid or unauthorized API key)");
  }
  if (res.status === 429) {
    throw new ProviderUnavailableError("serpapi", "PROVIDER_RATE_LIMITED", "SerpAPI rate limit exceeded");
  }
  if (!res.ok) throw new ProviderUnavailableError("serpapi", "PROVIDER_ERROR", `SerpApi HTTP status ${res.status}`);

  const raw = (await res.json().catch(() => {
    throw new ProviderUnavailableError("serpapi", "INVALID_RESPONSE", "SerpAPI returned invalid JSON");
  })) as {
    ai_overview?: {
      text_blocks?: SerpApiTextBlock[];
      references?: SerpApiReference[];
      page_token?: string;
    };
    text_blocks?: SerpApiTextBlock[];
    references?: SerpApiReference[];
    error?: string;
    search_metadata?: { status?: string };
  };

  if (raw.error) {
    if (typeof raw.error === "string" && (raw.error.includes("Invalid API key") || raw.error.includes("api_key"))) {
      throw new ProviderUnavailableError("serpapi", "PROVIDER_AUTH_FAILED", "SerpAPI authentication error (Invalid or unauthorized API key)");
    }
    // Google genuinely produced no AI answer: a real "no answer" result.
    if (typeof raw.error === "string" && (raw.error.toLowerCase().includes("has not produced") || raw.error.toLowerCase().includes("no results"))) {
      return null;
    }
    throw new ProviderUnavailableError("serpapi", "PROVIDER_ERROR", `SerpApi error: ${raw.error}`);
  }
  if (raw.search_metadata?.status === "Error") throw new ProviderUnavailableError("serpapi", "PROVIDER_ERROR", "SerpApi search status=Error");

  let aiOverview = raw.ai_overview;

  if (aiOverview?.page_token && (!aiOverview.text_blocks?.length && !aiOverview.references?.length)) {
    try {
      const pageTokenParams = new URLSearchParams({
        engine: "google_ai_overview",
        page_token: aiOverview.page_token,
        api_key: key,
      });
      const res2 = await fetch(`https://serpapi.com/search.json?${pageTokenParams.toString()}`, {
        signal: AbortSignal.timeout(30000),
      });
      if (res2.ok) {
        const raw2 = (await res2.json()) as {
          ai_overview?: { text_blocks?: SerpApiTextBlock[]; references?: SerpApiReference[] };
          text_blocks?: SerpApiTextBlock[];
          references?: SerpApiReference[];
        };
        aiOverview = {
          text_blocks: raw2.ai_overview?.text_blocks ?? raw2.text_blocks,
          references: raw2.ai_overview?.references ?? raw2.references,
        };
      }
    } catch {
      // Ignore page_token fetch error and fallback to initial data
    }
  }

  const text_blocks = aiOverview?.text_blocks ?? raw.text_blocks;
  const references = aiOverview?.references ?? raw.references;

  if (!text_blocks?.length && !references?.length) return null;

  return {
    text_blocks,
    references,
  };
}

// ─────────────────────────────────────────
// Main AIO fetcher
// ─────────────────────────────────────────

export async function fetchAIO(
  keyword: string,
  domain: string,
  brand: string,
  location: Location
): Promise<AIOResult> {
  const key = serpApiKey();
  const cleanDomain = (domain ?? "")
    .toLowerCase()
    .replace(/^[a-z]+:\/+/, "")
    .replace(/^www\./, "")
    .split(/[\/?#]/)[0]
    .replace(/:\d+$/, "");
  // An invalid domain can never be "cited": no fallback domain is substituted.
  const validClientDomain = cleanDomain.includes(".") && /[a-z]/.test(cleanDomain) ? cleanDomain : "";

  if (!key) {
    if (demoDataAllowed()) return demoAIO(keyword, domain, brand, location);
    throw new ProviderUnavailableError("serpapi", "PROVIDER_NOT_CONFIGURED", "Google AI answers need SERPAPI_KEY.");
  }

  const loc = LOCATIONS[location];

  const aio = await fetchAIORaw(keyword, loc, key);

  const aioPresent = !!aio && (
    (aio.text_blocks?.length ?? 0) > 0 ||
    (aio.references?.length ?? 0) > 0
  );

  let aioSnippet: string | null = null;
  let aioFullText: string | null = null;
  let aioBlocks: AIOTextBlock[] = [];

  if (aio?.text_blocks?.length) {
    const out = buildTextOutputs(aio.text_blocks);
    aioSnippet = out.snippet;
    aioFullText = out.fullText;
    aioBlocks = out.uiBlocks;
  }

  // Citations from `references`
  const citations: AIOCitation[] = (aio?.references ?? [])
    .slice()
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((ref, i) => {
      const citDomain = extractDomain(ref.link);
      const isClient = !!validClientDomain && hostMatchesDomain(citDomain, validClientDomain);
      return {
        position: i + 1,
        sourceName: ref.source ?? citDomain,
        title: ref.title ?? null,
        domain: citDomain,
        url: ref.link,
        isClient,
        platform: detectPlatform(citDomain, cleanDomain),
      };
    });

  const brandTokens = buildBrandTokens({ brand, domain });
  const mentionedInText = aioFullText ? matchesBrand(aioFullText, brandTokens) : false;

  const citedDomains = citations.map((c) => c.domain);
  const clientCited = citations.some((c) => c.isClient);

  return {
    keyword,
    domain,
    brand,
    location,
    aioPresent,
    aioSnippet,
    aioFullText,
    aioBlocks,
    citations,
    citedDomains,
    clientCited,
    mentionedInText,
    // SerpAPI engine=google returns Google's AI Overview block for the query.
    engine: "google_ai_overview",
    provider: "serpapi",
  };
}

