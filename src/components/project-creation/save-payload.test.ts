import { describe, expect, it } from "vitest";
import { buildProjectSavePayload, type WizardSaveInput } from "./save-payload";

function input(overrides: Partial<WizardSaveInput["business"]> = {}, rest: Partial<WizardSaveInput> = {}): WizardSaveInput {
  return {
    business: { brandName: "Acme", domain: "acme.com", businessType: "", location: "", locationCode: "us", ...overrides },
    keywords: [{ keyword: "acme widgets", selected: true }],
    competitors: [],
    ...rest,
  };
}

describe("buildProjectSavePayload", () => {
  it("saves only selected searches and competitors", () => {
    const res = buildProjectSavePayload(
      input({}, {
        keywords: [
          { keyword: "acme widgets", selected: true },
          { keyword: "unselected query", selected: false },
          { keyword: "  Acme Widgets ", selected: true }, // duplicate
          { keyword: "   ", selected: true },
        ],
        competitors: [
          { domain: "rival.com", selected: true },
          { domain: "suggested-but-unticked.com", selected: false },
        ],
      })
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.payload.searches).toEqual([{ keyword: "acme widgets", trackType: "both", location: "us" }]);
    expect(res.payload.competitorDomains).toEqual(["rival.com"]);
  });

  it("requires the user to choose a search location instead of defaulting it", () => {
    const res = buildProjectSavePayload(input({ locationCode: "" }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.message).toMatch(/search location/i);
  });

  it("rejects an unsupported location code", () => {
    expect(buildProjectSavePayload(input({ locationCode: "zz" })).ok).toBe(false);
  });

  it("requires at least one selected search", () => {
    const res = buildProjectSavePayload(input({}, { keywords: [{ keyword: "x", selected: false }] }));
    expect(res.ok).toBe(false);
  });

  it("stores missing business facts as null, never as invented defaults", () => {
    const res = buildProjectSavePayload(input({ businessType: "  ", location: "" }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.payload.client.industry).toBeNull();
    expect(res.payload.client.country).toBeNull();
    expect(res.payload.client.default_location).toBe("us");
  });

  it("names the project after the website the user typed when no brand was entered", () => {
    const res = buildProjectSavePayload(input({ brandName: "" }));
    expect(res.ok && res.payload.client.name).toBe("acme.com");
  });

  it("requires a website", () => {
    expect(buildProjectSavePayload(input({ domain: "" })).ok).toBe(false);
  });
});
