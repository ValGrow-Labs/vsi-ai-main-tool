import { Readable } from "node:stream";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// No network: DNS, the pinned transport and global fetch (Firecrawl API) are mocked.
const lookup = vi.fn();
vi.mock("node:dns/promises", () => ({ lookup: (...a: unknown[]) => lookup(...a), default: { lookup: (...a: unknown[]) => lookup(...a) } }));
const pinnedRequest = vi.fn();
vi.mock("@/lib/net/pinned-request", () => ({ pinnedRequest: (...a: unknown[]) => pinnedRequest(...a) }));

import { scrapeUrl, scrapeUrlsBatch } from "./firecrawl";
import { UnsafeUrlError } from "./net/safe-fetch";

const fetchSpy = vi.fn();
const realFetch = globalThis.fetch;
const originalKey = process.env.FIRECRAWL_API_KEY;

beforeEach(() => {
  lookup.mockReset();
  lookup.mockImplementation(async (host: string) =>
    host === "rebind.attacker.com" ? [{ address: "10.0.0.5", family: 4 }] : [{ address: "93.184.216.34", family: 4 }],
  );
  pinnedRequest.mockReset();
  pinnedRequest.mockResolvedValue({
    status: 200,
    headers: { "content-type": "text/html" },
    body: Readable.from([Buffer.from("<title>Public</title><p>Hello world</p>")]),
  });
  fetchSpy.mockReset();
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
  process.env.FIRECRAWL_API_KEY = "fc-test";
});

afterAll(() => {
  globalThis.fetch = realFetch;
  if (originalKey === undefined) delete process.env.FIRECRAWL_API_KEY;
  else process.env.FIRECRAWL_API_KEY = originalKey;
});

describe("scrapeUrl outbound policy", () => {
  it.each([
    "http://127.0.0.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://metadata.google.internal/",
    "http://localhost:3000/",
    "http://[::ffff:127.0.0.1]/",
    "file:///etc/passwd",
    "https://rebind.attacker.com/",
  ])("rejects %s without calling Firecrawl or fetching it", async (u) => {
    await expect(scrapeUrl(u)).rejects.toThrow(UnsafeUrlError);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(pinnedRequest).not.toHaveBeenCalled();
  });

  it("falls back to the safe fetcher (pinned, public) when Firecrawl fails", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ error: "down" }), { status: 500 }));
    const res = await scrapeUrl("https://example.com/");
    expect(res.source).toBe("fallback");
    expect(res.title).toBe("Public");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0][0])).toBe("https://api.firecrawl.dev/v1/scrape");
    expect(pinnedRequest.mock.calls[0][1]).toEqual({ address: "93.184.216.34", family: 4 });
  });

  it("sends only vetted public URLs to Firecrawl", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { markdown: "# Hi", metadata: { title: "T" } } }), { status: 200 }),
    );
    const res = await scrapeUrl("https://example.com/page");
    expect(res.source).toBe("firecrawl");
    expect(JSON.parse(fetchSpy.mock.calls[0][1].body).url).toBe("https://example.com/page");
    expect(pinnedRequest).not.toHaveBeenCalled();
  });

  it("batch scraping reports blocked URLs as failures without fetching them", async () => {
    fetchSpy.mockResolvedValue(new Response("{}", { status: 500 }));
    const out = await scrapeUrlsBatch(["http://10.0.0.5/", "http://192.168.1.1/"]);
    expect(out.every((r) => r.markdown === "" && r.wordCount === 0)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(pinnedRequest).not.toHaveBeenCalled();
  });
});
