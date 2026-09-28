/**
 * Local, in-memory Postgres (PGlite) with the minimum Supabase stand-ins needed to run the
 * migration chain and exercise RLS as the API roles. Test-only: nothing here talks to a real
 * Supabase project.
 *
 * Stand-ins:
 *  - roles anon, authenticated (RLS applies), service_role (BYPASSRLS), like Supabase.
 *  - schema auth: auth.users (the columns the migrations read) and auth.uid(), which reads
 *    request.jwt.claim.sub exactly like Supabase's legacy auth.uid().
 *  - schema storage: storage.buckets, storage.objects and storage.foldername(), used by 012.
 *  - Supabase's default grants: every table/function/sequence created in public is granted to
 *    anon, authenticated and service_role; RLS is what actually restricts access.
 *
 * Migrations are applied as the PGlite superuser ("postgres"), so SECURITY DEFINER functions are
 * owned by a role that bypasses RLS — the same effective behaviour as Supabase's postgres owner.
 */
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";

export const MIGRATIONS_DIR = path.resolve(__dirname, "../migrations");

const SUPABASE_STANDINS = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  last_sign_in_at timestamptz,
  created_at timestamptz default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text not null, public boolean default false);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects to anon, authenticated, service_role;
grant all on storage.buckets to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

/** Migrations that are not replayed, with the reason. Empty today: every file runs. */
export const SKIPPED_MIGRATIONS: Record<string, string> = {};

export function migrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .sort();
}

export type TestDb = {
  db: PGlite;
  /** Run a query as a given API role, with request.jwt.claim.sub = userId (or unset). */
  as: <T = Record<string, unknown>>(
    who: { role: "anon" | "authenticated" | "service_role"; userId?: string | null },
    sql: string,
    params?: unknown[],
  ) => Promise<T[]>;
  /** Run as the superuser (setup / fixtures). */
  admin: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
  applied: string[];
};

export async function createTestDb(opts: { include?: (file: string) => boolean } = {}): Promise<TestDb> {
  const db = new PGlite();
  await db.exec(SUPABASE_STANDINS);

  const applied: string[] = [];
  for (const file of migrationFiles()) {
    if (SKIPPED_MIGRATIONS[file]) continue;
    if (opts.include && !opts.include(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    try {
      await db.exec(sql);
    } catch (e) {
      throw new Error(`Migration ${file} failed in PGlite: ${e instanceof Error ? e.message : String(e)}`);
    }
    applied.push(file);
  }

  const reset = async () => {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  };

  const as: TestDb["as"] = async (who, sql, params = []) => {
    await reset();
    const sub = who.userId ?? "";
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub]);
    await db.exec(`set role ${who.role}`);
    try {
      const res = await db.query(sql, params);
      return res.rows as never[];
    } finally {
      await reset();
    }
  };

  const admin: TestDb["admin"] = async (sql, params = []) => {
    await reset();
    const res = await db.query(sql, params);
    return res.rows as never[];
  };

  return { db, as, admin, applied };
}
