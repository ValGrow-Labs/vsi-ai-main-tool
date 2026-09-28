/**
 * The AI answer engines VSI checks — the single source of engine ids and
 * customer-facing labels. Every page, report, finding and AI Chat context
 * takes its engine names from here.
 *
 * What VSI actually checks today:
 *  - google_ai_overview: SerpAPI `engine=google`, reading the response's
 *    `ai_overview` block (with SerpAPI's `engine=google_ai_overview`
 *    follow-up when Google returns only a page_token). This is Google's AI
 *    Overview. VSI does NOT call Google AI Mode (`engine=google_ai_mode`).
 *    Stored in the search_results `aio_*` columns; the project toggle is the
 *    `ai_mode_enabled` column (legacy name).
 *  - chatgpt: OpenAI chat completions. Stored in the `chatgpt_*` columns.
 *
 * The `ai_overview_*` columns and the `ai_overview_enabled` toggle are
 * legacy: they only ever held a second copy of the same `engine=google`
 * request, so they are not a separate engine and are not read.
 */

export type AiEngineId = "google_ai_overview" | "chatgpt";

export interface AiEngineInfo {
  id: AiEngineId;
  /** Full customer-facing name, e.g. in engine lists and evidence cards. */
  label: string;
  /** Short name for tight spaces and running text ("in the AI Overview"). */
  shortLabel: string;
  description: string;
  /** Where the data comes from (provenance). */
  provider: "serpapi" | "openai";
  /** The provider's own engine / API parameter used for the request. */
  providerEngine: string;
}

export const AI_ENGINES: Record<AiEngineId, AiEngineInfo> = {
  google_ai_overview: {
    id: "google_ai_overview",
    label: "Google AI Overview",
    shortLabel: "AI Overview",
    description: "The AI summary Google shows at the top of search results",
    provider: "serpapi",
    providerEngine: "google",
  },
  chatgpt: {
    id: "chatgpt",
    label: "ChatGPT",
    shortLabel: "ChatGPT",
    description: "Answers from ChatGPT",
    provider: "openai",
    providerEngine: "chat.completions",
  },
};

/** Display order. */
export const AI_ENGINE_IDS: AiEngineId[] = ["google_ai_overview", "chatgpt"];

/** "Google AI Overview" */
export const GOOGLE_AI_OVERVIEW = AI_ENGINES.google_ai_overview.label;
/** "AI Overview" */
export const AI_OVERVIEW = AI_ENGINES.google_ai_overview.shortLabel;

export function aiEngineLabel(id: AiEngineId, short = false): string {
  const e = AI_ENGINES[id];
  return short ? e.shortLabel : e.label;
}
