import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({ requireAgencyApi: async () => ({ userId: "u1", agencyId: "a1" }) }));

let thrown: unknown;
vi.mock("@/lib/serpapi-service", async () => {
  class SerpApiError extends Error {
    statusCode: number;
    code: string;
    constructor(message: string, statusCode = 500, code = "CHECK_FAILED") {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }
  }
  return { SerpApiError, searchSerpApi: async () => { throw thrown; } };
});

import { POST } from "./route";
import { SerpApiError } from "@/lib/serpapi-service";

const req = () =>
  new NextRequest("https://app.example/api/search", { method: "POST", body: JSON.stringify({ keyword: "x" }) });

describe("/api/search provider errors", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));

  it("does not echo the provider's error body, keeps status code and status field", async () => {
    thrown = new (SerpApiError as unknown as new (m: string, s: number, c?: string) => Error)(
      "SerpAPI error: Invalid API key sk_live_SECRET at https://serpapi.com/search?api_key=sk_live_SECRET",
      502,
    );
    const res = await POST(req());
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).not.toContain("sk_live_SECRET");
    expect(text).not.toContain("serpapi.com");
    expect(JSON.parse(text)).toMatchObject({ success: false, status: "CHECK_FAILED", reason: "PROVIDER_ERROR" });
  });

  it("keeps 503 SEARCH_UNAVAILABLE", async () => {
    thrown = new (SerpApiError as unknown as new (m: string, s: number, c?: string) => Error)("no SERPAPI_KEY", 503, "SEARCH_UNAVAILABLE");
    const res = await POST(req());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("SEARCH_UNAVAILABLE");
    expect(JSON.stringify(body)).not.toContain("SERPAPI_KEY");
  });
});
