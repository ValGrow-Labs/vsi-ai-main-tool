import { describe, expect, it, vi } from "vitest";
import { createWorkspace, selfServiceSlug, slugify, validateOrganizationName, type WorkspaceClient } from "./workspace";

type Reply = { data?: unknown; error: { message?: string; code?: string } | null };

function client(...replies: (Reply | Error)[]) {
  let i = 0;
  const rpc = vi.fn(async () => {
    const r = replies[Math.min(i++, replies.length - 1)];
    if (r instanceof Error) throw r;
    return { data: r.data ?? null, error: r.error };
  });
  return { rpc, client: { rpc } as WorkspaceClient };
}

// The same rule the database applies to a slug (migration 039).
const DB_SLUG_RULE = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;

describe("organization name and slug", () => {
  it("validates the name", () => {
    expect(validateOrganizationName("  ")).toBeTruthy();
    expect(validateOrganizationName("x".repeat(81))).toBeTruthy();
    expect(validateOrganizationName("Bad\nName")).toBeTruthy();
    expect(validateOrganizationName("Acme Plumbing")).toBeNull();
    expect(validateOrganizationName("x".repeat(80))).toBeNull();
  });

  it("slugifies like the existing onboarding did", () => {
    expect(slugify("Acme Plumbing & Sons!")).toBe("acme-plumbing-sons");
  });

  it("adds a short suffix so common names don't collide", () => {
    expect(selfServiceSlug("Acme", () => 0)).toBe("acme-0000");
    expect(selfServiceSlug("Acme", () => 0.5)).toMatch(/^acme-[0-9a-z]{4}$/);
    expect(selfServiceSlug("!!!", () => 0)).toBe("workspace-0000");
  });

  it("always produces a slug the database accepts, whatever the name", () => {
    const names = ["Acme", "A - B", "  Spaced   Out  ", "-Leading", "Trailing-", "UPPER Case", "ünïcödé Café", "x".repeat(200), "a--b", "!!!", "123", "Acme & Sons, Ltd."];
    for (const n of names) {
      expect(selfServiceSlug(n), n).toMatch(DB_SLUG_RULE);
      expect(selfServiceSlug(n, () => 0.999999), n).toMatch(DB_SLUG_RULE);
    }
  });
});

describe("createWorkspace: self-service (no invite)", () => {
  it("creates the organization through the database function, never by writing tables or roles", async () => {
    const { rpc, client: c } = client({ error: null });
    const result = await createWorkspace(c, { name: "  Acme Plumbing  " });
    expect(result).toEqual({ status: "created", path: "self_service" });
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(fn).toBe("create_own_organization");
    expect(args.p_agency_name).toBe("Acme Plumbing");
    // The role and the user are decided inside the database: the browser sends only a name and a slug.
    expect(Object.keys(args).sort()).toEqual(["p_agency_name", "p_slug"]);
    expect(args.p_slug).toMatch(DB_SLUG_RULE);
  });

  it("says it is unavailable, and doesn't pretend to succeed, while the database function is missing", async () => {
    const { client: c } = client({ error: { code: "PGRST202", message: "Could not find the function public.create_own_organization" } });
    const result = await createWorkspace(c, { name: "Acme" });
    expect(result.status).toBe("unavailable");
    expect(result.status === "unavailable" && result.message).toMatch(/Database setup incomplete/);
  });

  it("retries with a fresh slug when the address is taken, then succeeds", async () => {
    const clash = { error: { code: "23505", message: "Organization slug is already in use" } };
    const { rpc, client: c } = client(clash, clash, { error: null });
    expect(await createWorkspace(c, { name: "Acme" })).toEqual({ status: "created", path: "self_service" });
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it("gives up after a few clashes with a message the person can act on", async () => {
    const { rpc, client: c } = client({ error: { code: "23505", message: "Organization slug is already in use" } });
    const result = await createWorkspace(c, { name: "Acme" });
    expect(rpc).toHaveBeenCalledTimes(3);
    // Wording updated in fac45b0 (it now also says why); the behaviour under test is unchanged.
    expect(result).toEqual({ status: "error", message: "Could not create the organization. Organization name or address is already in use. Try a different name." });
    expect(result.status === "error" && result.message).not.toMatch(/slug|23505|duplicate key/i);
  });

  it("treats an account that already has an organization as done, not as a failure", async () => {
    const { rpc, client: c } = client({ error: { code: "42501", message: "Account is already set up" } });
    expect(await createWorkspace(c, { name: "Acme" })).toEqual({ status: "already_set_up" });
    expect(rpc).toHaveBeenCalledTimes(1); // and it does not retry into a second organization
  });

  it("explains an expired session, a disabled account and a missing profile", async () => {
    const expired = await createWorkspace(client({ error: { code: "42501", message: "Not signed in" } }).client, { name: "Acme" });
    // Wording updated in fac45b0 ("Please sign in before creating a workspace."); it still tells the person to sign in.
    expect(expired).toMatchObject({ status: "error", message: expect.stringMatching(/sign in/i) });
    const disabled = await createWorkspace(client({ error: { code: "42501", message: "This account is disabled" } }).client, { name: "Acme" });
    expect(disabled).toMatchObject({ status: "error", message: expect.stringMatching(/disabled/) });
    const missing = await createWorkspace(client({ error: { code: "P0002", message: "Profile not found for this account" } }).client, { name: "Acme" });
    expect(missing).toMatchObject({ status: "error", message: expect.stringMatching(/account profile/) });
  });

  it("maps the database's own validation errors", async () => {
    const long = await createWorkspace(client({ error: { code: "22023", message: "Organization name must be 80 characters or fewer" } }).client, { name: "Acme" });
    expect(long).toMatchObject({ status: "error", message: expect.stringMatching(/at most 80/) });
    const chars = await createWorkspace(client({ error: { code: "22023", message: "Organization name contains invalid characters" } }).client, { name: "Acme" });
    expect(chars).toMatchObject({ status: "error", message: expect.stringMatching(/aren't allowed/) });
  });

  it("shows the real problem but never raw database text", async () => {
    const result = await createWorkspace(client({ error: { code: "XX000", message: 'relation "public.agencies" violates internal thing pg_xyz' } }).client, { name: "Acme" });
    expect(result).toEqual({ status: "error", message: "Account setup failed. Please try again." });
  });

  it.each([
    { code: "23503", message: 'insert or update on table "agencies" violates foreign key constraint "agencies_owner_fkey"' },
    { code: "23514", message: 'new row for relation "profiles" violates check constraint "profiles_role_check"' },
    { code: "42501", message: "permission denied for table agencies" },
    { code: "42703", message: 'column "p_slug" does not exist at character 17: select * from public.agencies where slug = $1' },
    { code: "P0001", message: "ERROR:  something unexpected\nCONTEXT:  PL/pgSQL function create_own_organization(text,text) line 42 at RAISE" },
    { code: "", message: "" },
  ])("unknown database error $code → the generic message, with no database text", async (error) => {
    for (const inviteCode of ["", "VG-AAAA-BBBB"]) {
      const result = await createWorkspace(client({ error }).client, { name: "Acme", inviteCode });
      expect(result).toEqual({ status: "error", message: "Account setup failed. Please try again." });
      const text = JSON.stringify(result);
      for (const leak of [/relation|table|column|constraint|violates|select |public\.|pl\/pgsql|context|line \d+|_fkey|_check/i, /\b(235|425|427|P0)\d{2}\b/]) {
        expect(text).not.toMatch(leak);
      }
    }
  });

  it("the setup-missing message names no database function, migration or tool", async () => {
    const result = await createWorkspace(client({ error: { code: "PGRST202", message: "Could not find the function public.create_own_organization" } }).client, { name: "Acme" });
    expect(result.status).toBe("unavailable");
    expect(JSON.stringify(result)).not.toMatch(/create_own_organization|complete_onboarding|rpc|migration|\.sql|sql editor|supabase/i);
  });

  it("known, safe errors keep their own messages", async () => {
    const cases: [{ code?: string; message: string }, RegExp][] = [
      [{ code: "42501", message: "This account is disabled" }, /account is disabled/],
      [{ code: "P0002", message: "Profile not found for this account" }, /account profile/],
      [{ code: "22023", message: "Organization name must be 80 characters or fewer" }, /at most 80/],
      [{ code: "22023", message: "Organization name is required" }, /Enter a name/],
    ];
    for (const [error, expected] of cases) {
      const result = await createWorkspace(client({ error }).client, { name: "Acme" });
      expect(result).toMatchObject({ status: "error", message: expect.stringMatching(expected) });
    }
  });

  it("survives a network failure and reports it", async () => {
    const result = await createWorkspace(client(new Error("fetch failed")).client, { name: "Acme" });
    expect(result.status).toBe("error");
  });

  it("rejects an empty or invalid name without calling the database", async () => {
    const { rpc, client: c } = client({ error: null });
    expect(await createWorkspace(c, { name: "   " })).toMatchObject({ status: "error" });
    expect(await createWorkspace(c, { name: "x".repeat(81) })).toMatchObject({ status: "error" });
    expect(await createWorkspace(c, { name: "Bad\u0000Name" })).toMatchObject({ status: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never sends a role, user id, organization id or permission", async () => {
    const { rpc, client: c } = client({ error: null });
    await createWorkspace(c, { name: "Acme", inviteCode: "" });
    const [, args] = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    for (const forbidden of ["role", "p_role", "user_id", "p_user", "agency_id", "p_agency_id", "organization_id", "permissions", "is_pilot", "max_keywords"]) {
      expect(args).not.toHaveProperty(forbidden);
    }
  });
});

describe("createWorkspace: with an invite code (existing flow)", () => {
  it("uses complete_onboarding, so the invite decides the role", async () => {
    const { rpc, client: c } = client({ error: null });
    const result = await createWorkspace(c, { name: "Acme Plumbing", inviteCode: " vg-4q7a-k9d2 " });
    expect(result).toEqual({ status: "created", path: "invite" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("complete_onboarding", { p_code: "VG-4Q7A-K9D2", p_agency_name: "Acme Plumbing", p_slug: "acme-plumbing" });
  });

  it("does not call the self-service function when an invite code is given", async () => {
    const { rpc, client: c } = client({ error: null });
    await createWorkspace(c, { name: "Acme", inviteCode: "VG-AAAA-BBBB" });
    expect(rpc.mock.calls.map((call) => (call as unknown[])[0])).toEqual(["complete_onboarding"]);
  });

  it("reports an invalid or used invite", async () => {
    const result = await createWorkspace(client({ error: { message: "This invite is invalid or already used" } }).client, { name: "Acme", inviteCode: "VG-XXXX-XXXX" });
    expect(result).toMatchObject({ status: "error", message: expect.stringMatching(/Invalid or expired invite code/) });
  });

  it("treats an already-set-up account as done", async () => {
    const result = await createWorkspace(client({ error: { message: "Account is already set up" } }).client, { name: "Acme", inviteCode: "VG-AAAA-BBBB" });
    expect(result).toEqual({ status: "already_set_up" });
  });
});
