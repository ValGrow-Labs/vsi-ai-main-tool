import type { Location } from "@/types/search";
import { isSupportedLocationCode } from "./location";

/** The subset of the wizard's state that is saved. */
export interface WizardSaveInput {
  business: {
    brandName: string;
    domain: string;
    businessType: string;
    location: string;
    locationCode: string;
  };
  keywords: Array<{ keyword: string; selected: boolean }>;
  competitors: Array<{ domain: string; selected: boolean }>;
}

export interface ProjectSavePayload {
  client: {
    name: string;
    website: string;
    brand_name: string;
    service_type: "seo_geo";
    country: string | null;
    industry: string | null;
    default_location: Location;
  };
  searches: Array<{ keyword: string; trackType: "both"; location: Location }>;
  competitorDomains: string[];
}

export type BuildSaveResult = { ok: true; payload: ProjectSavePayload } | { ok: false; message: string };

/**
 * Builds exactly what the wizard saves: only what the user kept selected, and only values they entered
 * or confirmed. Missing facts stay null; the search market must be chosen, never defaulted.
 */
export function buildProjectSavePayload(input: WizardSaveInput): BuildSaveResult {
  const domain = input.business.domain.trim();
  if (!domain) {
    return { ok: false, message: "Website URL is required. Please go back to Step 1 to enter your website." };
  }

  const locationCode = input.business.locationCode.trim();
  if (!isSupportedLocationCode(locationCode)) {
    return { ok: false, message: "Choose the search location for this project in Step 4 before starting." };
  }

  const seen = new Set<string>();
  const searches: ProjectSavePayload["searches"] = [];
  for (const k of input.keywords) {
    if (!k.selected) continue;
    const keyword = k.keyword.trim();
    if (!keyword || seen.has(keyword.toLowerCase())) continue;
    seen.add(keyword.toLowerCase());
    searches.push({ keyword, trackType: "both", location: locationCode });
  }
  if (searches.length === 0) {
    return { ok: false, message: "Please select at least one search query or topic to analyze in Step 4." };
  }

  const competitorDomains = Array.from(
    new Set(input.competitors.filter((c) => c.selected).map((c) => c.domain.trim().toLowerCase()).filter(Boolean))
  );

  const brand = input.business.brandName.trim() || domain;

  return {
    ok: true,
    payload: {
      client: {
        name: brand,
        website: domain,
        brand_name: brand,
        service_type: "seo_geo",
        country: input.business.location.trim() || null,
        industry: input.business.businessType.trim() || null,
        default_location: locationCode,
      },
      searches,
      competitorDomains,
    },
  };
}
