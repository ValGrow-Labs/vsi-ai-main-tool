import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { currentCookieSessionAllowed, isAccountBlocked, isDummySupabaseUrl } from "@/lib/auth-rules";

export type UserRole = "super_admin" | "pilot";

export interface AgencyBranding {
  displayName: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  supportEmail: string | null;
  reportFooter: string | null;
}

export interface SessionContext {
  userId: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  agencyId: string | null;
  agencyName: string | null;
  isPilot: boolean;
  maxKeywords: number;
  branding: AgencyBranding;
}

/**
 * Returns true when Supabase is configured with placeholder / dummy
 * credentials (local dev without a real backend).
 */
export function isDummySupabase(): boolean {
  return isDummySupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

function cleanVal(val?: string | null): string | null {
  if (!val) return null;
  try {
    let decoded = decodeURIComponent(val).trim();
    if (decoded.startsWith('"') && decoded.endsWith('"')) {
      decoded = decoded.slice(1, -1);
    }
    if (decoded.startsWith("'") && decoded.endsWith("'")) {
      decoded = decoded.slice(1, -1);
    }
    return decoded.trim();
  } catch {
    return val;
  }
}

/** Extract user details from cookies set during client session creation. */
async function getCookieUser(): Promise<{
  email: string | null;
  fullName: string | null;
  agencyDisplayName: string | null;
  agencyEmail: string | null;
  agencyLogoMarker: string | null;
}> {
  try {
    const cookieStore = await cookies();
    const emailCookie = cookieStore.get("vsi_user_email")?.value;
    const nameCookie = cookieStore.get("vsi_user_name")?.value;
    const displayNameCookie = cookieStore.get("vsi_agency_display_name")?.value;
    const agencyEmailCookie = cookieStore.get("vsi_agency_email")?.value;
    const logoMarkerCookie = cookieStore.get("vsi_agency_logo_marker")?.value;
    return {
      email: cleanVal(emailCookie),
      fullName: cleanVal(nameCookie),
      agencyDisplayName: cleanVal(displayNameCookie),
      agencyEmail: cleanVal(agencyEmailCookie),
      agencyLogoMarker: cleanVal(logoMarkerCookie),
    };
  } catch {
    return { email: null, fullName: null, agencyDisplayName: null, agencyEmail: null, agencyLogoMarker: null };
  }
}

/**
 * Role of the local-development session. It is a fixture with no database behind it, so it gets
 * the least privilege unless you opt in with VSI_DEV_SESSION_ROLE=super_admin (for example to
 * open /admin locally). It never depends on the email address.
 */
function devSessionRole(): UserRole {
  return process.env.VSI_DEV_SESSION_ROLE === "super_admin" ? "super_admin" : "pilot";
}

/**
 * Local-development session built from cookies. Only used when
 * currentCookieSessionAllowed() is true (placeholder Supabase, not production).
 */
async function dynamicSession(): Promise<SessionContext> {
  const { email, fullName, agencyDisplayName, agencyEmail, agencyLogoMarker } = await getCookieUser();
  const activeEmail = email || "user@example.com";
  const activeName = fullName || (email ? email.split("@")[0] : "User");

  return {
    userId: "00000000-0000-0000-0000-000000000002",
    email: activeEmail,
    fullName: activeName,
    role: devSessionRole(),
    agencyId: "00000000-0000-0000-0000-000000000001",
    agencyName: "Local development",
    isPilot: false,
    maxKeywords: 999,
    branding: {
      displayName: agencyDisplayName || null,
      logoUrl: agencyLogoMarker || null,
      primaryColor: null,
      supportEmail: agencyEmail || null,
      reportFooter: null,
    },
  };
}

/**
 * Who is making this request:
 *  - "signed_out": nobody (or an unverifiable cookie) is signed in;
 *  - "disabled":   a real Supabase user whose account, or whose organization, has been disabled.
 *                  They still hold a valid Supabase session, so this must be told apart from
 *                  "signed_out": APIs answer 403 account_disabled and pages sign them out;
 *  - "active":     a usable session.
 * Cached per request, so every helper below shares one profile read.
 */
export type AuthState =
  | { status: "signed_out" }
  | { status: "disabled" }
  | { status: "active"; session: SessionContext };

export const getAuthState = cache(async (): Promise<AuthState> => {
  try {
    const cookieStore = await cookies();
    // Only a hint to skip work when nobody is signed in; it never grants access.
    const hasSession =
      cookieStore.has("vsi_session") || cookieStore.getAll().some((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name));
    if (!hasSession) {
      return { status: "signed_out" };
    }
  } catch {
    // If cookies API fails, proceed
  }

  // Local development without a database: a cookie session, which needs an email to build it from.
  if (currentCookieSessionAllowed()) {
    const cookieUserData = await getCookieUser();
    if (!cookieUserData.email) {
      return { status: "signed_out" };
    }
    return { status: "active", session: await dynamicSession() };
  }
  // Placeholder credentials in production: there is no backend to sign in against.
  if (isDummySupabase()) return { status: "signed_out" };

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      let { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("agency_id, role, full_name, is_disabled, agencies(name, is_pilot, max_keywords, display_name, logo_url, primary_color, support_email, report_footer, is_disabled)")
        .eq("id", user.id)
        .single();

      if (profileErr && (profileErr.code === "42703" || /column/i.test(profileErr.message ?? ""))) {
        const fallback = await supabase
          .from("profiles")
          .select("agency_id, role, full_name, agencies(name)")
          .eq("id", user.id)
          .single();
        profile = fallback.data as typeof profile;
      }

      const agency = (profile?.agencies as unknown) as {
        name: string; is_pilot?: boolean; max_keywords?: number;
        display_name?: string | null; logo_url?: string | null;
        primary_color?: string | null; support_email?: string | null;
        report_footer?: string | null; is_disabled?: boolean | null;
      } | null;

      // Disabled accounts (or accounts in a disabled organization) get no session.
      if (isAccountBlocked({ role: profile?.role as string | undefined, userDisabled: profile?.is_disabled as boolean | undefined, orgDisabled: agency?.is_disabled })) {
        return { status: "disabled" };
      }

      const cookieUserData = await getCookieUser();
      const resolvedEmail = user.email ?? cookieUserData.email ?? "";
      const resolvedName = profile?.full_name ?? cookieUserData.fullName ?? null;

      const userRole = (profile?.role as UserRole) ?? "pilot";
      return {
        status: "active",
        session: {
          userId:       user.id,
          email:        resolvedEmail,
          fullName:     resolvedName,
          role:         userRole,
          // A user with no organization really has none: null, not a made-up one. requireAgency()
          // sends them to /onboarding to create it.
          agencyId:     profile?.agency_id ?? null,
          agencyName:   agency?.name ?? null,
          isPilot:      agency?.is_pilot ?? true,
          maxKeywords:  agency?.max_keywords ?? 10,
          branding: {
            displayName:  agency?.display_name ?? null,
            logoUrl:      agency?.logo_url ?? null,
            primaryColor: agency?.primary_color ?? null,
            supportEmail: agency?.support_email ?? null,
            reportFooter: agency?.report_footer ?? null,
          },
        },
      };
    }
  } catch {
    // Supabase unreachable: no session. Cookies alone are never trusted here.
  }

  return { status: "signed_out" };
});

/**
 * Server-side: fetch current authenticated user + their profile + their agency.
 * Returns null if nobody is signed in or the account is disabled. Any Supabase user can sign in;
 * their role comes from their profile row, never from their email address.
 * Use getAuthState() when "disabled" must be told apart from "signed out".
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const state = await getAuthState();
  return state.status === "active" ? state.session : null;
});

/** Where pages send a disabled account. The login page shows the notice and signs the browser out. */
export const ACCOUNT_DISABLED_PATH = "/login?error=account_disabled";

/** Page/layout guard: the active session, or a redirect (signed out: /login, disabled: the notice). */
async function requirePageSession(): Promise<SessionContext> {
  const state = await getAuthState();
  if (state.status === "disabled") redirect(ACCOUNT_DISABLED_PATH);
  if (state.status !== "active") redirect("/login");
  return state.session;
}

/** JSON answers shared by every API guard. */
export const apiAuthError = {
  signedOut: () => Response.json({ error: "Sign in again to continue.", code: "unauthenticated" }, { status: 401 }),
  disabled: () =>
    Response.json({ error: "This account has been disabled. Contact your administrator.", code: "account_disabled" }, { status: 403 }),
  noOrganization: () => Response.json({ error: "Create your organization first.", code: "no_organization" }, { status: 403 }),
  notAdmin: () => Response.json({ error: "Only platform admins can do this.", code: "forbidden" }, { status: 403 }),
};

/**
 * API routes: any active signed-in user (with or without an organization).
 * Returns the session, or a 401 (signed out) / 403 account_disabled response to send back.
 */
export async function requireSessionApi(): Promise<SessionContext | Response> {
  const state = await getAuthState();
  if (state.status === "disabled") return apiAuthError.disabled();
  if (state.status !== "active") return apiAuthError.signedOut();
  return state.session;
}

/** A signed-in session that belongs to a real organization. */
export type AgencySession = SessionContext & { agencyId: string; agencyName: string };

/** Shown when an organization row exists but its name couldn't be read. Never a made-up identity. */
const UNNAMED_ORGANIZATION = "Unnamed organization";

function withAgency(session: SessionContext & { agencyId: string }): AgencySession {
  return { ...session, agencyName: session.agencyName ?? UNNAMED_ORGANIZATION };
}

/**
 * Pages and layouts: the signed-in user and their organization. Nobody signed in goes to /login;
 * a signed-in user without an organization goes to /onboarding to create one. There is no stand-in
 * organization. (The local-development cookie session carries its own fixture organization.)
 *
 * redirect() throws, so API routes should use requireAgencyApi() instead: inside a try/catch the
 * redirect would otherwise surface as a 500 "NEXT_REDIRECT".
 */
export async function requireAgency(): Promise<AgencySession> {
  const session = await requirePageSession();
  if (!session.agencyId) redirect("/onboarding");
  return withAgency({ ...session, agencyId: session.agencyId });
}

/**
 * API routes: same check as requireAgency(), but answers in JSON instead of redirecting.
 * Returns the session, or a 401 (not signed in) / 403 (account_disabled, no_organization) response.
 *
 *   const session = await requireAgencyApi();
 *   if (session instanceof Response) return session;
 */
export async function requireAgencyApi(): Promise<AgencySession | Response> {
  const session = await requireSessionApi();
  if (session instanceof Response) return session;
  if (!session.agencyId) return apiAuthError.noOrganization();
  return withAgency({ ...session, agencyId: session.agencyId });
}

/** API routes: a platform admin. 401 signed out, 403 account_disabled / forbidden. */
export async function requireSuperAdminApi(): Promise<SessionContext | Response> {
  const session = await requireSessionApi();
  if (session instanceof Response) return session;
  if (session.role !== "super_admin") return apiAuthError.notAdmin();
  return session;
}

/**
 * For an API route's catch block: a body that isn't JSON is the caller's mistake (400); anything
 * else is a generic 500. The detail is logged server-side, never sent to the browser.
 */
export function apiServerError(context: string, e: unknown, message = "Something went wrong. Please try again."): Response {
  if (e instanceof SyntaxError) {
    return Response.json({ error: "Invalid request body.", code: "bad_request" }, { status: 400 });
  }
  const detail =
    e && typeof e === "object" && "message" in e
      ? { code: (e as { code?: unknown }).code, message: (e as { message?: unknown }).message }
      : e;
  console.error(`[api] ${context} failed`, detail);
  return Response.json({ error: message, code: "server_error" }, { status: 500 });
}

/** Require a super_admin user. */
export async function requireSuperAdmin(): Promise<SessionContext> {
  const session = await requirePageSession();
  if (session.role !== "super_admin") {
    redirect("/dashboard");
  }
  return session;
}

/** Require a pilot user (or any user with isPilot true). */
export async function requirePilot(): Promise<SessionContext> {
  const session = await requirePageSession();
  if (!session.isPilot) {
    redirect("/dashboard");
  }
  return session;
}

/** Require either super admin or pilot role. */
export async function requireSuperAdminOrPilot(): Promise<SessionContext> {
  const session = await requirePageSession();
  if (session.role !== "super_admin" && !session.isPilot) {
    redirect("/dashboard");
  }
  return session;
}

/**
 * Generate a short, readable invite code (e.g. "VG-4Q7A-K9D2"), from the platform's
 * cryptographic random source. 32 symbols divide 256 exactly, so `byte % 32` is unbiased.
 */
export function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const symbols = Array.from(bytes, (b) => chars[b % chars.length]).join("");
  return `VG-${symbols.slice(0, 4)}-${symbols.slice(4)}`;
}
