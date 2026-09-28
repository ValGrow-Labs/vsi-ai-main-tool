import { fetchRank } from "@/lib/serper";
import { ProviderUnavailableError, serpApiKey, serperKey } from "@/lib/provider-status";
import type { Location } from "@/types/search";
import type { SearchProvider, SearchQueryResult } from "./types";

export class SerperSearchProvider implements SearchProvider {
  name = "Serper.dev";

  isConfigured(): boolean {
    return !!serperKey();
  }

  async search(query: string, location: string, domain: string, brand: string): Promise<SearchQueryResult> {
    const loc = (location || "us") as Location;
    // Throws ProviderUnavailableError on failure: never an empty "not visible" result.
    const res = await fetchRank(query, domain, loc, brand);

    const isVisible = res.position !== null;

    return {
      query,
      engine: "Google",
      location: loc,
      timestamp: new Date().toISOString(),
      serpFeatures: res.serpFeatures || [],
      organicResults: (res.organicResults || []).map((r) => ({
        position: r.position,
        title: r.title,
        url: r.url,
        domain: r.domain,
        snippet: r.snippet,
        isClient: r.isClient,
        isCompetitor: false,
      })),
      rankingPosition: res.position,
      rankingUrl: res.rankingUrl,
      rankingTitle: res.rankingTitle,
      is_visible: isVisible,
      rawResponse: res,
    };
  }
}

export class SerpApiSearchProvider extends SerperSearchProvider {
  name = "SerpAPI";

  isConfigured(): boolean {
    return !!serpApiKey();
  }
}

export class UnconfiguredSearchProvider implements SearchProvider {
  name = "Unconfigured Provider";

  isConfigured(): boolean {
    return false;
  }

  async search(): Promise<SearchQueryResult> {
    // No provider, no result: an empty list here would read as "not ranking".
    throw new ProviderUnavailableError("search", "PROVIDER_NOT_CONFIGURED", "Search provider credentials (SERPER_API_KEY / SERPAPI_KEY) not configured.");
  }
}

export function getSearchProvider(): SearchProvider {
  if (serperKey()) {
    return new SerperSearchProvider();
  }
  if (serpApiKey()) {
    return new SerpApiSearchProvider();
  }
  return new UnconfiguredSearchProvider();
}
