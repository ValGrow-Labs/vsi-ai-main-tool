import type { AIOCitation } from "@/types/search";

// ─── Types stored in reports.content ────────────────────────────

export interface ReportBranding {
  displayName: string;
  logoUrl: string | null;
  primaryColor: string;
  supportEmail: string | null;
  footer: string | null;
}

export interface ReportClient {
  name: string;
  brandName: string | null;
  website: string;
  servicePackage: string;
}

export interface HeroMetric {
  label: string;
  value: string;
  sub?: string;
  delta?: string;     // e.g. "+2" or "-1"
  tone?: "good" | "bad" | "neutral";
}

export interface KeywordRow {
  keyword: string;
  rank: number | null;
  rankDelta: number | null;        // positive = improved
  aioPresent: boolean | null;
  clientCited: boolean | null;
  mentionedInText: boolean | null;
  chatgptCited: boolean | null;
  chatgptMentioned: boolean | null;
  gap: string;
}

export interface ReportWebsiteHealth {
  score: number;
  previousScore: number | null;
  checkedAt: string;
  pagesChecked: number;
  /** Plain-language headlines of the checks that need fixing or improving. */
  issues: string[];
  /** Checks that couldn't run because pages didn't load (absent on older reports). */
  notChecked?: number;
}

export interface ReportCompletedTasks {
  total: number;
  verified: number;
  items: { title: string; completedAt: string; verified: boolean }[];
}

export interface ReportCompetitor {
  domain: string;
  aiAnswers: number;
  tracked: boolean;
}

export interface ReportContent {
  schema: "vsi-report-v1";
  generatedAt: string;
  rangeLabel: string;             // e.g. "Last 7 days"
  branding: ReportBranding;
  client: ReportClient;
  hero: HeroMetric[];
  wins: KeywordRow[];
  losses: KeywordRow[];
  opportunities: KeywordRow[];
  totalKeywords: number;
  /** Latest completed site audit. Absent in reports made before it was added. */
  websiteHealth?: ReportWebsiteHealth | null;
  /** Tasks finished during the report period. */
  completedTasks?: ReportCompletedTasks | null;
  /** Competitors in the AI answers checked: the user's own first, then the most linked. */
  competitors?: ReportCompetitor[];
}

// ─── Snapshot row shape we read from the DB ─────────────────────

export interface SnapshotRow {
  id: string;
  tracked_keyword_id: string | null;
  keyword: string;
  track_type?: string | null;
  rank_position: number | null;
  aio_present: boolean | null;
  client_cited: boolean | null;
  mentioned_in_text: boolean | null;
  chatgpt_checked: boolean | null;
  chatgpt_brand_cited: boolean | null;
  chatgpt_brand_mentioned: boolean | null;
  citations_json: AIOCitation[] | null;
  gap_label: string;
  created_at: string;
}

// ─── The builder ────────────────────────────────────────────────

function pickLatestPerKeyword(rows: SnapshotRow[]): Map<string, SnapshotRow> {
  // Key by keyword + track_type so the same query under different track
  // types stays distinct. Matches the dedup logic used on the client
  // overview page so the two surfaces always agree.
  const map = new Map<string, SnapshotRow>();
  for (const r of rows) {
    const trackType = (r as SnapshotRow & { track_type?: string }).track_type ?? "";
    const k = `${r.keyword}::${trackType}`;
    const existing = map.get(k);
    if (!existing || new Date(r.created_at) > new Date(existing.created_at)) {
      map.set(k, r);
    }
  }
  return map;
}

const HIGH_PRIORITY_GAPS = new Set([
  "search_strong_ai_invisible",
  "geo_invisible",
  "weak_double_loss",
]);

export function buildReportContent(opts: {
  client: ReportClient;
  branding: ReportBranding;
  currentSnapshots: SnapshotRow[];  // all snapshots within the current window
  previousSnapshots: SnapshotRow[]; // all snapshots within the previous window (for deltas)
  rangeLabel: string;
}): ReportContent {
  const currentLatest = pickLatestPerKeyword(opts.currentSnapshots);
  const previousLatest = pickLatestPerKeyword(opts.previousSnapshots);

  // Hero metrics
  const totalKeywords = currentLatest.size;
  let aioCited = 0, aioMentioned = 0, aioInvisible = 0, aioChecked = 0;
  let chatgptCited = 0, chatgptMentioned = 0, chatgptInvisible = 0, chatgptChecked = 0;
  let rankSum = 0, rankCount = 0;

  currentLatest.forEach((r) => {
    // aio_present can be true / false / null. Only count keywords where
    // the AIO check actually ran (i.e. it's not null).
    if (r.aio_present !== null && r.aio_present !== undefined) {
      aioChecked++;
      if (r.client_cited)              aioCited++;
      else if (r.mentioned_in_text)    aioMentioned++;
      else if (r.aio_present)          aioInvisible++;
      // else: AIO check ran but Google didn't trigger AIO for this query
    }

    if (r.chatgpt_checked) {
      chatgptChecked++;
      if (r.chatgpt_brand_cited)            chatgptCited++;
      else if (r.chatgpt_brand_mentioned)   chatgptMentioned++;
      else                                  chatgptInvisible++;
    }

    if (r.rank_position) {
      rankSum += r.rank_position;
      rankCount++;
    }
  });

  const avgRank = rankCount > 0 ? Math.round(rankSum / rankCount) : null;
  // Visibility % = (cited + mentioned) / keywords where AIO actually ran.
  // Earlier version divided by total keywords, which under-counted because
  // SEO-only and non-triggered AIO keywords inflated the denominator.
  const aioVisibility = aioChecked > 0
    ? Math.round(((aioCited + aioMentioned) / aioChecked) * 100)
    : null;
  const chatgptVisibility = chatgptChecked > 0
    ? Math.round(((chatgptCited + chatgptMentioned) / chatgptChecked) * 100)
    : null;

  const hero: HeroMetric[] = [
    {
      label: "Keywords tracked",
      value: String(totalKeywords),
    },
    {
      label: "Avg Google rank",
      value: avgRank != null ? `#${avgRank}` : "Not ranked",
      sub: `${rankCount} of ${totalKeywords} ranking`,
    },
    aioVisibility != null
      ? {
          label: "AI Overview visibility",
          value: `${aioVisibility}%`,
          sub: `${aioCited} cited · ${aioMentioned} mentioned · ${aioInvisible} invisible (of ${aioChecked} checked)`,
          tone: aioVisibility >= 50 ? "good" : aioVisibility >= 20 ? "neutral" : "bad",
        }
      : { label: "AI Overview visibility", value: "Off", sub: "Not turned on for this project" },
    chatgptVisibility != null
      ? {
          label: "ChatGPT visibility",
          value: `${chatgptVisibility}%`,
          sub: `${chatgptCited} cited · ${chatgptMentioned} mentioned (of ${chatgptChecked} checked)`,
          tone: chatgptVisibility >= 50 ? "good" : chatgptVisibility >= 20 ? "neutral" : "bad",
        }
      : { label: "ChatGPT visibility", value: "Off", sub: "Not turned on for this project" },
  ];

  // Wins + losses: compare current rank to previous rank per keyword
  const wins: KeywordRow[] = [];
  const losses: KeywordRow[] = [];

  currentLatest.forEach((cur, kw) => {
    const prev = previousLatest.get(kw);
    if (!prev) return;
    const delta =
      cur.rank_position && prev.rank_position
        ? prev.rank_position - cur.rank_position
        : null;
    const newlyCited = !!cur.client_cited && !prev.client_cited;
    const lostCitation = !cur.client_cited && !!prev.client_cited;

    const row: KeywordRow = {
      keyword: (kw.split("::")[0]) || kw,
      rank: cur.rank_position,
      rankDelta: delta,
      aioPresent: cur.aio_present,
      clientCited: cur.client_cited,
      mentionedInText: cur.mentioned_in_text,
      chatgptCited: cur.chatgpt_brand_cited,
      chatgptMentioned: cur.chatgpt_brand_mentioned,
      gap: cur.gap_label,
    };

    // A keyword can only be a win OR a loss — never both. Score each
    // change and bucket by net direction. Citation gain/loss outweighs
    // a one-position rank wobble.
    const rankScore = delta ?? 0;
    const citationScore = newlyCited ? 5 : lostCitation ? -5 : 0;
    const total = rankScore + citationScore;
    if (total > 0) wins.push(row);
    else if (total < 0) losses.push(row);
  });

  // Sort wins by best improvement, losses by worst regression
  wins.sort((a, b) => (b.rankDelta ?? 0) - (a.rankDelta ?? 0));
  losses.sort((a, b) => (a.rankDelta ?? 0) - (b.rankDelta ?? 0));

  // Opportunities: keywords with high-priority gap labels
  const opportunities: KeywordRow[] = [];
  currentLatest.forEach((cur, kw) => {
    if (!HIGH_PRIORITY_GAPS.has(cur.gap_label)) return;
    opportunities.push({
      keyword: (kw.split("::")[0]) || kw,
      rank: cur.rank_position,
      rankDelta: null,
      aioPresent: cur.aio_present,
      clientCited: cur.client_cited,
      mentionedInText: cur.mentioned_in_text,
      chatgptCited: cur.chatgpt_brand_cited,
      chatgptMentioned: cur.chatgpt_brand_mentioned,
      gap: cur.gap_label,
    });
  });

  return {
    schema: "vsi-report-v1",
    generatedAt: new Date().toISOString(),
    rangeLabel: opts.rangeLabel,
    branding: opts.branding,
    client: opts.client,
    hero,
    wins: wins.slice(0, 10),
    losses: losses.slice(0, 10),
    opportunities: opportunities.slice(0, 10),
    totalKeywords,
  };
}

// Cryptographically random share token (32 hex chars = 128 bits of entropy)
export function generateShareToken(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}
