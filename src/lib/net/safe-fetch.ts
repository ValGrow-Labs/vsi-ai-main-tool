import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPublicAddress } from "./ip";

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export interface SafeFetchResult {
  url: string;
  status: number;
  ok: boolean;
  contentType: string;
  body: string;
  truncated: boolean;
}

interface SafeFetchOptions {
  method?: "GET" | "HEAD";
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  userAgent?: string;
}

export const AUDIT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Resolve the host and refuse anything that isn't a public address.
 * Blocks loopback, private ranges, link-local (cloud metadata) and friends.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("That address isn't a valid web address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https addresses can be checked.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new UnsafeUrlError("Only standard web ports can be checked.");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("Addresses with credentials can't be checked.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);
  if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
    throw new UnsafeUrlError("That address points to a private network and can't be checked.");
  }
  return url;
}

/**
 * fetch() for user-supplied URLs: public hosts only, every redirect hop
 * re-validated, hard timeout and response size cap.
 */
export async function safeFetch(raw: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const { method = "GET", timeoutMs = 10_000, maxBytes = 1_500_000, maxRedirects = 5, userAgent = AUDIT_USER_AGENT } = opts;
  let current = raw;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = await assertPublicUrl(current);
    const res = await fetch(url, {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": userAgent, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5" },
    });

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, url).toString();
      await res.body?.cancel().catch(() => {});
      continue;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (method === "HEAD" || !res.body) {
      return { url: url.toString(), status: res.status, ok: res.ok, contentType, body: "", truncated: false };
    }

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    let truncated = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        truncated = true;
        await reader.cancel().catch(() => {});
        break;
      }
      chunks.push(value);
    }
    const body = new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
    return { url: url.toString(), status: res.status, ok: res.ok, contentType, body, truncated };
  }

  throw new UnsafeUrlError("The address redirected too many times.");
}
