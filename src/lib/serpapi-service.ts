import { demoDataAllowed, serpApiKey } from "@/lib/provider-status";
import { demoOrganicResults } from "@/lib/demo-data";

export interface SerpSearchResultItem {
  position: number;
  title: string;
  link: string;
  snippet?: string;
  source?: string;
}

export interface SerpSearchResponse {
  success: true;
  /** True only for opt-in development placeholder data (VSI_ALLOW_DEMO_DATA). */
  isDemo?: boolean;
  query: string;
  total_results: number;
  results: SerpSearchResultItem[];
  knowledge_graph?: {
    title?: string;
    type?: string;
    description?: string;
  };
}

export type SearchErrorCode = "SEARCH_UNAVAILABLE" | "CHECK_FAILED";

export class SerpApiError extends Error {
  statusCode: number;
  /** SEARCH_UNAVAILABLE: no provider configured. CHECK_FAILED: the provider call failed. */
  code: SearchErrorCode;

  constructor(message: string, statusCode: number = 500, code: SearchErrorCode = "CHECK_FAILED") {
    super(message);
    this.name = "SerpApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export async function searchSerpApi(
  query: string,
  options: { engine?: string; gl?: string; hl?: string; num?: number } = {}
): Promise<SerpSearchResponse> {
  const apiKey = serpApiKey();

  if (!apiKey) {
    if (demoDataAllowed()) {
      const results = demoOrganicResults(query.trim()).map((r) => ({
        position: r.position,
        title: r.title,
        link: r.url,
        snippet: r.snippet ?? "",
        source: r.domain,
      }));
      return { success: true, isDemo: true, query: query.trim(), total_results: results.length, results };
    }
    throw new SerpApiError("Live search results aren't available: no search provider is configured (SERPAPI_KEY).", 503, "SEARCH_UNAVAILABLE");
  }

  const { engine = "google", gl = "us", hl = "en", num = 10 } = options;

  const searchUrl = new URL("https://serpapi.com/search.json");
  searchUrl.searchParams.set("engine", engine);
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("gl", gl);
  searchUrl.searchParams.set("hl", hl);
  searchUrl.searchParams.set("num", num.toString());
  searchUrl.searchParams.set("api_key", apiKey);

  try {
    const response = await fetch(searchUrl.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (response.status === 401 || response.status === 403) {
      throw new SerpApiError("Invalid or unauthorized SerpAPI key.", 401);
    }

    if (response.status === 429) {
      throw new SerpApiError("SerpAPI rate limit exceeded. Please try again later.", 429);
    }

    if (!response.ok) {
      throw new SerpApiError(`SerpAPI returned HTTP status ${response.status}`, 502);
    }

    const data = await response.json();

    if (data.error) {
      if (typeof data.error === "string" && (data.error.includes("Invalid API key") || data.error.includes("api_key"))) {
        throw new SerpApiError("SerpAPI authentication error.", 401);
      }
      throw new SerpApiError(`SerpAPI error: ${data.error}`, 502);
    }

    const organicResults = (data.organic_results || []).map((item: { position?: number; title?: string; link?: string; snippet?: string; snippet_highlighted_words?: string[]; displayed_link?: string; source?: string }, index: number) => ({
      position: item.position ?? index + 1,
      title: item.title ?? "",
      link: item.link ?? "",
      snippet: item.snippet ?? item.snippet_highlighted_words?.join(" ") ?? "",
      source: item.displayed_link ?? item.source ?? "",
    }));

    const knowledgeGraph = data.knowledge_graph
      ? {
          title: data.knowledge_graph.title,
          type: data.knowledge_graph.type,
          description: data.knowledge_graph.description,
        }
      : undefined;

    return {
      success: true,
      query,
      total_results: organicResults.length,
      results: organicResults,
      knowledge_graph: knowledgeGraph,
    };
  } catch (error: unknown) {
    if (error instanceof SerpApiError) {
      throw error;
    }
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new SerpApiError("SerpAPI request timed out.", 504);
    }
    throw new SerpApiError("Failed to fetch search results from search service.", 500);
  }
}
