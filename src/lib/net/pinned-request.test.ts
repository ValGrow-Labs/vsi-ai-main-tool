import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pinnedLookup, pinnedRequest } from "./pinned-request";

/**
 * An in-process server on the loopback interface (no external network). The request targets a
 * hostname that does not exist (`.invalid` never resolves); it only reaches this server because the
 * connection is pinned — proving DNS is not consulted again at connect time.
 */
let server: http.Server;
let port = 0;
const seen: Array<{ host?: string; url?: string }> = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    seen.push({ host: req.headers.host, url: req.url });
    if (req.url === "/gzip") {
      res.writeHead(200, { "content-type": "text/plain", "content-encoding": "gzip" });
      res.end(zlib.gzipSync("compressed hello"));
      return;
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("hello");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

async function read(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c as Buffer));
  return Buffer.concat(chunks).toString("utf8");
}

describe("pinnedLookup", () => {
  it("answers with the pinned address whatever hostname is asked (single + all forms)", async () => {
    const lookup = pinnedLookup({ address: "93.184.216.34", family: 4 });
    const one = await new Promise((r) => lookup("evil.example", {}, (_e, a, f) => r([a, f])));
    expect(one).toEqual(["93.184.216.34", 4]);
    const all = await new Promise((r) => lookup("evil.example", { all: true }, (_e, a) => r(a)));
    expect(all).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });
});

describe("pinnedRequest", () => {
  it("connects to the pinned address and keeps the original Host header", async () => {
    const res = await pinnedRequest(new URL(`http://pinned-host.invalid:${port}/path?q=1`), { address: "127.0.0.1", family: 4 }, {
      method: "GET",
      headers: { "User-Agent": "test" },
      signal: AbortSignal.timeout(5000),
    });
    expect(res.status).toBe(200);
    expect(await read(res.body)).toBe("hello");
    expect(seen.at(-1)).toEqual({ host: `pinned-host.invalid:${port}`, url: "/path?q=1" });
  });

  it("decompresses gzip bodies", async () => {
    const res = await pinnedRequest(new URL(`http://pinned-host.invalid:${port}/gzip`), { address: "127.0.0.1", family: 4 }, {
      method: "GET",
      headers: {},
      signal: AbortSignal.timeout(5000),
    });
    expect(await read(res.body)).toBe("compressed hello");
  });
});
