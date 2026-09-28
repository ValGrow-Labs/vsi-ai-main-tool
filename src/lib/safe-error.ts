// Turn any AI/provider error into fixed, user-facing text before it leaves the server, so we never
// leak the underlying AI vendor, model identifier, HTTP layer details, upstream response bodies,
// URLs (which can carry api_key query strings), key names or stack traces to the client. The raw
// error is logged server-side for diagnostics; only these fixed strings reach the browser.

const GENERIC = "The AI assistant couldn't finish that request. Please try again.";
const FRIENDLY_402 = "The free-tier AI budget for the day has been used up. Try again later, or top up credits.";
const FRIENDLY_429 = "The AI assistant is rate-limited right now. Try again in a minute.";
const FRIENDLY_5XX = "The AI assistant is busy. Try again in a minute.";

export function safeAiError(raw: string | null | undefined): string {
  if (!raw) return GENERIC;
  const lower = raw.toLowerCase();

  // Recognise common HTTP problems by code or wording.
  if (lower.includes("402") || lower.includes("payment required") || lower.includes("insufficient credit")) {
    return FRIENDLY_402;
  }
  if (lower.includes("429") || lower.includes("rate limit") || lower.includes("rate-limit")) {
    return FRIENDLY_429;
  }
  if (/\b50\d\b/.test(raw) || lower.includes("timed out") || lower.includes("timeout")) {
    return FRIENDLY_5XX;
  }

  // Anything else is upstream text: never echoed.
  return GENERIC;
}
