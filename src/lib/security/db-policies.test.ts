/**
 * Database security tests: the real migration chain (001 → 043) replayed into an in-memory PGlite
 * database, then exercised as the Supabase API roles (anon / authenticated with a JWT subject).
 * Nothing here touches a real Supabase project. See supabase/tests/pglite-harness.ts.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../supabase/tests/pglite-harness";

// ── Fixture ids ─────────────────────────────────────────────────
const U = {
  a: "00000000-0000-4000-8000-00000000000a", // member of org A
  b: "00000000-0000-4000-8000-00000000000b", // member of org B
  d: "00000000-0000-4000-8000-00000000000d", // disabled member of org A
  s: "00000000-0000-4000-8000-000000000005", // platform admin (org A)
  n: "00000000-0000-4000-8000-000000000001", // signed up, no org yet
  nd: "00000000-0000-4000-8000-000000000002", // signed up, no org, disabled
  i1: "00000000-0000-4000-8000-000000000003", // invitee 1 (no org)
  i2: "00000000-0000-4000-8000-000000000004", // invitee 2 (no org)
  o: "00000000-0000-4000-8000-000000000006", // member of disabled org O
};
const ORG = {
  a: "10000000-0000-4000-8000-00000000000a",
  b: "10000000-0000-4000-8000-00000000000b",
  o: "10000000-0000-4000-8000-000000000006",
};
const CLIENT = { a: "20000000-0000-4000-8000-00000000000a", b: "20000000-0000-4000-8000-00000000000b" };
const KW = { a: "30000000-0000-4000-8000-00000000000a", b: "30000000-0000-4000-8000-00000000000b" };
const REPORT = {
  a: "40000000-0000-4000-8000-00000000000a",
  b: "40000000-0000-4000-8000-00000000000b",
  expired: "40000000-0000-4000-8000-0000000000ee",
  pending: "40000000-0000-4000-8000-0000000000cc",
};
const TOKEN = {
  a: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  b: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  expired: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  pending: "cccccccccccccccccccccccccccccccc",
};

type Who = { role: "anon" | "authenticated" | "service_role"; userId?: string | null };
const anon: Who = { role: "anon" };
const as = (userId: string): Who => ({ role: "authenticated", userId });

async function seed(t: TestDb) {
  const users = Object.entries(U);
  for (const [k, id] of users) {
    await t.admin(`insert into auth.users (id, email) values ($1, $2)`, [id, `${k}@example.test`]);
  }
  await t.admin(
    `insert into public.agencies (id, name, slug) values ($1,'Org A','org-a'), ($2,'Org B','org-b'), ($3,'Org O','org-o')`,
    [ORG.a, ORG.b, ORG.o],
  );
  await t.admin(`update public.agencies set is_disabled = true where id = $1`, [ORG.o]);
  await t.admin(`update public.profiles set agency_id = $1 where id in ($2, $3, $4)`, [ORG.a, U.a, U.d, U.s]);
  await t.admin(`update public.profiles set agency_id = $1 where id = $2`, [ORG.b, U.b]);
  await t.admin(`update public.profiles set agency_id = $1 where id = $2`, [ORG.o, U.o]);
  await t.admin(`update public.profiles set is_disabled = true where id in ($1, $2)`, [U.d, U.nd]);
  await t.admin(`update public.profiles set role = 'super_admin' where id = $1`, [U.s]);

  for (const k of ["a", "b"] as const) {
    const org = ORG[k];
    const client = CLIENT[k];
    await t.admin(`insert into public.clients (id, agency_id, name, website) values ($1, $2, $3, $4)`, [client, org, `Client ${k}`, `${k}.example`]);
    await t.admin(`insert into public.tracked_keywords (id, client_id, agency_id, keyword, domain) values ($1, $2, $3, 'kw', $4)`, [KW[k], client, org, `${k}.example`]);
    await t.admin(`insert into public.search_results (agency_id, client_id, tracked_keyword_id, keyword, domain, location) values ($1, $2, $3, 'kw', $4, 'ae')`, [org, client, KW[k], `${k}.example`]);
    await t.admin(`insert into public.tasks (agency_id, client_id, group_name, title) values ($1, $2, 'Content', 'task ${k}')`, [org, client]);
    await t.admin(`insert into public.site_audits (agency_id, client_id, domain, status) values ($1, $2, $3, 'completed')`, [org, client, `${k}.example`]);
    await t.admin(`insert into public.project_competitors (agency_id, client_id, domain) values ($1, $2, 'rival.example')`, [org, client]);
    await t.admin(`insert into public.analysis_jobs (agency_id, client_id) values ($1, $2)`, [org, client]);
    await t.admin(`insert into public.client_keyword_analyses (client_id, domain, brand_name) values ($1, $2, 'brand')`, [client, `${k}.example`]);
    await t.admin(
      `insert into public.reports (id, agency_id, client_id, share_token, content, status) values ($1, $2, $3, $4, $5, 'ready')`,
      [REPORT[k], org, client, TOKEN[k], JSON.stringify({ report: k })],
    );
    await t.admin(
      `insert into public.messages (id, user_id, sender, recipient, subject) values ($1, $2, '{"name":"x","email":"x@x"}', '{"name":"y","email":"y@y"}', 'hello')`,
      [`msg-${k}`, U[k]],
    );
    await t.admin(`insert into public.notifications (user_id, title, message) values ($1, 'note', 'note ${k}')`, [U[k]]);
  }
  await t.admin(
    `insert into public.reports (id, agency_id, client_id, share_token, content, status, expires_at) values ($1, $2, $3, $4, '{"report":"old"}', 'ready', now() - interval '1 day')`,
    [REPORT.expired, ORG.a, CLIENT.a, TOKEN.expired],
  );
  await t.admin(
    `insert into public.reports (id, agency_id, client_id, share_token, content, status) values ($1, $2, $3, $4, '{"secret":"draft"}', 'pending')`,
    [REPORT.pending, ORG.a, CLIENT.a, TOKEN.pending],
  );
  await t.admin(
    `insert into public.invites (code, role, max_keywords) values ('INV-ONE', 'pilot', 25), ('INV-TWO', 'pilot', 10), ('INV-THREE', 'pilot', 10)`,
  );
}

async function denied(p: Promise<unknown>, pattern: RegExp = /row-level security|permission denied|not allowed|does not belong|only be claimed/i) {
  await expect(p).rejects.toThrow(pattern);
}

// ────────────────────────────────────────────────────────────────
// Confirms the holes existed before 043 (same fixtures, chain up to 042).
// ────────────────────────────────────────────────────────────────
describe("before migration 043 (chain 001-042): the reported holes are real", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb({ include: (f) => f < "043" });
    await seed(t);
  }, 120_000);

  it("anon lists every organization's reports (MT-2)", async () => {
    const rows = await t.as(anon, `select agency_id from public.reports`);
    expect(new Set(rows.map((r) => r.agency_id))).toEqual(new Set([ORG.a, ORG.b]));
  });

  it("any signed-in user can insert an agency directly (MT-8)", async () => {
    // No RETURNING: that would also need a SELECT policy on the new row.
    await t.as(as(U.n), `insert into public.agencies (name, slug) values ('x', 'x-pre')`);
    expect(await t.admin(`select id from public.agencies where slug = 'x-pre'`)).toHaveLength(1);
  });

  it("claim_invite accepts an arbitrary p_user (MT-9)", async () => {
    const rows = await t.as(as(U.i1), `select * from public.claim_invite('INV-THREE', $1)`, [U.i2]);
    expect(rows).toHaveLength(1);
  });

  it("a child row can point at another organization's client (MT-10)", async () => {
    const rows = await t.as(as(U.a), `insert into public.tasks (agency_id, client_id, group_name, title) values ($1, $2, 'Content', 'x') returning id`, [ORG.a, CLIENT.b]);
    expect(rows).toHaveLength(1);
  });

  it("a disabled user still reads their organization's data", async () => {
    const rows = await t.as(as(U.d), `select id from public.clients`);
    expect(rows).toHaveLength(1);
  });

  it("ownerless messages are writable by anon (MT-3)", async () => {
    const rows = await t.as(anon, `insert into public.messages (id, subject) values ('anon-msg', 'x') returning id`);
    expect(rows).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────────────────────
// After 043
// ────────────────────────────────────────────────────────────────
describe("after migration 043", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
    await seed(t);
  }, 120_000);

  it("replays the whole chain including 040, 042 and 043", () => {
    expect(t.applied).toContain("040_analysis_jobs.sql");
    expect(t.applied).toContain("042_check_status_provenance.sql");
    expect(t.applied).toContain("043_security_hardening.sql");
  });

  describe("reports and share links", () => {
    it("anon cannot select the reports table", async () => {
      await denied(t.as(anon, `select id from public.reports`));
    });

    it("anon cannot read a report by id", async () => {
      await denied(t.as(anon, `select content from public.reports where id = $1`, [REPORT.a]));
    });

    it("get_shared_report(valid token) returns exactly that report and only shareable columns", async () => {
      const rows = await t.as(anon, `select * from public.get_shared_report($1)`, [TOKEN.a]);
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(REPORT.a);
      expect(rows[0].content).toEqual({ report: "a" });
      expect(Object.keys(rows[0]).sort()).toEqual(["content", "expires_at", "generated_at", "id", "status", "type"]);
    });

    it("unknown, empty, short, null and wildcard tokens return nothing", async () => {
      for (const tok of ["ffffffffffffffffffffffffffffffff", "", "aaaa", "%", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa%"]) {
        expect(await t.as(anon, `select * from public.get_shared_report($1)`, [tok])).toHaveLength(0);
      }
      expect(await t.as(anon, `select * from public.get_shared_report(null)`)).toHaveLength(0);
    });

    it("a token only ever returns its own report", async () => {
      const rows = await t.as(anon, `select id from public.get_shared_report($1)`, [TOKEN.b]);
      expect(rows.map((r) => r.id)).toEqual([REPORT.b]);
    });

    it("an expired link returns nothing to anon or to another organization", async () => {
      expect(await t.as(anon, `select * from public.get_shared_report($1)`, [TOKEN.expired])).toHaveLength(0);
      expect(await t.as(as(U.b), `select * from public.get_shared_report($1)`, [TOKEN.expired])).toHaveLength(0);
    });

    it("the owning organization can still open its own expired report", async () => {
      expect(await t.as(as(U.a), `select id from public.get_shared_report($1)`, [TOKEN.expired])).toHaveLength(1);
    });

    it("a pending report returns its status but no content", async () => {
      const rows = await t.as(anon, `select status, content from public.get_shared_report($1)`, [TOKEN.pending]);
      expect(rows).toEqual([{ status: "pending", content: null }]);
    });

    it("org A cannot select org B's report, and cannot list it via the table", async () => {
      expect(await t.as(as(U.a), `select id from public.reports where id = $1`, [REPORT.b])).toHaveLength(0);
      const all = await t.as(as(U.a), `select agency_id from public.reports`);
      expect(all.length).toBeGreaterThan(0);
      expect(all.every((r) => r.agency_id === ORG.a)).toBe(true);
    });

    it("the function cannot be used to enumerate: org A gets nothing for B's report without B's token", async () => {
      expect(await t.as(as(U.a), `select * from public.get_shared_report($1)`, [TOKEN.a.replace(/a/g, "b").slice(0, 31) + "c"])).toHaveLength(0);
    });

    it("new reports get a 30-day expiry by default", async () => {
      const rows = await t.as(
        as(U.a),
        `insert into public.reports (agency_id, client_id, share_token, content) values ($1, $2, 'dddddddddddddddddddddddddddddddd', '{}') returning expires_at > now() + interval '29 days' and expires_at < now() + interval '31 days' as ok`,
        [ORG.a, CLIENT.a],
      );
      expect(rows[0].ok).toBe(true);
    });

    it("a disabled organization's links stop working for the public", async () => {
      await t.admin(
        `insert into public.clients (id, agency_id, name) values ('20000000-0000-4000-8000-000000000006', $1, 'Client O')`,
        [ORG.o],
      );
      await t.admin(
        `insert into public.reports (agency_id, client_id, share_token, content) values ($1, '20000000-0000-4000-8000-000000000006', '66666666666666666666666666666666', '{}')`,
        [ORG.o],
      );
      expect(await t.as(anon, `select * from public.get_shared_report('66666666666666666666666666666666')`)).toHaveLength(0);
    });
  });

  describe("messages", () => {
    it("user A sees only their own messages", async () => {
      const rows = await t.as(as(U.a), `select id from public.messages`);
      expect(rows.map((r) => r.id)).toEqual(["msg-a"]);
    });

    it("user A cannot update or delete B's message", async () => {
      expect(await t.as(as(U.a), `update public.messages set subject = 'pwned' where id = 'msg-b' returning id`)).toHaveLength(0);
      expect(await t.as(as(U.a), `delete from public.messages where id = 'msg-b' returning id`)).toHaveLength(0);
      const [row] = await t.admin(`select subject from public.messages where id = 'msg-b'`);
      expect(row.subject).toBe("hello");
    });

    it("user A cannot reassign their own message to B", async () => {
      await denied(t.as(as(U.a), `update public.messages set user_id = $1 where id = 'msg-a'`, [U.b]));
    });

    it("insert with user_id = B is denied", async () => {
      await denied(t.as(as(U.a), `insert into public.messages (id, user_id, sender, recipient) values ('x1', $1, '{}', '{}')`, [U.b]));
    });

    it("ownerless insert is denied (NOT NULL or RLS)", async () => {
      await denied(
        t.as(as(U.a), `insert into public.messages (id, sender, recipient) values ('x2', '{}', '{}')`),
        /row-level security|null value/i,
      );
    });

    it("anon has no access at all", async () => {
      await denied(t.as(anon, `select id from public.messages`));
      await denied(t.as(anon, `insert into public.messages (id, subject) values ('anon-msg', 'x')`));
    });

    it("the fake sender/recipient defaults are gone", async () => {
      const rows = await t.admin(
        `select column_name, column_default, is_nullable from information_schema.columns
          where table_schema = 'public' and table_name = 'messages' and column_name in ('sender', 'recipient', 'user_id') order by column_name`,
      );
      expect(rows).toEqual([
        { column_name: "recipient", column_default: null, is_nullable: "NO" },
        { column_name: "sender", column_default: null, is_nullable: "NO" },
        { column_name: "user_id", column_default: null, is_nullable: "NO" },
      ]);
    });

    it("an owner can create, update and delete their own message", async () => {
      await t.as(as(U.a), `insert into public.messages (id, user_id, sender, recipient) values ('own-1', $1, '{}', '{}')`, [U.a]);
      expect(await t.as(as(U.a), `update public.messages set subject = 's' where id = 'own-1' returning id`)).toHaveLength(1);
      expect(await t.as(as(U.a), `delete from public.messages where id = 'own-1' returning id`)).toHaveLength(1);
    });
  });

  describe("notifications", () => {
    it("user A sees only their own notifications", async () => {
      const rows = await t.as(as(U.a), `select message from public.notifications`);
      expect(rows.map((r) => r.message)).toEqual(["note a"]);
    });

    it("user A cannot update or delete B's notifications", async () => {
      expect(await t.as(as(U.a), `update public.notifications set is_read = true where user_id = $1 returning id`, [U.b])).toHaveLength(0);
      expect(await t.as(as(U.a), `delete from public.notifications where user_id = $1 returning id`, [U.b])).toHaveLength(0);
    });

    it("insert for another user or without an owner is denied", async () => {
      await denied(t.as(as(U.a), `insert into public.notifications (user_id, title, message) values ($1, 't', 'm')`, [U.b]));
      await denied(t.as(as(U.a), `insert into public.notifications (title, message) values ('t', 'm')`), /row-level security|null value/i);
    });

    it("anon has no access", async () => {
      await denied(t.as(anon, `select id from public.notifications`));
    });

    it("an owner can insert and mark their own notification read", async () => {
      await t.as(as(U.a), `insert into public.notifications (user_id, title, message) values ($1, 't', 'mine')`, [U.a]);
      expect(await t.as(as(U.a), `update public.notifications set is_read = true where message = 'mine' returning id`)).toHaveLength(1);
    });
  });

  describe("agencies and onboarding", () => {
    it("direct INSERT into agencies by a signed-in user is denied", async () => {
      await denied(t.as(as(U.n), `insert into public.agencies (name, slug) values ('Evil', 'evil')`));
    });

    it("anon cannot insert into agencies", async () => {
      await denied(t.as(anon, `insert into public.agencies (name, slug) values ('Evil', 'evil-anon')`));
    });

    it("create_own_organization still works for a user without an organization", async () => {
      const [row] = await t.as(as(U.n), `select public.create_own_organization('New Co', 'new-co') as id`);
      expect(row.id).toBeTruthy();
      const [p] = await t.admin(`select agency_id, role from public.profiles where id = $1`, [U.n]);
      expect(p.agency_id).toBe(row.id);
      expect(p.role).toBe("pilot");
      // and the new member can read their organization
      expect(await t.as(as(U.n), `select id from public.agencies`)).toEqual([{ id: row.id }]);
    });

    it("create_own_organization is refused for a disabled account", async () => {
      await denied(t.as(as(U.nd), `select public.create_own_organization('Nope', 'nope')`), /disabled/i);
    });

    it("members only see their own organization", async () => {
      expect(await t.as(as(U.a), `select id from public.agencies`)).toEqual([{ id: ORG.a }]);
    });

    it("a member of a disabled organization can still read their org row (so the app can sign them out) but no tenant data", async () => {
      expect(await t.as(as(U.o), `select is_disabled from public.agencies`)).toEqual([{ is_disabled: true }]);
      expect(await t.as(as(U.o), `select id from public.clients`)).toHaveLength(0);
    });
  });

  describe("invites", () => {
    it("claim_invite cannot be called directly by signed-in users", async () => {
      await denied(t.as(as(U.i1), `select * from public.claim_invite('INV-TWO', $1)`, [U.i2]), /permission denied/i);
    });

    it("claim_invite refuses a p_user that is not the caller (defence in depth)", async () => {
      // Call the function body as its owner but with I1's JWT subject: simulates a future caller
      // that re-grants it. The p_user manipulation must still fail.
      await t.admin(`select set_config('request.jwt.claim.sub', $1, false)`, [U.i1]);
      await expect(t.db.query(`select * from public.claim_invite('INV-TWO', $1)`, [U.i2])).rejects.toThrow(/only be claimed/);
      await t.admin(`select set_config('request.jwt.claim.sub', '', false)`);
      const [inv] = await t.admin(`select used_by from public.invites where code = 'INV-TWO'`);
      expect(inv.used_by).toBeNull();
    });

    it("complete_onboarding claims for the caller, and the role and limits come from the invite", async () => {
      const [row] = await t.as(as(U.i1), `select public.complete_onboarding('inv-one', 'Invited Co', 'invited-co') as id`);
      const [p] = await t.admin(`select agency_id, role from public.profiles where id = $1`, [U.i1]);
      expect(p).toEqual({ agency_id: row.id, role: "pilot" });
      const [a] = await t.admin(`select max_keywords, is_pilot from public.agencies where id = $1`, [row.id]);
      expect(a).toEqual({ max_keywords: 25, is_pilot: true });
      const [inv] = await t.admin(`select used_by, is_active from public.invites where code = 'INV-ONE'`);
      expect(inv).toEqual({ used_by: U.i1, is_active: false });
    });

    it("a claimed invite cannot be reused", async () => {
      await denied(t.as(as(U.i2), `select public.complete_onboarding('INV-ONE', 'Again Co', 'again-co')`), /invalid or has already been used/);
      const [p] = await t.admin(`select agency_id from public.profiles where id = $1`, [U.i2]);
      expect(p.agency_id).toBeNull();
    });

    it("complete_onboarding is refused for a disabled account", async () => {
      await denied(t.as(as(U.nd), `select public.complete_onboarding('INV-TWO', 'D Co', 'd-co')`), /disabled/i);
    });

    it("a user cannot escalate to super_admin or move organization by updating their profile", async () => {
      await denied(t.as(as(U.a), `update public.profiles set role = 'super_admin' where id = $1`, [U.a]), /not allowed/i);
      await denied(t.as(as(U.a), `update public.profiles set agency_id = $2 where id = $1`, [U.a, ORG.b]), /not allowed/i);
      await denied(t.as(as(U.d), `update public.profiles set is_disabled = false where id = $1`, [U.d]), /not allowed/i);
      expect(await t.as(as(U.a), `update public.profiles set full_name = 'A' where id = $1 returning id`, [U.a])).toHaveLength(1);
    });

    it("anon cannot list invites; validate_invite still works", async () => {
      await denied(t.as(anon, `select code from public.invites`));
      expect(await t.as(anon, `select * from public.validate_invite('inv-two')`)).toEqual([{ role: "pilot", max_keywords: 10 }]);
    });
  });

  describe("tenant isolation of project data", () => {
    const TABLES = ["clients", "tracked_keywords", "search_results", "tasks", "reports", "site_audits", "project_competitors", "analysis_jobs"] as const;

    for (const table of TABLES) {
      it(`${table}: A reads only org A rows and cannot update/delete org B rows`, async () => {
        const rows = await t.as(as(U.a), `select agency_id from public.${table}`);
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.every((r) => r.agency_id === ORG.a)).toBe(true);
        const setCol = table === "project_competitors" ? "name = 'x'" : table === "clients" ? "name = 'x'" : "agency_id = agency_id";
        if (table !== "project_competitors") {
          expect(await t.as(as(U.a), `update public.${table} set ${setCol} where agency_id = $1 returning 1`, [ORG.b])).toHaveLength(0);
        }
        if (!["site_audits", "analysis_jobs"].includes(table)) {
          expect(await t.as(as(U.a), `delete from public.${table} where agency_id = $1 returning 1`, [ORG.b])).toHaveLength(0);
        }
        const [{ n }] = await t.admin(`select count(*)::int as n from public.${table} where agency_id = $1`, [ORG.b]);
        expect(n).toBeGreaterThan(0);
      });
    }

    it("client_keyword_analyses: A sees only analyses of org A's clients", async () => {
      const rows = await t.as(as(U.a), `select client_id from public.client_keyword_analyses`);
      expect(rows).toEqual([{ client_id: CLIENT.a }]);
      expect(await t.as(as(U.a), `delete from public.client_keyword_analyses where client_id = $1 returning 1`, [CLIENT.b])).toHaveLength(0);
      await denied(t.as(as(U.a), `insert into public.client_keyword_analyses (client_id, domain, brand_name) values ($1, 'x', 'x')`, [CLIENT.b]));
    });

    it("anon reads nothing from tenant tables", async () => {
      for (const table of [...TABLES, "client_keyword_analyses"]) {
        await denied(t.as(anon, `select 1 from public.${table}`));
      }
      expect(await t.as(anon, `select id from public.agencies`)).toHaveLength(0);
    });

    const cross: Array<[string, string, unknown[]]> = [
      ["tracked_keywords", `insert into public.tracked_keywords (client_id, agency_id, keyword, domain) values ($2, $1, 'x', 'x')`, []],
      ["search_results", `insert into public.search_results (agency_id, client_id, keyword, domain, location) values ($1, $2, 'x', 'x', 'ae')`, []],
      ["tasks", `insert into public.tasks (agency_id, client_id, group_name, title) values ($1, $2, 'Content', 'x')`, []],
      ["reports", `insert into public.reports (agency_id, client_id, share_token, content) values ($1, $2, '99999999999999999999999999999999', '{}')`, []],
      ["site_audits", `insert into public.site_audits (agency_id, client_id, domain) values ($1, $2, 'x.example')`, []],
      ["project_competitors", `insert into public.project_competitors (agency_id, client_id, domain) values ($1, $2, 'y.example')`, []],
      ["analysis_jobs", `insert into public.analysis_jobs (agency_id, client_id) values ($1, $2)`, []],
    ];
    for (const [table, sql] of cross) {
      it(`${table}: A cannot insert a row with A's agency_id but B's client_id`, async () => {
        await denied(t.as(as(U.a), sql, [ORG.a, CLIENT.b]));
      });
    }

    it("A cannot re-point an existing own row at B's client", async () => {
      await denied(t.as(as(U.a), `update public.tasks set client_id = $1 where agency_id = $2`, [CLIENT.b, ORG.a]));
    });

    it("A cannot link B's tracked keyword or B's report from an own-agency row", async () => {
      await denied(
        t.as(as(U.a), `insert into public.tasks (agency_id, client_id, tracked_keyword_id, group_name, title) values ($1, $2, $3, 'Content', 'x')`, [ORG.a, CLIENT.a, KW.b]),
      );
      await denied(
        t.as(as(U.a), `insert into public.tasks (agency_id, client_id, source_report_id, group_name, title) values ($1, $2, $3, 'Content', 'x')`, [ORG.a, CLIENT.a, REPORT.b]),
      );
    });

    it("the consistency check also covers service-role writes", async () => {
      await denied(t.as({ role: "service_role" }, `insert into public.tasks (agency_id, client_id, group_name, title) values ($1, $2, 'Content', 'x')`, [ORG.a, CLIENT.b]));
    });

    it("only one running analysis job per project (040 unique index); finished jobs are unlimited", async () => {
      // The seed already holds an in_progress job for CLIENT.a.
      await expect(
        t.as(as(U.a), `insert into public.analysis_jobs (agency_id, client_id) values ($1, $2)`, [ORG.a, CLIENT.a]),
      ).rejects.toThrow(/duplicate key|unique/i);
      expect(await t.as(as(U.a), `insert into public.analysis_jobs (agency_id, client_id, status) values ($1, $2, 'failed') returning id`, [ORG.a, CLIENT.a])).toHaveLength(1);
    });

    it("active control case: A can create and change rows for org A's own client", async () => {
      expect(await t.as(as(U.a), `insert into public.tasks (agency_id, client_id, tracked_keyword_id, group_name, title) values ($1, $2, $3, 'Content', 'ok') returning id`, [ORG.a, CLIENT.a, KW.a])).toHaveLength(1);
      expect(await t.as(as(U.a), `insert into public.search_results (agency_id, client_id, tracked_keyword_id, keyword, domain, location) values ($1, $2, $3, 'kw', 'a.example', 'ae') returning id`, [ORG.a, CLIENT.a, KW.a])).toHaveLength(1);
      expect(await t.as(as(U.a), `insert into public.site_audits (agency_id, client_id, domain) values ($1, $2, 'a.example') returning id`, [ORG.a, CLIENT.a])).toHaveLength(1);
      // status 'completed': the seed already has a running job for this project (one running job per project).
      expect(await t.as(as(U.a), `insert into public.analysis_jobs (agency_id, client_id, status) values ($1, $2, 'completed') returning id`, [ORG.a, CLIENT.a])).toHaveLength(1);
      expect(await t.as(as(U.a), `insert into public.project_competitors (agency_id, client_id, domain) values ($1, $2, 'other.example') returning id`, [ORG.a, CLIENT.a])).toHaveLength(1);
      expect(await t.as(as(U.a), `update public.clients set name = 'Renamed' where id = $1 returning id`, [CLIENT.a])).toHaveLength(1);
      expect(await t.as(as(U.a), `update public.tasks set status = 'done' where title = 'ok' returning id`)).toHaveLength(1);
    });
  });

  describe("disabled accounts", () => {
    const TABLES = ["clients", "tracked_keywords", "search_results", "tasks", "reports", "site_audits", "project_competitors", "analysis_jobs", "client_keyword_analyses"];

    it("a disabled user with a valid JWT sees 0 rows of their own organization's data", async () => {
      for (const table of TABLES) {
        expect(await t.as(as(U.d), `select 1 from public.${table}`), table).toHaveLength(0);
      }
      expect(await t.as(as(U.d), `select id from public.agencies`)).toHaveLength(0);
    });

    it("a disabled user cannot insert project data", async () => {
      await denied(t.as(as(U.d), `insert into public.clients (agency_id, name) values ($1, 'x')`, [ORG.a]));
      await denied(t.as(as(U.d), `insert into public.tasks (agency_id, client_id, group_name, title) values ($1, $2, 'Content', 'x')`, [ORG.a, CLIENT.a]));
    });

    it("a disabled user cannot use messages or notifications", async () => {
      await t.admin(`insert into public.messages (id, user_id, sender, recipient) values ('msg-d', $1, '{}', '{}')`, [U.d]);
      expect(await t.as(as(U.d), `select id from public.messages`)).toHaveLength(0);
      await denied(t.as(as(U.d), `insert into public.messages (id, user_id, sender, recipient) values ('msg-d2', $1, '{}', '{}')`, [U.d]));
    });

    it("a disabled user can still read their own profile (the app needs is_disabled to sign them out)", async () => {
      expect(await t.as(as(U.d), `select is_disabled from public.profiles where id = $1`, [U.d])).toEqual([{ is_disabled: true }]);
    });

    it("a disabled platform admin loses cross-tenant access", async () => {
      expect((await t.as(as(U.s), `select id from public.clients where agency_id in ($1, $2)`, [ORG.a, ORG.b])).length).toBe(2);
      await t.admin(`update public.profiles set is_disabled = true where id = $1`, [U.s]);
      try {
        expect(await t.as(as(U.s), `select id from public.clients`)).toHaveLength(0);
        expect(await t.as(as(U.s), `select public.is_super_admin() as s`)).toEqual([{ s: false }]);
      } finally {
        await t.admin(`update public.profiles set is_disabled = false where id = $1`, [U.s]);
      }
    });
  });

  describe("platform admin paths keep working", () => {
    it("super admin reads and writes across organizations", async () => {
      const clients = await t.as(as(U.s), `select agency_id from public.clients`);
      expect(new Set(clients.map((r) => r.agency_id))).toEqual(new Set([ORG.a, ORG.b, ORG.o]));
      expect((await t.as(as(U.s), `select id from public.reports where agency_id = $1`, [ORG.b])).length).toBe(1);
      expect(await t.as(as(U.s), `insert into public.agencies (name, slug) values ('Admin Made', 'admin-made') returning id`)).toHaveLength(1);
      expect(await t.as(as(U.s), `insert into public.tasks (agency_id, client_id, group_name, title) values ($1, $2, 'Content', 'admin') returning id`, [ORG.b, CLIENT.b])).toHaveLength(1);
      // still bound by the consistency rule
      await denied(t.as(as(U.s), `insert into public.tasks (agency_id, client_id, group_name, title) values ($1, $2, 'Content', 'x')`, [ORG.b, CLIENT.a]));
    });

    it("super admin can open any report through the function, including an expired one", async () => {
      expect(await t.as(as(U.s), `select id from public.get_shared_report($1)`, [TOKEN.expired])).toEqual([{ id: REPORT.expired }]);
    });

    it("admin RPCs still run", async () => {
      expect((await t.as(as(U.s), `select * from public.admin_list_users()`)).length).toBeGreaterThan(0);
      expect((await t.as(as(U.s), `select * from public.admin_organization_summaries()`)).length).toBeGreaterThan(0);
      await denied(t.as(as(U.a), `select * from public.admin_list_users()`), /not authorised/i);
    });
  });

  it("043 is idempotent (re-running it succeeds and changes nothing observable)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { MIGRATIONS_DIR } = await import("../../../supabase/tests/pglite-harness");
    await t.db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, "043_security_hardening.sql"), "utf8"));
    expect(await t.as(as(U.a), `select id from public.messages order by id`)).toEqual([{ id: "msg-a" }]);
    await denied(t.as(anon, `select id from public.reports`));
  });
});

// ────────────────────────────────────────────────────────────────
// 040 is unapplied in production. 043 must not fail without it, and 040 (amended before its first
// apply) must be secure on its own if it is applied after 043.
// ────────────────────────────────────────────────────────────────
describe("043 applied before 040", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb({ include: (f) => f !== "040_analysis_jobs.sql" });
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { MIGRATIONS_DIR } = await import("../../../supabase/tests/pglite-harness");
    await t.db.exec(fs.readFileSync(path.join(MIGRATIONS_DIR, "040_analysis_jobs.sql"), "utf8"));
    await seed(t);
  }, 120_000);

  it("analysis_jobs from 040 alone refuses another tenant's client and disabled accounts", async () => {
    await denied(t.as(as(U.a), `insert into public.analysis_jobs (agency_id, client_id) values ($1, $2)`, [ORG.a, CLIENT.b]));
    expect(await t.as(as(U.a), `select agency_id from public.analysis_jobs`)).toEqual([{ agency_id: ORG.a }]);
    expect(await t.as(as(U.d), `select 1 from public.analysis_jobs`)).toHaveLength(0);
  });
});
