import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

let exchangeResult: unknown;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { exchangeCodeForSession: async () => exchangeResult },
  }),
}));

import { GET } from "./route";

const ORIGIN = "https://app.example";

function call(query: string) {
  return GET(new NextRequest(`${ORIGIN}/auth/callback?${query}`));
}

describe("/auth/callback next= handling", () => {
  beforeEach(() => {
    exchangeResult = {
      data: { session: { user: { email: "a@example.com", user_metadata: {} } } },
      error: null,
    };
  });

  it.each([
    "//evil.com",
    "https://evil.com",
    "/\evil.com",
    "%2F%2Fevil.com",
    "javascript:alert(1)",
  ])("sends next=%s to the internal dashboard", async (next) => {
    const res = await call(`code=abc&next=${encodeURIComponent(next)}`);
    const location = res.headers.get("location")!;
    expect(new URL(location).origin).toBe(ORIGIN);
    expect(new URL(location).pathname).toBe("/dashboard");
  });

  it("follows an internal next", async () => {
    const res = await call(`code=abc&next=${encodeURIComponent("/onboarding")}`);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/onboarding`);
  });

  it("defaults to the dashboard", async () => {
    const res = await call("code=abc");
    expect(res.headers.get("location")).toBe(`${ORIGIN}/dashboard`);
  });
});
