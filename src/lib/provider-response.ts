import { NextResponse } from "next/server";
import { failureReason, isProviderUnavailable, type ProviderFailureReason } from "@/lib/provider-status";

/**
 * Fixed, user-facing text for each provider failure. Nothing from the upstream error (bodies,
 * URLs with api_key query strings, stack traces, key names, vendor hosts) ever reaches the browser;
 * the detail is logged server-side only.
 */
export const PROVIDER_FAILURE_MESSAGES: Record<ProviderFailureReason, string> = {
  PROVIDER_NOT_CONFIGURED: "The search provider isn't configured for this workspace yet.",
  PROVIDER_AUTH_FAILED: "The search provider rejected our credentials. An administrator needs to check the configuration.",
  PROVIDER_RATE_LIMITED: "The search provider is rate limited right now. Try again in a few minutes.",
  PROVIDER_TIMEOUT: "The search provider took too long to answer. Try again in a moment.",
  PROVIDER_ERROR: "The search provider couldn't complete the request. Try again in a moment.",
  INVALID_RESPONSE: "The search provider returned an answer we couldn't read. Try again in a moment.",
};

/** Safe text for a provider failure, for places that embed it in a larger body (status fields etc.). */
export function safeProviderMessage(err: unknown): string {
  return PROVIDER_FAILURE_MESSAGES[failureReason(err)];
}

/** Server-side log of a provider failure: the full detail stays in the logs. */
export function logProviderError(context: string, err: unknown): void {
  const detail =
    err instanceof Error
      ? {
          name: err.name,
          message: err.message,
          reason: failureReason(err),
          provider: isProviderUnavailable(err) ? err.provider : undefined,
        }
      : err;
  console.error(`[provider] ${context} failed`, detail);
}

/**
 * JSON response for a provider-backed route that failed. Never a success body:
 * 503 SEARCH_UNAVAILABLE when no provider is configured, 502 CHECK_FAILED when
 * the provider call itself failed.
 *
 * Shape: { success: false, status, reason, error, message }. `status` and `reason` are stable
 * codes; `error` (what the existing UI displays) and `message` carry the same fixed friendly text.
 * `fallbackMessage` is kept for call-site compatibility and only logged.
 */
export function providerErrorResponse(err: unknown, fallbackMessage = "The check couldn't be completed.") {
  const reason = failureReason(err);
  const notConfigured = reason === "PROVIDER_NOT_CONFIGURED";
  logProviderError(fallbackMessage, err);
  const message = PROVIDER_FAILURE_MESSAGES[reason];
  return NextResponse.json(
    {
      success: false,
      status: notConfigured ? "SEARCH_UNAVAILABLE" : "CHECK_FAILED",
      reason,
      error: message,
      message,
    },
    { status: notConfigured ? 503 : 502 },
  );
}

/**
 * Failure reason for an error that carries only an HTTP-ish status (e.g. SerpApiError.statusCode)
 * rather than a ProviderFailureReason. Used so the browser sees the fixed text for that reason
 * instead of the error's own message, which can embed the upstream body.
 */
export function reasonFromHttpStatus(statusCode: number, code?: string): ProviderFailureReason {
  if (code === "SEARCH_UNAVAILABLE" || statusCode === 503) return "PROVIDER_NOT_CONFIGURED";
  if (statusCode === 401 || statusCode === 403) return "PROVIDER_AUTH_FAILED";
  if (statusCode === 429) return "PROVIDER_RATE_LIMITED";
  if (statusCode === 504) return "PROVIDER_TIMEOUT";
  return "PROVIDER_ERROR";
}
