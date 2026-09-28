/**
 * Database security tests for migration 044 (feedback, analytics_events, system_settings/prompts,
 * invite email binding). The real migration chain (001 → 044) is replayed into an in-memory PGlite
 * database and exercised as the Supabase API roles. Nothing here touches a real Supabase project.
 * See supabase/tests/pglite-harness.ts and db-policies.test.ts (043).
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../supabase/tests/pglite-harness";

const U = {
  a: "00000000-0000-4000-8000-00000000000a", // member of org A
  b: "00000000-0000-4000-8000-00000000000b", // member of org B
  d: "00000000-0000-4000-8000-00000000000d", // disabled member of org A
  s: "00000000-0000-4000-8000-000000000005", // platform admin (org A)
  n: "00000000-0000-4000-8000-000000000001", // signed up, no org yet
  o: "00000000-0000-4000-8000-000000000006", // member of disabled org O
  alice: "00000000-0000-4000-8000-0000000000a1",
  bob: "00000000-0000-4000-8000-0000000000b1",
  mallory: "00000000-0000-4000-8000-0000000000e1",
  dave: "00000000-0000-4000-8000-0000000000d1",
  erin: "00000000-0000-4000-8000-0000000000f1",
  frank: "00000000-0000-4000-8000-0000000000f2",
};
const EMAIL: Partial<Record<keyof typeof U, string>> = {
  alice: " Alice@Example.COM ", // messy casing/whitespace in auth.users
  bob: "bob@example.com",
  mallory: "mallory@example.com",
  dave: "dave@example.com",
  erin: "erin@example.com",
  frank: "frank@example.com",
};
const ORG = {
  a: "10000000-0000-4000-8000-00000000000a",
  b: "10000000-0000-4000-8000-00000000000b",
  o: "10000000-0000-4000-8000-000000000006",
};

type Who = { role: "anon" | "authenticated" | "service_role"; userId?: string | null };
const anon: Who = { role: "anon" };
const as = (userId: string): Who => ({ role: "authenticated", userId });

async function seed(t: TestDb) {
  for (const [k, id] of Object.entries(U)) {
    await t.admin(`insert into auth.users (id, email) values ($1, $2)`, [id, EMAIL[k as keyof typeof U] ?? `${k}@example.test`]);
  }
  await t.admin(
    `insert into public.agencies (id, name, slug) values ($1,'Org A','org-a'), ($2,'Org B','org-b'), ($3,'Org O','org-o')`,
    [ORG.a, ORG.b, ORG.o],
  );
  await t.admin(`update public.agencies set is_disabled = true where id = $1`, [ORG.o]);
  await t.admin(`update public.profiles set agency_id = $1 where id in ($2, $3, $4)`, [ORG.a, U.a, U.d, U.s]);
  await t.admin(`update public.profiles set agency_id = $1 where id = $2`, [ORG.b, U.b]);
  await t.admin(`update public.profiles set agency_id = $1 where id = $2`, [ORG.o, U.o]);
  await t.admin(`update public.profiles set is_disabled = true where id = $1`, [U.d]);
  await t.admin(`update public.profiles set role = 'super_admin' where id = $1`, [U.s]);

  await t.admin(
    `insert into public.feedback (user_id, agency_id, category, message) values ($1, $2, 'bug', 'from b'), ($3, $4, 'idea', 'from a (seed)')`,
    [U.b, ORG.b, U.a, ORG.a],
  );
  await t.admin(`insert into public.analytics_events (agency_id, event_type) values ($1, 'seed_a'), ($2, 'seed_b')`, [ORG.a, ORG.b]);
  await t.admin(`insert into public.prompts (key, template) values ('seed_prompt', 'secret prompt template')`);

  await t.admin(
    `insert into public.invites (code, email, role, max_keywords) values
       ('MAIL-ALICE', 'alice@example.com', 'pilot', 25),
       ('MAIL-BOB',   ' Bob@Example.com ', 'pilot', 10),
       ('MAIL-CAROL', 'carol@example.com', 'pilot', 10),
       ('OPEN-1',     null,                'pilot', 10),
       ('BLANK-1',    '   ',               'pilot', 10),
       ('SA-ORPHAN',  'erin@example.com',  'super_admin', 999999)`,
  );
  // A super_admin invite whose creator is not (or no longer) a platform admin.
  await t.admin(
    `insert into public.invites (code, email, role, max_keywords, created_by) values ('SA-DEMOTED', 'frank@example.com', 'super_admin', 999999, $1)`,
    [U.a],
  );
}

async function denied(p: Promise<unknown>, pattern: RegExp = /row-level security|permission denied|not allowed/i) {
  await expect(p).rejects.toThrow(pattern);
}

describe("migration 044", () => {
  let t: TestDb;
  beforeAll(async () => {
    // Exercises 044 as shipped: replay stops at 044 (045 later restricts event_type; see db-policies-045.test.ts).
    t = await createTestDb({ include: (file) => file <= "044_security_followups.sql" });
    await seed(t);
  }, 120_000);

  it("replays the whole chain through 044", () => {
    expect(t.applied).toContain("043_security_hardening.sql");
    expect(t.applied[t.applied.length - 1]).toBe("044_security_followups.sql");
  });

  // ────────────────────────────────────────────────────────────
  describe("feedback", () => {
    const insertSql = `insert into public.feedback (user_id, agency_id, category, message, status, admin_notes)
                       values ($1, $2, 'bug', 'hello', $3, $4) returning user_id, agency_id, status, admin_notes`;

    it("signed-out insert is denied", async () => {
      await denied(t.as(anon, `insert into public.feedback (category, message) values ('bug', 'anon')`));
    });

    it("a user inserts as self; user_id and admin columns are forced even if the client sends B's id", async () => {
      const [row] = await t.as(as(U.a), insertSql, [U.b, ORG.a, "done", "fake admin note"]);
      expect(row).toEqual({ user_id: U.a, agency_id: ORG.a, status: "new", admin_notes: null });
    });

    it("agency_id may be null (user without an organization)", async () => {
      const [row] = await t.as(as(U.n), insertSql, [null, null, "new", null]);
      expect(row.user_id).toBe(U.n);
    });

    it("another organization's agency_id is denied", async () => {
      await denied(t.as(as(U.a), insertSql, [U.a, ORG.b, "new", null]));
      await denied(t.as(as(U.n), insertSql, [U.n, ORG.a, "new", null]));
    });

    it("a non-admin cannot update status/admin_notes, even on their own row", async () => {
      const upd = await t.as(as(U.a), `update public.feedback set status = 'done', admin_notes = 'x' where user_id = $1 returning id`, [U.a]);
      expect(upd).toHaveLength(0);
      const rows = await t.admin<{ status: string; admin_notes: string | null }>(`select status, admin_notes from public.feedback where user_id = $1`, [U.a]);
      expect(rows.every((r) => r.status === "new" && r.admin_notes === null)).toBe(true);
    });

    it("A cannot read B's feedback", async () => {
      const rows = await t.as<{ user_id: string }>(as(U.a), `select user_id from public.feedback`);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.user_id === U.a)).toBe(true);
    });

    it("super_admin reads all feedback and can triage it", async () => {
      const rows = await t.as<{ user_id: string }>(as(U.s), `select user_id from public.feedback`);
      expect(new Set(rows.map((r) => r.user_id))).toEqual(new Set([U.a, U.b, U.n]));
      const upd = await t.as(as(U.s), `update public.feedback set status = 'triaged', admin_notes = 'seen' where user_id = $1 returning status, admin_notes`, [U.b]);
      expect(upd).toEqual([{ status: "triaged", admin_notes: "seen" }]);
    });

    it("a disabled user can neither insert nor read feedback", async () => {
      await t.admin(`insert into public.feedback (user_id, agency_id, category, message) values ($1, $2, 'bug', 'before disable')`, [U.d, ORG.a]);
      await denied(t.as(as(U.d), `insert into public.feedback (category, message) values ('bug', 'x')`));
      expect(await t.as(as(U.d), `select id from public.feedback`)).toHaveLength(0);
    });
  });

  // ────────────────────────────────────────────────────────────
  describe("analytics_events", () => {
    it("has no raw user_id column (identity is the app-side user_hash)", async () => {
      const cols = await t.admin<{ column_name: string }>(
        `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'analytics_events'`,
      );
      expect(cols.map((c) => c.column_name)).not.toContain("user_id");
    });

    it("anon insert is denied (no anonymous telemetry)", async () => {
      await denied(t.as(anon, `insert into public.analytics_events (event_type) values ('anon_evt')`));
      await denied(t.as(anon, `insert into public.analytics_events (agency_id, event_type) values ($1, 'anon_evt')`, [ORG.a]));
    });

    it("an active member inserts for their own org or with no org; backdating is ignored", async () => {
      await t.as(as(U.a), `insert into public.analytics_events (agency_id, event_type, created_at) values ($1, 'evt_a', '2000-01-01')`, [ORG.a]);
      await t.as(as(U.a), `insert into public.analytics_events (event_type) values ('evt_a_noorg')`);
      const [row] = await t.admin<{ created_at: Date }>(`select created_at from public.analytics_events where event_type = 'evt_a'`);
      expect(new Date(row.created_at).getFullYear()).toBeGreaterThan(2000);
    });

    it("another organization's agency_id is denied", async () => {
      await denied(t.as(as(U.a), `insert into public.analytics_events (agency_id, event_type) values ($1, 'x')`, [ORG.b]));
    });

    it("a payload claiming super_admin grants nothing", async () => {
      await t.as(as(U.a), `insert into public.analytics_events (agency_id, event_type, payload) values ($1, 'evil', '{"role":"super_admin","is_admin":true}')`, [ORG.a]);
      const [r] = await t.as<{ sa: boolean }>(as(U.a), `select public.is_super_admin() as sa`);
      expect(r.sa).toBe(false);
      expect(await t.as(as(U.a), `select id from public.analytics_events`)).toHaveLength(0);
      await denied(t.as(as(U.a), `insert into public.analytics_events (agency_id, event_type, payload) values ($1, 'evil', '{"role":"super_admin"}')`, [ORG.b]));
    });

    it("non-admins cannot select, update or delete events", async () => {
      expect(await t.as(as(U.b), `select id from public.analytics_events`)).toHaveLength(0);
      await denied(t.as(as(U.a), `update public.analytics_events set event_type = 'x'`));
      await denied(t.as(as(U.a), `delete from public.analytics_events`));
      await denied(t.as(as(U.a), `select public.prune_old_analytics()`));
    });

    it("disabled users and members of disabled orgs cannot insert as their org", async () => {
      await denied(t.as(as(U.d), `insert into public.analytics_events (event_type) values ('x')`));
      await denied(t.as(as(U.d), `insert into public.analytics_events (agency_id, event_type) values ($1, 'x')`, [ORG.a]));
      await denied(t.as(as(U.o), `insert into public.analytics_events (agency_id, event_type) values ($1, 'x')`, [ORG.o]));
    });

    it("super_admin can read all events", async () => {
      const rows = await t.as<{ event_type: string }>(as(U.s), `select event_type from public.analytics_events`);
      expect(rows.map((r) => r.event_type)).toEqual(expect.arrayContaining(["seed_a", "seed_b", "evt_a", "evil"]));
    });
  });

  // ────────────────────────────────────────────────────────────
  describe("system_settings and prompts", () => {
    for (const table of ["system_settings", "prompts"] as const) {
      describe(table, () => {
        it("an active user can read", async () => {
          expect((await t.as(as(U.a), `select key from public.${table}`)).length).toBeGreaterThan(0);
          expect((await t.as(as(U.n), `select key from public.${table}`)).length).toBeGreaterThan(0);
        });

        it("a disabled user cannot read", async () => {
          expect(await t.as(as(U.d), `select key from public.${table}`)).toHaveLength(0);
        });

        it("anon cannot read", async () => {
          await denied(t.as(anon, `select key from public.${table}`));
        });

        it("a non-admin cannot write", async () => {
          const ins =
            table === "system_settings"
              ? `insert into public.system_settings (key, value) values ('hack', 'true'::jsonb)`
              : `insert into public.prompts (key, template) values ('hack', 'x')`;
          await denied(t.as(as(U.a), ins));
          const col = table === "system_settings" ? `value = '"x"'::jsonb` : `template = 'x'`;
          expect(await t.as(as(U.a), `update public.${table} set ${col} returning key`)).toHaveLength(0);
          expect(await t.as(as(U.a), `delete from public.${table} returning key`)).toHaveLength(0);
        });

        it("super_admin can read and write", async () => {
          const ins =
            table === "system_settings"
              ? `insert into public.system_settings (key, value) values ('sa_key', 'true'::jsonb) returning key`
              : `insert into public.prompts (key, template) values ('sa_key', 'template') returning key`;
          expect(await t.as(as(U.s), ins)).toEqual([{ key: "sa_key" }]);
          expect(await t.as(as(U.s), `delete from public.${table} where key = 'sa_key' returning key`)).toEqual([{ key: "sa_key" }]);
          expect((await t.as(as(U.s), `select key from public.${table}`)).length).toBeGreaterThan(0);
        });
      });
    }
  });

  // ────────────────────────────────────────────────────────────
  describe("QA tester RPCs (044 section 5)", () => {
    const TESTER = "40000000-0000-4000-8000-000000000001";
    beforeAll(async () => {
      await t.admin(`insert into public.qa_testers (id, code, name) values ($1, 'QACODE', 'Tester') on conflict do nothing`, [TESTER]);
    });

    it("anon (public anon key) can no longer brute-force codes or write checks", async () => {
      await denied(t.as(anon, `select * from public.qa_login('1122')`), /permission denied/i);
      await denied(t.as(anon, `select public.qa_save_check($1, '1.1', 'pass', 'x')`, [TESTER]), /permission denied/i);
      await denied(t.as(anon, `select * from public.qa_get_session($1)`, [TESTER]), /permission denied/i);
      await denied(t.as(anon, `select * from public.qa_list_checks($1)`, [TESTER]), /permission denied/i);
    });

    it("signed-in customers cannot call them either, or read the QA tables", async () => {
      await denied(t.as(as(U.a), `select public.qa_save_check($1, '1.1', 'fail', 'x')`, [TESTER]), /permission denied/i);
      await denied(t.as(as(U.a), `select * from public.qa_login('QACODE')`), /permission denied/i);
      await denied(t.as(as(U.a), `select code from public.qa_testers`), /permission denied/i);
      await denied(t.as(anon, `select * from public.qa_checks`), /permission denied/i);
    });

    it("the super-admin QA report keeps working; non-admins are refused", async () => {
      await t.as({ role: "service_role" }, `select public.qa_save_check($1, '1.1', 'pass', 'ok')`, [TESTER]);
      expect(await t.as(as(U.s), `select * from public.qa_all_checks_admin()`)).not.toHaveLength(0);
      await denied(t.as(as(U.a), `select * from public.qa_all_checks_admin()`), /not authorised/i);
    });
  });

  describe("invites", () => {
    const onboard = (who: string, code: string, slug: string) =>
      t.as<{ id: string }>(as(who), `select public.complete_onboarding($1, $2, $3) as id`, [code, `Co ${slug}`, slug]);
    const invite = async (code: string) =>
      (await t.admin<{ used_by: string | null; is_active: boolean }>(`select used_by, is_active from public.invites where code = $1`, [code]))[0];

    it("invites have no expires_at column (no expiry semantics exist)", async () => {
      const cols = await t.admin<{ column_name: string }>(
        `select column_name from information_schema.columns where table_schema = 'public' and table_name = 'invites'`,
      );
      expect(cols.map((c) => c.column_name)).not.toContain("expires_at");
    });

    it("the wrong email is denied and the invite stays unused", async () => {
      await denied(onboard(U.mallory, "MAIL-CAROL", "mallory-co"), /invite/i);
      expect(await invite("MAIL-CAROL")).toEqual({ used_by: null, is_active: true });
      const [p] = await t.admin(`select agency_id from public.profiles where id = $1`, [U.mallory]);
      expect(p.agency_id).toBeNull();
    });

    it("validate_invite hides an email-bound invite from another signed-in account, not from anon", async () => {
      expect(await t.as(as(U.mallory), `select * from public.validate_invite('mail-carol')`)).toHaveLength(0);
      expect(await t.as(anon, `select * from public.validate_invite('mail-carol')`)).toEqual([{ role: "pilot", max_keywords: 10 }]);
      expect(await t.as(as(U.bob), `select * from public.validate_invite('mail-bob')`)).toEqual([{ role: "pilot", max_keywords: 10 }]);
    });

    it("the matching email claims, ignoring case and whitespace on either side", async () => {
      const [{ id }] = await onboard(U.alice, "mail-alice", "alice-co"); // user email " Alice@Example.COM "
      expect(id).toBeTruthy();
      const [row] = await onboard(U.bob, " MAIL-BOB ", "bob-co"); // invite email " Bob@Example.com "
      expect(row.id).toBeTruthy();
      expect((await invite("MAIL-ALICE")).used_by).toBe(U.alice);
      expect((await invite("MAIL-BOB")).used_by).toBe(U.bob);
    });

    it("the claim joins a NEW organization from the invite, never an existing one", async () => {
      const [p] = await t.admin<{ agency_id: string; role: string }>(`select agency_id, role from public.profiles where id = $1`, [U.alice]);
      expect([ORG.a, ORG.b, ORG.o]).not.toContain(p.agency_id);
      const [ag] = await t.admin(`select name, slug, max_keywords from public.agencies where id = $1`, [p.agency_id]);
      expect(ag).toEqual({ name: "Co alice-co", slug: "alice-co", max_keywords: 25 });
      // Pointing the slug at an existing organization fails; nothing is claimed or joined.
      await t.admin(`insert into public.invites (code, email, role) values ('MAIL-MAL2', 'mallory@example.com', 'pilot')`);
      await expect(onboard(U.mallory, "MAIL-MAL2", "org-a")).rejects.toThrow(/duplicate|unique/i);
      expect(await invite("MAIL-MAL2")).toEqual({ used_by: null, is_active: true });
      const [m] = await t.admin(`select agency_id from public.profiles where id = $1`, [U.mallory]);
      expect(m.agency_id).toBeNull();
    });

    it("the role comes from the invite and cannot be escalated afterwards", async () => {
      const [p] = await t.admin(`select role from public.profiles where id = $1`, [U.alice]);
      expect(p.role).toBe("pilot");
      await denied(t.as(as(U.alice), `update public.profiles set role = 'super_admin' where id = $1`, [U.alice]));
    });

    it("an already-claimed invite is denied, even for the invited email", async () => {
      await denied(onboard(U.mallory, "MAIL-ALICE", "again-co"), /invite/i);
    });

    it("an invite without an email still works for any account (unchanged behaviour)", async () => {
      const [row] = await onboard(U.n, "OPEN-1", "open-co");
      expect(row.id).toBeTruthy();
      const [row2] = await onboard(U.mallory, "BLANK-1", "blank-co"); // blank email = no binding
      expect(row2.id).toBeTruthy();
    });

    it("a super_admin invite with no super_admin creator is refused", async () => {
      await denied(onboard(U.erin, "SA-ORPHAN", "erin-co"), /invite/i);
      await denied(onboard(U.frank, "SA-DEMOTED", "frank-co"), /invite/i);
      const [p] = await t.admin(`select role, agency_id from public.profiles where id = $1`, [U.frank]);
      expect(p.agency_id).toBeNull();
      expect(p.role).not.toBe("super_admin");
    });

    it("a super_admin invite created by a platform admin works; created_by cannot be forged", async () => {
      await t.as(as(U.s), `insert into public.invites (code, email, role, max_keywords, created_by) values ('SA-DAVE', 'dave@example.com', 'super_admin', 999999, $1)`, [U.a]);
      const [inv] = await t.admin(`select created_by from public.invites where code = 'SA-DAVE'`);
      expect(inv.created_by).toBe(U.s);
      await onboard(U.dave, "SA-DAVE", "dave-co");
      const [p] = await t.admin(`select role from public.profiles where id = $1`, [U.dave]);
      expect(p.role).toBe("super_admin");
    });

    it("non-admins cannot create invites; anon cannot touch the table", async () => {
      await denied(t.as(as(U.a), `insert into public.invites (code, role) values ('SELF-SA', 'super_admin')`));
      await denied(t.as(anon, `select code from public.invites`));
      await denied(t.as(anon, `insert into public.invites (code) values ('ANON')`));
    });

    it("claim_invite stays revoked for API roles (043)", async () => {
      await denied(t.as(as(U.mallory), `select * from public.claim_invite('MAIL-CAROL', $1)`, [U.mallory]), /permission denied/i);
      await denied(t.as(as(U.mallory), `select public.invite_is_claimable_by(i, $1) from public.invites i`, [U.mallory]), /permission denied/i);
    });
  });
});
