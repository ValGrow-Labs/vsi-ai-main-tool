import { describe, expect, it, vi, beforeEach } from "vitest";

const inserts: Record<string, unknown>[] = [];
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({ insert: async (row: Record<string, unknown>) => { inserts.push(row); return { error: null }; } }),
  }),
}));

import { isEventType, sanitizeEventPayload, track } from "./track";

beforeEach(() => {
  inserts.length = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("track", () => {
  it("drops unknown event types", async () => {
    await track({ type: "make_me_admin" as never, agencyId: "a" });
    expect(inserts).toEqual([]);
    expect(isEventType("chat_query")).toBe(true);
    expect(isEventType("nope")).toBe(false);
  });

  it("strips identity / privilege keys from the payload", async () => {
    await track({
      type: "chat_thumbs",
      agencyId: "agency-me",
      userId: "user-me",
      payload: { vote: "up", role: "super_admin", is_admin: true, user_id: "victim", agency_id: "other", email: "x@y", nested: { isAdmin: true, is_super_admin: true, ok: 1 } },
    });
    const row = inserts[0];
    expect(row.agency_id).toBe("agency-me");
    expect(row.payload).toEqual({ vote: "up", nested: { ok: 1 } });
    expect(row.user_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(row.user_hash).not.toContain("user-me");
  });

  it("sanitizeEventPayload tolerates missing payloads", () => {
    expect(sanitizeEventPayload(undefined)).toEqual({});
  });
});
