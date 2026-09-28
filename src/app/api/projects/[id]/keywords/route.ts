import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAgencyApi, type SessionContext } from "@/lib/auth";
import { displayDomain, UUID_PATTERN } from "@/lib/project-types";
import { LOCATIONS, type Location, type TrackType } from "@/types/search";

export const dynamic = "force-dynamic";

function error(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** The project, only if the caller's organization owns it (super admins: any). */
async function findProject(session: SessionContext & { agencyId: string }, projectId: string) {
  const supabase = await createClient();
  let q = supabase
    .from("clients")
    .select("id, agency_id, name, website, brand_name, default_location")
    .eq("id", projectId);
  if (session.role !== "super_admin") {
    q = q.eq("agency_id", session.agencyId);
  }
  const { data } = await q.maybeSingle();
  return {
    supabase,
    project: data as {
      id: string;
      agency_id: string;
      name: string;
      website: string | null;
      brand_name: string | null;
      default_location: string | null;
    } | null,
  };
}

/** List the searches added to a project. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAgencyApi();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!UUID_PATTERN.test(id)) return error(400, "bad_request", "Choose a valid project.");

  const { supabase, project } = await findProject(session, id);
  if (!project) return error(404, "not_found", "That project isn't available.");

  const { data, error: qErr } = await supabase
    .from("tracked_keywords")
    .select("id, keyword, domain, brand, location, track_type, is_active, created_at")
    .eq("client_id", id)
    .order("created_at", { ascending: false });

  if (qErr) {
    console.error("[keywords] GET failed", { code: qErr.code, message: qErr.message });
    return error(500, "load_failed", "We couldn't load searches. Please try again.");
  }

  return NextResponse.json({ searches: data ?? [] });
}

/** Add or upsert searches for a project. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAgencyApi();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  if (!UUID_PATTERN.test(id)) return error(400, "bad_request", "Choose a valid project.");

  let body: {
    searches?: unknown;
    keywords?: unknown;
    keyword?: unknown;
    trackType?: unknown;
    location?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return error(400, "bad_request", "Invalid request.");
  }

  const rawList: unknown[] = Array.isArray(body.searches)
    ? body.searches
    : Array.isArray(body.keywords)
    ? body.keywords
    : body.keyword
    ? [{ keyword: body.keyword, trackType: body.trackType, location: body.location }]
    : [];

  if (rawList.length === 0) {
    return error(400, "bad_request", "Enter one or more searches to track.");
  }

  const { supabase, project } = await findProject(session, id);
  if (!project) return error(404, "not_found", "That project isn't available.");

  const domain = displayDomain(project.website) || project.website || "";
  const brand = ((project.brand_name as string | null) || (project.name as string) || domain).trim();
  const defaultLoc: Location =
    project.default_location && project.default_location in LOCATIONS
      ? (project.default_location as Location)
      : "ae";

  type ValidatedSearch = {
    keyword: string;
    trackType: TrackType;
    location: Location;
  };

  const toInsert: ValidatedSearch[] = [];
  const seen = new Set<string>();

  for (const item of rawList) {
    let kw = "";
    let trackType: TrackType = "both";
    let loc: Location = defaultLoc;

    if (typeof item === "string") {
      kw = item.trim();
    } else if (item && typeof item === "object") {
      const obj = item as Record<string, unknown>;
      kw = typeof obj.keyword === "string" ? obj.keyword.trim() : "";
      if (
        typeof obj.trackType === "string" &&
        (obj.trackType === "seo" || obj.trackType === "geo" || obj.trackType === "both")
      ) {
        trackType = obj.trackType as TrackType;
      }
      if (typeof obj.location === "string" && obj.location in LOCATIONS) {
        loc = obj.location as Location;
      }
    }

    if (!kw || kw.length > 255) continue;
    const dedupKey = `${kw.toLowerCase()}|${loc}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    toInsert.push({ keyword: kw, trackType, location: loc });
  }

  if (toInsert.length === 0) {
    return error(400, "bad_request", "Enter valid searches to track.");
  }

  const rows = toInsert.map((s) => ({
    client_id: id,
    agency_id: project.agency_id,
    keyword: s.keyword,
    domain,
    brand,
    track_type: s.trackType,
    location: s.location,
    is_active: true,
  }));

  const { data, error: insErr } = await supabase
    .from("tracked_keywords")
    .upsert(rows, { onConflict: "client_id,keyword,domain,location", ignoreDuplicates: true })
    .select("id, keyword, track_type, location, is_active");

  if (insErr) {
    if (insErr.message?.toLowerCase().includes("limit")) {
      return error(400, "keyword_limit", "Keyword limit reached for this agency.");
    }
    console.error("[keywords] POST insert failed", { code: insErr.code, message: insErr.message });
    return error(500, "save_failed", "We couldn't save these searches. Please try again.");
  }

  return NextResponse.json(
    { ok: true, count: data?.length ?? toInsert.length, searches: data ?? [] },
    { status: 201 }
  );
}
