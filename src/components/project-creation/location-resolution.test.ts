import { describe, expect, it } from "vitest";
import { resolveLocation, matchLocationOption, isSupportedLocationCode } from "./location";
import { detectMarketFromDomain } from "./CompetitorSelection";
import { buildProjectSavePayload } from "./save-payload";

describe("Location Resolution and Saving", () => {
  it("resolves India correctly from name, alias, and code", () => {
    const res1 = resolveLocation("India", "United States", "us");
    expect(res1.location).toBe("India");
    expect(res1.locationCode).toBe("in");

    const res2 = resolveLocation("in", "United States", "us");
    expect(res2.location).toBe("India");
    expect(res2.locationCode).toBe("in");

    const match = matchLocationOption("India");
    expect(match?.code).toBe("in");
    expect(match?.country).toBe("India");
  });

  it("resolves Sri Lanka correctly from name, alias, and code", () => {
    const res1 = resolveLocation("Sri Lanka", "United States", "us");
    expect(res1.location).toBe("Sri Lanka");
    expect(res1.locationCode).toBe("lk");

    const res2 = resolveLocation("lk", "United States", "us");
    expect(res2.location).toBe("Sri Lanka");
    expect(res2.locationCode).toBe("lk");

    const match = matchLocationOption("Sri Lanka");
    expect(match?.code).toBe("lk");
    expect(match?.country).toBe("Sri Lanka");
  });

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

    const res2 = resolveLocation("USA", "India", "in");
    expect(res2.location).toBe("United States");
    expect(res2.locationCode).toBe("us");
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
    expect(isSupportedLocationCode("in")).toBe(true);
    expect(isSupportedLocationCode("lk")).toBe(true);
    expect(isSupportedLocationCode("sg")).toBe(true);
    expect(isSupportedLocationCode("us")).toBe(true);
    expect(isSupportedLocationCode("uk")).toBe(true);
    expect(isSupportedLocationCode("ae")).toBe(true);
    expect(isSupportedLocationCode("")).toBe(false);
    expect(isSupportedLocationCode("de")).toBe(false);
    expect(isSupportedLocationCode(undefined)).toBe(false);
  });

  it("consistently persists each target country into competitor market and save payload", () => {
    const testCountries = [
      { name: "India", code: "in" },
      { name: "Sri Lanka", code: "lk" },
      { name: "Singapore", code: "sg" },
      { name: "United States", code: "us" },
    ];

    for (const { name, code } of testCountries) {
      // 1. Competitor market detection
      const competitorMarket = detectMarketFromDomain("generic-competitor.com", name);
      expect(competitorMarket).toBe(name);

      // 2. Save payload construction
      const payloadResult = buildProjectSavePayload({
        business: {
          brandName: "Test Brand",
          domain: "testbrand.com",
          businessType: "Technology",
          location: name,
          locationCode: code,
        },
        keywords: [{ keyword: "test keyword", selected: true }],
        competitors: [{ domain: "generic-competitor.com", selected: true }],
      });

      expect(payloadResult.ok).toBe(true);
      if (payloadResult.ok) {
        expect(payloadResult.payload.client.country).toBe(name);
        expect(payloadResult.payload.client.default_location).toBe(code);
        expect(payloadResult.payload.searches[0].location).toBe(code);
      }
    }
  });
});
