import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { providerErrorResponse, reasonFromHttpStatus, safeProviderMessage } from "./provider-response";
import { ProviderUnavailableError } from "./provider-status";
import { safeAiError } from "./safe-error";

const SECRET_URL = "https://serpapi.com/search.json?engine=google&q=x&api_key=sk_live_SUPERSECRET123";
const UPSTREAM_BODY = '{"error":{"message":"Incorrect API key provided: sk-proj-abc***xyz","type":"invalid_request_error"}}';
const STACK = "Error: boom\n    at fetchSerp (/var/task/.next/server/chunks/1234.js:10:5)\n    at internal/process";

const FORBIDDEN = ["api_key", "SUPERSECRET", "serpapi.com", "sk-proj", "invalid_request_error", "/var/task", ".next/server", "SERPAPI_KEY", "OPENAI_API_KEY", "at fetchSerp"];

function expectClean(text: string) {
  for (const f of FORBIDDEN) expect(text).not.toContain(f);
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("providerErrorResponse", () => {
  it("never returns a provider error message that embeds an api_key URL", async () => {
    const res = providerErrorResponse(new Error(`request to ${SECRET_URL} failed, reason: ECONNRESET`));
    expect(res.status).toBe(502);
    const text = await res.text();
    expectClean(text);
    const body = JSON.parse(text);
    expect(body).toMatchObject({ success: false, status: "CHECK_FAILED" });
    expect(body.error).toBe(body.message);
  });

  it("never returns an upstream body or stack trace", async () => {
    const err = new ProviderUnavailableError("serpapi", "PROVIDER_AUTH_FAILED", `SerpAPI 401: ${UPSTREAM_BODY}`);
    err.stack = STACK;
    const res = providerErrorResponse(err);
    expect(res.status).toBe(502);
    const text = await res.text();
    expectClean(text);
    expect(JSON.parse(text).reason).toBe("PROVIDER_AUTH_FAILED");
  });

  it("keeps 503 SEARCH_UNAVAILABLE for an unconfigured provider, with safe text", async () => {
    const res = providerErrorResponse(new ProviderUnavailableError("serpapi", "PROVIDER_NOT_CONFIGURED", "SERPAPI_KEY is not set"));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("SEARCH_UNAVAILABLE");
    expect(body.error).toMatch(/isn't configured/);
    expectClean(JSON.stringify(body));
  });

  it("keeps a useful rate-limit message", async () => {
    const res = providerErrorResponse(new ProviderUnavailableError("serper", "PROVIDER_RATE_LIMITED", `429 from ${SECRET_URL}`));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/rate limited/i);
    expectClean(JSON.stringify(body));
  });

  it("logs the detail server-side", () => {
    providerErrorResponse(new Error(`boom ${SECRET_URL}`));
    expect(console.error).toHaveBeenCalled();
  });

  it("handles non-Error throwables", async () => {
    const res = providerErrorResponse({ weird: SECRET_URL });
    expectClean(await res.text());
  });
});

describe("safeProviderMessage / reasonFromHttpStatus", () => {
  it("returns fixed text", () => {
    expectClean(safeProviderMessage(new Error(UPSTREAM_BODY + SECRET_URL)));
  });
  it("maps statuses", () => {
    expect(reasonFromHttpStatus(503, "SEARCH_UNAVAILABLE")).toBe("PROVIDER_NOT_CONFIGURED");
    expect(reasonFromHttpStatus(401)).toBe("PROVIDER_AUTH_FAILED");
    expect(reasonFromHttpStatus(429)).toBe("PROVIDER_RATE_LIMITED");
    expect(reasonFromHttpStatus(504)).toBe("PROVIDER_TIMEOUT");
    expect(reasonFromHttpStatus(502)).toBe("PROVIDER_ERROR");
  });
});

describe("safeAiError", () => {
  it("never echoes upstream text", () => {
    for (const raw of [`openai: HTTP 400 ${UPSTREAM_BODY}`, `fetch ${SECRET_URL}`, STACK, "OPENAI_API_KEY not configured"]) {
      expectClean(safeAiError(raw));
    }
  });
  it("keeps the rate-limit hint", () => {
    expect(safeAiError("model-x: HTTP 429 slow down")).toMatch(/rate-limited/);
  });
});
