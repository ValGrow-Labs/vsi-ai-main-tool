import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeDb, fakeSupabaseClient, profileRow } from "@/test-utils/fake-supabase";

// Disabled accounts (profiles.is_disabled, or a disabled organization) at the application layer.
// The database's row-level rules deny them as well; these tests cover the server helpers.

const db = createFakeDb();
const cookieJar: Record<string, string> = {};

vi.mock("next/headers", () => ({
  cookies: async () => ({
    has: (n: string) => n in cookieJar,
    get: (n: string) => (n in cookieJar ? { name: n, value: cookieJar[n] } : undefined),
    getAll: () => Object.entries(cookieJar).map(([name, value]) => ({ name, value })),
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeSupabaseClient(db) }));

const auth = await import("./auth");
const { adminApiSession } = await import("./admin/api");
const { requireProjectContext } = await import("./project-context");

function signIn(profile: Parameters<typeof profileRow>[0]) {
  cookieJar["sb-abcd1234-auth-token"] = "token";
  db.user = { id: profile.id, email: `${profile.id}@example.org` };
  db.tables.profiles = [profileRow(profile)];
}

async function jsonOf(r: unknown) {
  expect(r).toBeInstanceOf(Response);
  const res = r as Response;
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcd1234.supabase.co");
  for (const k of Object.keys(cookieJar)) delete cookieJar[k];
  db.user = null;
  db.tables = {};
  db.errors = {};
});
afterEach(() => vi.unstubAllEnvs());

describe("disabled user, still holding a valid Supabase session", () => {
  beforeEach(() => signIn({ id: "u1", agencyId: "org-a", disabled: true }));

  it("getAuthState says disabled; getSession gives no session", async () => {
    expect(await auth.getAuthState()).toEqual({ status: "disabled" });
    expect(await auth.getSession()).toBeNull();
  });

  it("pages and layouts send them to the disabled notice, not the dashboard", async () => {
    await expect(auth.requireAgency()).rejects.toThrow("REDIRECT /login?error=account_disabled");
    await expect(auth.requireSuperAdmin()).rejects.toThrow("REDIRECT /login?error=account_disabled");
    await expect(requireProjectContext()).rejects.toThrow("REDIRECT /login?error=account_disabled");
  });

  it("APIs answer 403 account_disabled (not 401: they are signed in, but not allowed)", async () => {
    for (const guard of [auth.requireSessionApi, auth.requireAgencyApi, auth.requireSuperAdminApi, adminApiSession]) {
      const { status, body } = await jsonOf(await guard());
      expect(status).toBe(403);
      expect(body.code).toBe("account_disabled");
    }
  });

  it("applies to a disabled platform admin too", async () => {
    signIn({ id: "u1", agencyId: null, role: "super_admin", disabled: true });
    expect((await auth.getAuthState()).status).toBe("disabled");
    expect((await jsonOf(await auth.requireSuperAdminApi())).status).toBe(403);
  });
});

describe("member of a disabled organization", () => {
  it("is denied like a disabled user", async () => {
    signIn({ id: "u2", agencyId: "org-a", orgDisabled: true });
    expect((await auth.getAuthState()).status).toBe("disabled");
    expect((await jsonOf(await auth.requireAgencyApi())).body.code).toBe("account_disabled");
    await expect(auth.requireAgency()).rejects.toThrow("REDIRECT /login?error=account_disabled");
  });

  it("except a platform admin, so the platform can't lock itself out", async () => {
    signIn({ id: "u3", agencyId: "org-a", role: "super_admin", orgDisabled: true });
    expect((await auth.getAuthState()).status).toBe("active");
  });
});

describe("active and signed-out users", () => {
  it("an active user gets through every guard", async () => {
    signIn({ id: "u4", agencyId: "org-a" });
    await expect(auth.requireAgency()).resolves.toMatchObject({ userId: "u4", agencyId: "org-a" });
    await expect(auth.requireAgencyApi()).resolves.toMatchObject({ userId: "u4", agencyId: "org-a" });
    await expect(auth.requireSessionApi()).resolves.toMatchObject({ userId: "u4" });
  });

  it("an active member is not a platform admin: 403 forbidden", async () => {
    signIn({ id: "u4", agencyId: "org-a" });
    const { status, body } = await jsonOf(await auth.requireSuperAdminApi());
    expect(status).toBe(403);
    expect(body.code).toBe("forbidden");
  });

  it("a user with no organization: pages go to onboarding, APIs answer 403 no_organization", async () => {
    signIn({ id: "u5", agencyId: null });
    await expect(auth.requireAgency()).rejects.toThrow("REDIRECT /onboarding");
    const { status, body } = await jsonOf(await auth.requireAgencyApi());
    expect(status).toBe(403);
    expect(body.code).toBe("no_organization");
    await expect(auth.requireSessionApi()).resolves.toMatchObject({ userId: "u5", agencyId: null });
  });

  it("signed out: APIs answer 401, pages go to /login", async () => {
    for (const guard of [auth.requireSessionApi, auth.requireAgencyApi, auth.requireSuperAdminApi]) {
      const { status, body } = await jsonOf(await guard());
      expect(status).toBe(401);
      expect(body.code).toBe("unauthenticated");
    }
    await expect(auth.requireAgency()).rejects.toThrow("REDIRECT /login");
  });

  it("a Supabase cookie whose user no longer verifies is signed out, not disabled", async () => {
    cookieJar["sb-abcd1234-auth-token"] = "stale";
    db.user = null;
    expect(await auth.getAuthState()).toEqual({ status: "signed_out" });
  });
});

describe("apiServerError", () => {
  it("never sends database text to the browser", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = auth.apiServerError("test", { code: "42P01", message: 'relation "secret_table" does not exist' });
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("secret_table");
    spy.mockRestore();
  });

  it("treats a body that isn't JSON as the caller's mistake (400)", async () => {
    const res = auth.apiServerError("test", new SyntaxError("Unexpected token"));
    expect(res.status).toBe(400);
  });
});
