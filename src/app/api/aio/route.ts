import { NextRequest, NextResponse } from "next/server";
import { requireAgencyApi } from "@/lib/auth";
import { fetchAIO } from "@/lib/serpapi";
import { providerErrorResponse } from "@/lib/provider-response";
import { normaliseDomain } from "@/lib/url-input";
import type { Location } from "@/types/search";

export async function POST(req: NextRequest) {
  // Paid provider call: an active signed-in user with an organization only (401 / 403 otherwise).
  const auth = await requireAgencyApi();
  if (auth instanceof Response) return auth;

  try {
    const body = await req.json();
    const { keyword, domain, brand, location } = body as {
      keyword: string;
      domain: string;
      brand: string;
      location: Location;
    };

    if (!keyword?.trim() || !domain?.trim() || !location) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const norm = normaliseDomain(domain);
    if (!norm) {
      return NextResponse.json({ error: "Enter a valid domain like example.com" }, { status: 400 });
    }

    const result = await fetchAIO(
      keyword.trim(),
      norm.domain,
      (brand ?? "").trim() || norm.stem,
      location
    );
    return NextResponse.json(result);
  } catch (err: unknown) {
    if (err instanceof SyntaxError) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    return providerErrorResponse(err, "Failed to fetch the Google AI answer");
  }
}
