import { NextRequest, NextResponse } from "next/server";
import { requireAgencyApi } from "@/lib/auth";
import { runCheckPipeline } from "@/lib/run-check";
import { isProviderUnavailable } from "@/lib/provider-status";
import { providerErrorResponse } from "@/lib/provider-response";
import type { Location } from "@/types/search";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Paid provider call: an active signed-in user with an organization only (401 / 403 otherwise).
  const auth = await requireAgencyApi();
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json();
    const { keyword, domain, brand, location, language, provider, bypassCache } = body as {
      keyword: string;
      domain: string;
      brand?: string;
      location: Location;
      language?: string;
      provider?: string;
      bypassCache?: boolean;
    };

    if (!keyword?.trim() || !domain?.trim() || !location) {
      return NextResponse.json(
        { success: false, error: "Keyword, Domain, and Location parameters are required." },
        { status: 400 }
      );
    }

    const result = await runCheckPipeline({
      keyword,
      domain,
      brand: brand ?? "",
      location,
      language,
      provider,
      bypassCache,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err: unknown) {
    if (err instanceof SyntaxError) {
      return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
    }
    if (isProviderUnavailable(err)) return providerErrorResponse(err);
    console.error("[API /api/check Error]:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { success: false, error: "Failed to run Keyword Intelligence check." },
      { status: 500 }
    );
  }
}
