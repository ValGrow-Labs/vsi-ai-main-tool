import "server-only";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import type { Readable } from "node:stream";
import zlib from "node:zlib";

export interface PinnedAddress {
  address: string;
  family: 4 | 6;
}

export interface PinnedResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  /** Decoded (decompressed) body stream. Destroy it if you stop reading early. */
  body: Readable;
}

export interface PinnedRequestOptions {
  method: "GET" | "HEAD";
  headers: Record<string, string>;
  signal: AbortSignal;
}

/**
 * A `lookup` replacement for net.connect that ignores DNS entirely and hands back the address we
 * already vetted. This is what closes the DNS-rebinding window: the hostname is never resolved a
 * second time, so it can't come back as 127.0.0.1 between our check and the connect.
 */
export function pinnedLookup(pinned: PinnedAddress): LookupFunction {
  return ((_hostname: string, options: unknown, callback?: unknown) => {
    const cb = (typeof options === "function" ? options : callback) as (...args: unknown[]) => void;
    const opts = (typeof options === "object" && options) || {};
    if ((opts as { all?: boolean }).all) {
      cb(null, [{ address: pinned.address, family: pinned.family }]);
    } else {
      cb(null, pinned.address, pinned.family);
    }
  }) as LookupFunction;
}

function decode(res: http.IncomingMessage): Readable {
  const enc = String(res.headers["content-encoding"] ?? "").trim().toLowerCase();
  const onError = (d: Readable) => {
    res.on("error", (e) => d.destroy(e));
    return d;
  };
  if (enc === "gzip" || enc === "x-gzip") return onError(res.pipe(zlib.createGunzip()));
  if (enc === "deflate") return onError(res.pipe(zlib.createInflate()));
  if (enc === "br") return onError(res.pipe(zlib.createBrotliDecompress()));
  return res;
}

/**
 * One HTTP(S) request whose TCP connection goes to `pinned`, whatever DNS says now. The URL's
 * hostname is still used for the Host header and for TLS SNI + certificate verification, so HTTPS
 * behaves exactly as if we had resolved the name normally. Never follows redirects.
 */
export function pinnedRequest(url: URL, pinned: PinnedAddress, opts: PinnedRequestOptions): Promise<PinnedResponse> {
  const mod = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request(
      url,
      {
        method: opts.method,
        headers: opts.headers,
        signal: opts.signal,
        lookup: pinnedLookup(pinned),
        // A fresh agent per request: no pooled socket can be reused for a different host/address.
        agent: false,
      },
      (res) => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: decode(res) }),
    );
    req.on("error", reject);
    req.end();
  });
}
