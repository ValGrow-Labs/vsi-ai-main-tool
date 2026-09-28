/**
 * Report share links.
 *
 * A share link (/r/<token>) is readable without signing in, so it expires. There is no product
 * setting for this yet; 30 days matches the database default set by migration 043
 * (reports.expires_at default now() + 30 days). Members of the organization that owns the report
 * can still open it after expiry (enforced in public.get_shared_report).
 */
export const REPORT_SHARE_TTL_DAYS = 30;

export function shareLinkExpiry(from: Date = new Date()): string {
  return new Date(from.getTime() + REPORT_SHARE_TTL_DAYS * 86_400_000).toISOString();
}

/** Columns returned by public.get_shared_report(p_token). */
export type SharedReportRow = {
  id: string;
  type: string;
  status: string | null;
  generated_at: string;
  expires_at: string | null;
  content: unknown;
};
