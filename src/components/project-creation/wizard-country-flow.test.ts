import { describe, expect, it } from "vitest";
import { matchLocationOption, resolveLocation } from "./location";
import { detectMarketFromDomain, type CompetitorItem } from "./CompetitorSelection";
import { buildProjectSavePayload } from "./save-payload";
import type { BusinessData } from "./BusinessSummary";

describe("Setup Wizard Country & Location Persistence Flow", () => {
  const initialBusiness: BusinessData = {
    brandName: "Samsung",
    domain: "samsung.com",
    businessType: "Electronics",
    websiteTitle: "Samsung Global",
    metaDescription: "Smartphones & TVs",
    language: "English",
    location: "United States",
    locationCode: "us",
    suggestedTopics: ["Smartphones", "Smart TVs"],
    sitemapUrl: "",
    competitiveAdvantage: "Leading OLED displays",
    aboutBusiness: "Global consumer electronics leader.",
    targetCustomers: ["Tech Enthusiasts", "Everyday Consumers"],
  };

  const initialCompetitors: CompetitorItem[] = [
    { domain: "apple.com", name: "Apple", market: "United States", selected: true },
    { domain: "oneplus.in", name: "OnePlus", market: "India", selected: true },
    { domain: "generic-brand.com", name: "Generic Brand", market: "United States", selected: true },
  ];

  const targetCountries = [
    { name: "India", code: "in" },
    { name: "Sri Lanka", code: "lk" },
    { name: "Singapore", code: "sg" },
    { name: "United States", code: "us" },
  ];

  for (const { name, code } of targetCountries) {
    it(`persists ${name} (${code}) across all wizard steps without resetting to US or default`, () => {
      // 1. Simulate Step 2 (Business Summary): User selects target country in LocationModal
      const matched = matchLocationOption(name);
      expect(matched).toBeDefined();
      expect(matched?.code).toBe(code);
      expect(matched?.country).toBe(name);

      // BusinessData is updated as single source of truth
      const updatedBusiness: BusinessData = {
        ...initialBusiness,
        location: matched!.country,
        locationCode: matched!.code,
      };

      expect(updatedBusiness.location).toBe(name);
      expect(updatedBusiness.locationCode).toBe(code);

      // 2. Simulate Step 3 (Competitor Selection): Competitors update their market based on defaultMarket
      const updatedCompetitors = initialCompetitors.map((c) => ({
        ...c,
        market: detectMarketFromDomain(c.domain, updatedBusiness.location),
      }));

      // A generic .com competitor must take the project's selected country
      const genericComp = updatedCompetitors.find((c) => c.domain === "generic-brand.com");
      expect(genericComp?.market).toBe(name);

      // A ccTLD competitor (like .in) preserves its specific country
      const ccTldComp = updatedCompetitors.find((c) => c.domain === "oneplus.in");
      expect(ccTldComp?.market).toBe("India");

      // 3. Simulate Step 4 (SEO Setup): Search location dropdown resolves active code
      const activeLocMatch = matchLocationOption(updatedBusiness.locationCode || updatedBusiness.location);
      const activeCode = activeLocMatch?.code || updatedBusiness.locationCode;
      expect(activeCode).toBe(code);

      // 4. Simulate Back & Forth navigation: Business data remains untouched
      // Navigating Back (Step 4 -> Step 3 -> Step 2)
      const afterNavBackBusiness = { ...updatedBusiness };
      expect(afterNavBackBusiness.location).toBe(name);
      expect(afterNavBackBusiness.locationCode).toBe(code);

      // Navigating Forward again (Step 2 -> Step 3 -> Step 4)
      const afterNavForwardBusiness = { ...afterNavBackBusiness };
      const step4Code = matchLocationOption(afterNavForwardBusiness.locationCode || afterNavForwardBusiness.location)?.code;
      expect(step4Code).toBe(code);

      // 5. Final Save Payload verification: Correct country and default_location passed to API
      const saveResult = buildProjectSavePayload({
        business: afterNavForwardBusiness,
        keywords: [{ keyword: "best smartphones", selected: true }],
        competitors: updatedCompetitors,
      });

      expect(saveResult.ok).toBe(true);
      if (saveResult.ok) {
        expect(saveResult.payload.client.country).toBe(name);
        expect(saveResult.payload.client.default_location).toBe(code);
        expect(saveResult.payload.searches.length).toBeGreaterThan(0);
        expect(saveResult.payload.searches[0].location).toBe(code);
      }
    });
  }

  it("handles user switching location in Step 4 and reflecting back in Step 3 and 2", () => {
    // User starts in India
    let currentBusiness: BusinessData = {
      ...initialBusiness,
      location: "India",
      locationCode: "in",
    };

    // User navigates to Step 4 and changes location to Sri Lanka
    const newLocMatch = matchLocationOption("lk");
    expect(newLocMatch).toBeDefined();

    currentBusiness = {
      ...currentBusiness,
      location: newLocMatch!.country,
      locationCode: newLocMatch!.code,
    };

    // Navigating back to Step 3 updates competitor market
    const comps = initialCompetitors.map((c) => ({
      ...c,
      market: detectMarketFromDomain(c.domain, currentBusiness.location),
    }));
    expect(comps.find((c) => c.domain === "generic-brand.com")?.market).toBe("Sri Lanka");

    // Navigating back to Step 2 reflects Sri Lanka
    expect(currentBusiness.location).toBe("Sri Lanka");
    expect(currentBusiness.locationCode).toBe("lk");
  });
});
