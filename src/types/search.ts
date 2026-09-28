export type Location = "ae" | "us" | "uk" | "in" | "lk" | "sg";
export type ServiceType = "seo" | "geo" | "seo_geo";
export type TrackType = "seo" | "geo" | "both";

export const SERVICE_TYPE_LABELS: Record<ServiceType, { label: string; short: string; color: string; description: string }> = {
  seo: {
    label: "SEO Only",
    short: "SEO",
    color: "bg-surface-2 text-ink-2",
    description: "Google rank tracking only",
  },
  geo: {
    label: "GEO Only",
    short: "GEO",
    color: "bg-surface-2 text-ink-2",
    description: "AI Overview citations & mentions only",
  },
  seo_geo: {
    label: "SEO + GEO",
    short: "SEO+GEO",
    color: "bg-surface-2 text-ink-2",
    description: "Full Rank-to-Citation Gap™ intelligence",
  },
};

export const TRACK_TYPE_CONFIG: Record<TrackType, { label: string; color: string; runsSERP: boolean; runsAIO: boolean }> = {
  seo:  { label: "SEO",  color: "bg-surface-2 text-ink-2",   runsSERP: true,  runsAIO: false },
  geo:  { label: "GEO",  color: "bg-surface-2 text-ink-2", runsSERP: false, runsAIO: true  },
  both: { label: "Both", color: "bg-surface-2 text-ink-2",  runsSERP: true,  runsAIO: true  },
};

export const INDUSTRIES = [
  "SEO / Digital Marketing",
  "E-commerce",
  "Real Estate",
  "Healthcare",
  "Legal",
  "Finance",
  "Education",
  "Hospitality & Travel",
  "Technology / SaaS",
  "Construction & Engineering",
  "Automobiles",
  "Retail",
  "Other",
] as const;

export const COUNTRIES = [
  "United Arab Emirates",
  "Saudi Arabia",
  "Kuwait",
  "Qatar",
  "Bahrain",
  "Oman",
  "United States",
  "United Kingdom",
  "India",
  "Sri Lanka",
  "Singapore",
  "Other",
] as const;

export const LOCATIONS: Record<Location, { label: string; gl: string; location: string; hl: string }> = {
  ae: {
    label: "UAE",
    gl: "ae",
    location: "Dubai, United Arab Emirates",
    hl: "en",
  },
  us: {
    label: "United States",
    gl: "us",
    location: "United States",
    hl: "en",
  },
  uk: {
    label: "United Kingdom",
    gl: "uk",
    location: "United Kingdom",
    hl: "en",
  },
  in: {
    label: "India",
    gl: "in",
    location: "India",
    hl: "en",
  },
  lk: {
    label: "Sri Lanka",
    gl: "lk",
    location: "Sri Lanka",
    hl: "en",
  },
  sg: {
    label: "Singapore",
    gl: "sg",
    location: "Singapore",
    hl: "en",
  },
};

// ─── Platform detection ───────────────────────────────────────
export type PlatformType =
  | "linkedin"
  | "reddit"
  | "quora"
  | "youtube"
  | "twitter"
  | "facebook"
  | "instagram"
  | "trustpilot"
  | "clutch"
  | "g2"
  | "tripadvisor"
  | "yelp"
  | "glassdoor"
  | "medium"
  | "wikipedia"
  | "news"
  | "brand"      // the client's own domain
  | "other";

const PLATFORM_PATTERNS: Array<{ platform: PlatformType; patterns: string[] }> = [
  { platform: "linkedin",    patterns: ["linkedin.com"] },
  { platform: "reddit",      patterns: ["reddit.com"] },
  { platform: "quora",       patterns: ["quora.com"] },
  { platform: "youtube",     patterns: ["youtube.com", "youtu.be"] },
  { platform: "twitter",     patterns: ["twitter.com", "x.com"] },
  { platform: "facebook",    patterns: ["facebook.com", "fb.com"] },
  { platform: "instagram",   patterns: ["instagram.com"] },
  { platform: "trustpilot",  patterns: ["trustpilot.com"] },
  { platform: "clutch",      patterns: ["clutch.co"] },
  { platform: "g2",          patterns: ["g2.com"] },
  { platform: "tripadvisor", patterns: ["tripadvisor.com"] },
  { platform: "yelp",        patterns: ["yelp.com"] },
  { platform: "glassdoor",   patterns: ["glassdoor.com"] },
  { platform: "medium",      patterns: ["medium.com"] },
  { platform: "wikipedia",   patterns: ["wikipedia.org"] },
];

export const PLATFORM_LABELS: Record<PlatformType, { label: string; color: string; icon: string }> = {
  linkedin:    { label: "LinkedIn",    color: "bg-surface-2 text-ink-2",    icon: "in" },
  reddit:      { label: "Reddit",      color: "bg-surface-2 text-ink-2", icon: "r/" },
  quora:       { label: "Quora",       color: "bg-surface-2 text-ink-2",      icon: "Q" },
  youtube:     { label: "YouTube",     color: "bg-surface-2 text-ink-2",      icon: "▶" },
  twitter:     { label: "X / Twitter", color: "bg-surface-2 text-ink-2",    icon: "𝕏" },
  facebook:    { label: "Facebook",    color: "bg-surface-2 text-ink-2",    icon: "f" },
  instagram:   { label: "Instagram",   color: "bg-surface-2 text-ink-2",    icon: "ig" },
  trustpilot:  { label: "Trustpilot",  color: "bg-surface-2 text-ink-2",  icon: "★" },
  clutch:      { label: "Clutch",      color: "bg-surface-2 text-ink-2",      icon: "C" },
  g2:          { label: "G2",          color: "bg-surface-2 text-ink-2", icon: "G2" },
  tripadvisor: { label: "TripAdvisor", color: "bg-surface-2 text-ink-2",  icon: "TA" },
  yelp:        { label: "Yelp",        color: "bg-surface-2 text-ink-2",      icon: "Y" },
  glassdoor:   { label: "Glassdoor",   color: "bg-surface-2 text-ink-2",  icon: "GD" },
  medium:      { label: "Medium",      color: "bg-surface-2 text-ink-2",    icon: "M" },
  wikipedia:   { label: "Wikipedia",   color: "bg-surface-2 text-ink-2",    icon: "W" },
  news:        { label: "News",        color: "bg-surface-2 text-ink-2",    icon: "📰" },
  brand:       { label: "Brand",       color: "bg-surface-2 text-ink-2",  icon: "★" },
  other:       { label: "Other",       color: "bg-surface-2 text-ink-2",    icon: "•" },
};

export function detectPlatform(domain: string, clientDomain?: string): PlatformType {
  // Exact host or subdomain only: "netflix.com" is not "x.com", and
  // "notexample.com" is not the client "example.com".
  const clean = (s: string) =>
    (s || "").trim().toLowerCase().replace(/^[a-z]+:\/+/, "").replace(/^www\./, "").split(/[/?#]/)[0].replace(/:\d+$/, "");
  const d = clean(domain);
  const onSite = (site: string) => !!d && !!site && (d === site || d.endsWith(`.${site}`));
  const client = clean(clientDomain ?? "");
  if (client.includes(".") && onSite(client)) return "brand";
  for (const { platform, patterns } of PLATFORM_PATTERNS) {
    if (patterns.some((p) => onSite(p))) return platform;
  }
  return "other";
}

export interface OrganicResult {
  position: number;
  title: string;
  url: string;
  domain: string;
  snippet: string | null;
  isClient: boolean;
  platform: PlatformType;
}

export interface SerpResult {
  keyword: string;
  domain: string;
  location: Location;
  position: number | null;
  rankingUrl: string | null;
  rankingTitle: string | null;
  serpFeatures: string[];
  organicResults: OrganicResult[];  // top 10 SERP results
  /** Which provider answered ("serper" | "serpapi" | "demo"). */
  provider?: string;
  /** True only for opt-in development placeholder data (VSI_ALLOW_DEMO_DATA). Never stored. */
  isDemo?: boolean;
}

export interface AIOCitation {
  position: number;       // 1-indexed order in the AIO references list
  sourceName: string;     // SerpAPI "source" field — brand/display name (e.g. "United SEO")
  title: string | null;   // page title
  domain: string;
  url: string;
  isClient: boolean;      // true if this is the tracked domain
  platform: PlatformType; // detected platform type
}

export interface AIOTextBlock {
  type: "paragraph" | "list" | string;
  snippet?: string;
  list?: Array<{ snippet: string }>;
}

export interface AIOResult {
  keyword: string;
  domain: string;
  brand: string;
  location: Location;
  aioPresent: boolean;
  aioSnippet: string | null;       // short truncated preview
  aioFullText: string | null;      // full text for LLM + display
  aioBlocks: AIOTextBlock[];       // structured blocks for UI rendering
  citations: AIOCitation[];        // rich source data for display
  citedDomains: string[];          // domain-only list for DB storage
  clientCited: boolean;            // domain appears as a source link
  mentionedInText: boolean;        // brand name appears in AIO text
  /** Provenance: the Google surface that produced this answer ("google_ai_overview"). */
  engine?: string;
  /** Which provider fetched it ("serpapi" | "demo"). */
  provider?: string;
  /** True only for opt-in development placeholder data (VSI_ALLOW_DEMO_DATA). Never stored. */
  isDemo?: boolean;
}

export type GapLabel =
  | "weak_double_loss"     // Google NO + AI mention NO + citation NO
  | "seo_only"             // Google YES + AI mention NO + citation NO
  | "ai_mention_only"      // Google NO + AI mention YES + citation NO
  | "ai_visible"           // Google NO + AI mention YES + citation YES
  | "partial_visibility"   // Google YES + AI mention YES + citation NO
  | "strong_visibility"    // Google YES + AI mention YES + citation YES
  | "citation_only"        // Google NO + AI mention NO + citation YES
  | "seo_plus_citation"    // Google YES + AI mention NO + citation YES
  // Backward compatibility aliases
  | "aligned"
  | "aligned_no_mention"
  | "ai_mentioned"
  | "search_strong_ai_invisible"
  | "geo_cited"
  | "geo_cited_no_mention"
  | "geo_mentioned"
  | "geo_invisible"
  | "seo_ranked"
  | "seo_ranked_no_aio"
  | "seo_not_ranked";

export type StatusColor = "green" | "yellow" | "red" | "blue" | "gray" | "amber" | "orange";

export interface GapClassification {
  label: GapLabel;
  dot: StatusColor;
  title: string;
  description: string;
}

export const GAP_CLASSIFICATIONS: Record<GapLabel, GapClassification> = {
  weak_double_loss: {
    label: "weak_double_loss",
    dot: "red",
    title: "Weak / Double Loss",
    description: "Not ranking in Google organic AND not cited or mentioned in AI Overview — invisible on both channels",
  },
  seo_only: {
    label: "seo_only",
    dot: "yellow",
    title: "SEO Only",
    description: "Ranking in Google organic, but completely absent from AI Overview answers and citations",
  },
  ai_mention_only: {
    label: "ai_mention_only",
    dot: "blue",
    title: "AI Mention Only",
    description: "Brand name is mentioned in AI Overview answer text, but website is not ranking in Google organic or cited as a source link",
  },
  ai_visible: {
    label: "ai_visible",
    dot: "green",
    title: "AI Visible",
    description: "Cited as a source link AND mentioned in AI Overview answer text, despite not ranking in Google organic search",
  },
  partial_visibility: {
    label: "partial_visibility",
    dot: "blue",
    title: "Partial Visibility",
    description: "Ranking in Google organic and mentioned in AI text, but website is not linked as a cited source",
  },
  strong_visibility: {
    label: "strong_visibility",
    dot: "green",
    title: "Strong Visibility",
    description: "Ranking in Google organic, cited as a source link, AND mentioned in AI Overview text — winning on all channels",
  },
  citation_only: {
    label: "citation_only",
    dot: "blue",
    title: "Citation Only",
    description: "Website is cited as a source link in AI Overview, but brand name is not mentioned in text and not ranking in Google organic",
  },
  seo_plus_citation: {
    label: "seo_plus_citation",
    dot: "green",
    title: "SEO + Citation",
    description: "Ranking in Google organic AND cited as a source link in AI Overview, but brand name is unmentioned in text",
  },
  // Backward compatibility mappings
  aligned: {
    label: "strong_visibility",
    dot: "green",
    title: "Strong Visibility",
    description: "Ranking in Google organic, cited as a source link, AND mentioned in AI Overview text",
  },
  aligned_no_mention: {
    label: "seo_plus_citation",
    dot: "green",
    title: "SEO + Citation",
    description: "Ranking in Google organic AND cited as a source link in AI Overview, but brand name is unmentioned in text",
  },
  ai_mentioned: {
    label: "partial_visibility",
    dot: "blue",
    title: "Partial Visibility",
    description: "Ranking in Google organic and mentioned in AI text, but website is not linked as a cited source",
  },
  search_strong_ai_invisible: {
    label: "seo_only",
    dot: "yellow",
    title: "SEO Only",
    description: "Ranking in Google organic, but completely absent from AI Overview answers and citations",
  },
  geo_cited: {
    label: "ai_visible",
    dot: "green",
    title: "AI Visible",
    description: "Cited as a source link AND mentioned in AI Overview answer text, despite not ranking in Google organic search",
  },
  geo_cited_no_mention: {
    label: "citation_only",
    dot: "blue",
    title: "Citation Only",
    description: "Website is cited as a source link in AI Overview, but brand name is not mentioned in text and not ranking in Google organic",
  },
  geo_mentioned: {
    label: "ai_mention_only",
    dot: "blue",
    title: "AI Mention Only",
    description: "Brand name is mentioned in AI Overview answer text, but website is not ranking in Google organic or cited as a source link",
  },
  geo_invisible: {
    label: "weak_double_loss",
    dot: "red",
    title: "Weak / Double Loss",
    description: "Not ranking in Google organic AND not cited or mentioned in AI Overview — invisible on both channels",
  },
  seo_ranked: {
    label: "seo_only",
    dot: "yellow",
    title: "SEO Only",
    description: "Ranking in Google organic, but completely absent from AI Overview answers and citations",
  },
  seo_ranked_no_aio: {
    label: "seo_only",
    dot: "yellow",
    title: "SEO Only",
    description: "Ranking in Google organic, but completely absent from AI Overview answers and citations",
  },
  seo_not_ranked: {
    label: "weak_double_loss",
    dot: "red",
    title: "Weak / Double Loss",
    description: "Not ranking in Google organic AND not cited or mentioned in AI Overview — invisible on both channels",
  },
};

/**
 * Requirement 5: Deterministic single function for final visibility status
 */
export function calculateVisibilityStatus(
  googleRank: number | null,
  brandMentioned: boolean,
  brandCited: boolean
): GapClassification {
  const ranked = googleRank !== null;
  const mentioned = !!brandMentioned;
  const cited = !!brandCited;

  if (!ranked && !mentioned && !cited) return GAP_CLASSIFICATIONS.weak_double_loss;
  if (ranked && !mentioned && !cited)  return GAP_CLASSIFICATIONS.seo_only;
  if (!ranked && mentioned && !cited)  return GAP_CLASSIFICATIONS.ai_mention_only;
  if (!ranked && mentioned && cited)   return GAP_CLASSIFICATIONS.ai_visible;
  if (ranked && mentioned && !cited)   return GAP_CLASSIFICATIONS.partial_visibility;
  if (ranked && mentioned && cited)    return GAP_CLASSIFICATIONS.strong_visibility;
  if (!ranked && !mentioned && cited)  return GAP_CLASSIFICATIONS.citation_only;
  if (ranked && !mentioned && cited)   return GAP_CLASSIFICATIONS.seo_plus_citation;

  return GAP_CLASSIFICATIONS.weak_double_loss;
}

export function classifyGap(serp: SerpResult, aio: AIOResult): GapClassification {
  return calculateVisibilityStatus(serp.position, aio.mentionedInText, aio.clientCited);
}

export interface RunCheckResult {
  keyword: string;
  domain: string;
  brand: string;
  location: Location;
  timestamp: string;
  dataSource: string;
  isDemo: boolean;
  
  googleRank: number | null;
  googleRankingUrl: string | null;
  googleRankingTitle: string | null;
  organicResults: OrganicResult[];
  serpFeatures: string[];

  aioPresent: boolean;
  aioSnippet: string | null;
  aioFullText: string | null;
  aioBlocks: AIOTextBlock[];
  citations: AIOCitation[];
  
  brandMentioned: boolean;
  brandCited: boolean;

  uniqueCompetitorsCount: number;
  totalCitationsCount: number;
  uniqueCompetitorDomains: string[];

  clientCitationPosition: number | null;
  clientR2CGap: number | null;
  
  status: GapClassification;

  serp: SerpResult;
  aio: AIOResult;
}

export interface SearchSnapshot {
  keyword: string;
  domain: string;
  brand: string;
  location: Location;
  serp: SerpResult;
  aio: AIOResult;
}
