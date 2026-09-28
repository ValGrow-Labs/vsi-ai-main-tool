import { describe, expect, it } from "vitest";
import { isPublicAddress } from "./ip";

describe("isPublicAddress", () => {
  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "104.16.0.1",
    "2606:4700::1111",
    "64:ff9b::12a1:d818", // 18.161.216.24 via NAT64/DNS64
    "64:ff9b::18.161.216.24",
    "::ffff:8.8.8.8",
    "2002:808:808::1", // 6to4 wrapping 8.8.8.8
    "2a00:1450:4001:80b::200e",
  ])("allows public %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });

  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "64:ff9b::7f00:1", // 127.0.0.1 via NAT64
    "64:ff9b::a00:1", // 10.0.0.1 via NAT64
    "64:ff9b::192.168.1.1", // 192.168.1.1 via NAT64
    "64:ff9b::a9fe:a9fe", // 169.254.169.254 (metadata) via NAT64
    "64:ff9b:1::1", // local-use translation prefix
    "2001:db8::1", // documentation prefix
    "::ffff:7f00:1", // IPv4-mapped 127.0.0.1, hex form (what WHATWG URL produces)
    "::ffff:a9fe:a9fe", // IPv4-mapped 169.254.169.254, hex form
    "0:0:0:0:0:ffff:7f00:1",
    "::7f00:1", // IPv4-compatible (deprecated)
    "::127.0.0.1",
    "fd00:ec2::254", // AWS IMDS over IPv6
    "fec0::1", // site-local (deprecated)
    "ff02::1", // multicast
    "100::1", // discard prefix
    "2002:7f00:1::1", // 6to4 wrapping 127.0.0.1
    "2002:a9fe:a9fe::1", // 6to4 wrapping 169.254.169.254
    "2001:0:4136:e378::1", // Teredo
    "192.88.99.1",
    "255.255.255.255",
    "198.18.0.1",
    "fe80::1%eth0",
  ])("blocks private %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it("treats non-IP strings as not public", () => {
    expect(isPublicAddress("localhost")).toBe(false);
  });

  it("does not block 172.32.x (outside 172.16/12)", () => {
    expect(isPublicAddress("172.32.0.1")).toBe(true);
  });
});

