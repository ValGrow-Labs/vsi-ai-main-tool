/**
 * Report and keyword-suggestion routes answer JSON 401 / 403 (never a redirect
 * or a 500 NEXT_REDIRECT) and touch nothing before the caller is authorised.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const createClient = vi.fn(async () => {
  throw new Error("database must not be touched before authorisation");
});
vi.mock("@/lib/supabase/server", () => ({ createClient }));

const requireAgencyApi = vi.fn();
vi.mock("@/lib/auth", () => ({ requireAgencyApi }));

const scrape = vi.fn();
vi.mock("@/lib/ai-keyword-generator", () => ({ scrapeWebsiteMetadata: scrape, generateAIKeywordsAndQueries: vi.fn() }));

const json = (status: number, code: string) => new Response(JSON.stringify({ error: code, code }), { status, headers: { "content-type": "application/json" } });

const post = (url: string, body: unknown) =>
  new NextRequest(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const ctx = { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) };

const routes: { name: string; call: () => Promise<Response> }[] = [
  { name: "POST /api/reports/generate", call: async () => (await import("./reports/generate/route")).POST(post("http://x/api/reports/generate", { client_id: ctx })) },
  { name: "POST /api/keyword-report/generate", call: async () => (await import("./keyword-report/generate/route")).POST(post("http://x/api/keyword-report/generate", { keyword_id: "k" })) },
  { name: "DELETE /api/keyword-report/[id]", call: async () => (await import("./keyword-report/[id]/route")).DELETE(new NextRequest("http://x", { method: "DELETE" }), ctx) },
  { name: "GET /api/keyword-report/[id]/status", call: async () => (await import("./keyword-report/[id]/status/route")).GET(new NextRequest("http://x"), ctx) },
  { name: "POST /api/clients/ai-keywords", call: async () => (await import("./clients/ai-keywords/route")).POST(post("http://x/api/clients/ai-keywords", { domain: "example.com" })) },
];

// Load the route modules once, outside the timed tests: the first cold import of a route's module
// graph can take several seconds when the full suite runs in parallel, which used to trip the
// 5s per-test timeout. The tests below then measure only the route calls.
beforeAll(async () => {
  await Promise.all([
    import("./reports/generate/route"),
    import("./keyword-report/generate/route"),
    import("./keyword-report/[id]/route"),
    import("./keyword-report/[id]/status/route"),
    import("./clients/ai-keywords/route"),
  ]);
}, 60_000);

beforeEach(() => {
  vi.clearAllMocks();
});

describe.each(routes)("$name", ({ call }) => {
  it("signed out → 401 JSON, no database or scrape", async () => {
    requireAgencyApi.mockResolvedValue(json(401, "unauthenticated"));
    const res = await call();
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
    expect(scrape).not.toHaveBeenCalled();
  });
  it("disabled or no organization → 403 JSON", async () => {
    for (const code of ["account_disabled", "no_organization"]) {
      requireAgencyApi.mockResolvedValue(json(403, code));
      const res = await call();
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe(code);
    }
    expect(createClient).not.toHaveBeenCalled();
  });
});
