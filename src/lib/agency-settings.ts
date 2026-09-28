/**
 * Organization (agency) settings: the editable fields, how an update is validated on the server,
 * and how the settings form decides what to send. No server imports, so the page and the route
 * share it and it runs in tests.
 */

export const EDITABLE_AGENCY_FIELDS = [
  "display_name",
  "primary_color",
  "support_email",
  "report_footer",
  "logo_url",
] as const;

export type EditableAgencyField = (typeof EDITABLE_AGENCY_FIELDS)[number];

export type AgencySettingsValues = Record<EditableAgencyField, string | null>;

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TEXT = 5000;
const MAX_URL = 2000;

/**
 * Validates a settings update from the browser. Unknown keys are ignored; a known key with a bad
 * value is an error (never silently dropped, so the caller is never told "saved" for a value that
 * wasn't stored). Empty strings clear the field.
 */
export function buildAgencySettingsUpdate(body: Record<string, unknown>): {
  update: Partial<AgencySettingsValues>;
  errors: string[];
} {
  const update: Partial<AgencySettingsValues> = {};
  const errors: string[] = [];

  for (const key of EDITABLE_AGENCY_FIELDS) {
    if (!(key in body)) continue;
    const value = body[key];
    if (value === null) {
      update[key] = null;
      continue;
    }
    if (typeof value !== "string") {
      errors.push(`${key} must be text.`);
      continue;
    }
    const trimmed = value.trim();
    if (trimmed === "") {
      update[key] = null;
      continue;
    }

    switch (key) {
      case "primary_color":
        if (!HEX_COLOR.test(trimmed)) errors.push("Brand color must be a hex color like #1A2B3C.");
        else update[key] = trimmed;
        break;
      case "support_email":
        if (!EMAIL.test(trimmed) || trimmed.length > 320) errors.push("Contact email isn't a valid email address.");
        else update[key] = trimmed;
        break;
      case "logo_url":
        // Only a hosted image URL is stored. An inline data: URL is refused rather than dropped.
        if (!/^https?:\/\//i.test(trimmed) || trimmed.length > MAX_URL) errors.push("Logo must be an uploaded image URL.");
        else update[key] = trimmed;
        break;
      default:
        if (trimmed.length > MAX_TEXT) errors.push(`${key} is too long.`);
        else update[key] = trimmed;
    }
  }

  return { update, errors };
}

/**
 * The fields the settings form should send: only the ones that differ from what was loaded.
 * In particular logo_url is sent only when the user uploaded a new logo or removed the old one,
 * so saving the name never wipes a stored logo.
 */
export function changedAgencySettings(
  loaded: Partial<AgencySettingsValues>,
  current: Partial<AgencySettingsValues>,
): Partial<AgencySettingsValues> {
  const norm = (v: string | null | undefined) => (v ?? "").trim() || null;
  const out: Partial<AgencySettingsValues> = {};
  for (const key of EDITABLE_AGENCY_FIELDS) {
    if (!(key in current)) continue;
    if (norm(current[key]) !== norm(loaded[key])) out[key] = norm(current[key]);
  }
  return out;
}

/** Public shape returned by GET /api/agency/settings. */
export interface AgencySettingsResponse {
  ok: true;
  /** "database": real organization row. "local": local-development cookie session, no database. */
  mode: "database" | "local";
  /** Whether this account may change the organization's settings (organization UPDATE is admin-only). */
  canEdit: boolean;
  organization: {
    id: string;
    name: string | null;
    isPilot: boolean | null;
    maxKeywords: number | null;
    maxClients: number | null;
  } & AgencySettingsValues;
  user: { email: string; fullName: string | null; role: string };
  /** Present when requested with ?include=usage. A null count means it couldn't be read. */
  usage?: { clients: number | null; activeKeywords: number | null; reports: number | null };
}
