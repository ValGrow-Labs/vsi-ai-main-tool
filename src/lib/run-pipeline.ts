import { createClient } from "@/lib/supabase/server";
import { fetchRank } from "@/lib/serper";
import { fetchAIO } from "@/lib/serpapi";
import { runChatGPTCheck, type ChatGPTCheckResult, type ProjectCompetitor } from "@/lib/chatgpt-check";
import { failureReason, type AiCheckStatus, type ProviderFailureReason, type RankStatus } from "@/lib/provider-status";
import { logProviderError } from "@/lib/provider-response";
import { AI_ENGINES } from "@/lib/ai-engines";
import type { AIOResult, SerpResult } from "@/types/search";
import { getSetting } from "@/lib/settings";
import { track } from "@/lib/track";
import type { Location, TrackType } from "@/types/search";

export interface RunResult {
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  results: Array<{
    keyword: string;
    track_type: TrackType;
    status: "ok" | "error";
    error?: string;
  }>;
}

export interface TrackedKeyword {
  id: string;
  keyword: string;
  domain: string;
  brand: string | null;
  location: Location;
  track_type: TrackType;
  client_id: string;
}

interface ClientToggles {
  ai_mode_enabled: boolean | null;
  ai_overview_enabled: boolean | null;
  rank_tracking_enabled: boolean | null;
  chatgpt_enabled: boolean | null;
}

/** One engine's provenance entry in search_results.check_provenance. */
export interface ProvenanceEntry {
  status: RankStatus | AiCheckStatus;
  provider?: string | null;
  /** VSI engine id (see ai-engines.ts), e.g. "google_ai_overview", "chatgpt", "google_organic". */
  engine?: string;
  /** The provider's own engine / API parameter used for the request, e.g. SerpAPI "google". */
  provider_engine?: string;
  model?: string | null;
  reason?: string;
  checked_at: string;
}

type Settled<T> = { status: "fulfilled"; value: T } | { status: "rejected"; reason: unknown } | null;

export interface BuildRowInput {
  kw: TrackedKeyword;
  agencyId: string;
  clientId: string;
  rankTrackingEnabled: boolean;
  /** null = not attempted */
  serp: Settled<SerpResult>;
  aio: Settled<AIOResult>;
  gpt: Settled<ChatGPTCheckResult>;
  now?: string;
}

export type BuildRowOutcome =
  | { kind: "row"; row: Record<string, unknown>; failures: string[] }
  | { kind: "no_data"; failures: string[] }
  | { kind: "demo" };

/**
 * Fixed wording for a failed check. These strings reach the project's organization (the
 * /api/run-client response, the Run button, analysis_jobs.stages_data), so they never carry the
 * provider's own error text, which can include upstream response bodies, URLs with api_key or
 * vendor detail. The raw error is logged server-side by the caller.
 */
const FAILURE_TEXT: Record<ProviderFailureReason, string> = {
  PROVIDER_NOT_CONFIGURED: "the provider isn't configured",
  PROVIDER_AUTH_FAILED: "the provider rejected our credentials",
  PROVIDER_RATE_LIMITED: "the provider is rate limited, try again later",
  PROVIDER_TIMEOUT: "the provider took too long to answer",
  PROVIDER_ERROR: "the provider couldn't complete the check",
  INVALID_RESPONSE: "the provider's answer couldn't be read",
};

export function publicFailureText(reason: ProviderFailureReason | null | undefined): string {
  return (reason && FAILURE_TEXT[reason]) || "the check couldn't be completed";
}

function reasonText(check: string, err: unknown): string {
  logProviderError(check, err);
  return publicFailureText(failureReason(err));
}

/**
 * Turns the settled provider calls for one keyword into a search_results row.
 * Only real observations are stored: a failed or skipped check leaves its
 * fields NULL (read as "not checked") and is recorded in check_provenance —
 * it is never stored as "not ranking" or "not mentioned". When nothing real
 * was observed, no row is written at all.
 */
export function buildSearchResultRow(input: BuildRowInput): BuildRowOutcome {
  const { kw, serp, aio, gpt } = input;
  const now = input.now ?? new Date().toISOString();
  const failures: string[] = [];

  // Opt-in development placeholder data is never stored as history.
  if ((serp?.status === "fulfilled" && serp.value.isDemo) || (aio?.status === "fulfilled" && aio.value.isDemo)) {
    return { kind: "demo" };
  }

  // ── Google rank ──
  let rankStatus: RankStatus;
  const rank: ProvenanceEntry = { status: "not_checked", engine: "google_organic", checked_at: now };
  if (!input.rankTrackingEnabled || !serp) {
    rankStatus = "not_checked";
    rank.reason = input.rankTrackingEnabled ? "not_requested" : "rank_tracking_disabled";
  } else if (serp.status === "rejected") {
    rankStatus = "check_failed";
    rank.reason = failureReason(serp.reason);
    failures.push(`Google rank: ${reasonText("Google rank", serp.reason)}`);
  } else {
    rankStatus = serp.value.position !== null ? "found" : "not_found";
    rank.provider = serp.value.provider ?? null;
  }
  rank.status = rankStatus;
  const rankObserved = rankStatus === "found" || rankStatus === "not_found";
  const serpValue = serp?.status === "fulfilled" ? serp.value : null;

  // ── Google AI answer (SerpAPI engine=google, ai_overview block) ──
  // Google AI Overview: SerpAPI engine=google, response block "ai_overview".
  const googleAi: ProvenanceEntry = {
    status: "not_checked",
    engine: AI_ENGINES.google_ai_overview.id,
    provider_engine: AI_ENGINES.google_ai_overview.providerEngine,
    checked_at: now,
  };
  const aioValue = aio?.status === "fulfilled" ? aio.value : null;
  if (aio?.status === "rejected") {
    googleAi.status = "check_failed";
    googleAi.reason = failureReason(aio.reason);
    failures.push(`Google AI answer: ${reasonText("Google AI answer", aio.reason)}`);
  } else if (aioValue) {
    googleAi.status = aioValue.aioPresent ? "answered" : "no_answer";
    googleAi.provider = aioValue.provider ?? "serpapi";
  }

  // ── ChatGPT (OpenAI only) ──
  const gptValue = gpt?.status === "fulfilled" ? gpt.value : null;
  const chatgpt: ProvenanceEntry = { status: "not_checked", engine: AI_ENGINES.chatgpt.id, provider_engine: AI_ENGINES.chatgpt.providerEngine, checked_at: now };
  if (gpt?.status === "rejected") {
    chatgpt.status = "check_failed";
    chatgpt.reason = failureReason(gpt.reason);
    failures.push(`ChatGPT: ${reasonText("ChatGPT", gpt.reason)}`);
  } else if (gptValue) {
    chatgpt.status = gptValue.status;
    chatgpt.provider = gptValue.provider;
    chatgpt.model = gptValue.model;
    if (gptValue.failure_reason) chatgpt.reason = gptValue.failure_reason;
    if (gptValue.status === "check_failed") {
      console.error("[provider] ChatGPT check failed", { reason: gptValue.failure_reason, detail: gptValue.skipped_reason });
      failures.push(`ChatGPT: ${publicFailureText(gptValue.failure_reason)}`);
    }
  }
  const gptAnswered = gptValue?.status === "answered" && gptValue.checked === true;


  if (!rankObserved && !aioValue && !gptAnswered) {
    return { kind: "no_data", failures };
  }

  const row: Record<string, unknown> = {
    agency_id: input.agencyId,
    client_id: input.clientId,
    tracked_keyword_id: kw.id,
    keyword: kw.keyword,
    domain: kw.domain,
    brand: kw.brand,
    location: kw.location,
    track_type: kw.track_type,
    rank_position: rankObserved ? serpValue?.position ?? null : null,
    rank_url: rankObserved ? serpValue?.rankingUrl ?? null : null,
    rank_title: rankObserved ? serpValue?.rankingTitle ?? null : null,
    serp_features: rankObserved ? serpValue?.serpFeatures ?? [] : [],
    // NULL (not []) when the lookup didn't produce results: the loaders use
    // this to tell a failed/skipped lookup from a real "not found".
    serp_results_json: rankObserved ? serpValue?.organicResults ?? [] : null,
    aio_present: aioValue ? aioValue.aioPresent : null,
    aio_snippet: aioValue?.aioSnippet ?? null,
    aio_full_text: aioValue?.aioFullText ?? null,
    cited_domains: aioValue?.citedDomains ?? [],
    client_cited: aioValue ? aioValue.clientCited : null,
    mentioned_in_text: aioValue ? aioValue.mentionedInText : null,
    citations_json: aioValue?.citations ?? [],
    chatgpt_checked: gptAnswered,
    chatgpt_response: gptAnswered ? gptValue?.response ?? null : null,
    chatgpt_brand_cited: gptAnswered ? gptValue?.brand_cited ?? null : null,
    chatgpt_brand_mentioned: gptAnswered ? gptValue?.brand_mentioned ?? null : null,
    chatgpt_mention_count: gptAnswered ? gptValue?.mention_count ?? null : null,
    chatgpt_competitors: gptAnswered ? gptValue?.competitors ?? [] : [],
    chatgpt_cited_urls: gptAnswered ? gptValue?.cited_urls ?? [] : [],
    chatgpt_entity_match: gptAnswered ? gptValue?.entity_match ?? null : null,
    chatgpt_actual_entity: gptAnswered ? gptValue?.entity_actual ?? null : null,
    ai_overview_present: null,
    ai_overview_full_text: null,
    ai_overview_snippet: null,
    ai_overview_citations_json: null,
    ai_overview_client_cited: null,
    ai_overview_cited_domains: null,
    rank_status: rankStatus,
    // One entry per engine actually checked. The legacy ai_overview_* columns
    // above stay NULL: they are not a separate engine (see ai-engines.ts).
    check_provenance: { rank, google_ai_overview: googleAi, chatgpt },
  };
  return { kind: "row", row, failures };
}

/** Columns added by later migrations; dropped on retry when the database doesn't have them yet. */
const MIGRATION_042_COLUMNS = ["rank_status", "check_provenance"];
const MIGRATION_029_COLUMNS = ["chatgpt_entity_match", "chatgpt_actual_entity"];

function without(row: Record<string, unknown>, cols: string[]) {
  const copy = { ...row };
  for (const c of cols) delete copy[c];
  return copy;
}

/**
 * Inserts a row, dropping columns from migrations that may not be applied yet.
 * Without migration 042 a failed rank lookup can't be marked, so the row keeps
 * serp_results_json NULL, which the loaders also read as "not checked".
 */
export async function insertSearchResultRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  row: Record<string, unknown>,
): Promise<{ error: string | null }> {
  const attempts = [row, without(row, MIGRATION_042_COLUMNS), without(row, [...MIGRATION_042_COLUMNS, ...MIGRATION_029_COLUMNS])];
  let lastError: string | null = null;
  for (const attempt of attempts) {
    const { error } = await supabase.from("search_results").insert(attempt);
    if (!error) return { error: null };
    lastError = error.message ?? String(error.code ?? "insert failed");
    // Only a missing column is worth retrying with fewer columns.
    if (!/column|schema cache|42703|PGRST204/i.test(`${error.code ?? ""} ${error.message ?? ""}`)) break;
  }
  return { error: lastError };
}

async function runKeyword(
  kw: TrackedKeyword,
  agencyId: string,
  clientId: string,
  chatgptApiEnabled: boolean,
  googleAiOverviewEnabled: boolean,
  rankTrackingEnabled: boolean,
  competitors: ProjectCompetitor[],
): Promise<{ status: "ok" | "error"; error?: string }> {
  try {
    const runAI = googleAiOverviewEnabled && (kw.track_type === "geo" || kw.track_type === "both");
    const runChatGPT = chatgptApiEnabled && (kw.track_type === "geo" || kw.track_type === "both");
    // Rank lookups for every tracked search when rank tracking is on (the
    // stored gap classification combines the rank with the AI answer).
    const runRank = rankTrackingEnabled;

    const [serpSettled, aioSettled, gptSettled] = await Promise.all([
      runRank ? Promise.allSettled([fetchRank(kw.keyword, kw.domain, kw.location, kw.brand ?? "")]).then((r) => r[0]) : Promise.resolve(null),
      runAI ? Promise.allSettled([fetchAIO(kw.keyword, kw.domain, kw.brand ?? "", kw.location)]).then((r) => r[0]) : Promise.resolve(null),
      runChatGPT
        ? Promise.allSettled([runChatGPTCheck({ keyword: kw.keyword, clientBrand: kw.brand ?? "", clientDomain: kw.domain, competitors })]).then((r) => r[0])
        : Promise.resolve(null),
    ]);

    const built = buildSearchResultRow({
      kw,
      agencyId,
      clientId,
      rankTrackingEnabled: runRank,
      serp: serpSettled,
      aio: aioSettled,
      gpt: gptSettled,
    });

    if (built.kind === "demo") {
      return { status: "error", error: "Search provider isn't configured, so no real results were collected." };
    }
    if (built.kind === "no_data") {
      return { status: "error", error: built.failures.join("; ") || "No check produced a result." };
    }

    const supabase = await createClient();
    const inserted = await insertSearchResultRow(supabase, built.row);
    if (inserted.error) {
      console.error("[run-pipeline] saving the search result failed", inserted.error);
      return { status: "error", error: "Couldn't save the result. Please try again." };
    }

    // After a successful run, check whether any completed tasks for this
    // keyword can be marked as outcome-verified or regressed. Best-effort:
    // we don't want a task-update failure to take down the pipeline.
    try {
      const { runOutcomeVerification } = await import("@/lib/task-outcome");
      await runOutcomeVerification(supabase, kw.id);
    } catch (e) {
      console.error("[pipeline] outcome verification failed", e);
    }

    const serpResult = serpSettled?.status === "fulfilled" ? serpSettled.value : null;
    const aioResult = aioSettled?.status === "fulfilled" ? aioSettled.value : null;
    // Anonymous outcome telemetry for usage patterns + training data.
    track({
      agencyId,
      type: "keyword_run_outcome",
      payload: {
        track_type: kw.track_type,
        rank_status: built.row.rank_status as string,
        rank_position: serpResult?.position ?? null,
        aio_present: aioResult?.aioPresent ?? null,
        client_cited: aioResult?.clientCited ?? null,
        cited_domain_count: aioResult?.citedDomains?.length ?? 0,
      },
    });

    // Stored, but some checks failed: report them without discarding the real data.
    return built.failures.length ? { status: "ok", error: `Partly checked — ${built.failures.join("; ")}` } : { status: "ok" };
  } catch (err) {
    console.error("[run-pipeline] keyword check failed", err);
    return { status: "error", error: "The check couldn't be completed. Please try again." };
  }
}

/**
 * Run a batch of keywords for a single client. Used by /api/run-client (manual
 * UI trigger) and by /api/cron/run-due-clients (scheduled auto-runs).
 *
 * The caller is responsible for verifying the agency owns the client (or for
 * being the cron job itself, which is authorised by CRON_SECRET).
 */
export async function runKeywordsForClient(opts: {
  agencyId: string;
  clientId: string;
  client: ClientToggles;
  keywords: TrackedKeyword[];
  batchSize?: number;
}): Promise<RunResult> {
  if (opts.keywords.length === 0) {
    return { total: 0, completed: 0, failed: 0, skipped: 0, results: [] };
  }

  const systemChatgptEnabled = await getSetting<boolean>("chatgpt_api_enabled");
  const chatgptApiEnabled    = opts.client.chatgpt_enabled ?? systemChatgptEnabled;
  // Google AI Overview (SerpAPI engine=google) is switched by the
  // ai_mode_enabled column (legacy name); on by default. The legacy
  // ai_overview_enabled toggle is not a separate engine and isn't used.
  const googleAiOverviewEnabled = opts.client.ai_mode_enabled ?? true;
  const rankTrackingEnabled  = opts.client.rank_tracking_enabled ?? true;

  // The project's own competitors are the only source of competitor mentions.
  let competitors: ProjectCompetitor[] = [];
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("project_competitors").select("domain, name").eq("client_id", opts.clientId);
    competitors = (data ?? []) as ProjectCompetitor[];
  } catch {
    // No competitors table yet: no competitor mentions, rather than invented ones.
  }

  const batchSize = opts.batchSize ?? 3;
  const results: RunResult["results"] = [];

  for (let i = 0; i < opts.keywords.length; i += batchSize) {
    const batch = opts.keywords.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (kw) => {
        const res = await runKeyword(kw, opts.agencyId, opts.clientId, chatgptApiEnabled, googleAiOverviewEnabled, rankTrackingEnabled, competitors);
        return { keyword: kw.keyword, track_type: kw.track_type, ...res };
      })
    );
    results.push(...batchResults);
  }

  const completed = results.filter((r) => r.status === "ok").length;
  const failed    = results.filter((r) => r.status === "error").length;
  return { total: opts.keywords.length, completed, failed, skipped: 0, results };
}
