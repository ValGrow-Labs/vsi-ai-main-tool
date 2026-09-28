import { NextRequest, NextResponse } from "next/server";
import { requireAgencyApi } from "@/lib/auth";
import { fetchBulkRanks } from "@/lib/serper";
import { providerErrorResponse } from "@/lib/provider-response";
import type { Location } from "@/types/search";

export async function POST(req: NextRequest) {
 // Paid provider call: an active signed-in user with an organization only (401 / 403 otherwise).
 const auth = await requireAgencyApi();
 if (auth instanceof Response) return auth;

 try {
 const { keyword, domains, location } = await req.json() as {
 keyword: string;
 domains: string[];
 location: Location;
 };

 if (typeof keyword !== "string" || !keyword.trim() || !Array.isArray(domains) || !domains.length || !domains.every((d) => typeof d === "string")) {
 return NextResponse.json({ error: "Missing fields" }, { status: 400 });
 }

 // Cap at first 10 domains — one Serper call covers all of them
 const results = await fetchBulkRanks(keyword, domains.slice(0, 10), location);
 return NextResponse.json(results);
 } catch (err: unknown) {
 if (err instanceof SyntaxError) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
 return providerErrorResponse(err, "Failed to fetch rankings");
 }
}
