import { isIPv4, isIPv6 } from "node:net";

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

/** IPv4 ranges that are never reachable "on the public internet" (RFC 6890 special-purpose + friends). */
const V4_BLOCKED: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (cloud metadata 169.254.169.254)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

function inV4Range(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

function isPublicV4(ip: string): boolean {
  return !V4_BLOCKED.some(([base, bits]) => inV4Range(ip, base, bits));
}

/** Expand an IPv6 literal (any textual form, incl. embedded dotted IPv4) into 8 16-bit groups. */
export function parseIPv6(raw: string): number[] | null {
  let ip = raw.toLowerCase().replace(/^\[|\]$/g, "");
  const zone = ip.indexOf("%");
  if (zone !== -1) ip = ip.slice(0, zone);
  if (!isIPv6(ip)) return null;

  // Trailing dotted IPv4 → two hex groups.
  const dotted = ip.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const n = ipv4ToInt(dotted[2]);
    ip = `${dotted[1]}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }

  const [head, tail] = ip.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail !== undefined && tail !== "" ? tail.split(":") : [];
  const missing = ip.includes("::") ? 8 - headParts.length - tailParts.length : 0;
  const parts = [...headParts, ...Array(missing).fill("0"), ...tailParts];
  if (parts.length !== 8) return null;
  const groups = parts.map((p) => parseInt(p, 16));
  return groups.some((g) => Number.isNaN(g) || g < 0 || g > 0xffff) ? null : groups;
}

function v4FromGroups(hi: number, lo: number): string {
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
}

function isPublicV6(ip: string): boolean {
  const g = parseIPv6(ip);
  if (!g) return false;
  const [g0, g1, g2, g3, g4, g5, g6, g7] = g;
  const firstSixZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;

  // ::/128, ::1, IPv4-compatible ::a.b.c.d (deprecated) — never public for our purposes.
  if (firstSixZero && g5 === 0) return false;
  // ::ffff:a.b.c.d IPv4-mapped (dotted or hex form) → judge the embedded IPv4.
  if (firstSixZero && g5 === 0xffff) return isPublicV4(v4FromGroups(g6, g7));
  // 64:ff9b::/96 well-known NAT64 prefix → judge the embedded IPv4.
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return isPublicV4(v4FromGroups(g6, g7));
  }
  // 64:ff9b:1::/48 local-use NAT64.
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 1) return false;
  // 2002::/16 6to4 → embedded IPv4 in groups 1-2.
  if (g0 === 0x2002) return isPublicV4(v4FromGroups(g1, g2));
  // 2001::/32 Teredo (embeds obfuscated IPv4; tunnels to arbitrary hosts).
  if (g0 === 0x2001 && g1 === 0) return false;
  // 2001:db8::/32 documentation.
  if (g0 === 0x2001 && g1 === 0xdb8) return false;
  // Only global unicast 2000::/3 is public. This excludes fc00::/7 (ULA, incl. fd00:ec2::254 AWS metadata),
  // fe80::/10 link-local, fec0::/10 site-local, ff00::/8 multicast, 100::/64 discard, and everything unassigned.
  return (g0 & 0xe000) === 0x2000;
}

/** True only for addresses on the public internet. Non-IP strings are never public. */
export function isPublicAddress(ip: string): boolean {
  if (isIPv4(ip)) return isPublicV4(ip);
  return isPublicV6(ip);
}
