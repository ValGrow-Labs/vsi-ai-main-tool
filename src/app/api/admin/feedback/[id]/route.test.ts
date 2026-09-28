import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

let role = "pilot";
const updates: Record<string, unknown>[] = [];

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    requireSuperAdminApi: async () =>
      role === "super_admin" ? { userId: "admin-1", role, email: "a@x", agencyId: null } : actual.apiAuthError.notAdmin(),
  };
});
vi.mock("@/lib/admin/audit", () => ({ recordAdminAction: async () => {} }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({ update: (p: Record<string, unknown>) => { updates.push(p); return { eq: async () => ({ error: null }) }; } }),
  }),
}));

import { PATCH } from "./route";

const patch = (body: unknown) =>
  PATCH(new NextRequest("https://app.example/api/admin/feedback/f1", { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id: "f1" }),
  });

beforeEach(() => {
  updates.length = 0;
});

describe("PATCH /api/admin/feedback/[id] (admin fields)", () => {
  it("403 for a non-admin; nothing written", async () => {
    role = "pilot";
    const res = await patch({ status: "done", admin_notes: "x" });
    expect(res.status).toBe(403);
    expect(updates).toEqual([]);
  });

  it("a super admin can set status and notes, and nothing else", async () => {
    role = "super_admin";
    const res = await patch({ status: "done", admin_notes: "ok", user_id: "someone", agency_id: "other" });
    expect(res.status).toBe(200);
    expect(updates).toEqual([{ status: "done", admin_notes: "ok" }]);
  });
});
