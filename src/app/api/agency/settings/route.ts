import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAgencyApi } from "@/lib/auth";
import { currentCookieSessionAllowed } from "@/lib/auth-rules";
import { buildAgencySettingsUpdate, type AgencySettingsResponse } from "@/lib/agency-settings";

export const dynamic = "force-dynamic";

/** Organization UPDATE is allowed by RLS only for platform admins (policy super_admin_all_agencies). */
const NOT_ALLOWED = "Your account can't change organization settings. Only a platform admin can update them.";

type CountResult = { count: number | null; error: unknown };

async function countOrNull(query: PromiseLike<CountResult>): Promise<number | null> {
  try {
    const { count, error } = await query;
    return error ? null : count ?? null;
  } catch {
    return null;
  }
}

/** GET: the signed-in user's own organization. Always scoped to the session's organization. */
export async function GET(req: NextRequest) {
  const session = await requireAgencyApi();
  if (session instanceof Response) return session;

  const wantUsage = new URL(req.url).searchParams.get("include") === "usage";
  const user = { email: session.email, fullName: session.fullName, role: session.role };

  // Local development without a database: the cookie session is the only source.
  if (currentCookieSessionAllowed()) {
    const body: AgencySettingsResponse = {
      ok: true,
      mode: "local",
      canEdit: true,
      organization: {
        id: session.agencyId,
        name: session.agencyName,
        isPilot: null,
        maxKeywords: null,
        maxClients: null,
        display_name: session.branding.displayName,
        logo_url: null,
        primary_color: session.branding.primaryColor,
        support_email: session.branding.supportEmail,
        report_footer: session.branding.reportFooter,
      },
      user,
      ...(wantUsage ? { usage: { clients: null, activeKeywords: null, reports: null } } : {}),
    };
    return NextResponse.json(body);
  }

  try {
    const supabase = await createClient();
    const { data: agency, error } = await supabase
      .from("agencies")
      .select("*")
      .eq("id", session.agencyId)
      .maybeSingle();

    if (error) {
      console.error("[agency/settings] load failed", { code: error.code, message: error.message });
      return NextResponse.json({ error: "Couldn't load your organization. Please try again." }, { status: 500 });
    }
    if (!agency) {
      return NextResponse.json({ error: "Your organization couldn't be found." }, { status: 404 });
    }

    const a = agency as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
    const num = (v: unknown) => (typeof v === "number" ? v : null);

    let usage: AgencySettingsResponse["usage"];
    if (wantUsage) {
      const [clients, activeKeywords, reports] = await Promise.all([
        countOrNull(supabase.from("clients").select("id", { count: "exact", head: true }).eq("agency_id", session.agencyId)),
        countOrNull(
          supabase
            .from("tracked_keywords")
            .select("id", { count: "exact", head: true })
            .eq("agency_id", session.agencyId)
            .eq("is_active", true),
        ),
        countOrNull(supabase.from("reports").select("id", { count: "exact", head: true }).eq("agency_id", session.agencyId)),
      ]);
      usage = { clients, activeKeywords, reports };
    }

    const body: AgencySettingsResponse = {
      ok: true,
      mode: "database",
      canEdit: session.role === "super_admin",
      organization: {
        id: session.agencyId,
        name: str(a.name),
        isPilot: typeof a.is_pilot === "boolean" ? a.is_pilot : null,
        maxKeywords: num(a.max_keywords),
        maxClients: num(a.max_clients),
        display_name: str(a.display_name),
        logo_url: str(a.logo_url),
        primary_color: str(a.primary_color),
        support_email: str(a.support_email),
        report_footer: str(a.report_footer),
      },
      user,
      ...(usage ? { usage } : {}),
    };
    return NextResponse.json(body);
  } catch (err) {
    console.error("[agency/settings] load failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't load your organization. Please try again." }, { status: 500 });
  }
}

/** POST: update the session's organization. Reports success only when a row was really updated. */
export async function POST(req: NextRequest) {
  const session = await requireAgencyApi();
  if (session instanceof Response) return session;

  if (currentCookieSessionAllowed()) {
    return NextResponse.json(
      { error: "No database is configured, so organization settings can't be saved on the server." },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { update, errors } = buildAgencySettingsUpdate(body);
  if (errors.length > 0) return NextResponse.json({ error: errors.join(" ") }, { status: 400 });
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("agencies")
      .update(update)
      .eq("id", session.agencyId)
      .select("id");

    if (error) {
      console.error("[agency/settings] update failed", { code: error.code, message: error.message });
      if (error.code === "42501") return NextResponse.json({ error: NOT_ALLOWED }, { status: 403 });
      return NextResponse.json({ error: "Couldn't save your settings. Please try again." }, { status: 500 });
    }
    // RLS filters the row out instead of raising: zero rows means nothing was saved.
    if (!data || data.length === 0) {
      return NextResponse.json({ error: NOT_ALLOWED }, { status: 403 });
    }
    return NextResponse.json({ ok: true, updated: Object.keys(update) });
  } catch (err) {
    console.error("[agency/settings] update failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't save your settings. Please try again." }, { status: 500 });
  }
}
