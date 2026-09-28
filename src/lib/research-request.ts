/**
 * Keyword research (/dashboard?q=…) spends a paid search-provider call, so it runs only after a
 * deliberate action: submitting the lookup form, clicking a suggested question, or the "Look up
 * live results" button. Opening the URL by itself — a reload, back/forward, a bookmark or a shared
 * link — never calls /api/research; the page shows a "not looked up yet" state with the button.
 *
 * The deliberate actions leave a one-time intent in sessionStorage (this tab only; it cannot be
 * put into a link) just before navigating. The results view takes it once on mount: it is removed
 * as it is read, so a reload finds nothing and does not search again.
 */

export interface ResearchResponse {
  success: boolean;
  error?: string;
  keyword: string;
  location: string;
  liveResultsAvailable: boolean;
  liveResultsNote: string | null;
  intent: { primary: string; description: string };
  prompts: string[];
  topOrganicResults: { position?: number; title: string; link: string; snippet?: string }[];
}

export type ResearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ok"; data: ResearchResponse };

type IntentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const INTENT_KEY = "vsi:research-intent";
/** A navigation that takes longer than this after the click is not treated as that click. */
export const RESEARCH_INTENT_MAX_AGE_MS = 15_000;

/** The browser's sessionStorage, or null where it is unavailable (server, blocked storage). */
export function sessionIntentStorage(): IntentStorage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Called by a deliberate action right before it navigates to /dashboard?q=…&loc=…. */
export function markResearchIntent(storage: IntentStorage | null, query: string, location: string, now = Date.now()): void {
  try {
    storage?.setItem(INTENT_KEY, JSON.stringify({ query, location, at: now }));
  } catch {
    // Storage blocked: the page will offer the button instead.
  }
}

/** True once for the matching, recent intent; the intent is removed whatever the answer. */
export function takeResearchIntent(storage: IntentStorage | null, query: string, location: string, now = Date.now()): boolean {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(INTENT_KEY) ?? null;
    storage?.removeItem(INTENT_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;
  try {
    const intent = JSON.parse(raw) as { query?: unknown; location?: unknown; at?: unknown };
    const age = typeof intent.at === "number" ? now - intent.at : Number.NaN;
    return intent.query === query && intent.location === location && age >= 0 && age <= RESEARCH_INTENT_MAX_AGE_MS;
  } catch {
    return false;
  }
}

/** The one place that calls /api/research (the paid lookup). */
export async function requestResearch(fetchFn: FetchFn, query: string, location: string): Promise<ResearchState> {
  try {
    const res = await fetchFn("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: query, location, language: "English" }),
    });
    const data = (await res.json().catch(() => null)) as ResearchResponse | null;
    if (!res.ok || !data?.success) return { kind: "error", message: data?.error ?? "We couldn't look up this search. Please try again." };
    return { kind: "ok", data };
  } catch {
    return { kind: "error", message: "We couldn't reach VSI. Check your connection and try again." };
  }
}

/**
 * What the results view does. `mount()` runs the lookup only if a deliberate action just asked
 * for it (otherwise the view stays "idle" and nothing is requested); `run()` is the button.
 */
export function createResearchController(deps: {
  fetch: FetchFn;
  storage: IntentStorage | null;
  query: string;
  location: string;
  onState: (state: ResearchState) => void;
  now?: () => number;
}) {
  let inFlight = false;
  const run = async () => {
    if (inFlight) return; // a double click is one lookup
    inFlight = true;
    deps.onState({ kind: "loading" });
    try {
      deps.onState(await requestResearch(deps.fetch, deps.query, deps.location));
    } finally {
      inFlight = false;
    }
  };
  return {
    mount(): Promise<void> {
      return takeResearchIntent(deps.storage, deps.query, deps.location, deps.now?.() ?? Date.now()) ? run() : Promise.resolve();
    },
    run,
  };
}
