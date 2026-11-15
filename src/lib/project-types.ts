/** Shared between server and client code. No server imports here. */

export const PROJECT_COOKIE = "vsi_project";

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ProjectSummary {
  id: string;
  name: string;
  website: string | null;
  brandName: string | null;
  serviceType: string | null;
  defaultLocation: string | null;
  country: string | null;
  agencyId: string;
  /** Only filled for super admins, who see projects across organizations. */
  agencyName: string | null;
}

export function displayDomain(website: string | null | undefined): string | null {
  if (!website) return null;
  return website.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}
