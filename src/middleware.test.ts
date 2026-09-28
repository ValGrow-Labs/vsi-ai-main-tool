import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The Supabase user the middleware sees, and their profile row (null: none; "error": the read fails).
const state: {
  user: { id: string; email: string } | null;
  profile: Record<string, unknown> | null | "error";
  /** Project ids the user's row-level rules let them see; "error": the clients read fails. */
  visibleProjects: string[] | "error";
  clientsQueries: string[];
} = { user: null, profile: null, visibleProjects: [], clientsQueries: [] };

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => ({
      select: () => ({
        eq: (_col: string, value: string) => ({
          maybeSingle: async () => {
            if (table === "clients") {
              state.clientsQueries.push(value);
              if (state.visibleProjects === "error") return { data: null, error: { code: "08006", message: "connection failure" } };
              return { data: state.visibleProjects.includes(value) ? { id: value } : null, error: null };
            }
            return state.profile === "error"
              ? { data: null, error: { code: "08006", message: "connection failure" } }
              : { data: state.profile, error: null };
          },
        }),
      }),
    }),
  }),
}));

async function run(path: string, cookies: Record<string, string> = {}) {
  vi.resetModules();
  const { middleware } = await import("./middleware");
  const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  const req = new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie } : {} });
  return middleware(req);
}

const redirectsTo = (res: Response, path: string) =>
  res.status >= 300 && res.status < 400 && new URL(res.headers.get("location") ?? "", "http://localhost:3000").pathname === path;

describe("middleware sign-in rules", () => {
  beforeEach(() => {
    state.user = null;
    state.profile = null;
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcd1234.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lets any signed-in Supabase user into the dashboard, whatever their email", async () => {
    state.user = { id: "u2", email: "new.person@example.org" };
    const res = await run("/dashboard");
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("does not sign a user out or send them to /login because of their email", async () => {
    state.user = { id: "u9", email: "someone.else@example.com" };
    const res = await run("/dashboard/tasks");
    expect(redirectsTo(res, "/login")).toBe(false);
    expect(res.headers.get("set-cookie") ?? "").not.toContain("vsi_session=;");
  });

  it("sends a visitor who is not signed in to /login", async () => {
    const res = await run("/dashboard");
    expect(redirectsTo(res, "/login")).toBe(true);
  });

  it("does not trust forged cookies when a real Supabase project is configured", async () => {
    const res = await run("/dashboard", { vsi_session: "authenticated", vsi_user_email: encodeURIComponent("new.person@example.org") });
    expect(redirectsTo(res, "/login")).toBe(true);
  });

  it("opens the auth page in sign-up mode from the legacy register link", async () => {
    const res = await run("/auth/register");
    const location = new URL(res.headers.get("location") ?? "", "http://localhost:3000");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("mode")).toBe("signup");
  });

  it("keeps the login page public", async () => {
    const res = await run("/login");
    expect(redirectsTo(res, "/login")).toBe(false);
    expect(res.status).toBe(200);
  });

  it("answers an unauthenticated API call with 401 JSON, not a redirect to the login page", async () => {
    for (const path of ["/api/tasks", "/api/check", "/api/jobs/analysis?client_id=x", "/api/projects/abc/keywords"]) {
      const res = await run(path);
      expect(res.status).toBe(401);
      expect(res.headers.get("location")).toBeNull();
      expect(await res.json()).toMatchObject({ code: "unauthenticated" });
    }
  });

  it("keeps the public APIs public (cron is gated by its own secret in the route)", async () => {
    for (const path of ["/api/cron/run-due-clients", "/api/auth/google", "/api/qa/login"]) {
      const res = await run(path);
      expect(res.status).toBe(200);
    }
  });

  it("does not let a forged cookie session call an API", async () => {
    const res = await run("/api/tasks", { vsi_session: "authenticated", vsi_user_email: "x%40example.org" });
    expect(res.status).toBe(401);
  });
});

describe("middleware: disabled accounts", () => {
  beforeEach(() => {
    state.user = { id: "u1", email: "pat@example.org" };
    state.profile = null;
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcd1234.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("answers a disabled user's API call with 403 account_disabled", async () => {
    state.profile = { role: "pilot", is_disabled: true, agencies: { is_disabled: false } };
    const res = await run("/api/tasks");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "account_disabled" });
  });

  it("signs a disabled user out of the dashboard and shows the notice", async () => {
    state.profile = { role: "pilot", is_disabled: true, agencies: { is_disabled: false } };
    const res = await run("/dashboard", { "sb-abcd1234-auth-token": "t", vsi_session: "authenticated" });
    const location = new URL(res.headers.get("location") ?? "", "http://localhost:3000");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("account_disabled");
    const cleared = res.headers.get("set-cookie") ?? "";
    expect(cleared).toContain("sb-abcd1234-auth-token=;");
    expect(cleared).toContain("vsi_session=;");
  });

  it("treats members of a disabled organization the same way, except platform admins", async () => {
    state.profile = { role: "pilot", is_disabled: false, agencies: { is_disabled: true } };
    expect((await run("/api/tasks")).status).toBe(403);
    state.profile = { role: "super_admin", is_disabled: false, agencies: { is_disabled: true } };
    expect((await run("/api/tasks")).status).toBe(200);
  });

  it("lets an active user through", async () => {
    state.profile = { role: "pilot", is_disabled: false, agencies: { is_disabled: false } };
    expect((await run("/dashboard")).status).toBe(200);
    expect((await run("/api/tasks")).status).toBe(200);
  });

  it("does not lock everyone out when the profile can't be read (the server helpers still check)", async () => {
    state.profile = "error";
    expect((await run("/dashboard")).status).toBe(200);
  });

  it("leaves the login page reachable for a disabled user", async () => {
    state.profile = { role: "pilot", is_disabled: true, agencies: null };
    expect((await run("/login?error=account_disabled")).status).toBe(200);
  });
});

describe("middleware: project pages answer a real 404 before streaming", () => {
  const OWN = "11111111-1111-4111-8111-111111111111";
  const FOREIGN = "22222222-2222-4222-8222-222222222222";
  const RANDOM = "33333333-3333-4333-8333-333333333333";
  const rewriteTarget = (res: Response) => {
    const r = res.headers.get("x-middleware-rewrite");
    return r ? new URL(r).pathname : null;
  };
  beforeEach(() => {
    state.user = { id: "u-a", email: "a@example.com" };
    state.profile = { role: "pilot", is_disabled: false, agencies: { is_disabled: false } };
    state.visibleProjects = [OWN];
    state.clientsQueries = [];
  });

  it("own project → continues to the page (loading UI kept)", async () => {
    const res = await run(`/dashboard/clients/${OWN}`);
    expect(rewriteTarget(res)).toBeNull();
    expect(res.status).toBe(200);
  });

  it("another organization's project and a random id get the identical not-found rewrite", async () => {
    const foreign = await run(`/dashboard/clients/${FOREIGN}`);
    const random = await run(`/dashboard/clients/${RANDOM}`);
    expect(rewriteTarget(foreign)).toBe("/project-not-found");
    expect(rewriteTarget(random)).toBe("/project-not-found");
    // Same work for both: exactly one visibility query each, through the user's session.
    expect(state.clientsQueries).toEqual([FOREIGN, RANDOM]);
  });

  it("sub-pages of a foreign project are not-found too, and it never becomes the active project", async () => {
    const res = await run(`/dashboard/clients/${FOREIGN}/keywords`);
    expect(rewriteTarget(res)).toBe("/project-not-found");
    expect(res.headers.get("set-cookie") ?? "").not.toContain(`vsi_project=${FOREIGN}`);
  });

  it("a malformed id is not-found without a database query; /new is left alone", async () => {
    expect(rewriteTarget(await run("/dashboard/clients/not-a-uuid"))).toBe("/project-not-found");
    expect(rewriteTarget(await run("/dashboard/clients/new"))).toBeNull();
    expect(state.clientsQueries).toEqual([]);
  });

  it("if the visibility check itself fails, the page's own check decides (no false 404)", async () => {
    state.visibleProjects = "error";
    expect(rewriteTarget(await run(`/dashboard/clients/${OWN}`))).toBeNull();
  });

  it("signed-out users are still sent to login first", async () => {
    state.user = null;
    const res = await run(`/dashboard/clients/${FOREIGN}`);
    expect(redirectsTo(res, "/login")).toBe(true);
  });
});
