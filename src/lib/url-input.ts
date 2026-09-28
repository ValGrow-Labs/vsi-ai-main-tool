// Shared URL/domain validation + normalisation.
//
// The product asks the user for a website (their domain) in several places —
// the client wizard, Quick Check, and elsewhere. If we don't validate here,
// users can submit things like "Https:" or "example" and the downstream
// pipeline silently treats the broken string as a domain stem, which (via
// the brand-match logic) flags every citation as the client's own.

const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export interface NormalisedDomain {
  /** Bare hostname, lowercased, no protocol, no www, no path. e.g. "example.com" */
  domain: string;
  /** First label, useful for brand-match heuristics. e.g. "example" */
  stem: string;
}

/**
 * Try to coerce free-form input into a clean hostname. Returns null if the
 * value can't reasonably be parsed as a domain with a TLD.
 */
export function normaliseDomain(input: string): NormalisedDomain | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;

  // Strip protocol — handle malformed variants where the user omitted slashes
  // or only typed part of the scheme (e.g. "Https:", "http:/", "https://").
  s = s.replace(/^[a-z]+:\/+/, "").replace(/^[a-z]+:\/?/, "");
  s = s.replace(/^www\./, "");
  s = s.split(/[\/?#]/)[0];
  s = s.replace(/:\d+$/, ""); // strip port

  if (!s || !HOST_RE.test(s)) return null;
  // Reject pure-TLD inputs ("com") and overly long labels.
  if (!s.includes(".") || s.length > 253) return null;

  const stem = s.split(".")[0];
  if (!stem || stem.length < 2) return null;

  return { domain: s, stem };
}

/**
 * Validate without normalising — convenient for inline form checks.
 */
export function isValidDomain(input: string): boolean {
  return normaliseDomain(input) !== null;
}

/**
 * True when `host` (a hostname or URL) is the site `domain` or one of its
 * subdomains. Exact label matching only: "notexample.com", "example.com.evil.io"
 * and empty hosts never match "example.com".
 */
export function hostMatchesDomain(host: string, domain: string): boolean {
  const clean = (s: string) =>
    (s || "").trim().toLowerCase().replace(/^[a-z]+:\/+/, "").replace(/^www\./, "").split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/\.$/, "");
  const h = clean(host);
  const d = clean(domain);
  if (!h || !d || !d.includes(".")) return false;
  return h === d || h.endsWith(`.${d}`);
}
