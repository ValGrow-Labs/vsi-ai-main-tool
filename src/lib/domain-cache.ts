import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { ExtractedWebsiteData } from "@/app/api/analyze-website/website-profile";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function normaliseCacheDomain(domain: string): string {
  return domain
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function getCacheClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("dummy.supabase.co")) {
    return null;
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Retrieve cached analysis for a domain from Supabase if under 7 days old.
 */
export async function getDomainAnalysisCache(
  rawDomain: string
): Promise<ExtractedWebsiteData | null> {
  const domain = normaliseCacheDomain(rawDomain);
  if (!domain) return null;

  try {
    const supabase = getCacheClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("website_analysis_cache")
      .select("profile, created_at")
      .eq("domain", domain)
      .maybeSingle();

    if (error || !data?.profile || !data?.created_at) {
      return null;
    }

    const age = Date.now() - new Date(data.created_at).getTime();
    if (age >= SEVEN_DAYS_MS) {
      return null; // Expired (> 7 days)
    }

    return data.profile as ExtractedWebsiteData;
  } catch (err) {
    console.warn("[domain-cache] Failed to read cache for", domain, err);
    return null;
  }
}

/**
 * Store an analysis profile in Supabase with a 7-day TTL.
 */
export async function saveDomainAnalysisCache(
  rawDomain: string,
  profile: ExtractedWebsiteData
): Promise<void> {
  const domain = normaliseCacheDomain(rawDomain);
  if (!domain || !profile) return;

  try {
    const supabase = getCacheClient();
    if (!supabase) return;

    const { error } = await supabase.from("website_analysis_cache").upsert({
      domain,
      profile,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.warn("[domain-cache] Failed to save cache for", domain, error.message);
    }
  } catch (err) {
    console.warn("[domain-cache] Error saving cache for", domain, err);
  }
}
