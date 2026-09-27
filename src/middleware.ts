import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { currentCookieSessionAllowed } from "@/lib/auth-rules";
import { PROJECT_COOKIE, UUID_PATTERN } from "@/lib/project-types";

// Routes that do not require authentication
const PUBLIC_PATHS = [
  "/",
  "/login",
  "/privacy",
  "/r",
  "/qa",
  "/api/qa",
  "/api/cron",
  "/api/auth",
  "/api/analyze-website",
  "/auth/callback",
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

  // Protect all non-public routes (e.g. /dashboard, /clients, /tasks, /prompts, /settings, /feedback, etc.)
  if (!isPublicPath && !isAuthorized) {
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

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
