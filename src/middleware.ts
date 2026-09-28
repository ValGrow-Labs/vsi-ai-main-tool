import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { currentCookieSessionAllowed, isAccountBlocked } from "@/lib/auth-rules";
import { PROJECT_COOKIE, UUID_PATTERN } from "@/lib/project-types";

// Routes that do not require authentication:
//   /, /login, /privacy, /auth/callback  sign-in and public pages
//   /auth/reset-password                  password-reset link target (the Supabase recovery link is the credential)
//   /r/<token>                            shared report links (the token is the credential)
//   /qa, /api/qa                          QA checklist, gated by its own tester code (vsi_qa_tester)
//   /api/cron                             scheduler, gated by the CRON_SECRET bearer token in the route
//   /api/auth                             Google OAuth start/callback (establishes the session)
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/privacy",
  "/r",
  "/qa",
  "/api/qa",
  "/api/cron",
  "/api/auth",
  "/auth/callback",
  "/auth/reset-password",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let supabaseResponse = NextResponse.next({
    request,
  });

  // Legacy auth links land on the auth page: sign in, or create an account.
  if (pathname === "/auth/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (pathname === "/auth/register") {
    return NextResponse.redirect(new URL("/login?mode=signup", request.url));
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://dummy.supabase.co";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_key_for_local_development";

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Get user from Supabase Auth
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let cookieEmail = request.cookies.get("vsi_user_email")?.value
    ? decodeURIComponent(request.cookies.get("vsi_user_email")!.value)
    : null;

  if (cookieEmail) {
    cookieEmail = cookieEmail.trim();
    if (cookieEmail.startsWith('"') && cookieEmail.endsWith('"')) {
      cookieEmail = cookieEmail.slice(1, -1);
    }
    if (cookieEmail.startsWith("'") && cookieEmail.endsWith("'")) {
      cookieEmail = cookieEmail.slice(1, -1);
    }
    cookieEmail = cookieEmail.trim();
  }

  // A signed-in Supabase user is authenticated whatever their email. What they may do is decided
  // by their profile role and organization (lib/auth, RLS), never by the address.
  // Cookies alone are only trusted in local development without a database, and there they must
  // carry an email, since the development session is built from it.
  const cookieSessions = currentCookieSessionAllowed();
  const isAuthorized = !!user || (cookieSessions && request.cookies.has("vsi_session") && !!cookieEmail);

  // Check if current route is public
  const isPublicPath = PUBLIC_PATHS.some(
    (p) => pathname === p || (p !== "/" && pathname.startsWith(p + "/"))
  );

  const isApi = pathname === "/api" || pathname.startsWith("/api/");

  // Protect all non-public routes (e.g. /dashboard, /clients, /tasks, /prompts, /settings, /feedback, etc.)
  if (!isPublicPath && !isAuthorized) {
    // APIs answer fetch callers in JSON; a redirect to an HTML page is not an answer they can use.
    if (isApi) {
      return NextResponse.json({ error: "Sign in again to continue.", code: "unauthenticated" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    const res = NextResponse.redirect(loginUrl);
    // Clear leftover client-side session markers so the login page doesn't
    // bounce the user back to a page they can no longer open.
    if (!cookieSessions && request.cookies.has("vsi_session")) {
      const expired = "path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
      res.headers.append("Set-Cookie", `vsi_session=; ${expired}`);
      res.headers.append("Set-Cookie", `vsi_user_email=; ${expired}`);
      res.headers.append("Set-Cookie", `vsi_user_name=; ${expired}`);
    }
    return res;
  }

  // A disabled account (or a member of a disabled organization) still holds a valid Supabase
  // session. Stop it here, before any page or route runs. This is the first of three layers: the
  // server helpers (lib/auth getAuthState / require*Api / require*) check again on every request,
  // and the database's row-level rules deny disabled users as well, so nothing relies on this one.
  if (!isPublicPath && user && (await isDisabledAccount(supabase, user.id))) {
    if (isApi) {
      return NextResponse.json(
        { error: "This account has been disabled. Contact your administrator.", code: "account_disabled" },
        { status: 403 },
      );
    }
    const res = NextResponse.redirect(new URL("/login?error=account_disabled", request.url));
    // Sign the browser out: drop the Supabase auth cookies and the client-side session markers.
    const expired = "path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
    for (const c of request.cookies.getAll()) {
      if (/^sb-.+-auth-token(\.\d+)?$/.test(c.name)) res.headers.append("Set-Cookie", `${c.name}=; ${expired}`);
    }
    for (const name of ["vsi_session", "vsi_user_email", "vsi_user_name"]) {
      if (request.cookies.has(name)) res.headers.append("Set-Cookie", `${name}=; ${expired}`);
    }
    return res;
  }

  // A project page answers with a real HTTP 404 when the project isn't visible to this user.
  // dashboard/loading.tsx streams every dashboard page, and a streamed response has already
  // committed to 200 before the page's own notFound() runs, so the check has to happen here,
  // before rendering. It is one query through the user's own session: the database's row-level
  // rules decide, so another organization's project and a project that doesn't exist get the
  // identical answer. The page keeps its own check as a second layer.
  if (user && pathname.startsWith("/dashboard/clients/")) {
    const segment = pathname.split("/")[3] ?? "";
    if (segment && segment !== "new") {
      const visible = UUID_PATTERN.test(segment) ? await isProjectVisible(supabase, segment) : false;
      if (visible === false) {
        const res = NextResponse.rewrite(new URL(PROJECT_NOT_FOUND_PATH, request.url));
        supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c));
        return res;
      }
    }
  }

  // Deep links into a project make it the active project app-wide. Access is
  // still validated server-side in getProjectContext(); an id the user can't
  // see simply falls back to their first project.
  if (pathname.startsWith("/dashboard")) {
    const fromPath = pathname.match(/^\/dashboard\/clients\/([^/]+)/)?.[1];
    const candidate = fromPath ?? request.nextUrl.searchParams.get("client");
    if (candidate && UUID_PATTERN.test(candidate) && request.cookies.get(PROJECT_COOKIE)?.value !== candidate) {
      request.cookies.set(PROJECT_COOKIE, candidate);
      const next = NextResponse.next({ request });
      supabaseResponse.cookies.getAll().forEach((c) => next.cookies.set(c));
      next.cookies.set(PROJECT_COOKIE, candidate, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24 * 365,
      });
      supabaseResponse = next;
    }
  }

  return supabaseResponse;
}

/**
 * One profile read per request. Fails open (returns false) when the profile can't be read: the
 * server helpers and the database still enforce the rule, and a network blip must not lock
 * everyone out.
 */
async function isDisabledAccount(supabase: ReturnType<typeof createServerClient>, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("role, is_disabled, agencies(is_disabled)")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return false;
    const row = data as { role?: string | null; is_disabled?: boolean | null; agencies?: { is_disabled?: boolean | null } | { is_disabled?: boolean | null }[] | null };
    const agency = Array.isArray(row.agencies) ? row.agencies[0] : row.agencies;
    return isAccountBlocked({ role: row.role, userDisabled: row.is_disabled, orgDisabled: agency?.is_disabled });
  } catch {
    return false;
  }
}

/**
 * No route lives here, so a rewrite to it renders the app's not-found page with a real 404
 * (the root layout doesn't stream). The browser keeps the address it asked for.
 */
export const PROJECT_NOT_FOUND_PATH = "/project-not-found";

/**
 * Whether the signed-in user may see this project, decided by the database's row-level rules.
 * null when the check itself failed: the page's own check then applies, so a network blip
 * never turns into a false 404 for a legitimate project.
 */
async function isProjectVisible(supabase: ReturnType<typeof createServerClient>, projectId: string): Promise<boolean | null> {
  try {
    const { data, error } = await supabase.from("clients").select("id").eq("id", projectId).maybeSingle();
    if (error) return null;
    return !!data;
  } catch {
    return null;
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
