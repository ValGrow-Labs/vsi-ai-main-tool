import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isDummySupabase, requireAgency, type SessionContext } from "@/lib/auth";
import { PROJECT_COOKIE, type ProjectSummary } from "@/lib/project-types";
import { matchLocationOption } from "@/components/project-creation/location";

export { PROJECT_COOKIE };
export type { ProjectSummary };

export interface ProjectContext {
  projects: ProjectSummary[];
  active: ProjectSummary | null;
  /** Set when the project list could not be loaded (network, database). */
  error: string | null;
}

type ClientRow = {
  id: string;
  name: string;
  website: string | null;
  brand_name: string | null;
  service_type: string | null;
  default_location: string | null;
  country?: string | null;
  agency_id: string;
  agencies?: { name?: string | null; display_name?: string | null } | { name?: string | null; display_name?: string | null }[] | null;
};

/**
 * Every project the signed-in user can see, exactly as the database's row-level rules allow.
 *
 * This read needs nothing from the user's profile, only the request's own credentials, so it can start
 * before the profile lookup finishes and run alongside it (see startProjectLoad). The organization filter
 * that used to be part of the query is applied to the rows in loadProjects below, so the result is the same.
 */
const loadVisibleClients = cache(async () => {
  if (isDummySupabase()) return { rows: [] as ClientRow[], error: null as { code?: string } | null };
  const supabase = await createClient();
  let data: any = null;
  let error: { code?: string; message?: string } | null = null;

  const main = await supabase
    .from("clients")
    .select("id, name, website, brand_name, service_type, default_location, country, agency_id, agencies(name, display_name)")
    .order("created_at", { ascending: true });
  data = main.data;
  error = main.error;

  if (error && (error.code === "42703" || /display_name|column/i.test(error.message ?? ""))) {
    const fallback = await supabase
      .from("clients")
      .select("id, name, website, brand_name, service_type, default_location, country, agency_id, agencies(name)")
      .order("created_at", { ascending: true });

    if (fallback.error && (fallback.error.code === "42703" || /column/i.test(fallback.error.message ?? ""))) {
      const basic = await supabase
        .from("clients")
        .select("id, name, website, brand_name, service_type, default_location, country, agency_id")
        .order("created_at", { ascending: true });
      data = basic.data;
      error = basic.error;
    } else {
      data = fallback.data;
      error = fallback.error;
    }
  }

  return { rows: (data ?? []) as ClientRow[], error: error ? { code: error.code } : null };
});

/**
 * Starts the project read now, so it runs at the same time as the session lookup instead of after it.
 * Safe to call more than once per request (the read is shared). Nothing is used until the session has been
 * verified: the rows are only ever handed out by getProjectContext, which needs the verified session.
 */
export function startProjectLoad(): void {
  // A failure is still raised where the result is awaited (getProjectContext); this only avoids an unhandled rejection here.
  loadVisibleClients().catch(() => {});
}

const loadProjects = cache(async (userId: string, agencyId: string | null, isSuperAdmin: boolean) => {
  if (isDummySupabase()) {
    return { projects: [] as ProjectSummary[], error: null as string | null };
  }
  const { rows, error } = await loadVisibleClients();
  if (error) {
    console.error("[project-context] failed to load projects", { userId, code: error.code });
    return { projects: [] as ProjectSummary[], error: "We couldn't load your projects right now." };
  }
  // Same organization filter as before, applied to the rows instead of in the query. Platform admins see every project.
  const visible = isSuperAdmin || !agencyId ? rows : rows.filter((c) => c.agency_id === agencyId);
  const projects = visible.map((c) => {
    const agency = Array.isArray(c.agencies) ? c.agencies[0] : c.agencies;
    const locMatch =
      (c.country ? matchLocationOption(c.country) : null) ||
      (c.default_location ? matchLocationOption(c.default_location) : null);
    return {
      id: c.id,
      name: c.name,
      website: c.website,
      brandName: c.brand_name,
      serviceType: c.service_type,
      defaultLocation: locMatch?.code || c.default_location || null,
      country: locMatch?.country || c.country || null,
      agencyId: c.agency_id,
      agencyName: isSuperAdmin ? agency?.display_name ?? agency?.name ?? null : null,
    } satisfies ProjectSummary;
  });
  return { projects, error: null as string | null };
});

/**
 * The single source of "which project am I looking at".
 * Order: explicit override (deep link) → vsi_project cookie → first project.
 * Only projects the session may access are ever returned.
 */
export async function getProjectContext(session: SessionContext, override?: string | null): Promise<ProjectContext> {
  const isSuperAdmin = session.role === "super_admin";
  const { projects, error } = await loadProjects(session.userId, session.agencyId, isSuperAdmin);
  const cookieStore = await cookies();
  const wanted = override || cookieStore.get(PROJECT_COOKIE)?.value || null;
  const active = projects.find((p) => p.id === wanted) ?? projects[0] ?? null;
  return { projects, active, error };
}

/**
 * The verified session and the project context in one call, with the project read started first so it
 * overlaps the session lookup. Use this at the top of a dashboard page or layout instead of
 * requireAgency() followed by getProjectContext().
 */
export async function requireProjectContext(override?: string | null) {
  startProjectLoad();
  const session = await requireAgency();
  const context = await getProjectContext(session, override);
  return { session, ...context };
}
