import "server-only";
import * as dns from "node:dns/promises";
import { isIP } from "node:net";
import { isPublicAddress } from "./ip";
import { pinnedRequest, type PinnedAddress } from "./pinned-request";

/**
 * The one outbound-URL policy for anything a user (or a third party, e.g. a search result, a
 * sitemap, a redirect) gets to choose. Use:
 *  - checkUrlPolicy(url)  — sync, no DNS: shape/host checks (for input validation).
 *  - assertPublicUrl(url) — async: checkUrlPolicy + every DNS answer must be public.
 *    Use before handing a URL to a third party that fetches it (Firecrawl).
 *  - safeFetch(url)       — fetch it ourselves: assertPublicUrl on every hop, connection pinned
 *    to the vetted IP (no DNS rebinding), manual redirects, timeout and size cap.
 */

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
  accept?: string;
}

export const AUDIT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const MSG = {
  invalid: "That address isn't a valid web address.",
  protocol: "Only http and https addresses can be checked.",
  port: "Only standard web ports can be checked.",
  credentials: "Addresses with credentials can't be checked.",
  private: "That address points to a private network and can't be checked.",
  redirects: "The address redirected too many times.",
} as const;

/** Cloud metadata endpoints reachable by name (the IPs are covered by isPublicAddress). */
const METADATA_HOSTS = new Set([
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "instance-data",
  "instance-data.ec2.internal",
  "metadata.azure.internal",
  "metadata.tencentyun.com",
  "100-100-100-200.aliyun.com",
]);

/** Suffixes that only ever name internal hosts. */
const INTERNAL_SUFFIXES = [
  ".localhost",
  ".local",
  ".localdomain",
  ".internal",
  ".intranet",
  ".lan",
  ".home",
  ".corp",
  ".private",
  ".arpa", // incl. home.arpa and reverse-DNS names
];

export type UrlPolicyResult =
  | { ok: true; url: URL; host: string; isIpLiteral: boolean }
  | { ok: false; reason: string };

/** Hostname as used for policy decisions: no IPv6 brackets, no trailing dots, lower-case. */
function policyHost(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, "").replace(/\.+$/, "").toLowerCase();
}

/**
 * Synchronous URL policy (no DNS). Relies on WHATWG URL parsing, which already normalises
 * decimal/octal/hex/short IPv4 forms (http://2130706433, http://0x7f.1, http://127.1 → 127.0.0.1)
 * and IPv6 literals, so the IP check sees the address the connection would actually use.
 */
export function checkUrlPolicy(raw: string | URL): UrlPolicyResult {
  let url: URL;
  try {
    url = new URL(String(raw));
  } catch {
    return { ok: false, reason: MSG.invalid };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, reason: MSG.protocol };
  if (url.username || url.password) return { ok: false, reason: MSG.credentials };
  if (url.port && url.port !== "80" && url.port !== "443") return { ok: false, reason: MSG.port };

  const host = policyHost(url);
  if (!host) return { ok: false, reason: MSG.invalid };

  if (isIP(host)) {
    return isPublicAddress(host) ? { ok: true, url, host, isIpLiteral: true } : { ok: false, reason: MSG.private };
  }
  if (
    host === "localhost" ||
    !host.includes(".") || // single-label names only resolve on internal networks
    METADATA_HOSTS.has(host) ||
    INTERNAL_SUFFIXES.some((s) => host.endsWith(s))
  ) {
    return { ok: false, reason: MSG.private };
  }
  return { ok: true, url, host, isIpLiteral: false };
}

/**
 * checkUrlPolicy + resolve ALL addresses for the host; every one must be public (a name that
 * answers with one public and one private address is refused). Returns the vetted addresses.
 */
export async function resolvePublicUrl(raw: string | URL): Promise<{ url: URL; addresses: PinnedAddress[] }> {
  const policy = checkUrlPolicy(raw);
  if (!policy.ok) throw new UnsafeUrlError(policy.reason);
  const { url, host, isIpLiteral } = policy;

  if (isIpLiteral) {
    return { url, addresses: [{ address: host, family: isIP(host) === 6 ? 6 : 4 }] };
  }
  const answers = await dns.lookup(host, { all: true, verbatim: true });
  const addresses: PinnedAddress[] = (answers ?? []).map((a) => ({
    address: a.address,
    family: a.family === 6 ? 6 : 4,
  }));
  if (addresses.length === 0 || !addresses.every((a) => isPublicAddress(a.address))) {
    throw new UnsafeUrlError(MSG.private);
  }
  return { url, addresses };
}

/** Resolve the host and refuse anything that isn't a public address. */
export async function assertPublicUrl(raw: string | URL): Promise<URL> {
  return (await resolvePublicUrl(raw)).url;
}

function header(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

/**
 * fetch() for user-supplied URLs: public hosts only, the TCP connection pinned to the vetted IP,
 * every redirect hop re-validated, hard timeout (whole request incl. body) and response size cap.
 */
export async function safeFetch(raw: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const {
    method = "GET",
    timeoutMs = 10_000,
    maxBytes = 1_500_000,
    maxRedirects = 5,
    userAgent = AUDIT_USER_AGENT,
    accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5",
  } = opts;
  const signal = AbortSignal.timeout(timeoutMs);
  let current: string = raw;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const { url, addresses } = await resolvePublicUrl(current);
    // Every address is vetted; connect to one of them (IPv4 first — IPv6 egress is often missing).
    const pinned = addresses.find((a) => a.family === 4) ?? addresses[0];
    const res = await pinnedRequest(url, pinned, {
      method,
      signal,
      headers: { "User-Agent": userAgent, Accept: accept, "Accept-Encoding": "gzip, br" },
    });

    const location = header(res.headers.location);
    if (res.status >= 300 && res.status < 400 && location) {
      res.body.destroy();
      try {
        current = new URL(location, url).toString();
      } catch {
        throw new UnsafeUrlError(MSG.invalid);
      }
      continue;
    }

    const status = res.status;
    const ok = status >= 200 && status < 300;
    const contentType = header(res.headers["content-type"]);
    if (method === "HEAD") {
      res.body.destroy();
      return { url: url.toString(), status, ok, contentType, body: "", truncated: false };
    }

    const chunks: Buffer[] = [];
    let size = 0;
    let truncated = false;
    for await (const chunk of res.body) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      if (size + buf.byteLength > maxBytes) {
        chunks.push(buf.subarray(0, maxBytes - size));
        truncated = true;
        break; // leaving the loop destroys the stream
      }
      size += buf.byteLength;
      chunks.push(buf);
    }
    res.body.destroy();
    const body = new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
    return { url: url.toString(), status, ok, contentType, body, truncated };
  }

  throw new UnsafeUrlError(MSG.redirects);
}
