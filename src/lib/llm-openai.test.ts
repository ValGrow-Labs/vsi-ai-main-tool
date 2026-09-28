import { afterEach, describe, expect, it, vi } from "vitest";
import { callOpenAI } from "./llm";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("callOpenAI", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts a JSON-mode chat completion with the key and returns the content", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => json({ choices: [{ message: { content: ' {"ok":true} ' } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await callOpenAI("gpt-4o-mini", "sys", "user prompt", "test-key", 1800);
    expect(res).toEqual({ content: '{"ok":true}', rateLimited: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ model: "gpt-4o-mini", max_tokens: 1800, response_format: { type: "json_object" } });
    expect(body.messages).toEqual([{ role: "system", content: "sys" }, { role: "user", content: "user prompt" }]);
  });

  it("a rate limit is reported as rateLimited, not thrown", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { code: "rate_limit_exceeded", message: "Rate limit reached" } }, 429)));
    expect(await callOpenAI("gpt-4o-mini", "s", "u", "k")).toEqual({ content: null, rateLimited: true });
  });

  it("other failures throw a short error without the key or the provider's message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { type: "invalid_request_error", message: "Incorrect API key provided: sk-proj-abc" } }, 401)));
    const err = await callOpenAI("gpt-4o-mini", "s", "u", "sk-proj-abc").then(() => null, (e: Error) => e);
    expect(err?.message).toBe("OpenAI HTTP 401 invalid_request_error");
    expect(err?.message).not.toMatch(/sk-proj|Incorrect API key/);
  });
});
