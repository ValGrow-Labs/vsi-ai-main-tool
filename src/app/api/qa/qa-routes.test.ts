import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createHmac } from "node:crypto";

const SECRET = "test-secret-0123456789-abcdefghijklmnop";
const TESTER_A = "11111111-1111-4111-8111-111111111111";
const TESTER_B = "22222222-2222-4222-8222-222222222222";

let cookieValue: string | undefined;
let rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
let loginResult: { data: unknown; error: unknown } = { data: [], error: null };

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "vsi_qa_tester" && cookieValue ? { value: cookieValue } : undefined) }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === "qa_login") return loginResult;
      return { data: null, error: null };
    },
  }),
}));

import { POST as loginPOST, DELETE as loginDELETE } from "./login/route";
import { POST as checkPOST } from "./check/route";
import { qaLoginLimiter, signQaToken, verifyQaToken, QA_SESSION_TTL_SECONDS, createLoginLimiter } from "@/lib/qa-session";

function jsonReq(url: string, body: unknown, ip = "203.0.113.5") {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}
const checkReq = (body: unknown) => jsonReq("https://app.example/api/qa/check", body);
const loginReq = (code: unknown, ip?: string) => jsonReq("https://app.example/api/qa/login", { code }, ip);

function forge(testerId: string, exp: number, secret = SECRET) {
  const payload = `v1.${testerId}.${exp}`;
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

beforeEach(() => {
  vi.stubEnv("VSI_QA_ENABLED", "true");
  vi.stubEnv("QA_COOKIE_SECRET", SECRET);
  cookieValue = undefined;
  rpcCalls = [];
  loginResult = { data: [], error: null };
  qaLoginLimiter.reset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("QA is off unless explicitly enabled", () => {
  it("returns 404 on every endpoint when VSI_QA_ENABLED is unset", async () => {
    vi.stubEnv("VSI_QA_ENABLED", "");
    cookieValue = signQaToken(TESTER_A);
    expect((await loginPOST(loginReq("1122"))).status).toBe(404);
    expect((await loginDELETE()).status).toBe(404);
    expect((await checkPOST(checkReq({ item_key: "1.1", status: "pass" }))).status).toBe(404);
    expect(rpcCalls).toEqual([]);
  });

  it("fails closed (404) when enabled without a secret", async () => {
    vi.stubEnv("QA_COOKIE_SECRET", "");
    expect((await loginPOST(loginReq("1122"))).status).toBe(404);
    expect(rpcCalls).toEqual([]);
  });
});

describe("QA login", () => {
  it("sets a signed, expiring cookie (never the bare tester id)", async () => {
    loginResult = { data: [{ id: TESTER_A, name: "Atheefa" }], error: null };
    const res = await loginPOST(loginReq("1122"));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie")!;
    const value = decodeURIComponent(/vsi_qa_tester=([^;]+)/.exec(setCookie)![1]);
    expect(value).not.toBe(TESTER_A);
    expect(verifyQaToken(value)).toBe(TESTER_A);
    expect(setCookie.toLowerCase()).toContain("httponly");
  });

  it("rejects unknown codes with 401", async () => {
    const res = await loginPOST(loginReq("9999"));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("locks out after 5 failures from one address, before touching the database", async () => {
    for (let i = 0; i < 5; i++) expect((await loginPOST(loginReq(`000${i}`))).status).toBe(401);
    const calls = rpcCalls.length;
    const res = await loginPOST(loginReq("1122"));
    expect(res.status).toBe(429);
    expect(rpcCalls.length).toBe(calls);
    // A different address is still allowed.
    loginResult = { data: [{ id: TESTER_A, name: "A" }], error: null };
    expect((await loginPOST(loginReq("1122", "198.51.100.9"))).status).toBe(200);
  });

  it("caps failures globally so rotating addresses does not help", async () => {
    for (let i = 0; i < 30; i++) await loginPOST(loginReq(`${1000 + i}`, `10.0.${i}.1`));
    expect((await loginPOST(loginReq("1122", "10.9.9.9"))).status).toBe(429);
  });

  it("limiter window expires", () => {
    const lim = createLoginLimiter({ windowMs: 1000, maxFailuresPerKey: 1, maxFailuresGlobal: 10 });
    lim.recordFailure("k", 0);
    expect(lim.allowed("k", 500)).toBe(false);
    expect(lim.allowed("k", 1500)).toBe(true);
  });
});

describe("QA check save", () => {
  const body = { item_key: "1.1", status: "pass", notes: "ok" };

  it("saves for the tester named by a valid signed cookie", async () => {
    cookieValue = signQaToken(TESTER_A);
    const res = await checkPOST(checkReq(body));
    expect(res.status).toBe(200);
    expect(rpcCalls).toEqual([
      { fn: "qa_save_check", args: { p_tester_id: TESTER_A, p_item_key: "1.1", p_status: "pass", p_notes: "ok" } },
    ]);
  });

  it("rejects a bare (unsigned) tester id cookie", async () => {
    cookieValue = TESTER_A;
    expect((await checkPOST(checkReq(body))).status).toBe(401);
    expect(rpcCalls).toEqual([]);
  });

  it("rejects a token signed with another secret", async () => {
    cookieValue = forge(TESTER_A, Math.floor(Date.now() / 1000) + 3600, "attacker-secret-attacker-secret-xx");
    expect((await checkPOST(checkReq(body))).status).toBe(401);
  });

  it("rejects a tampered token (tester id swapped)", async () => {
    const valid = signQaToken(TESTER_A);
    cookieValue = valid.replace(TESTER_A, TESTER_B);
    expect((await checkPOST(checkReq(body))).status).toBe(401);
    expect(rpcCalls).toEqual([]);
  });

  it("rejects an expired token", async () => {
    cookieValue = signQaToken(TESTER_A, Date.now() - (QA_SESSION_TTL_SECONDS + 10) * 1000);
    expect((await checkPOST(checkReq(body))).status).toBe(401);
  });

  it("rejects a token whose expiry is implausibly far away", async () => {
    cookieValue = forge(TESTER_A, Math.floor(Date.now() / 1000) + QA_SESSION_TTL_SECONDS * 10);
    expect((await checkPOST(checkReq(body))).status).toBe(401);
  });

  it("ignores any tester id in the body: writes only for the cookie's tester", async () => {
    cookieValue = signQaToken(TESTER_A);
    await checkPOST(checkReq({ ...body, tester_id: TESTER_B, p_tester_id: TESTER_B }));
    expect(rpcCalls[0].args.p_tester_id).toBe(TESTER_A);
  });

  it("rejects unknown item keys and statuses", async () => {
    cookieValue = signQaToken(TESTER_A);
    expect((await checkPOST(checkReq({ item_key: "customers", status: "pass" }))).status).toBe(400);
    expect((await checkPOST(checkReq({ item_key: "1.1", status: "owned" }))).status).toBe(400);
    expect(rpcCalls).toEqual([]);
  });
});
