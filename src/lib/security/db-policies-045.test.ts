/**
 * Database tests for migration 045 (analytics_events event_type allowlist). The real migration
 * chain (001 → 045) is replayed into an in-memory PGlite database and exercised as the Supabase
 * API roles. Nothing here touches a real Supabase project. See supabase/tests/pglite-harness.ts.
 */
import fs from "fs";
import path from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../supabase/tests/pglite-harness";
import { EVENT_TYPES } from "@/lib/track";

const MIGRATION_045 = path.join(process.cwd(), "supabase", "migrations", "045_analytics_event_allowlist.sql");

const U = {
  a: "00000000-0000-4000-8000-00000000000a", // member of org A
  b: "00000000-0000-4000-8000-00000000000b", // member of org B
  d: "00000000-0000-4000-8000-00000000000d", // disabled member of org A
  s: "00000000-0000-4000-8000-000000000005", // platform admin (org A)
  o: "00000000-0000-4000-8000-000000000006", // member of disabled org O
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
  await t.admin(`update public.profiles set is_disabled = true where id = $1`, [U.d]);
  await t.admin(`update public.profiles set role = 'super_admin' where id = $1`, [U.s]);
}

async function denied(p: Promise<unknown>, pattern: RegExp = /row-level security|permission denied|not allowed/i) {
  await expect(p).rejects.toThrow(pattern);
}
const UNKNOWN_TYPE = /analytics_events_event_type_allowed/;

describe("migration 045", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
    await seed(t);
  }, 120_000);

  it("replays the whole chain through 045", () => {
    expect(t.applied).toContain("044_security_followups.sql");
    expect(t.applied[t.applied.length - 1]).toBe("045_analytics_event_allowlist.sql");
  });

  it("the database allowlist is exactly EVENT_TYPES in src/lib/track.ts (no drift)", async () => {
    const [row] = await t.admin<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'analytics_events_event_type_allowed'`,
    );
    const inDb = [...row.def.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect(inDb).toEqual([...EVENT_TYPES].sort());
  });

  it.each([...EVENT_TYPES])("an active member can record %s for their own organization", async (type) => {
    // No RETURNING: non-admins have no SELECT on analytics_events (044), so check as admin.
    await t.as(as(U.a), `insert into public.analytics_events (agency_id, event_type) values ($1, $2)`, [ORG.a, type]);
    const rows = await t.admin(`select 1 from public.analytics_events where agency_id = $1 and event_type = $2`, [ORG.a, type]);
    expect(rows).toHaveLength(1);
  });

  it("an unknown event type is rejected with a clear check violation (not silently dropped)", async () => {
    const before = await t.admin(`select count(*)::int as n from public.analytics_events`);
    for (const bad of ["page_view", "totally_unknown_event_xyz", "", "CHAT_QUERY", "chat_query "]) {
      const err = await t
        .as(as(U.a), `insert into public.analytics_events (agency_id, event_type) values ($1, $2)`, [ORG.a, bad])
        .then(() => null, (e: { code?: string; message?: string }) => e);
      expect(err?.message).toMatch(UNKNOWN_TYPE);
      expect(err?.code).toBe("23514");
    }
    // Even the superuser (service role path) cannot write an unknown type.
    await expect(t.admin(`insert into public.analytics_events (agency_id, event_type) values ($1, 'nope')`, [ORG.a])).rejects.toThrow(UNKNOWN_TYPE);
    expect(await t.admin(`select count(*)::int as n from public.analytics_events`)).toEqual(before);
  });

  it("an existing event cannot be renamed to an unknown type", async () => {
    await expect(t.admin(`update public.analytics_events set event_type = 'renamed_xyz'`)).rejects.toThrow(UNKNOWN_TYPE);
  });

  it("a disabled user, or a member of a disabled organization, is still rejected (valid type)", async () => {
    await denied(t.as(as(U.d), `insert into public.analytics_events (event_type) values ('chat_query')`));
    await denied(t.as(as(U.d), `insert into public.analytics_events (agency_id, event_type) values ($1, 'chat_query')`, [ORG.a]));
    await denied(t.as(as(U.o), `insert into public.analytics_events (agency_id, event_type) values ($1, 'chat_query')`, [ORG.o]));
  });

  it("an event for another organization is rejected (valid type)", async () => {
    await denied(t.as(as(U.a), `insert into public.analytics_events (agency_id, event_type) values ($1, 'chat_query')`, [ORG.b]));
  });

  it("an anonymous event is rejected (valid type)", async () => {
    await denied(t.as(anon, `insert into public.analytics_events (event_type) values ('chat_query')`));
    await denied(t.as(anon, `insert into public.analytics_events (agency_id, event_type) values ($1, 'chat_query')`, [ORG.a]));
  });

  it("a backdated event gets the server time, not the client's", async () => {
    await t.as(
      as(U.b),
      `insert into public.analytics_events (agency_id, event_type, created_at, payload) values ($1, 'task_outcome', '2000-01-01', '{"marker":"backdate-045"}')`,
      [ORG.b],
    );
    const [row] = await t.admin<{ created_at: Date }>(`select created_at from public.analytics_events where payload->>'marker' = 'backdate-045'`);
    expect(new Date(row.created_at).getUTCFullYear()).toBeGreaterThanOrEqual(2025);
  });

  it("identity/privilege claims in the payload stay ineffective", async () => {
    await t.as(
      as(U.a),
      `insert into public.analytics_events (agency_id, event_type, payload) values ($1, 'engine_used', '{"role":"super_admin","is_admin":true,"agency_id":"${ORG.b}"}')`,
      [ORG.a],
    );
    // Still cannot read events, cannot write for org B, and cannot use an unknown type via payload tricks.
    expect(await t.as(as(U.a), `select * from public.analytics_events`)).toEqual([]);
    await denied(t.as(as(U.a), `insert into public.analytics_events (agency_id, event_type, payload) values ($1, 'engine_used', '{"role":"super_admin"}')`, [ORG.b]));
    const [row] = await t.admin<{ agency_id: string }>(`select agency_id from public.analytics_events where payload->>'is_admin' = 'true'`);
    expect(row.agency_id).toBe(ORG.a);
  });

  it("super_admin can still read events", async () => {
    const rows = await t.as<{ event_type: string }>(as(U.s), `select event_type from public.analytics_events`);
    expect(rows.length).toBeGreaterThan(EVENT_TYPES.length - 1);
    expect(rows.every((r) => (EVENT_TYPES as readonly string[]).includes(r.event_type))).toBe(true);
  });
});

describe("migration 045 on a database that already has events", () => {
  it("is NOT VALID and idempotent: existing rows (valid or not) are kept untouched; new unknown types are rejected", async () => {
    const t = await createTestDb({ include: (file) => file <= "044_security_followups.sql" });
    await t.admin(`insert into public.agencies (id, name, slug) values ($1,'Org A','org-a')`, [ORG.a]);
    await t.admin(
      `insert into public.analytics_events (agency_id, event_type) values ($1, 'feedback_submitted'), ($1, 'page_view'), ($1, 'legacy_unknown')`,
      [ORG.a],
    );
    const before = await t.admin(`select id, event_type, created_at from public.analytics_events order by id`);

    const sql = fs.readFileSync(MIGRATION_045, "utf8");
    await t.db.exec(sql);
    await t.db.exec(sql); // re-running is harmless

    expect(await t.admin(`select id, event_type, created_at from public.analytics_events order by id`)).toEqual(before);
    const [c] = await t.admin<{ convalidated: boolean; n: number }>(
      `select bool_and(convalidated) as convalidated, count(*)::int as n from pg_constraint where conname = 'analytics_events_event_type_allowed'`,
    );
    expect(c).toEqual({ convalidated: false, n: 1 });
    await expect(t.admin(`insert into public.analytics_events (agency_id, event_type) values ($1, 'page_view')`, [ORG.a])).rejects.toThrow(UNKNOWN_TYPE);
    await t.admin(`insert into public.analytics_events (agency_id, event_type) values ($1, 'chat_query')`, [ORG.a]);
  }, 120_000);
});
