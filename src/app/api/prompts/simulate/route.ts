import { NextRequest, NextResponse } from "next/server";
import { requireAgencyApi } from "@/lib/auth";
import { searchSerpApi, SerpApiError } from "@/lib/serpapi-service";
import { logProviderError, PROVIDER_FAILURE_MESSAGES, reasonFromHttpStatus, safeProviderMessage } from "@/lib/provider-response";

export async function POST(req: NextRequest) {
  // Paid provider call: an active signed-in user with an organization only (401 / 403 otherwise).
  const auth = await requireAgencyApi();
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json();
    const { engine, prompt, variables } = body as {
      engine?: string;
      prompt?: string;
      variables?: Record<string, string>;
    };

    if (!prompt || !prompt.trim()) {
      return NextResponse.json(
        { success: false, error: "Generated prompt cannot be empty." },
        { status: 400 }
      );
    }

    const keyword = variables?.keyword || "";
    const location = variables?.location || "UAE";

    const apiKey = process.env.SERPAPI_KEY || process.env.SERPAPI_API_KEY;

    if (!apiKey || !apiKey.trim()) {
      return NextResponse.json({
        success: true,
        apiConnected: false,
        engine: engine || "AI Engine",
        generatedPrompt: prompt,
        message: "Prompt generated. Live results aren't available because no search provider (SERPAPI_KEY) is configured.",
      });
    }

    try {
      const glMap: Record<string, string> = {
        "UAE": "ae",
        "United Arab Emirates": "ae",
        "India": "in",
        "United States": "us",
        "US": "us",
        "United Kingdom": "uk",
        "UK": "uk",
      };
      const gl = glMap[location] || "ae";

      const serpResult = await searchSerpApi(keyword || "test search", {
        engine: "google",
        gl,
        num: 5,
      });

      if (serpResult.isDemo) {
        return NextResponse.json({
          success: true,
          apiConnected: false,
          engine: engine || "AI Engine",
          generatedPrompt: prompt,
          message: "Prompt generated. Showing development placeholder results (VSI_ALLOW_DEMO_DATA) — not live data.",
          isDemo: true,
        });
      }

      return NextResponse.json({
        success: true,
        apiConnected: true,
        engine: engine || "AI Engine",
        generatedPrompt: prompt,
        message: `Successfully executed live diagnostic call to search backend for query '${keyword}' in '${location}'.`,
        serpData: {
          total_results: serpResult.total_results,
          results: serpResult.results.map((r) => ({
            title: r.title,
            link: r.link,
            snippet: r.snippet,
          })),
        },
      });
    } catch (apiErr: unknown) {
      // Fixed text only: provider messages can carry response bodies or request URLs.
      logProviderError("prompts/simulate", apiErr);
      const errorMsg = apiErr instanceof SerpApiError
        ? PROVIDER_FAILURE_MESSAGES[reasonFromHttpStatus(apiErr.statusCode, apiErr.code)]
        : safeProviderMessage(apiErr);

      return NextResponse.json({
        success: false,
        apiConnected: false,
        generatedPrompt: prompt,
        error: `Request failed: ${errorMsg}`,
      }, { status: 502 });
    }
  } catch (err: unknown) {
    if (err instanceof SyntaxError) {
      return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
    }
    console.error("[prompts/simulate] failed", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { success: false, error: "Backend error: the request couldn't be completed." },
      { status: 500 }
    );
  }
}
