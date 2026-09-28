import { describe, expect, it } from "vitest";
import { resolveLocation, matchLocationOption, isSupportedLocationCode } from "./location";

describe("Location Resolution and Saving", () => {
  it("resolves Singapore correctly", () => {
    const res = resolveLocation("Singapore", "United States", "us");
    expect(res.location).toBe("Singapore");
    expect(res.locationCode).toBe("sg");
  });

  it("resolves sg code to Singapore", () => {
    const res = resolveLocation("sg", "United States", "us");
    expect(res.location).toBe("Singapore");
    expect(res.locationCode).toBe("sg");
  });

  it("resolves UAE aliases correctly", () => {
    const res1 = resolveLocation("UAE", "United States", "us");
    expect(res1.location).toBe("UAE");
    expect(res1.locationCode).toBe("ae");

    const res2 = resolveLocation("United Arab Emirates", "United States", "us");
    expect(res2.location).toBe("UAE");
    expect(res2.locationCode).toBe("ae");

    const res3 = resolveLocation("Dubai, United Arab Emirates", "United States", "us");
    expect(res3.location).toBe("UAE");
    expect(res3.locationCode).toBe("ae");
  });

  it("resolves United States correctly", () => {
    const res = resolveLocation("United States", "UAE", "ae");
    expect(res.location).toBe("United States");
    expect(res.locationCode).toBe("us");
  });

  it("keeps the current values when the input is empty", () => {
    const res = resolveLocation("", "United States", "us");
    expect(res.location).toBe("United States");
    expect(res.locationCode).toBe("us");
  });

  it("never invents a market when nothing is known", () => {
    const res = resolveLocation("", "", "");
    expect(res.location).toBe("");
    expect(res.locationCode).toBe("");
    expect(matchLocationOption("")).toBeUndefined();
    expect(matchLocationOption("Germany")).toBeUndefined();
  });

  it("recognises only supported location codes", () => {
    expect(isSupportedLocationCode("us")).toBe(true);
    expect(isSupportedLocationCode("")).toBe(false);
    expect(isSupportedLocationCode("de")).toBe(false);
    expect(isSupportedLocationCode(undefined)).toBe(false);
  });
});
