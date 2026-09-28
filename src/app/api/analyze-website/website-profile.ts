/**
 * Pure helpers for the website-analysis route. Kept out of route.ts because a Next.js route file may
 * only export route fields.
 *
 * Rule: every value comes from the site's own content (via the model) or directly from the domain the
 * user typed. A field the model didn't return stays null/empty; nothing is filled in to look complete.
 */
import { validateCompetitorDomain } from "@/lib/project-competitors";
import type { ProviderFailureReason } from "@/lib/provider-status";
import type { Location } from "@/types/search";

export type KeywordCategory = "primary" | "long_tail" | "geo" | "ai_search" | "branded";

export interface ExtractedWebsiteData {
  brandName: string | null;
  domain: string;
  businessType: string | null;
  websiteTitle: string | null;
  metaDescription: string | null;
  language: string | null;
  location: string | null;
  /** null when the market is unknown: the user must choose it. */
  locationCode: Location | null;
  suggestedTopics: string[];
  suggestedKeywords: Array<{
    keyword: string;
    category: KeywordCategory;
    categoryLabel: string;
    selected: boolean;
  }>;
  sitemapUrl: string | null;
  competitiveAdvantage: string | null;
  aboutBusiness: string | null;
  targetCustomers: string[];
  /** Model suggestions with a real domain only. Never pre-selected: the user opts in. */
  suggestedCompetitors: Array<{
    domain: string;
    name: string;
    market: string | null;
    selected: boolean;
  }>;
  geoTopics: string[];
}

/** Values derived only from the domain the user typed. Editable suggestions, never facts about the business. */
export interface DomainDerivedProfile {
  domain: string;
  brandName: string | null;
  location: string | null;
  locationCode: Location | null;
}

export interface AnalysisSuccessResponse {
  success: true;
  data: ExtractedWebsiteData;
}

export interface AnalysisUnavailableResponse {
  success: false;
  status: "ANALYSIS_UNAVAILABLE";
  reason: ProviderFailureReason;
  message: string;
  derived: DomainDerivedProfile;
}

export const SUPPORTED_LOCATION_CODES: readonly Location[] = ["ae", "us", "uk", "in", "lk", "sg"];

// ── Domain derivations ───────────────────────────────────────────────────────

/** Second-level labels used under country-code TLDs (co.uk, com.au, ac.uk, co.jp, …). */
const SECOND_LEVEL_LABELS = new Set([
  "co", "com", "org", "net", "ac", "gov", "edu", "ltd", "plc", "ne", "or", "go", "gen", "firm", "nic", "sch", "info", "biz", "mil", "nom",
]);

/** The registrable label of a hostname: amazon.co.in → "amazon", shop.bbc.co.uk → "bbc", nike.com → "nike". */
export function registrableLabel(domain: string): string | null {
  const labels = domain.toLowerCase().trim().replace(/^www\./, "").split(".").filter(Boolean);
  if (labels.length < 2) return null;
  const tld = labels[labels.length - 1];
  const second = labels[labels.length - 2];
  if (labels.length >= 3 && tld.length === 2 && SECOND_LEVEL_LABELS.has(second)) {
    return labels[labels.length - 3];
  }
  return second;
}

/** A brand-name suggestion taken from the domain itself (editable by the user). */
export function extractBrandFromDomain(domain: string): string | null {
  const label = registrableLabel(domain);
  if (!label) return null;
  const words = label.split(/[-_]+/).filter(Boolean);
  if (words.length === 0) return null;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** Country-code TLDs that map to a market VSI supports. Generic TLDs (.com, .io, .net, …) say nothing about location. */
const CCTLD_LOCATIONS: Record<string, { location: string; locationCode: Location }> = {
  in: { location: "India", locationCode: "in" },
  uk: { location: "United Kingdom", locationCode: "uk" },
  ae: { location: "UAE", locationCode: "ae" },
  sg: { location: "Singapore", locationCode: "sg" },
  lk: { location: "Sri Lanka", locationCode: "lk" },
  us: { location: "United States", locationCode: "us" },
};

/** Location from the domain's country-code TLD, or null when the TLD doesn't tell us. */
export function detectDomainLocation(domain: string): { location: string; locationCode: Location } | null {
  const labels = domain.toLowerCase().trim().split(".").filter(Boolean);
  if (labels.length < 2) return null;
  return CCTLD_LOCATIONS[labels[labels.length - 1]] ?? null;
}

export function deriveFromDomain(domain: string): DomainDerivedProfile {
  const loc = detectDomainLocation(domain);
  return {
    domain,
    brandName: extractBrandFromDomain(domain),
    location: loc?.location ?? null,
    locationCode: loc?.locationCode ?? null,
  };
}

// ── Model output cleaning ────────────────────────────────────────────────────

/** Placeholder text from the prompt template. A model that echoes it has told us nothing. */
const TEMPLATE_PLACEHOLDERS = new Set(
  [
    "Brand Name",
    "Industry / Category",
    "Primary Language e.g. English",
    "Primary Country e.g. India or United States or United Arab Emirates",
    "One punchy sentence describing key edge or value proposition.",
    "2-3 concise sentences summarizing what the business does and sells.",
    "Country / Global",
    "Competitor One",
    "Competitor Two",
    "N/A",
    "Unknown",
    "null",
    "undefined",
  ].map((s) => s.toLowerCase())
);

const PLACEHOLDER_PATTERNS = [
  /^(topic|group|search query|competitor|keyword|query)\s*\d+$/i,
  /^topic \/ query \d+/i,
];

/** Placeholder/example domains that the template or a lazy model produces. */
const PLACEHOLDER_DOMAIN_RE =
  /^(competitor[-\w]*|example|domain|website|yourdomain|yoursite|yourwebsite|mysite|brand|company|test|sample|placeholder|site)\d*\.(com|net|org|io|co)$/i;

function isPlaceholderText(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (TEMPLATE_PLACEHOLDERS.has(v)) return true;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(v));
}

/** A trimmed, non-placeholder string, or null. */
export function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || isPlaceholderText(v)) return null;
  return v;
}

/** Trimmed, de-duplicated, non-placeholder strings. */
export function cleanList(value: unknown, max = 20): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const v = cleanText(item);
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

export function isPlaceholderDomain(domain: string): boolean {
  const d = domain.toLowerCase();
  return PLACEHOLDER_DOMAIN_RE.test(d) || /(^|\.)example\.[a-z.]+$/.test(d) || d.startsWith("competitor-");
}

const KEYWORD_CATEGORIES: KeywordCategory[] = ["primary", "long_tail", "geo", "ai_search", "branded"];

function cleanKeywords(value: unknown): ExtractedWebsiteData["suggestedKeywords"] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: ExtractedWebsiteData["suggestedKeywords"] = [];
  for (const raw of value) {
    const obj = (raw && typeof raw === "object" ? raw : { keyword: raw }) as Record<string, unknown>;
    const keyword = cleanText(obj.keyword);
    if (!keyword) continue;
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const category = KEYWORD_CATEGORIES.includes(obj.category as KeywordCategory) ? (obj.category as KeywordCategory) : "primary";
    out.push({ keyword, category, categoryLabel: cleanText(obj.categoryLabel) ?? "", selected: true });
    if (out.length >= 25) break;
  }
  return out;
}

function cleanCompetitors(value: unknown, ownDomain: string): ExtractedWebsiteData["suggestedCompetitors"] {
  if (!Array.isArray(value)) return [];
  const out: ExtractedWebsiteData["suggestedCompetitors"] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    if (typeof c.domain !== "string" || !c.domain.trim()) continue; // no real domain → dropped
    const check = validateCompetitorDomain(c.domain, ownDomain, out.map((o) => o.domain));
    if (!check.ok) continue;
    if (isPlaceholderDomain(check.domain)) continue;
    out.push({
      domain: check.domain,
      name: cleanText(c.name) ?? check.domain,
      market: cleanText(c.market),
      selected: false,
    });
  }
  return out;
}

/** Maps a country name the model returned to a supported market code, when it clearly names one. */
function locationCodeFromText(text: string | null): Location | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/\b(uae|emirates|dubai|abu dhabi)\b/.test(t)) return "ae";
  if (/\b(united states|usa|u\.s\.)\b/.test(t)) return "us";
  if (/\b(united kingdom|uk|england|britain)\b/.test(t)) return "uk";
  if (/\bindia\b/.test(t)) return "in";
  if (/\bsri lanka\b/.test(t)) return "lk";
  if (/\bsingapore\b/.test(t)) return "sg";
  return null;
}

function cleanSitemap(value: unknown, domain: string): string | null {
  const v = cleanText(value);
  if (!v) return null;
  try {
    const u = new URL(v);
    if (!/^https?:$/.test(u.protocol)) return null;
    const host = u.hostname.replace(/^www\./, "");
    return host === domain ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Parses the model's reply into a JSON object, or null when it isn't one. */
export function parseModelJson(content: string): Record<string, unknown> | null {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed: unknown = JSON.parse(match[0]);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Builds the website profile from the model's JSON and the scraped page. Returns null when the reply
 * holds nothing about the business (every field missing or a template echo).
 */
export function buildProfile(
  parsed: Record<string, unknown>,
  domain: string,
  page: { title: string | null; description: string | null }
): ExtractedWebsiteData | null {
  const businessType = cleanText(parsed.businessType);
  const aboutBusiness = cleanText(parsed.aboutBusiness);
  const suggestedTopics = cleanList(parsed.suggestedTopics, 10);
  const suggestedKeywords = cleanKeywords(parsed.suggestedKeywords);
  const competitiveAdvantage = cleanText(parsed.competitiveAdvantage);
  const targetCustomers = cleanList(parsed.targetCustomers, 10);
  const geoTopics = cleanList(parsed.geoTopics, 10);

  const hasSubstance =
    businessType || aboutBusiness || competitiveAdvantage || suggestedTopics.length || suggestedKeywords.length || targetCustomers.length;
  if (!hasSubstance) return null;

  // Location: what the model read on the site, else the domain's country code, else unknown.
  const modelLocation = cleanText(parsed.location);
  const modelCode =
    typeof parsed.locationCode === "string" && SUPPORTED_LOCATION_CODES.includes(parsed.locationCode.toLowerCase() as Location)
      ? (parsed.locationCode.toLowerCase() as Location)
      : null;
  const domainLoc = detectDomainLocation(domain);

  let location: string | null = modelLocation;
  let locationCode: Location | null = null;
  if (modelLocation) {
    // The code must match the country the model named; a country VSI doesn't support stays without a code.
    locationCode = locationCodeFromText(modelLocation);
  } else if (modelCode) {
    locationCode = modelCode;
    location = CCTLD_LOCATIONS[modelCode]?.location ?? null;
  }
  if (!location && domainLoc) {
    location = domainLoc.location;
    locationCode = domainLoc.locationCode;
  }

  return {
    brandName: cleanText(parsed.brandName) ?? extractBrandFromDomain(domain),
    domain,
    businessType,
    websiteTitle: page.title?.trim() || null,
    metaDescription: page.description?.trim() || null,
    language: cleanText(parsed.language),
    location,
    locationCode,
    suggestedTopics,
    suggestedKeywords,
    sitemapUrl: cleanSitemap(parsed.sitemapUrl, domain),
    competitiveAdvantage,
    aboutBusiness,
    targetCustomers,
    suggestedCompetitors: cleanCompetitors(parsed.suggestedCompetitors, domain),
    geoTopics,
  };
}

/** Plain-English explanation for each failure reason. */
export function unavailableMessage(reason: ProviderFailureReason, stage: "website" | "analysis"): string {
  if (stage === "website") {
    return reason === "PROVIDER_TIMEOUT"
      ? "Your website took too long to respond, so we couldn't analyse it automatically."
      : "We couldn't read your website, so we couldn't analyse it automatically.";
  }
  switch (reason) {
    case "PROVIDER_NOT_CONFIGURED":
      return "Automatic website analysis isn't set up on this server.";
    case "PROVIDER_RATE_LIMITED":
      return "The analysis service is busy right now, so we couldn't analyse your website automatically.";
    case "PROVIDER_TIMEOUT":
      return "The analysis service took too long to respond, so we couldn't analyse your website automatically.";
    case "INVALID_RESPONSE":
      return "The analysis service returned an answer we couldn't use, so we couldn't analyse your website automatically.";
    default:
      return "The analysis service failed, so we couldn't analyse your website automatically.";
  }
}
