import type { SerpResult, OrganicResult, Location } from "@/types/search";
import { LOCATIONS, detectPlatform } from "@/types/search";
import { hostMatchesDomain } from "@/lib/url-input";
import { ProviderUnavailableError, demoDataAllowed, serpApiKey, serperKey } from "@/lib/provider-status";
import { demoOrganicResults } from "@/lib/demo-data";

interface SerperOrganicResult {
  position: number;
  title: string;
  link: string;
  snippet?: string;
}

interface SerperResponse {
  organic?: SerperOrganicResult[];
  knowledgeGraph?: object;
  answerBox?: object;
  peopleAlsoAsk?: object[];
  topStories?: object[];
  images?: object[];
  videos?: object[];
  /** Which provider answered. */
  provider: "serper" | "serpapi" | "demo";
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function detectSerpFeatures(raw: SerperResponse): string[] {
  const features: string[] = [];
  if (raw.knowledgeGraph) features.push("knowledge_graph");
  if (raw.answerBox) features.push("answer_box");
  if (raw.peopleAlsoAsk?.length) features.push("people_also_ask");
  if (raw.topStories?.length) features.push("top_stories");
  if (raw.images?.length) features.push("images");
  if (raw.videos?.length) features.push("videos");
  return features;
}

export interface DomainRank {
  domain: string;
  position: number | null;
  url: string | null;
  title: string | null;
}

/**
 * Google organic results. Serper.dev when a distinct Serper key is set, with
 * SerpAPI as a real second provider. Throws ProviderUnavailableError when no
 * provider is configured or every configured provider failed — never returns
 * invented results (placeholder data only with VSI_ALLOW_DEMO_DATA in dev).
 */
async function fetchOrganicResults(keyword: string, loc: typeof LOCATIONS[Location]): Promise<SerperResponse> {
  const serper = serperKey();
  const serpapi = serpApiKey();

  if (!serper && !serpapi) {
    if (demoDataAllowed()) {
      return {
        provider: "demo",
        organic: demoOrganicResults(keyword).map((r) => ({ position: r.position, title: r.title, link: r.url, snippet: r.snippet ?? "" })),
      };
    }
    throw new ProviderUnavailableError("search", "PROVIDER_NOT_CONFIGURED", "No search provider is configured (SERPAPI_KEY or SERPER_API_KEY).");
  }

  if (serper) {
    try {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": serper, "Content-Type": "application/json" },
        body: JSON.stringify({ q: keyword, gl: loc.gl, hl: loc.hl, location: loc.location, num: 100 }),
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 401 || res.status === 403) throw new ProviderUnavailableError("serper", "PROVIDER_AUTH_FAILED");
      if (res.status === 429) throw new ProviderUnavailableError("serper", "PROVIDER_RATE_LIMITED");
      if (!res.ok) throw new ProviderUnavailableError("serper", "PROVIDER_ERROR", `Serper HTTP status ${res.status}`);
      const data = (await res.json()) as Omit<SerperResponse, "provider">;
      if (!Array.isArray(data.organic)) throw new ProviderUnavailableError("serper", "INVALID_RESPONSE", "Serper response has no organic results list");
      return { ...data, provider: "serper" };
    } catch (err) {
      if (!serpapi) throw err instanceof ProviderUnavailableError ? err : new ProviderUnavailableError("serper", "PROVIDER_ERROR", String(err));
      // Fall through to SerpAPI, a real second provider.
    }
  }

  const searchParams = new URLSearchParams({
    engine: "google",
    q: keyword,
    gl: loc.gl,
    hl: loc.hl,
    num: "100",
    api_key: serpapi as string,
  });
  if (loc.location) searchParams.set("location", loc.location);

  const res = await fetch(`https://serpapi.com/search.json?${searchParams.toString()}`, { signal: AbortSignal.timeout(20000) });
  if (res.status === 401 || res.status === 403) throw new ProviderUnavailableError("serpapi", "PROVIDER_AUTH_FAILED", "SerpAPI authentication error (Invalid or unauthorized API key)");
  if (res.status === 429) throw new ProviderUnavailableError("serpapi", "PROVIDER_RATE_LIMITED", "SerpAPI rate limit exceeded");
  if (!res.ok) throw new ProviderUnavailableError("serpapi", "PROVIDER_ERROR", `SerpApi HTTP status ${res.status}`);

  let data: {
    organic_results?: Array<{ position?: number; title?: string; link?: string; snippet?: string }>;
    knowledge_graph?: object;
    answer_box?: object;
    related_questions?: object[];
    error?: string;
  };
  try {
    data = await res.json();
  } catch {
    throw new ProviderUnavailableError("serpapi", "INVALID_RESPONSE", "SerpAPI returned invalid JSON");
  }
  if (data.error) {
    // Google genuinely had no results for this query: a real, empty result.
    if (/hasn't returned any results|has not returned any results/i.test(data.error)) return { provider: "serpapi", organic: [] };
    throw new ProviderUnavailableError("serpapi", "PROVIDER_ERROR", `SerpApi error: ${data.error}`);
  }
  if (!Array.isArray(data.organic_results)) {
    throw new ProviderUnavailableError("serpapi", "INVALID_RESPONSE", "SerpAPI response has no organic results list");
  }

  const organic: SerperOrganicResult[] = data.organic_results.map((r, idx) => ({
    position: r.position ?? idx + 1,
    title: r.title ?? "",
    link: r.link ?? "",
    snippet: r.snippet ?? "",
  }));

  return {
    provider: "serpapi",
    organic,
    knowledgeGraph: data.knowledge_graph,
    answerBox: data.answer_box,
    peopleAlsoAsk: data.related_questions,
  };
}

export async function fetchBulkRanks(
  keyword: string,
  domains: string[],
  location: Location
): Promise<DomainRank[]> {
  const loc = LOCATIONS[location];
  const raw = await fetchOrganicResults(keyword, loc);
  if (raw.provider === "demo") throw new ProviderUnavailableError("search", "PROVIDER_NOT_CONFIGURED", "Bulk ranks need a real search provider.");
  const organic = raw.organic ?? [];

  return domains.map((domain) => {
    const match = organic.find((r) => hostMatchesDomain(extractDomain(r.link), domain));
    return {
      domain,
      position: match?.position ?? null,
      url: match?.link ?? null,
      title: match?.title ?? null,
    };
  });
}

export async function fetchRank(
  keyword: string,
  domain: string,
  location: Location,
  _brand: string = ""
): Promise<SerpResult> {
  const loc = LOCATIONS[location];

  const cleanDomain = (domain ?? "")
    .toLowerCase()
    .replace(/^[a-z]+:\/+/, "")
    .replace(/^www\./, "")
    .split(/[\/?#]/)[0]
    .replace(/:\d+$/, "");

  const validClientDomain = cleanDomain.includes(".") && /[a-z]/.test(cleanDomain) ? cleanDomain : "";
  // Without a valid domain there is nothing to look for: that's a failed check, not "not found".
  if (!validClientDomain) throw new ProviderUnavailableError("search", "INVALID_RESPONSE", `Cannot check rankings for an invalid domain "${domain}"`);

  const raw = await fetchOrganicResults(keyword, loc);

  const matchesClient = (host: string) => hostMatchesDomain(host, validClientDomain);
  const match = raw.organic?.find((r) => matchesClient(extractDomain(r.link)));

  const organicResults: OrganicResult[] = (raw.organic ?? [])
    .slice(0, 10)
    .map((r) => {
      const rDomain = extractDomain(r.link);
      const isClient = matchesClient(rDomain);
      return {
        position: r.position,
        title: r.title,
        url: r.link,
        domain: rDomain,
        snippet: r.snippet ?? null,
        isClient,
        platform: detectPlatform(rDomain, cleanDomain),
      };
    });

  return {
    keyword,
    domain,
    location,
    position: match?.position ?? null,
    rankingUrl: match?.link ?? null,
    rankingTitle: match?.title ?? null,
    serpFeatures: detectSerpFeatures(raw),
    organicResults,
    provider: raw.provider,
    isDemo: raw.provider === "demo",
  };
}
