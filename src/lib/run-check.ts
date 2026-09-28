import type { Location, RunCheckResult } from "@/types/search";
import { calculateVisibilityStatus } from "@/types/search";
import { normaliseDomain } from "@/lib/url-input";
import { fetchRank } from "@/lib/serper";
import { fetchAIO } from "@/lib/serpapi";
import { buildBrandTokens, matchesBrand } from "@/lib/brand-match";

export interface RunCheckInput {
  keyword: string;
  domain: string;
  brand: string;
  location: Location;
  language?: string;
  provider?: string;
  bypassCache?: boolean;
}

// In-memory cache with 1-hour TTL
interface CacheEntry {
  timestamp: number;
  data: RunCheckResult;
}

const cacheMap = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function buildCacheKey(input: RunCheckInput, normDomain: string, normBrand: string): string {
  const kw = input.keyword.trim().toLowerCase();
  const loc = input.location;
  const lang = (input.language || "en").toLowerCase();
  const prov = (input.provider || "default").toLowerCase();
  return `runcheck:${kw}:${normDomain}:${normBrand}:${loc}:${lang}:${prov}`;
}

export async function runCheckPipeline(input: RunCheckInput): Promise<RunCheckResult> {
  // 1. INPUT VALIDATION & NORMALIZATION
  const rawKw = input.keyword?.trim();
  const rawDomain = input.domain?.trim();
  const rawBrand = input.brand?.trim();
  const location = input.location;

  if (!rawKw) {
    throw new Error("Keyword parameter is required.");
  }
  if (!rawDomain) {
    throw new Error("Domain parameter is required.");
  }
  if (!location) {
    throw new Error("Location parameter is required.");
  }

  const normDomainObj = normaliseDomain(rawDomain);
  if (!normDomainObj) {
    throw new Error("Enter a valid domain like example.com");
  }
  const normDomain = normDomainObj.domain;

  const normBrand = (rawBrand || normDomainObj.stem).toLowerCase();
  const brandDisplay = rawBrand || normDomainObj.stem;

  // 10. CACHE LOOKUP
  const cacheKey = buildCacheKey(input, normDomain, normBrand);
  if (!input.bypassCache) {
    const cached = cacheMap.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log(`[RUN_CHECK_PIPELINE] Cache HIT for key: "${cacheKey}"`);
      return cached.data;
    }
  }

  console.log(`[RUN_CHECK_PIPELINE] Running check for:`, {
    keyword: rawKw,
    rawDomain,
    normDomain,
    brandDisplay,
    location,
  });

  // 2. GOOGLE / SERP DATA & AI VISIBILITY FETCHING
  const [serp, aio] = await Promise.all([
    fetchRank(rawKw, normDomain, location, brandDisplay),
    fetchAIO(rawKw, normDomain, brandDisplay, location),
  ]);

  const googleRank = serp.position ?? null;
  const organicResultsCount = serp.organicResults?.length ?? 0;

  console.log(`[RUN_CHECK_PIPELINE] Google SERP result count: ${organicResultsCount}, extracted client rank: ${googleRank}`);

  // 3. AI VISIBILITY DETECTION (Mentioned vs Cited evaluated independently)
  const aioPresent = !!aio.aioPresent;
  const aioFullText = aio.aioFullText || aio.aioSnippet || "";
  
  // Mention detection: Brand name in AI response text (case-insensitive)
  const brandTokens = buildBrandTokens({ brand: brandDisplay, domain: normDomain });
  const brandMentioned = aioPresent && aioFullText ? matchesBrand(aioFullText, brandTokens) : false;

  // Citation detection: Does any citation URL belong to the client domain?
  const isDomainMatch = (d: string) => {
    const cleanD = (d || "").toLowerCase().replace(/^www\./, "");
    return cleanD === normDomain || cleanD.endsWith(`.${normDomain}`) || normDomain.endsWith(`.${cleanD}`);
  };

  const clientCitation = aio.citations.find((c) => isDomainMatch(c.domain) || isDomainMatch(c.url));
  const brandCited = aioPresent && !!clientCitation;
  const clientCitationPosition = clientCitation?.position ?? null;

  console.log(`[RUN_CHECK_PIPELINE] AI Visibility: aioPresent=${aioPresent}, brandMentioned=${brandMentioned}, brandCited=${brandCited}, clientCitationPosition=${clientCitationPosition}`);

  // 4. COMPETITOR EXTRACTION & DEDUPLICATION
  const competitorDomainSet = new Set<string>();
  
  // Extract domains from organic SERP results
  for (const org of serp.organicResults || []) {
    const d = normaliseDomain(org.url || org.domain)?.domain || org.domain?.toLowerCase().replace(/^www\./, "");
    if (d && !isDomainMatch(d)) {
      competitorDomainSet.add(d);
    }
  }

  // Extract domains from AI citations
  for (const cit of aio.citations || []) {
    const d = normaliseDomain(cit.url || cit.domain)?.domain || cit.domain?.toLowerCase().replace(/^www\./, "");
    if (d && !isDomainMatch(d)) {
      competitorDomainSet.add(d);
    }
  }

  const uniqueCompetitorDomains = Array.from(competitorDomainSet);
  const uniqueCompetitorsCount = uniqueCompetitorDomains.length;
  const totalCitationsCount = aio.citations?.length ?? 0;

  console.log(`[RUN_CHECK_PIPELINE] Competitors extracted: uniqueCompetitorsCount=${uniqueCompetitorsCount}, totalCitationsCount=${totalCitationsCount}`);

  // 5. STATUS LOGIC (Deterministic single function)
  const status = calculateVisibilityStatus(googleRank, brandMentioned, brandCited);
  console.log(`[RUN_CHECK_PIPELINE] Final visibility status: ${status.label} ("${status.title}")`);

  // 6. RANK-TO-CITATION GAP (Only calculated when BOTH googleRank and citationPosition are available)
  const clientR2CGap = (googleRank !== null && clientCitationPosition !== null)
    ? googleRank - clientCitationPosition
    : null;

  // 7. DATA SOURCE IDENTIFICATION
  // Placeholder data exists only with VSI_ALLOW_DEMO_DATA in development; the
  // provider clients mark it explicitly.
  const isDemo = serp.isDemo === true || aio.isDemo === true;
  const dataSource = isDemo ? "Demo Data" : "Live SERP & AI Overview Data";

  const result: RunCheckResult = {
    keyword: rawKw,
    domain: normDomain,
    brand: brandDisplay,
    location,
    timestamp: new Date().toISOString(),
    dataSource,
    isDemo,

    googleRank,
    googleRankingUrl: serp.rankingUrl ?? null,
    googleRankingTitle: serp.rankingTitle ?? null,
    organicResults: serp.organicResults ?? [],
    serpFeatures: serp.serpFeatures ?? [],

    aioPresent,
    aioSnippet: aio.aioSnippet ?? null,
    aioFullText: aio.aioFullText ?? null,
    aioBlocks: aio.aioBlocks ?? [],
    citations: aio.citations ?? [],

    brandMentioned,
    brandCited,

    uniqueCompetitorsCount,
    totalCitationsCount,
    uniqueCompetitorDomains,

    clientCitationPosition,
    clientR2CGap,

    status,

    serp: {
      ...serp,
      domain: normDomain,
      position: googleRank,
    },
    aio: {
      ...aio,
      domain: normDomain,
      brand: brandDisplay,
      clientCited: brandCited,
      mentionedInText: brandMentioned,
    },
  };

  // Cache result
  cacheMap.set(cacheKey, { timestamp: Date.now(), data: result });

  return result;
}
