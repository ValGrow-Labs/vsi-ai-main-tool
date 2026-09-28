import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

import { generateInviteCode } from "@/lib/auth";

const FORMAT = /^VG-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;

describe("generateInviteCode", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps the existing readable format (VG-XXXX-XXXX, no 0/O/1/I)", () => {
    for (let i = 0; i < 500; i++) expect(generateInviteCode()).toMatch(FORMAT);
  });

  it("uses the cryptographic random source, never Math.random", () => {
    const mathRandom = vi.spyOn(Math, "random");
    const getRandomValues = vi.spyOn(crypto, "getRandomValues");
    generateInviteCode();
    expect(mathRandom).not.toHaveBeenCalled();
    expect(getRandomValues).toHaveBeenCalledTimes(1);
  });

  it("maps random bytes onto the alphabet without bias (every symbol reachable)", () => {
    vi.spyOn(crypto, "getRandomValues").mockImplementation(((arr: Uint8Array) => {
      arr.set([0, 31, 32, 255, 1, 2, 3, 4]);
      return arr;
    }) as typeof crypto.getRandomValues);
    // 0→A, 31→9, 32→A (wraps), 255→9; 1,2,3,4 → B,C,D,E
    expect(generateInviteCode()).toBe("VG-A9A9-BCDE");
  });

  it("does not repeat in practice", () => {
    const codes = new Set(Array.from({ length: 2000 }, () => generateInviteCode()));
    expect(codes.size).toBe(2000);
  });
});
