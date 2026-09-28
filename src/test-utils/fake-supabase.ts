/**
 * A small in-memory stand-in for the Supabase query builder, for route tests. Rows live in
 * `db.tables`; eq / in / lt filters really filter, so tenant scoping in a route (".eq('agency_id', …)")
 * is exercised, not assumed. Set `db.errors[table]` to make every call on that table fail.
 * No network, no real database.
 */
type Row = Record<string, unknown>;
type DbError = { code?: string; message?: string };

export interface FakeDb {
  tables: Record<string, Row[]>;
  errors: Record<string, DbError | undefined>;
  user: { id: string; email: string } | null;
  log: string[];
}

export function createFakeDb(): FakeDb {
  return { tables: {}, errors: {}, user: null, log: [] };
}

let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

function builder(db: FakeDb, table: string) {
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "insert" | "update" | "delete" = "select";
  let payload: Row | Row[] | null = null;
  let limit: number | null = null;
  let order: { col: string; asc: boolean } | null = null;

  const rows = () => (db.tables[table] ??= []);
  const matches = () => rows().filter((r) => filters.every((f) => f(r)));

  function run(): { data: Row[] | null; error: DbError | null } {
    const err = db.errors[table];
    if (err) return { data: null, error: err };
    db.log.push(`${table}.${op}`);
    if (op === "insert") {
      const list = (Array.isArray(payload) ? payload : [payload]) as Row[];
      const now = new Date().toISOString();
      const added = list.map((r) => ({ id: newId(), created_at: now, updated_at: now, ...r }));
      rows().push(...added);
      return { data: added, error: null };
    }
    if (op === "update") {
      const hit = matches();
      hit.forEach((r) => Object.assign(r, payload));
      return { data: hit, error: null };
    }
    if (op === "delete") {
      const hit = matches();
      db.tables[table] = rows().filter((r) => !hit.includes(r));
      return { data: hit, error: null };
    }
    let out = matches();
    if (order) {
      const { col, asc } = order;
      out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
    }
    if (limit != null) out = out.slice(0, limit);
    return { data: out, error: null };
  }

  const b = {
    select: () => b,
    insert: (r: Row | Row[]) => ((op = "insert"), (payload = r), b),
    update: (r: Row) => ((op = "update"), (payload = r), b),
    upsert: (r: Row | Row[]) => ((op = "insert"), (payload = r), b),
    delete: () => ((op = "delete"), b),
    eq: (col: string, val: unknown) => (filters.push((r) => r[col] === val), b),
    neq: (col: string, val: unknown) => (filters.push((r) => r[col] !== val), b),
    in: (col: string, vals: unknown[]) => (filters.push((r) => vals.includes(r[col])), b),
    lt: (col: string, val: string) => (filters.push((r) => String(r[col]) < val), b),
    order: (col: string, o?: { ascending?: boolean }) => ((order = { col, asc: o?.ascending !== false }), b),
    limit: (n: number) => ((limit = n), b),
    maybeSingle: async () => {
      const { data, error } = run();
      return { data: data?.[0] ?? null, error };
    },
    single: async () => {
      const { data, error } = run();
      if (error) return { data: null, error };
      if (!data || data.length !== 1) return { data: null, error: { code: "PGRST116", message: "no rows" } };
      return { data: data[0], error: null };
    },
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(run()).then(resolve, reject),
  };
  return b;
}

/** What `createClient()` from "@/lib/supabase/server" returns, backed by `db`. */
export function fakeSupabaseClient(db: FakeDb) {
  return {
    auth: { getUser: async () => ({ data: { user: db.user } }) },
    from: (table: string) => builder(db, table),
  };
}

/** A signed-in user's profile row, as lib/auth reads it (profiles joined to agencies). */
export function profileRow(opts: {
  id: string;
  agencyId: string | null;
  role?: "pilot" | "super_admin";
  disabled?: boolean;
  orgDisabled?: boolean;
}): Row {
  return {
    id: opts.id,
    agency_id: opts.agencyId,
    role: opts.role ?? "pilot",
    full_name: "Test User",
    is_disabled: !!opts.disabled,
    agencies: opts.agencyId ? { name: `Org ${opts.agencyId}`, is_disabled: !!opts.orgDisabled } : null,
  };
}
