import { createClient } from "@/lib/supabase/server";
import { loadProjectOverview } from "@/lib/project-summary";
import { CHECK_COPY, checkHeadline } from "@/lib/site-audit/copy";
import { isAuditProblem } from "@/lib/site-audit/checks";
import { isRankObservation } from "@/lib/search";

type StoredCheck = {
  rank_position: number | null;
  serp_first?: unknown;
  serp_results_json?: unknown[] | null;
  aio_present: boolean | null;
  gap_label: string | null;
};

/** A failed or skipped lookup is "not checked", never "not ranking". */
function isRealRank(r: StoredCheck): boolean {
  const first = r.serp_first !== undefined ? r.serp_first : (r.serp_results_json ?? [])[0] ?? null;
  return isRankObservation({ tracked_keyword_id: null, keyword: "", created_at: "", rank_position: r.rank_position, rank_url: null, serp_first: first });
}
function rankText(r: StoredCheck, found: (pos: number) => string, notFound: string): string {
  if (!isRealRank(r)) return "not checked (the lookup failed or didn't run)";
  return r.rank_position ? found(r.rank_position) : notFound;
}
function aiText(r: StoredCheck & { client_cited: boolean | null; mentioned_in_text: boolean | null }): string {
  if (r.aio_present === null || r.aio_present === undefined) return "not checked";
  return r.client_cited ? "cited" : r.mentioned_in_text ? "mentioned" : r.aio_present ? "invisible" : "no AI answer";
}
/** The stored gap label combines rank and AI answer; meaningless if either wasn't observed. */
function gapText(r: StoredCheck): string {
  if (!isRealRank(r) || r.aio_present === null || r.aio_present === undefined || !r.gap_label) return "unknown (incomplete check)";
  return r.gap_label.replace(/_/g, " ");
}
import type { AIOCitation, OrganicResult } from "@/types/search";

export type ChatScope =
  | { kind: "keyword"; clientId: string; keywordId: string }
  | { kind: "client"; clientId: string }
  | { kind: "global" };

// Hard cap — we keep the system prompt under ~8k tokens so free models work.
const MAX_AIO_CHARS = 2200;
const MAX_SERP_ITEMS = 10;
const MAX_CITATIONS = 20;
const MAX_KEYWORDS_PER_CLIENT = 30;
const MAX_CLIENTS_GLOBAL = 20;

function fmtSerp(serp: OrganicResult[] | null | undefined): string {
  if (!serp || serp.length === 0) return "(none)";
  return serp.slice(0, MAX_SERP_ITEMS).map((r) => {
    const snippet = r.snippet ? r.snippet.replace(/\s+/g, " ").slice(0, 160) : "";
    return `${r.position}. ${r.title} — ${r.domain}\n   ${snippet}`;
  }).join("\n");
}

function fmtCitations(c: AIOCitation[] | null | undefined): string {
  if (!c || c.length === 0) return "(none)";
  return c.slice(0, MAX_CITATIONS).map((x) => {
    const flag = x.isClient ? " ← CLIENT" : "";
    return `${x.position}. ${x.sourceName || x.domain}${flag} (${x.domain})`;
  }).join("\n");
}

export async function buildChatContext(opts: {
  agencyId: string;
  scope: ChatScope;
}): Promise<{ contextText: string; scopeLabel: string }> {
  const supabase = await createClient();
  const { scope, agencyId } = opts;

  // Open tasks (used by all scopes — adds the "execution" view to chat answers)
  async function fetchOpenTasksFor(scopeKey: { tracked_keyword_id?: string; client_id?: string }) {
    let q = supabase
      .from("tasks")
      .select("title, group_name, owner, status, effort, impact, due_date, tracked_keywords(keyword)")
      .eq("agency_id", agencyId)
      .in("status", ["todo", "in_progress"])
      .order("priority", { ascending: true })
      .limit(20);
    if (scopeKey.tracked_keyword_id) q = q.eq("tracked_keyword_id", scopeKey.tracked_keyword_id);
    else if (scopeKey.client_id) q = q.eq("client_id", scopeKey.client_id);
    const { data } = await q;
    if (!data || data.length === 0) return "(no open tasks)";
    return data.map((t) => {
      const kw = Array.isArray(t.tracked_keywords) ? t.tracked_keywords[0]?.keyword : (t.tracked_keywords as { keyword: string } | null)?.keyword;
      const due = t.due_date ? ` · due ${new Date(t.due_date).toISOString().slice(0, 10)}` : "";
      const owner = t.owner ? ` [${t.owner}]` : "";
      const kwBit = kw && !scopeKey.tracked_keyword_id ? ` ("${kw}")` : "";
      return `- ${t.status === "in_progress" ? "▶" : "○"} ${t.title}${owner} · ${t.group_name} · effort=${t.effort ?? "?"}${due}${kwBit}`;
    }).join("\n");
  }

  if (scope.kind === "keyword") {
    const { data: kw } = await supabase
      .from("tracked_keywords")
      .select("id, keyword, track_type, location, clients(name, brand_name, website, industry, country)")
      .eq("id", scope.keywordId)
      .eq("agency_id", agencyId)
      .maybeSingle();
    if (!kw) return { contextText: "(keyword not found)", scopeLabel: "Keyword" };

    const clientArr = kw.clients as unknown as Array<{ name: string; brand_name: string | null; website: string | null; industry: string | null; country: string | null }> | { name: string; brand_name: string | null; website: string | null; industry: string | null; country: string | null } | null;
    const client = Array.isArray(clientArr) ? clientArr[0] : clientArr;

    const { data: runs } = await supabase
      .from("search_results")
      .select("rank_position, aio_present, client_cited, mentioned_in_text, cited_domains, aio_full_text, aio_snippet, citations_json, serp_results_json, gap_label, created_at")
      .eq("tracked_keyword_id", scope.keywordId)
      .order("created_at", { ascending: false })
      .limit(5);

    const latest = runs?.[0];
    const previous = runs?.[1];

    if (!latest) {
      return {
        contextText: `Client: ${client?.brand_name ?? client?.name}\nKeyword: "${kw.keyword}"\nNo pipeline runs yet — no data to analyse.`,
        scopeLabel: kw.keyword as string,
      };
    }

    const aioText = (latest.aio_full_text ?? latest.aio_snippet ?? "") as string;
    const prevRank = previous && isRealRank(previous as StoredCheck) ? previous.rank_position ?? null : null;
    const rankDelta = isRealRank(latest as StoredCheck) && latest.rank_position && prevRank ? prevRank - latest.rank_position : null;

    const context = [
      `# Keyword in scope`,
      `Client: ${client?.brand_name ?? client?.name} (${client?.website ?? ""})`,
      `Industry: ${client?.industry ?? "—"} · Country: ${client?.country ?? "—"}`,
      `Tracked keyword: "${kw.keyword}" · type: ${kw.track_type} · location: ${kw.location ?? "—"}`,
      ``,
      `# Latest snapshot (${new Date(latest.created_at).toISOString().slice(0, 10)})`,
      `- Google rank: ${rankText(latest as StoredCheck, (p) => `#${p}`, "Not in the top results")}${rankDelta != null ? ` (was #${prevRank}, ${rankDelta >= 0 ? "+" : ""}${rankDelta})` : ""}`,
      `- Google AI answer: ${latest.aio_present === null || latest.aio_present === undefined ? "not checked" : latest.aio_present ? "Yes" : "No"}`,
      `- Client cited as source: ${latest.aio_present === null || latest.aio_present === undefined ? "not checked" : latest.client_cited ? "Yes" : "No"}`,
      `- Client mentioned in the AI answer: ${latest.aio_present === null || latest.aio_present === undefined ? "not checked" : latest.mentioned_in_text ? "Yes" : "No"}`,
      `- Gap classification: ${gapText(latest as StoredCheck)}`,
      `- Cited competitor domains: ${(latest.cited_domains as string[] | null)?.slice(0, 10).join(", ") || "none"}`,
      ``,
      `## Google SERP — top 10 organic`,
      fmtSerp(latest.serp_results_json as OrganicResult[] | null),
      ``,
      `## AIO citations (ordered)`,
      fmtCitations(latest.citations_json as AIOCitation[] | null),
      ``,
      `## AIO answer text (verbatim from Google)`,
      aioText ? `"""\n${aioText.slice(0, MAX_AIO_CHARS)}\n"""` : "(none)",
      ``,
      `## Open tasks for this keyword`,
      await fetchOpenTasksFor({ tracked_keyword_id: scope.keywordId }),
    ].join("\n");

    return { contextText: context, scopeLabel: kw.keyword as string };
  }

  if (scope.kind === "client") {
    const { data: client } = await supabase
      .from("clients")
      .select("id, name, brand_name, website, industry, country, service_type")
      .eq("id", scope.clientId)
      .eq("agency_id", agencyId)
      .maybeSingle();
    if (!client) return { contextText: "(client not found)", scopeLabel: "Client" };

    const { data: results } = await supabase
      .from("search_results")
      .select("keyword, track_type, rank_position, aio_present, client_cited, mentioned_in_text, gap_label, cited_domains, created_at, serp_first:serp_results_json->0")
      .eq("client_id", scope.clientId)
      .order("created_at", { ascending: false })
      .limit(500);

    // dedupe to latest per (keyword, track_type)
    const seen = new Set<string>();
    const latestPerKw: NonNullable<typeof results> = [];
    for (const r of results ?? []) {
      const k = `${r.keyword}::${r.track_type}`;
      if (seen.has(k)) continue;
      seen.add(k);
      latestPerKw.push(r);
    }

    const slice = latestPerKw.slice(0, MAX_KEYWORDS_PER_CLIENT);

    const context = [
      `# Client in scope`,
      `${client.brand_name ?? client.name} (${client.website ?? ""})`,
      `Industry: ${client.industry ?? "—"} · Country: ${client.country ?? "—"} · Package: ${client.service_type}`,
      ``,
      `# Keyword portfolio — ${latestPerKw.length} unique keywords${latestPerKw.length > MAX_KEYWORDS_PER_CLIENT ? ` (showing latest ${MAX_KEYWORDS_PER_CLIENT})` : ""}`,
      ...slice.map((r) => {
        const check = r as unknown as StoredCheck & { client_cited: boolean | null; mentioned_in_text: boolean | null };
        const rank = rankText(check, (p) => `#${p}`, "not in top results");
        const ai = aiText(check);
        const top3 = (r.cited_domains as string[] | null)?.slice(0, 3).join(", ") || "—";
        return `- "${r.keyword}" [${r.track_type}] rank ${rank} · AI: ${ai} · gap: ${gapText(check)} · cited: ${top3}`;
      }),
      ``,
      await projectFindingsContext({
        id: client.id as string,
        name: client.name as string,
        website: (client.website as string | null) ?? null,
        brandName: (client.brand_name as string | null) ?? null,
        serviceType: (client.service_type as string | null) ?? null,
        defaultLocation: null,
        agencyId,
        agencyName: null,
      }),
      ``,
      `# Open tasks for this client`,
      await fetchOpenTasksFor({ client_id: scope.clientId }),
    ].join("\n");

    return { contextText: context, scopeLabel: client.brand_name ?? client.name as string };
  }

  // global
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, brand_name, website, industry, country, service_type")
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: true })
    .limit(MAX_CLIENTS_GLOBAL);

  const { data: results } = await supabase
    .from("search_results")
    .select("client_id, keyword, track_type, gap_label, created_at")
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false })
    .limit(2000);

  // count gaps per client (latest snapshot per kw only)
  const seen = new Set<string>();
  const gapByClient = new Map<string, Record<string, number>>();
  for (const r of results ?? []) {
    const k = `${r.client_id}::${r.keyword}::${r.track_type}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const counts = gapByClient.get(r.client_id as string) ?? {};
    counts[r.gap_label as string] = (counts[r.gap_label as string] ?? 0) + 1;
    gapByClient.set(r.client_id as string, counts);
  }

  const context = [
    `# Agency portfolio — ${clients?.length ?? 0} clients`,
    ...(clients ?? []).map((c) => {
      const counts = gapByClient.get(c.id as string) ?? {};
      const summary = Object.entries(counts).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ");
      return `- ${c.brand_name ?? c.name} [${c.service_type}] (${c.industry ?? "—"} / ${c.country ?? "—"}) — ${summary || "no runs yet"}`;
    }),
    ``,
    `# Open tasks across all clients (top 20 by priority)`,
    await fetchOpenTasksFor({}),
  ].join("\n");

  return { contextText: context, scopeLabel: "All clients" };
}

/**
 * Site audit, AI visibility, rankings and ranked findings for one project,
 * from the same aggregation the Overview and Next Actions pages use.
 * Anything not checked yet is stated as such so the model never guesses.
 */
async function projectFindingsContext(project: Parameters<typeof loadProjectOverview>[0]): Promise<string> {
  try {
    const o = await loadProjectOverview(project);
    const lines: string[] = [];

    lines.push("# Latest site audit");
    if (o.audit.state === "ok" && o.audit.completed) {
      const a = o.audit.completed;
      lines.push(
        a.score === null || a.score === undefined
          ? `No website health score: the audit from ${(a.completed_at ?? a.created_at).slice(0, 10)} could only check part of the site (${a.pages_scanned} pages answered).`
          : `Website health ${a.score}/100 from ${(a.completed_at ?? a.created_at).slice(0, 10)}, ${a.pages_scanned} pages checked.`,
      );
      for (const c of a.checks.filter(isAuditProblem)) {
        lines.push(`- (${c.status === "fail" ? "needs fixing" : "could improve"}) ${checkHeadline(c)} [${CHECK_COPY[c.id].technical}]`);
      }
      const skipped = a.checks.filter((x) => x.status === "not_checked");
      if (skipped.length) lines.push(`- Not checked (the pages couldn't be read): ${skipped.map((c) => CHECK_COPY[c.id].technical).join(", ")}`);
      if (o.audit.history.length >= 2) {
        const prev = o.audit.history[o.audit.history.length - 2];
        lines.push(`Previous audit score: ${prev.score} on ${prev.created_at.slice(0, 10)}.`);
      }
    } else {
      lines.push(o.audit.state === "setup_required" ? "(Site Audit is not set up in this environment.)" : "(No site audit has been run yet.)");
    }

    lines.push("", "# AI visibility (GEO)");
    if (o.geo.state === "ok" && o.geo.summary.searchesTracked > 0) {
      const g = o.geo.summary;
      lines.push(
        g.visibility === null
          ? "None of the checked searches produced an AI answer."
          : `Appears in ${g.appears} of ${g.answered} AI answers (${g.visibility}%). Named ${g.mentions} times, linked ${g.citations} times. Last checked ${g.lastCheckedAt?.slice(0, 10)}.`,
      );
      for (const e of g.engines) {
        lines.push(`- ${e.label}: ${!e.enabled && e.checked === 0 ? "not turned on" : e.checked === 0 ? "not checked yet" : `${e.appears} of ${e.answered} answers mention the brand`}`);
      }
      lines.push("- Gemini and Perplexity: not checked by VSI.");
      if (g.competitors.length) lines.push(`Competitors linked in AI answers: ${g.competitors.slice(0, 5).map((c) => `${c.domain} (${c.answers})`).join(", ")}.`);
      if (g.trend.length >= 2) lines.push(`AI visibility trend: ${g.trend.map((t) => `${t.date} ${t.value}%`).join(", ")}.`);
    } else {
      lines.push("(No AI answer checks have been run yet.)");
    }

    lines.push("", "# Google rankings");
    if (o.search.state === "ok" && o.search.summary.tracked > 0) {
      const r = o.search.summary;
      lines.push(`${r.top10} of ${r.tracked} searches on Google's first page. ${r.improved} moved up and ${r.declined} moved down since the previous check.`);
    } else {
      lines.push("(No Google ranking checks yet.)");
    }

    lines.push("", "# Competitors the user added to this project");
    const tracked = o.competitors.competitors.map((c) => c.domain);
    if (o.competitors.state === "setup_required") lines.push("(Saving competitors isn't set up in this environment yet.)");
    else if (tracked.length === 0) lines.push("(None added. VSI still lists competitors it discovers in checks.)");
    else {
      const aiCounts = o.geo.state === "ok" ? o.geo.summary.competitors : [];
      for (const d of tracked) {
        const seen = aiCounts.filter((c) => c.domain === d || c.domain.endsWith(`.${d}`));
        lines.push(`- ${d}: ${seen.length ? `linked in ${Math.max(...seen.map((c) => c.answers))} AI answers checked` : "not linked in any AI answer checked so far"}`);
      }
    }

    lines.push("", "# Tasks");
    if (o.tasks) {
      const t = o.tasks;
      lines.push(`${t.todo} to do, ${t.inProgress} in progress, ${t.doneLast30} done in the last 30 days, ${t.verified} confirmed by a re-check.`);
    } else lines.push("(No tasks yet.)");

    lines.push("", "# Findings, most urgent first (what VSI recommends)");
    if (o.findings.length === 0) lines.push("(No open findings.)");
    for (const f of o.findings.slice(0, 12)) lines.push(`- [${f.sourceLabel}] ${f.title}: ${f.whatWeFound} What to do: ${f.whatToDo}`);
    return lines.join("\n");
  } catch (e) {
    console.error("[chat-context] project findings failed", e);
    return "(Project findings could not be loaded. Say so if asked about audits, AI visibility or rankings.)";
  }
}
