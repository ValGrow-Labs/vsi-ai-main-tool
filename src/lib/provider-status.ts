/**
 * Shared states for anything that depends on an external provider (search,
 * AI answers, website analysis). The rule: real data or an honest unavailable
 * state — a failed provider never produces a result that looks real.
 */

/** Why a provider-backed operation produced no data. */
export type ProviderFailureReason =
  | "PROVIDER_NOT_CONFIGURED" // no API key
  | "PROVIDER_AUTH_FAILED" // key rejected
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_ERROR" // HTTP error or error payload
  | "INVALID_RESPONSE"; // unparseable or unexpected shape

/** Outcome of one Google rank lookup. */
export type RankStatus = "found" | "not_found" | "check_failed" | "not_checked";

/** Outcome of one AI engine check. */
export type AiCheckStatus = "answered" | "no_answer" | "check_failed" | "not_checked";

/** Thrown by provider clients instead of returning invented data. */
export class ProviderUnavailableError extends Error {
  readonly reason: ProviderFailureReason;
  readonly provider: string;

  constructor(provider: string, reason: ProviderFailureReason, message?: string) {
    super(message ?? `${provider} is unavailable (${reason})`);
    this.name = "ProviderUnavailableError";
    this.provider = provider;
    this.reason = reason;
  }
}

export function isProviderUnavailable(err: unknown): err is ProviderUnavailableError {
  return err instanceof ProviderUnavailableError;
}

/** Best-effort classification of an unknown provider failure. */
export function failureReason(err: unknown): ProviderFailureReason {
  if (err instanceof ProviderUnavailableError) return err.reason;
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  if (/timeout|timed out|abort/i.test(msg)) return "PROVIDER_TIMEOUT";
  if (/rate limit|429/i.test(msg)) return "PROVIDER_RATE_LIMITED";
  if (/auth|401|403|api key/i.test(msg)) return "PROVIDER_AUTH_FAILED";
  if (/json|parse|unexpected token/i.test(msg)) return "INVALID_RESPONSE";
  return "PROVIDER_ERROR";
}

/**
 * Demo/placeholder provider data is allowed only when explicitly opted in with
 * VSI_ALLOW_DEMO_DATA=true, and never in a production build. Default: off.
 */
export function demoDataAllowed(): boolean {
  return process.env.VSI_ALLOW_DEMO_DATA === "true" && process.env.NODE_ENV !== "production";
}

/** The SerpAPI key. Keys for other vendors (Serper, SearchAPI) are never sent to SerpAPI. */
export function serpApiKey(): string | null {
  const key = (process.env.SERPAPI_KEY || process.env.SERPAPI_API_KEY || "").trim();
  return key || null;
}

/** The Serper.dev key, only when it's a distinct Serper key (not a copy of the SerpAPI key). */
export function serperKey(): string | null {
  const key = (process.env.SERPER_API_KEY || "").trim();
  if (!key) return null;
  if (key === (process.env.SERPAPI_KEY || "").trim() || key === (process.env.SERPAPI_API_KEY || "").trim()) return null;
  return key;
}
