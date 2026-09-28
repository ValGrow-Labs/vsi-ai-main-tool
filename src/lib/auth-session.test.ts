import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Cookies the "browser" sends, and the Supabase user/profile the server sees.
const state: {
  cookies: Record<string, string>;
  user: { id: string; email: string } | null;
  profile: Record<string, unknown> | null;
} = { cookies: {}, user: null, profile: null };

vi.mock("next/headers", () => ({
  cookies: async () => ({
    has: (n: string) => n in state.cookies,
    get: (n: string) => (n in state.cookies ? { name: n, value: state.cookies[n] } : undefined),
    getAll: () => Object.entries(state.cookies).map(([name, value]) => ({ name, value })),
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: state.profile }) }) }),
    }),
  }),
}));

const ADMIN_EMAIL = "valgrowlabs444@gmail.com";
const forged = { vsi_session: "authenticated", vsi_user_email: encodeURIComponent(ADMIN_EMAIL) };

async function freshSession() {
  vi.resetModules();
  const mod = await import("./auth");
  return mod;
}

describe("getSession", () => {
  beforeEach(() => {
    state.cookies = {};
    state.user = null;
    state.profile = null;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ignores forged cookies when a real Supabase project is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcd1234.supabase.co");
    vi.stubEnv("NODE_ENV", "production");
    state.cookies = forged;
    const { getSession } = await freshSession();
    expect(await getSession()).toBeNull();
  });

  it("ignores forged cookies in production even with placeholder credentials", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co");
    vi.stubEnv("NODE_ENV", "production");
    state.cookies = forged;
    const { getSession } = await freshSession();
    expect(await getSession()).toBeNull();
  });

  it("still allows the local development session without a database", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co");
    vi.stubEnv("NODE_ENV", "development");
    state.cookies = forged;
    const { getSession } = await freshSession();
    expect((await getSession())?.email).toBe(ADMIN_EMAIL);
  });

  it("uses the Supabase user and profile role", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcd1234.supabase.co");
    state.cookies = { "sb-abcd1234-auth-token": "x" };
    state.user = { id: "u1", email: ADMIN_EMAIL };
    state.profile = { agency_id: "a1", role: "pilot", full_name: "Pat", is_disabled: false, agencies: { name: "Acme", is_disabled: false } };
    const { getSession } = await freshSession();
    const s = await getSession();
    expect(s?.userId).toBe("u1");
    expect(s?.role).toBe("pilot");
  });

  it("signs out a disabled user and members of a disabled organization", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcd1234.supabase.co");
    state.cookies = { "sb-abcd1234-auth-token": "x" };
    state.user = { id: "u1", email: ADMIN_EMAIL };
    state.profile = { agency_id: "a1", role: "pilot", is_disabled: true, agencies: { name: "Acme", is_disabled: false } };
    let mod = await freshSession();
    expect(await mod.getSession()).toBeNull();

    state.profile = { agency_id: "a1", role: "pilot", is_disabled: false, agencies: { name: "Acme", is_disabled: true } };
    mod = await freshSession();
    expect(await mod.getSession()).toBeNull();
  });

  it("requireSuperAdmin sends a member away", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcd1234.supabase.co");
    state.cookies = { "sb-abcd1234-auth-token": "x" };
    state.user = { id: "u1", email: ADMIN_EMAIL };
    state.profile = { agency_id: "a1", role: "pilot", is_disabled: false, agencies: { name: "Acme", is_disabled: false } };
    const { requireSuperAdmin } = await freshSession();
    await expect(requireSuperAdmin()).rejects.toThrow("REDIRECT /dashboard");
  });

  it("admin APIs answer 401/403 in JSON instead of redirecting", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcd1234.supabase.co");
    vi.resetModules();
    let { adminApiSession } = await import("./admin/api");
    const anon = await adminApiSession();
    expect(anon instanceof Response && anon.status).toBe(401);

    state.cookies = { "sb-abcd1234-auth-token": "x" };
    state.user = { id: "u1", email: ADMIN_EMAIL };
    state.profile = { agency_id: "a1", role: "pilot", is_disabled: false, agencies: { name: "Acme", is_disabled: false } };
    vi.resetModules();
    ({ adminApiSession } = await import("./admin/api"));
    const member = await adminApiSession();
    expect(member instanceof Response && member.status).toBe(403);

    state.profile = { ...state.profile, role: "super_admin" };
    vi.resetModules();
    ({ adminApiSession } = await import("./admin/api"));
    const admin = await adminApiSession();
    expect(admin instanceof Response).toBe(false);
  });
});

// Sign-in is open to every Supabase user. Access is decided by the profile role and
// organization, never by the email address.
describe("open sign-in (no email allowlist)", () => {
  const OTHER_EMAIL = "new.person@example.org";
  const realSupabase = () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcd1234.supabase.co");
    state.cookies = { "sb-abcd1234-auth-token": "x" };
  };

  beforeEach(() => {
    state.cookies = {};
    state.user = null;
    state.profile = null;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("gives a session to any Supabase user, as their profile's role", async () => {
    realSupabase();
    state.user = { id: "u2", email: OTHER_EMAIL };
    state.profile = { agency_id: "a2", role: "pilot", full_name: "New Person", is_disabled: false, agencies: { name: "Their Org", is_disabled: false } };
    const { getSession } = await freshSession();
    const s = await getSession();
    expect(s?.email).toBe(OTHER_EMAIL);
    expect(s?.role).toBe("pilot");
    expect(s?.agencyId).toBe("a2");
  });

  it("keeps a new member out of the admin area", async () => {
    realSupabase();
    state.user = { id: "u2", email: OTHER_EMAIL };
    state.profile = { agency_id: "a2", role: "pilot", is_disabled: false, agencies: { name: "Their Org", is_disabled: false } };
    const { requireSuperAdmin } = await freshSession();
    await expect(requireSuperAdmin()).rejects.toThrow("REDIRECT /dashboard");
  });

  it("gives the former admin address no privilege of its own", async () => {
    realSupabase();
    state.user = { id: "u1", email: ADMIN_EMAIL };
    state.profile = { agency_id: "a1", role: "pilot", is_disabled: false, agencies: { name: "Acme", is_disabled: false } };
    const { getSession, requireSuperAdmin } = await freshSession();
    expect((await getSession())?.role).toBe("pilot");
    await expect(requireSuperAdmin()).rejects.toThrow("REDIRECT /dashboard");
  });

  it("makes someone a super admin only through the profile role", async () => {
    realSupabase();
    state.user = { id: "u3", email: OTHER_EMAIL };
    state.profile = { agency_id: "a3", role: "super_admin", is_disabled: false, agencies: { name: "Platform", is_disabled: false } };
    const { getSession, requireSuperAdmin } = await freshSession();
    expect((await getSession())?.role).toBe("super_admin");
    await expect(requireSuperAdmin()).resolves.toMatchObject({ role: "super_admin" });
  });

  it("returns no session when nobody is signed in", async () => {
    realSupabase();
    state.user = null;
    const { getSession } = await freshSession();
    expect(await getSession()).toBeNull();
  });

  it("gives the local development session to any email, as a member by default", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co");
    vi.stubEnv("NODE_ENV", "development");
    state.cookies = { vsi_session: "authenticated", vsi_user_email: encodeURIComponent(OTHER_EMAIL) };
    const { getSession } = await freshSession();
    const s = await getSession();
    expect(s?.email).toBe(OTHER_EMAIL);
    expect(s?.role).toBe("pilot");
  });

  it("gives the local development session admin rights only when explicitly opted in", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co");
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VSI_DEV_SESSION_ROLE", "super_admin");
    state.cookies = { vsi_session: "authenticated", vsi_user_email: encodeURIComponent(OTHER_EMAIL) };
    const { getSession } = await freshSession();
    expect((await getSession())?.role).toBe("super_admin");
  });

  it("does not trust a development cookie session without an email", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co");
    vi.stubEnv("NODE_ENV", "development");
    state.cookies = { vsi_session: "authenticated" };
    const { getSession } = await freshSession();
    expect(await getSession()).toBeNull();
  });
});

// A newly registered account has a profile (from the sign-up trigger) but no organization yet.
describe("new account with no organization", () => {
  const NEW_EMAIL = "fresh.signup@example.org";
  const realSupabase = () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcd1234.supabase.co");
    state.cookies = { "sb-abcd1234-auth-token": "x" };
    state.user = { id: "u9", email: NEW_EMAIL };
  };

  beforeEach(() => {
    state.cookies = {};
    state.user = null;
    state.profile = null;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("has no organization at all: no id, no name, no invented one", async () => {
    realSupabase();
    state.profile = { agency_id: null, role: "pilot", full_name: "Fresh Signup", is_disabled: false, agencies: null };
    const { getSession } = await freshSession();
    const s = await getSession();
    expect(s?.email).toBe(NEW_EMAIL);
    expect(s?.agencyId).toBeNull();
    expect(s?.agencyName).toBeNull();
    expect(JSON.stringify(s)).not.toContain("Valgrow");
    expect(JSON.stringify(s)).not.toContain("00000000-0000-0000-0000-000000000001");
  });

  it("stays without an organization when the profile row can't be read", async () => {
    realSupabase();
    state.profile = null;
    const { getSession } = await freshSession();
    const s = await getSession();
    expect(s?.agencyId).toBeNull();
    expect(s?.agencyName).toBeNull();
    expect(s?.role).toBe("pilot");
  });

  it("is an ordinary member, never a super admin", async () => {
    realSupabase();
    state.profile = { agency_id: null, role: "pilot", is_disabled: false, agencies: null };
    const { getSession, requireSuperAdmin } = await freshSession();
    expect((await getSession())?.role).toBe("pilot");
    await expect(requireSuperAdmin()).rejects.toThrow("REDIRECT /dashboard");
  });

  it("is sent to onboarding to create an organization, not into the dashboard", async () => {
    realSupabase();
    state.profile = { agency_id: null, role: "pilot", is_disabled: false, agencies: null };
    const { requireAgency } = await freshSession();
    await expect(requireAgency()).rejects.toThrow("REDIRECT /onboarding");
  });

  it("gets the real organization once one exists", async () => {
    realSupabase();
    state.profile = { agency_id: "org-1", role: "pilot", is_disabled: false, agencies: { name: "Acme Plumbing", is_disabled: false } };
    const { requireAgency } = await freshSession();
    await expect(requireAgency()).resolves.toMatchObject({ agencyId: "org-1", agencyName: "Acme Plumbing", role: "pilot" });
  });

  it("sends nobody-signed-in to the login page", async () => {
    realSupabase();
    state.user = null;
    const { requireAgency } = await freshSession();
    await expect(requireAgency()).rejects.toThrow("REDIRECT /login");
  });

  it("API routes get JSON: 401 when signed out, 403 without an organization, never a stand-in one", async () => {
    realSupabase();
    state.user = null;
    let { requireAgencyApi } = await freshSession();
    const anon = await requireAgencyApi();
    expect(anon instanceof Response && anon.status).toBe(401);

    state.user = { id: "u9", email: NEW_EMAIL };
    state.profile = { agency_id: null, role: "pilot", is_disabled: false, agencies: null };
    ({ requireAgencyApi } = await freshSession());
    const noOrg = await requireAgencyApi();
    expect(noOrg instanceof Response && noOrg.status).toBe(403);
    expect(noOrg instanceof Response && (await noOrg.json()).code).toBe("no_organization");

    state.profile = { agency_id: "org-1", role: "pilot", is_disabled: false, agencies: { name: "Acme Plumbing", is_disabled: false } };
    ({ requireAgencyApi } = await freshSession());
    await expect(requireAgencyApi()).resolves.toMatchObject({ agencyId: "org-1", agencyName: "Acme Plumbing" });
  });

  it("the local development session keeps its own fixture organization", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co");
    vi.stubEnv("NODE_ENV", "development");
    state.cookies = { vsi_session: "authenticated", vsi_user_email: encodeURIComponent(NEW_EMAIL) };
    const { requireAgency } = await freshSession();
    await expect(requireAgency()).resolves.toMatchObject({ agencyId: "00000000-0000-0000-0000-000000000001" });
  });

  it("still lets an explicit super admin through, with or without an organization", async () => {
    realSupabase();
    state.profile = { agency_id: null, role: "super_admin", is_disabled: false, agencies: null };
    const { requireSuperAdmin } = await freshSession();
    await expect(requireSuperAdmin()).resolves.toMatchObject({ role: "super_admin", agencyId: null });
  });
});
