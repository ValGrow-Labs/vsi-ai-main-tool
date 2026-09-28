import { NextRequest, NextResponse } from "next/server";
import { requireAgencyApi } from "@/lib/auth";
import { searchSerpApi, SerpApiError } from "@/lib/serpapi-service";
import { logProviderError, PROVIDER_FAILURE_MESSAGES, reasonFromHttpStatus } from "@/lib/provider-response";

export async function POST(req: NextRequest) {
  // Paid provider call: an active signed-in user with an organization only (401 / 403 otherwise).
  const auth = await requireAgencyApi();
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json();
    const { keyword, domain, brandName, location } = body as {
      keyword?: string;
      domain?: string;
      brandName?: string;
      location?: string;
    };

    if (!keyword || !keyword.trim()) {
      return NextResponse.json(
        { success: false, error: "Keyword parameter is required." },
        { status: 400 }
      );
    }

    const glMap: Record<string, string> = {
      "UAE": "ae",
      "United Arab Emirates": "ae",
      "ae": "ae",
      "United States": "us",
      "US": "us",
      "us": "us",
      "United Kingdom": "uk",
      "UK": "uk",
      "uk": "uk",
      "India": "in",
      "in": "in",
      "Sri Lanka": "lk",
      "lk": "lk",
      "Canada": "ca",
      "ca": "ca",
      "Australia": "au",
      "au": "au",
      "Germany": "de",
      "de": "de",
      "Singapore": "sg",
      "sg": "sg",
    };

    const gl = glMap[location || ""] || "ae";

    const response = await searchSerpApi(keyword.trim(), {
      engine: "google",
      gl,
      hl: "en",
      num: 10,
    });

    return NextResponse.json({
      success: true,
      query: response.query,
      domain: domain ?? null,
      brandName: brandName ?? null,
      location: location ?? "UAE",
      total_results: response.total_results,
      results: response.results,
      isDemo: response.isDemo === true,
    });
  } catch (error: unknown) {
    if (error instanceof SerpApiError) {
      // Fixed text only: the error's own message can carry the provider's response body.
      logProviderError("search", error);
      const reason = reasonFromHttpStatus(error.statusCode, error.code);
      return NextResponse.json(
        { success: false, status: error.code, reason, error: PROVIDER_FAILURE_MESSAGES[reason], message: PROVIDER_FAILURE_MESSAGES[reason] },
        { status: error.statusCode }
      );
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
    }
    console.error("[search] failed", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: "An unexpected server error occurred." },
      { status: 500 }
    );
  }
}
