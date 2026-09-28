import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAgencyApi, apiServerError } from "@/lib/auth";
import { UUID_PATTERN } from "@/lib/project-types";
import { getPromptTemplate, renderPrompt } from "@/lib/prompts";
import { checkAioTopicRelevance } from "@/lib/aio-topic-relevance";
import { safeAiError } from "@/lib/safe-error";
import { track } from "@/lib/track";
import type { AIOCitation, OrganicResult } from "@/types/search";

export const maxDuration = 180;
export const dynamic = "force-dynamic";

export interface OpportunityBrief {
 priorityScore: number;
 situation: string;
 // Legacy 3-step actions. The brief no longer renders these — the dedicated
 // Task List report is the source of truth for executable work. Kept
 // optional so older saved briefs in the DB don't break on read.
 actions?: Array<{
 step: number;
 title: string;
 detail: string;
 effort: "low" | "medium" | "high";
 impact: "low" | "medium" | "high";
 }>;
 contentAngle: string;
 targetedInsight: string;
 // Set when the AIO returned by Google is on a different topic than the
 // tracked keyword (e.g. "GEO" interpreted as geotechnical engineering).
 aioOffTopic?: { actualTopic: string };
 // Data-grounding signal — how much to trust this brief at a glance.
 confidence?: {
 level: "high" | "medium" | "low";
 reasons: string[];
 };
}

const MODEL_CHAIN = [
 "openrouter/auto",
 "z-ai/glm-4.5-air:free",
 "openai/gpt-oss-120b:free",
 "meta-llama/llama-3.3-70b-instruct:free",
];

async function callLLM(prompt: string, apiKey: string): Promise<{ content: string | null; errors: string[] }> {
 const systemPrompt =
 "You are a JSON API for SEO and GEO (Generative Engine Optimization) strategy. " +
 "Respond with only valid JSON. No markdown, no explanation, no extra text.";

 const errors: string[] = [];

 for (const model of MODEL_CHAIN) {
 const controller = new AbortController();
 const timer = setTimeout(() => controller.abort(), 35000);
 try {
 console.log(`[opportunity-brief] trying model: ${model}`);
 const started = Date.now();

 const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
 method: "POST",
 signal: controller.signal,
 headers: {
 "Authorization": `Bearer ${apiKey}`,
 "Content-Type": "application/json",
 "HTTP-Referer": "https://searchintel.valgrowlabs.com",
 "X-Title": "VSI Search Intelligence",
 },
 body: JSON.stringify({
 model,
 messages: [
 { role: "system", content: systemPrompt },
 { role: "user", content: prompt },
 ],
 temperature: 0.2,
 max_tokens: 1200,
 }),
 });

 const elapsed = Date.now() - started;
 console.log(`[opportunity-brief] ${model} responded HTTP ${res.status} in ${elapsed}ms`);

 if (!res.ok) {
 const text = await res.text().catch(() => "");
 errors.push(`${model}: HTTP ${res.status} ${text.slice(0, 200)}`);
 continue;
 }

 const data = await res.json();
 if (data.error) {
 errors.push(`${model}: ${data.error.message ?? data.error.code ?? "error"}`);
 continue;
 }

 const content = data.choices?.[0]?.message?.content?.trim();
 if (!content) {
 errors.push(`${model}: empty response`);
 continue;
 }

 const stripped = content.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
 const match = stripped.match(/\{[\s\S]*\}/);
 return { content: match ? match[0] : stripped, errors };
 } catch (e) {
 const msg = e instanceof Error ? e.message : "network error";
 const isAbort = msg.includes("aborted") || msg.includes("abort");
 errors.push(`${model}: ${isAbort ? "timed out after 35s (free model queue)" : msg}`);
 continue;
 } finally {
 clearTimeout(timer);
 }
 }
 return { content: null, errors };
}

function formatSerpTop10(serp: OrganicResult[] | null | undefined): string {
 if (!serp || serp.length === 0) return "(no SERP data available)";
 return serp.slice(0, 10).map((r) => {
 const snippet = r.snippet ? r.snippet.replace(/\s+/g, " ").slice(0, 200) : "";
 return `${r.position}. ${r.title} — ${r.domain}\n ${snippet}`;
 }).join("\n");
}

function formatCitations(citations: AIOCitation[] | null | undefined): string {
 if (!citations || citations.length === 0) return "(none)";
 return citations.slice(0, 30).map((c) => {
 const flag = c.isClient ? " ← CLIENT" : "";
 return `${c.position}. ${c.sourceName || c.domain}${flag} (${c.domain})`;
 }).join("\n");
}

export async function POST(req: NextRequest) {
 const session = await requireAgencyApi();
 if (session instanceof Response) return session;

 const apiKey = process.env.OPENROUTER_API_KEY;
 if (!apiKey) {
 return NextResponse.json({ error: "LLM service unavailable" }, { status: 503 });
 }

 try {
 const body = await req.json() as { trackedKeywordId?: string };
 const { trackedKeywordId } = body;
 if (!trackedKeywordId || typeof trackedKeywordId !== "string" || !UUID_PATTERN.test(trackedKeywordId)) {
 return NextResponse.json({ error: "trackedKeywordId is required" }, { status: 400 });
 }

 const supabase = await createClient();
 const isSuperAdmin = session.role === "super_admin";

 // Fetch the tracked keyword + client. Super admin can act on any agency.
 let kwQuery = supabase
 .from("tracked_keywords")
 .select("id, keyword, track_type, agency_id, client_id, clients(brand_name, name, website)")
 .eq("id", trackedKeywordId);
 if (!isSuperAdmin) {
 kwQuery = kwQuery.eq("agency_id", session.agencyId);
 }
 const { data: kw } = await kwQuery.single();
 if (!kw) return NextResponse.json({ error: "Keyword not found" }, { status: 404 });
 const owningAgencyId = (kw.agency_id as string) ?? session.agencyId;

 const clientArr = kw.clients as unknown as { brand_name: string | null; name: string; website: string | null }[] | { brand_name: string | null; name: string; website: string | null } | null;
 const clientRow = Array.isArray(clientArr) ? clientArr[0] ?? null : clientArr;
 const clientBrand = clientRow?.brand_name ?? clientRow?.name ?? "Client";
 const clientDomain = clientRow?.website ?? "";

 // Always pull the LATEST snapshot — never trust a client-side cache.
 const { data: latest } = await supabase
 .from("search_results")
 .select("rank_position, aio_present, client_cited, mentioned_in_text, cited_domains, aio_full_text, aio_snippet, citations_json, serp_results_json, gap_label, chatgpt_checked, chatgpt_response, chatgpt_brand_cited, chatgpt_brand_mentioned, chatgpt_competitors, created_at")
 .eq("tracked_keyword_id", trackedKeywordId)
 .order("created_at", { ascending: false })
 .limit(1)
 .maybeSingle();
 if (!latest) {
 return NextResponse.json({ error: "No pipeline runs yet for this keyword — run the pipeline first." }, { status: 400 });
 }

 const keyword = kw.keyword as string;
 const rankPosition = latest.rank_position as number | null;
 const aioPresent = latest.aio_present as boolean | null;
 const clientCited = latest.client_cited as boolean | null;
 const mentionedInText = latest.mentioned_in_text as boolean | null;
 const citedDomains = (latest.cited_domains as string[] | null) ?? [];
 const aioFullText = (latest.aio_full_text as string | null) ?? latest.aio_snippet as string | null;
 const citations = latest.citations_json as AIOCitation[] | null;
 const serp = latest.serp_results_json as OrganicResult[] | null;
 const gapLabel = latest.gap_label as string;

 // Topic-relevance pre-check — only when AIO actually returned content.
 let offTopic: { onTopic: boolean; actualTopic: string } | null = null;
 if (aioPresent && aioFullText && aioFullText.length > 50) {
 offTopic = await checkAioTopicRelevance({
 keyword,
 clientBrand,
 clientDomain,
 aioText: aioFullText,
 apiKey,
 });
 }

 const competitorList = citedDomains.slice(0, 8).join(", ") || "none detected";
 const today = new Date();
 const todayLabel = today.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
 const currentYear = today.getFullYear();

 const aioBlock = aioFullText
 ? `AIO answer text (verbatim, may exceed snippet shown in UI):\n"""\n${aioFullText.slice(0, 2500)}\n"""`
 : "AIO answer text: (none — Google did not return an AI answer for this query)";

 // ChatGPT visibility signal — a second AI surface buyers ask on. Helps
 // the diagnosis see whether the brand wins or loses in conversational AI
 // even when Google AIO is silent.
 const chatgptResponse = latest.chatgpt_response as string | null;
 const chatgptChecked = !!latest.chatgpt_checked;
 const chatgptCited = !!latest.chatgpt_brand_cited;
 const chatgptMentioned = !!latest.chatgpt_brand_mentioned;
 const chatgptCompetitors = (latest.chatgpt_competitors as string[] | null) ?? [];
 const chatgptBlock = chatgptChecked
 ? `ChatGPT-class response for this query (verbatim, used as a second AI signal):\n"""\n${(chatgptResponse ?? "").slice(0, 1500)}\n"""\nClient cited by ChatGPT: ${chatgptCited ? "Yes" : "No"}\nClient mentioned by ChatGPT: ${chatgptMentioned ? "Yes" : "No"}\nCompetitors named by ChatGPT: ${chatgptCompetitors.slice(0, 8).join(", ") || "none"}`
 : "ChatGPT response: (not captured for this snapshot)";

 const offTopicBlock = offTopic && !offTopic.onTopic
 ? `\n⚠️ AIO TOPIC MISMATCH DETECTED.\nGoogle's AI Overview answer for "${keyword}" is actually about: "${offTopic.actualTopic}". This means Google has misinterpreted the query intent. Recommend disambiguation / entity-clarification strategy (not citation injection — the AIO is not about ${clientBrand}'s industry).`
 : "";

 const template = await getPromptTemplate("opportunity_brief");
 const prompt = renderPrompt(template, {
 todayLabel,
 currentYear,
 clientBrand,
 clientDomain,
 keyword,
 rankPosition: rankPosition ? `#${rankPosition}` : "Not ranking",
 aioPresent: aioPresent ? "Yes" : "No",
 clientCited: clientCited ? "Yes" : "No",
 mentionedInText: mentionedInText ? "Yes" : "No",
 gapLabel: gapLabel.replace(/_/g, " "),
 competitorList,
 aioBlock: aioBlock + "\n\n" + chatgptBlock,
 serpTop10: formatSerpTop10(serp),
 citationsTable: formatCitations(citations),
 offTopicBlock,
 });

 const { content: raw, errors } = await callLLM(prompt, apiKey);
 if (!raw) {
 console.error("[opportunity-brief] callLLM failed:", errors);
 return NextResponse.json(
 { error: safeAiError(errors.slice(-1)[0]) },
 { status: 502 }
 );
 }

 let brief: OpportunityBrief;
 try {
 brief = JSON.parse(raw) as OpportunityBrief;
 } catch {
 return NextResponse.json(
 { error: "AI returned invalid JSON. Try regenerating." },
 { status: 502 }
 );
 }

 if (offTopic && !offTopic.onTopic) {
 brief.aioOffTopic = { actualTopic: offTopic.actualTopic };
 }

 // ── Confidence score ─────────────────────────────────────
 // Lightweight rules over the snapshot: rewards fresh, complete
 // data; penalises sparse SERP, off-topic AIO, or stale runs.
 {
 const reasons: string[] = [];
 let score = 0;
 const ageDays = (Date.now() - new Date(latest.created_at).getTime()) / 86400000;
 if (ageDays <= 7) { score += 2; reasons.push("Snapshot is recent (≤7 days)"); }
 else if (ageDays <= 30) { score += 1; reasons.push("Snapshot is within 30 days"); }
 else { reasons.push(`Snapshot is ${Math.round(ageDays)} days old — re-run for fresher data`); }

 const serpCount = serp?.length ?? 0;
 if (serpCount >= 8) { score += 2; reasons.push(`${serpCount} SERP results captured`); }
 else if (serpCount >= 4) { score += 1; reasons.push(`Only ${serpCount} SERP results — partial signal`); }
 else if (serpCount > 0) { reasons.push("Sparse SERP data — recommendations may be thin"); }

 if (aioPresent) {
 score += 1;
 if ((citations?.length ?? 0) >= 5) {
 score += 1;
 reasons.push(`${citations?.length ?? 0} AI Overview citations captured`);
 } else {
 reasons.push("AI Overview present but few citations to analyse");
 }
 } else {
 reasons.push("No AI Overview answer for this query — brief is rank-focused only");
 }

 if (offTopic && !offTopic.onTopic) {
 score -= 2;
 reasons.push("Google interpreted the query differently — recommendations are disambiguation, not citation injection");
 }

 const level: "high" | "medium" | "low" = score >= 4 ? "high" : score >= 2 ? "medium" : "low";
 brief.confidence = { level, reasons };
 }

 track({
 agencyId: owningAgencyId,
 userId: session.userId,
 type: "brief_generated",
 payload: {
 tracked_keyword_id: trackedKeywordId,
 gap_label: gapLabel,
 confidence: brief.confidence?.level,
 rank_position: rankPosition,
 aio_present: aioPresent,
 off_topic: !!(offTopic && !offTopic.onTopic),
 },
 });

 try {
 await supabase
 .from("tracked_keywords")
 .update({
 ai_brief: brief,
 ai_brief_at: new Date().toISOString(),
 ai_brief_gap: gapLabel,
 ai_brief_snapshot: {
 gapLabel,
 rankPosition,
 aioPresent,
 clientCited,
 mentionedInText,
 citedDomainCount: citedDomains.length,
 citedDomainsHash: citedDomains.slice().sort().join("|"),
 },
 })
 .eq("id", trackedKeywordId)
 .eq("agency_id", owningAgencyId);
 } catch (e) {
 console.error("[opportunity-brief] failed to persist brief", e);
 }

 return NextResponse.json(brief);
 } catch (err) {
 return apiServerError("opportunity-brief", err, "Failed to generate brief");
 }
}
