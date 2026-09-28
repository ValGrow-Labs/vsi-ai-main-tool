import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

type Session = { userId: string; email: string; role: string; agencyId: string | null };
let session: Session | Response;
let inserted: Record<string, unknown>[] = [];
let selectedCols: string | undefined;
let eqFilters: Array<[string, unknown]> = [];
const tracked: unknown[] = [];

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, requireSessionApi: async () => session };
});
vi.mock("@/lib/track", () => ({ track: (e: unknown) => tracked.push(e) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      const b: Record<string, unknown> = {};
      b.insert = (row: Record<string, unknown>) => {
        inserted.push(row);
        return { select: () => ({ single: async () => ({ data: { id: "fb-1" }, error: null }) }) };
      };
      b.select = (cols: string) => {
        selectedCols = cols;
        return b;
      };
      b.eq = (c: string, v: unknown) => {
        eqFilters.push([c, v]);
        return b;
      };
      b.order = async () => ({ data: [], error: null });
      return b;
    },
  }),
}));

import { GET, POST } from "./route";
import { apiAuthError } from "@/lib/auth";

const ME: Session = { userId: "user-me", email: "me@example.com", role: "pilot", agencyId: "agency-me" };
const post = (body: unknown) =>
  POST(new NextRequest("https://app.example/api/feedback", { method: "POST", body: JSON.stringify(body) }));

const IMPERSONATION = {
  user_id: "user-victim",
  email: "victim@example.com",
  agency_id: "agency-victim",
  status: "done",
  admin_notes: "approved by admin",
  role: "super_admin",
  is_admin: true,
};

beforeEach(() => {
  session = ME;
  inserted = [];
  eqFilters = [];
  selectedCols = undefined;
  tracked.length = 0;
});

describe("POST /api/feedback", () => {
  it("401 when signed out, nothing written", async () => {
    session = apiAuthError.signedOut();
    const res = await post({ rating: 5, comment: "great tool" });
    expect(res.status).toBe(401);
    expect(inserted).toEqual([]);
  });

  it("403 for a disabled account", async () => {
    session = apiAuthError.disabled();
    expect((await post({ rating: 5, comment: "great tool" })).status).toBe(403);
    expect(inserted).toEqual([]);
  });

  it("ignores impersonation and admin fields (rating form)", async () => {
    const res = await post({
      rating: 4,
      comment: "works well",
      ...IMPERSONATION,
      context_data: { ...IMPERSONATION, device: "desktop", user_hash: "x" },
    });
    expect(res.status).toBe(200);
    const row = inserted[0];
    expect(row.user_id).toBe("user-me");
    expect(row.agency_id).toBe("agency-me");
    expect(row.status).toBe("new");
    expect(row).not.toHaveProperty("admin_notes");
    expect(row).not.toHaveProperty("email");
    expect(row).not.toHaveProperty("role");
    const ctx = row.context_data as Record<string, unknown>;
    for (const k of Object.keys(IMPERSONATION)) expect(ctx).not.toHaveProperty(k);
    expect(ctx).not.toHaveProperty("user_hash");
    expect(ctx.device).toBe("desktop");
  });

  it("ignores impersonation and admin fields (category form)", async () => {
    await post({ category: "bug", message: "broken thing", subject: "hi", ...IMPERSONATION, context_data: { is_admin: true, submitted_from: "x" } });
    const row = inserted[0];
    expect(row).toMatchObject({ user_id: "user-me", agency_id: "agency-me", status: "new" });
    expect(row).not.toHaveProperty("admin_notes");
    expect(row.context_data).toEqual({ submitted_from: "x" });
  });

  it("analytics identity comes from the session, not the body", async () => {
    await post({ rating: 5, comment: "lovely thing", ...IMPERSONATION });
    expect(tracked).toHaveLength(1);
    expect(tracked[0]).toMatchObject({ agencyId: "agency-me", userId: "user-me", type: "feedback_submitted" });
  });

  it("rejects bad input", async () => {
    expect((await post({ rating: 9, comment: "hello there" })).status).toBe(400);
    expect((await post({ category: "hack", message: "hello there" })).status).toBe(400);
  });
});

describe("GET /api/feedback", () => {
  it("lists only the session user's rows and never admin_notes", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(eqFilters).toEqual([["user_id", "user-me"]]);
    expect(selectedCols).not.toContain("admin_notes");
    expect(selectedCols).not.toContain("*");
  });

  it("401 when signed out", async () => {
    session = apiAuthError.signedOut();
    expect((await GET()).status).toBe(401);
  });
});
