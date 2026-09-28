import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state: { session: Record<string, unknown> | null } = { session: null };
vi.mock("@/lib/auth", () => ({
  requireAgencyApi: async () =>
    state.session ?? Response.json({ error: "Sign in again to continue.", code: "unauthenticated" }, { status: 401 }),
}));

const { POST } = await import("./route");

const call = (body: unknown) =>
  POST(new Request("http://x.test/api/resolve", { method: "POST", body: JSON.stringify(body) }));

const fetchMock = vi.fn();

beforeEach(() => {
  state.session = { userId: "u1", email: "pat@acme.test", agencyId: "a1" };
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("POST /api/resolve", () => {
  it("answers 401 when nobody is signed in, without calling the model", async () => {
    state.session = null;
    const res = await call({ title: "t", message: "m" });
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is an error, not a made-up success, when the model returns no text", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ candidates: [] }), { status: 200 }));
    const res = await call({ title: "t", message: "m" });
    const json = await res.json();
    expect(res.status).toBe(502);
    expect(json.success).toBeUndefined();
    expect(json.resolution).toBeUndefined();
    expect(JSON.stringify(json)).not.toMatch(/successfully/i);
  });

  it("is an error when the model call fails", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
    const res = await call({ title: "t", message: "m" });
    expect(res.status).toBe(502);
  });

  it("is an honest 503 when no API key is configured", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("GOOGLE_API_KEY", "");
    const res = await call({ title: "t", message: "m" });
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the model's suggestion when there is one", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Check the keyword list." }] } }] }), { status: 200 }),
    );
    const res = await call({ title: "t", message: "m" });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ success: true, kind: "suggestion", resolution: "Check the keyword list." });
  });
});
