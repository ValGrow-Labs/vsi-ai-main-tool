import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state: { session: Record<string, unknown> | null } = { session: null };
vi.mock("@/lib/auth", () => ({
  requireAgencyApi: async () => {
    if (!state.session) return Response.json({ error: "Sign in again to continue." }, { status: 401 });
    if (!state.session.agencyId) return Response.json({ error: "Create your organization first." }, { status: 403 });
    return state.session;
  },
}));
vi.mock("@/lib/llm", () => ({ analyzeCitation: vi.fn() }));

// No network: DNS + transport mocked; global fetch (Firecrawl API) is a spy.
const lookup = vi.fn();
vi.mock("node:dns/promises", () => ({ lookup: (...a: unknown[]) => lookup(...a), default: { lookup: (...a: unknown[]) => lookup(...a) } }));
const pinnedRequest = vi.fn();
vi.mock("@/lib/net/pinned-request", () => ({ pinnedRequest: (...a: unknown[]) => pinnedRequest(...a) }));

import { POST } from "./route";

const fetchSpy = vi.fn();
const realFetch = globalThis.fetch;
const originalKey = process.env.FIRECRAWL_API_KEY;

function req(body: unknown) {
  return new NextRequest("http://localhost/api/citation-content", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.session = { userId: "u1", agencyId: "a1" };
  lookup.mockReset();
  lookup.mockImplementation(async (host: string) =>
    host === "rebind.attacker.com" ? [{ address: "169.254.169.254", family: 4 }] : [{ address: "93.184.216.34", family: 4 }],
  );
  pinnedRequest.mockReset();
  fetchSpy.mockReset();
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
  process.env.FIRECRAWL_API_KEY = "fc-test";
});

afterAll(() => {
  globalThis.fetch = realFetch;
  if (originalKey === undefined) delete process.env.FIRECRAWL_API_KEY;
  else process.env.FIRECRAWL_API_KEY = originalKey;
});

describe("POST /api/citation-content", () => {
  it("401s without a session and fetches nothing", async () => {
    state.session = null;
    const res = await POST(req({ url: "https://example.com/" }));
    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(pinnedRequest).not.toHaveBeenCalled();
  });

  it.each([
    "http://169.254.169.254/latest/meta-data/",
    "http://127.0.0.1:80/",
    "http://2130706433/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://[::1]/",
    "http://10.0.0.5/",
    "httpfoo://example.com/",
    "file:///etc/passwd",
    "https://rebind.attacker.com/",
  ])("rejects internal URL %s with 400, without calling Firecrawl or fetch", async (url) => {
    const res = await POST(req({ url }));
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(pinnedRequest).not.toHaveBeenCalled();
  });

  it("scrapes a public URL", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { markdown: "hello there", metadata: { title: "T" } } }), { status: 200 }),
    );
    const res = await POST(req({ url: "https://example.com/article" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ title: "T", source: "firecrawl" });
  });
});
