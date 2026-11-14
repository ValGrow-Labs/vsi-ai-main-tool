import { describe, expect, it, vi } from "vitest";
import { normaliseCacheDomain } from "./domain-cache";

describe("domain-cache normaliseCacheDomain", () => {
  it("normalises domains with protocol, www, and paths", () => {
    expect(normaliseCacheDomain("https://www.stripe.com/pricing")).toBe("stripe.com");
    expect(normaliseCacheDomain("http://stripe.com/")).toBe("stripe.com");
    expect(normaliseCacheDomain("valgrowlabs.com")).toBe("valgrowlabs.com");
    expect(normaliseCacheDomain("   HTTPS://WWW.NIKE.COM/   ")).toBe("nike.com");
  });
});

