import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

// No network: DNS and the HTTP transport are both mocked.
const lookup = vi.fn();
vi.mock("node:dns/promises", () => ({ lookup: (...a: unknown[]) => lookup(...a), default: { lookup: (...a: unknown[]) => lookup(...a) } }));

type Scripted = { status: number; headers?: Record<string, string>; body?: string };
const pinnedRequest = vi.fn();
vi.mock("./pinned-request", () => ({ pinnedRequest: (...a: unknown[]) => pinnedRequest(...a) }));

import { assertPublicUrl, checkUrlPolicy, safeFetch, UnsafeUrlError } from "./safe-fetch";

/** DNS table: host → addresses. Unknown hosts → ENOTFOUND. */
let dnsTable: Record<string, string[]> = {};
function answer(addresses: string[]) {
  return addresses.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
}

/** Scripted responses by URL. */
let responses: Record<string, Scripted> = {};

beforeEach(() => {
  dnsTable = {
    "example.com": ["93.184.216.34"],
    "www.example.com": ["93.184.216.34"],
    "rebind.attacker.com": ["10.0.0.5"],
    "169.254.169.254.nip.io": ["169.254.169.254"],
    "mixed.attacker.com": ["93.184.216.34", "127.0.0.1"],
    "v6private.attacker.com": ["fd00::1"],
    "internal-redirect.com": ["93.184.216.35"],
  };
  responses = {};
  lookup.mockReset();
  lookup.mockImplementation(async (host: string) => {
    const hit = dnsTable[host];
    if (!hit) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: "ENOTFOUND" });
    return answer(hit);
  });
  pinnedRequest.mockReset();
  pinnedRequest.mockImplementation(async (url: URL) => {
    const r = responses[url.toString()];
    if (!r) throw new Error(`unexpected request to ${url}`);
    return { status: r.status, headers: r.headers ?? {}, body: Readable.from([Buffer.from(r.body ?? "")]) };
  });
});

const BLOCKED_SYNC = [
  // local names
  "http://localhost/",
  "http://localhost:80/",
  "http://LOCALHOST./",
  "http://foo.localhost/",
  "http://printer.local/",
  "http://db.internal/",
  "http://nas.lan/",
  "http://router.home.arpa/",
  "http://intranet/",
  // metadata
  "http://metadata.google.internal/computeMetadata/v1/",
  "http://metadata/",
  "http://instance-data/latest/meta-data/",
  "http://169.254.169.254/latest/meta-data/",
  "http://[fd00:ec2::254]/",
  // loopback in every spelling WHATWG URL accepts
  "http://127.0.0.1/",
  "http://127.1/",
  "http://2130706433/",
  "http://0x7f000001/",
  "http://0x7f.1/",
  "http://0177.0.0.1/",
  "http://0.0.0.0/",
  "http://[::1]/",
  "http://[::]/",
  "http://[::ffff:127.0.0.1]/",
  "http://[::ffff:169.254.169.254]/",
  "http://[64:ff9b::10.0.0.1]/", // NAT64 of a private address
  // private / CGNAT / link-local / multicast
  "http://10.0.0.5/",
  "http://172.16.0.1/",
  "http://172.31.255.255/",
  "http://192.168.1.1/",
  "http://100.64.0.1/",
  "http://169.254.1.1/",
  "http://224.0.0.1/",
  "http://[fd00::1]/",
  "http://[fe80::1]/",
];

describe("checkUrlPolicy (sync)", () => {
  it.each(BLOCKED_SYNC)("blocks %s", (u) => {
    expect(checkUrlPolicy(u).ok).toBe(false);
  });

  it.each(["file:///etc/passwd", "ftp://example.com/", "gopher://example.com/", "javascript:alert(1)", "data:text/html,hi", "ws://example.com/"])(
    "blocks protocol %s",
    (u) => {
      const r = checkUrlPolicy(u);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/http and https/);
    },
  );

  it("blocks credentials in the URL", () => {
    expect(checkUrlPolicy("https://user:pass@example.com/").ok).toBe(false);
    expect(checkUrlPolicy("https://user@example.com/").ok).toBe(false);
  });

  it("blocks non-standard ports", () => {
    expect(checkUrlPolicy("http://example.com:8080/").ok).toBe(false);
    expect(checkUrlPolicy("https://example.com:6379/").ok).toBe(false);
    expect(checkUrlPolicy("http://example.com:443/").ok).toBe(true);
  });

  it("rejects garbage", () => {
    expect(checkUrlPolicy("not a url").ok).toBe(false);
    expect(checkUrlPolicy("").ok).toBe(false);
  });

  it("allows normal public addresses", () => {
    expect(checkUrlPolicy("https://example.com/path?q=1").ok).toBe(true);
    expect(checkUrlPolicy("http://8.8.8.8/").ok).toBe(true);
    expect(checkUrlPolicy("https://[2606:4700::1111]/").ok).toBe(true);
  });
});

describe("assertPublicUrl (DNS)", () => {
  it("allows a public host and resolves ALL addresses", async () => {
    const url = await assertPublicUrl("https://example.com");
    expect(url.hostname).toBe("example.com");
    expect(lookup).toHaveBeenCalledWith("example.com", expect.objectContaining({ all: true }));
  });

  it("blocks sync-policy failures without touching DNS", async () => {
    await expect(assertPublicUrl("http://localhost:3000")).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicUrl("http://169.254.169.254")).rejects.toThrow(UnsafeUrlError);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("blocks a hostname that resolves to a private IP", async () => {
    await expect(assertPublicUrl("https://rebind.attacker.com/")).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicUrl("http://169.254.169.254.nip.io/")).rejects.toThrow(UnsafeUrlError);
    await expect(assertPublicUrl("https://v6private.attacker.com/")).rejects.toThrow(UnsafeUrlError);
  });

  it("blocks a hostname with mixed public + private answers", async () => {
    await expect(assertPublicUrl("https://mixed.attacker.com/")).rejects.toThrow(UnsafeUrlError);
  });

  it("blocks a hostname with no answers", async () => {
    lookup.mockResolvedValueOnce([]);
    await expect(assertPublicUrl("https://empty.example.org/")).rejects.toThrow(UnsafeUrlError);
  });

  it("lets DNS failures through as ordinary errors", async () => {
    await expect(assertPublicUrl("https://nxdomain.example.org/")).rejects.toMatchObject({ code: "ENOTFOUND" });
  });
});

describe("safeFetch", () => {
  it("fetches a normal public HTTPS URL, pinned to the vetted address", async () => {
    responses["https://example.com/"] = { status: 200, headers: { "content-type": "text/html" }, body: "<title>Hi</title>" };
    const res = await safeFetch("https://example.com/");
    expect(res).toMatchObject({ ok: true, status: 200, body: "<title>Hi</title>", url: "https://example.com/", truncated: false });
    expect(pinnedRequest).toHaveBeenCalledTimes(1);
    const [url, pinned] = pinnedRequest.mock.calls[0];
    expect((url as URL).hostname).toBe("example.com");
    expect(pinned).toEqual({ address: "93.184.216.34", family: 4 });
  });

  it("follows http→https and www redirects on a public host", async () => {
    responses["http://example.com/"] = { status: 301, headers: { location: "https://example.com/" } };
    responses["https://example.com/"] = { status: 308, headers: { location: "https://www.example.com/" } };
    responses["https://www.example.com/"] = { status: 200, body: "ok" };
    const res = await safeFetch("http://example.com/");
    expect(res.url).toBe("https://www.example.com/");
    expect(res.body).toBe("ok");
    expect(pinnedRequest).toHaveBeenCalledTimes(3);
  });

  it("resolves relative redirects against the current URL", async () => {
    responses["https://example.com/a"] = { status: 302, headers: { location: "/b" } };
    responses["https://example.com/b"] = { status: 200, body: "b" };
    expect((await safeFetch("https://example.com/a")).body).toBe("b");
  });

  it("blocks a redirect from a public host to a private IP (never connects to it)", async () => {
    responses["https://internal-redirect.com/"] = { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } };
    await expect(safeFetch("https://internal-redirect.com/")).rejects.toThrow(UnsafeUrlError);
    expect(pinnedRequest).toHaveBeenCalledTimes(1);
  });

  it("blocks a redirect to a hostname that resolves privately", async () => {
    responses["https://internal-redirect.com/"] = { status: 302, headers: { location: "https://rebind.attacker.com/" } };
    await expect(safeFetch("https://internal-redirect.com/")).rejects.toThrow(UnsafeUrlError);
    expect(pinnedRequest).toHaveBeenCalledTimes(1);
  });

  it("blocks a redirect to a non-http protocol", async () => {
    responses["https://internal-redirect.com/"] = { status: 302, headers: { location: "file:///etc/passwd" } };
    await expect(safeFetch("https://internal-redirect.com/")).rejects.toThrow(UnsafeUrlError);
  });

  it("enforces the redirect chain limit", async () => {
    for (let i = 0; i < 10; i++) responses[`https://example.com/${i}`] = { status: 302, headers: { location: `/${i + 1}` } };
    await expect(safeFetch("https://example.com/0", { maxRedirects: 3 })).rejects.toThrow(/redirected too many times/);
    expect(pinnedRequest).toHaveBeenCalledTimes(4);
  });

  it("caps the response size", async () => {
    responses["https://example.com/big"] = { status: 200, body: "x".repeat(5000) };
    const res = await safeFetch("https://example.com/big", { maxBytes: 1000 });
    expect(res.truncated).toBe(true);
    expect(res.body.length).toBe(1000);
  });

  it("never connects for internal targets", async () => {
    for (const u of ["http://127.0.0.1/", "http://2130706433/", "http://[::ffff:127.0.0.1]/", "https://mixed.attacker.com/", "https://user:p@example.com/", "https://example.com:8443/"]) {
      await expect(safeFetch(u)).rejects.toThrow(UnsafeUrlError);
    }
    expect(pinnedRequest).not.toHaveBeenCalled();
  });

  it("pins to an IPv4 answer when the host has both families", async () => {
    dnsTable["dual.example.com"] = ["2606:2800:220:1:248:1893:25c8:1946", "93.184.216.34"];
    responses["https://dual.example.com/"] = { status: 200, body: "" };
    await safeFetch("https://dual.example.com/");
    expect(pinnedRequest.mock.calls[0][1]).toEqual({ address: "93.184.216.34", family: 4 });
  });
});
