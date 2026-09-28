/**
 * Development-only placeholder provider data. Callers must check
 * demoDataAllowed() (VSI_ALLOW_DEMO_DATA=true, never in production) first.
 * Every value is marked isDemo and uses reserved ".example" domains, so it
 * can't be mistaken for — or stored as — real data.
 */
import type { AIOResult, Location, OrganicResult } from "@/types/search";

const DEMO_DOMAINS = ["demo-result-1.example", "demo-result-2.example", "demo-result-3.example"];

export function isDemoDomain(domainOrUrl: string): boolean {
  return /\.example(?:[/:?#]|$)/i.test((domainOrUrl || "").replace(/^[a-z]+:\/+/i, ""));
}

export function demoOrganicResults(keyword: string): OrganicResult[] {
  return DEMO_DOMAINS.map((domain, i) => ({
    position: i + 1,
    title: `[Demo] Placeholder result ${i + 1} for "${keyword}"`,
    url: `https://${domain}/`,
    domain,
    snippet: "Development placeholder — not a real search result.",
    isClient: false,
    platform: "other",
  }));
}

export function demoAIO(keyword: string, domain: string, brand: string, location: Location): AIOResult {
  const text = `[Demo] Placeholder AI answer for "${keyword}". Development data — not a real AI answer.`;
  return {
    keyword,
    domain,
    brand,
    location,
    aioPresent: true,
    aioSnippet: text,
    aioFullText: text,
    aioBlocks: [{ type: "paragraph", snippet: text }],
    citations: [],
    citedDomains: [],
    clientCited: false,
    mentionedInText: false,
    engine: "google_ai_overview",
    provider: "demo",
    isDemo: true,
  };
}
