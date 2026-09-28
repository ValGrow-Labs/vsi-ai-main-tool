// Unified brand-match logic used by the Google AI answer parser, the ChatGPT
// check and the evidence highlighter. Returns true only when the brand itself
// appears as whole words — never when a generic word from the brand name
// ("Analytics", "Solutions") or a fragment inside another word ("Nova" in
// "Innovative") appears.

export interface BrandIdentifiers {
  brand: string;        // e.g. "ValGrow Labs"
  domain: string;       // e.g. "valgrowdigital.com"
}

// Generic strings that must never become a brand token on their own. If they
// slip through (e.g. the user stored "https://" as their website, or the brand
// is just a service term like "SEO"), they would match unrelated answers.
const TOKEN_BLOCKLIST = new Set([
  "labs", "group", "agency", "digital", "media", "inc", "ltd", "co", "company",
  "http", "https", "www", "com", "net", "org", "site", "page", "url", "blog",
  "seo", "geo", "ppc", "sem", "marketing", "services", "service", "online",
]);

const PROTOCOL_RE = /^[a-z]+:\/+/;

/**
 * Brand tokens to look for, as whole words:
 *   - the full brand ("valgrow labs"), also written without spaces ("valgrowlabs")
 *   - the domain stem ("valgrowdigital" from "valgrowdigital.com")
 * Individual words of a multi-word brand are NOT tokens: "Acme Analytics"
 * must not match "Google Analytics".
 */
export function buildBrandTokens({ brand, domain }: BrandIdentifiers): string[] {
  const tokens = new Set<string>();
  const add = (s: string, min: number) => {
    const t = s.trim().toLowerCase().replace(/\s+/g, " ");
    if (t.length < min) return;
    if (TOKEN_BLOCKLIST.has(t)) return;
    tokens.add(t);
  };

  if (brand?.trim()) {
    add(brand, 3);
    if (/\s/.test(brand.trim())) add(brand.replace(/\s+/g, ""), 4);
  }

  // Domain stem — only when the input looks like a real hostname.
  const lowered = (domain ?? "").toLowerCase().replace(PROTOCOL_RE, "").replace(/^www\./, "");
  const host = lowered.split(/[\/?#]/)[0].replace(/:\d+$/, "");
  if (host.includes(".") && /[a-z]/.test(host)) {
    const stem = host.split(".")[0];
    if (stem) add(stem, 4);
  }

  return Array.from(tokens);
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word (letters/digits boundary), case-insensitive, flexible whitespace. */
function wordPattern(token: string): string {
  return `(?<![\\p{L}\\p{N}])${token.split(/\s+/).map(escapeRegExp).join("\\s+")}(?![\\p{L}\\p{N}])`;
}

/** True when `name` appears in `text` as whole words (case-insensitive). */
export function mentionsName(text: string, name: string): boolean {
  const n = (name || "").trim();
  if (!text || n.length < 2) return false;
  return new RegExp(wordPattern(n.toLowerCase()), "iu").test(text);
}

/** Number of whole-word occurrences of `name` in `text`. */
export function countNameMentions(text: string, name: string): number {
  const n = (name || "").trim();
  if (!text || n.length < 2) return 0;
  return (text.match(new RegExp(wordPattern(n.toLowerCase()), "giu")) ?? []).length;
}

/**
 * Returns true if any brand token appears in the text as whole words.
 */
export function matchesBrand(text: string, tokens: string[]): boolean {
  if (!text || tokens.length === 0) return false;
  return tokens.some((t) => mentionsName(text, t));
}

/**
 * Quick boolean: does this text mention the brand?
 */
export function detectBrand(text: string, ids: BrandIdentifiers): boolean {
  return matchesBrand(text, buildBrandTokens(ids));
}
