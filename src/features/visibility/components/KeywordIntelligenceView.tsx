"use client";

import type { AIOCitation, OrganicResult } from "@/types/search";
import { PLATFORM_LABELS } from "@/types/search";
import { GAP_CLASSIFICATIONS } from "@/types/search";
import type { GapLabel } from "@/types/search";
import StatusDot from "@/components/ui/StatusDot";

interface Props {
 keyword: string;
 gapLabel: string;
 rankPosition: number | null;
 rankUrl: string | null;
 rankTitle: string | null;
 aioPresent: boolean | null;
 aioFullText: string | null;
 aioSnippet: string | null;
 clientCited: boolean | null;
 mentionedInText: boolean | null;
 citations: AIOCitation[];
 citedDomains?: string[];
 serpResults: OrganicResult[];
 clientDomain: string;
 clientBrand: string;
 aiOverviewPresent?: boolean | null;
 aiOverviewFullText?: string | null;
 aiOverviewCitations?: AIOCitation[];
 aiOverviewClientCited?: boolean | null;
}

const GAP_COLORS: Record<string, string> = {
 aligned: "text-positive",
 aligned_no_mention: "text-info",
 ai_mentioned: "text-info",
 search_strong_ai_invisible: "text-attention",
 weak_double_loss: "text-critical",
 geo_cited: "text-positive",
 geo_cited_no_mention: "text-info",
 geo_mentioned: "text-info",
 geo_invisible: "text-attention",
 geo_no_aio: "text-ink-3",
 seo_ranked: "text-positive",
 seo_ranked_no_aio: "text-positive",
 seo_not_ranked: "text-critical",
};

function normaliseHost(input: string | null | undefined): string {
 if (!input) return "";
 const s = input
 .toLowerCase()
 .replace(/^[a-z]+:\/+/, "")
 .replace(/^www\./, "")
 .split(/[\/?#]/)[0]
 .replace(/:\d+$/, "");
 return s.includes(".") ? s : "";
}
function matchesClientHost(rowHost: string, clientHost: string): boolean {
 if (!rowHost || !clientHost) return false;
 return rowHost === clientHost
 || rowHost.endsWith(`.${clientHost}`)
 || clientHost.endsWith(`.${rowHost}`);
}

export default function KeywordIntelligenceView({
 keyword, gapLabel, rankPosition, rankUrl, rankTitle,
 aioPresent, aioFullText, aioSnippet, clientCited, mentionedInText,
 citations, citedDomains = [], serpResults, clientDomain, clientBrand,
 aiOverviewPresent, aiOverviewFullText, aiOverviewCitations = [], aiOverviewClientCited,
}: Props) {
 const gapInfo = GAP_CLASSIFICATIONS[gapLabel as GapLabel];
 const gapColor = GAP_COLORS[gapLabel] ?? "text-ink-3";
 const displayText = aioFullText ?? aioSnippet;
 const clientHost = normaliseHost(clientDomain);
 const isClientHost = (host: string | null | undefined): boolean =>
 matchesClientHost(normaliseHost(host), clientHost);

 const hasRichCitations = citations.length > 0;
 const hasAnyCitations = hasRichCitations || citedDomains.length > 0;
 const needsRerun = aioPresent && !displayText && !hasAnyCitations;

 const showProvisional = needsRerun;

 return (
 <div className="space-y-5 mt-4 pt-4 border-t border-line font-sans">
 {/* Gap status banner */}
 {showProvisional ? (
 <div className="flex items-start gap-2.5 bg-surface-2 p-3.5 rounded-panel border border-line">
 <span className="mt-1"><StatusDot color="gray" size="md" /></span>
 <div>
 <span className="text-caption font-semibold text-ink">
 AI Overview present - content pending
 </span>
 <p className="text-caption text-ink-3 mt-0.5">
 An AI Overview was triggered for this query. Content extraction is queued - re-run to fetch.
 </p>
 </div>
 </div>
 ) : (
 <div className="flex items-start gap-2.5 bg-surface-2/80 p-3.5 rounded-panel border border-line">
 {gapInfo && <span className="mt-1"><StatusDot color={gapInfo.dot} size="md" /></span>}
 <div>
 <span className={`text-caption font-semibold ${gapColor}`}>
 {gapInfo?.title ?? gapLabel.replace(/_/g, " ")}
 </span>
 {gapInfo?.description && (
 <p className="text-caption text-ink-3 mt-0.5">{gapInfo.description}</p>
 )}
 </div>
 </div>
 )}

 <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">

 {/* SERP Results Panel */}
 <div className="space-y-2.5">
 <div className="flex items-center justify-between">
 <p className="text-caption font-semibold text-ink-3">
 Google SERP - Top {serpResults.length}
 </p>
 {rankPosition && (
 <span className="text-caption text-info font-semibold bg-info-soft border border-info/30 px-2 py-0.5 rounded">
 Your Client: #{rankPosition}
 </span>
 )}
 </div>

 {serpResults.length === 0 ? (
 <p className="text-caption text-ink-3 italic py-4">No SERP data - re-run to capture</p>
 ) : (
 <div className="space-y-1.5">
 {serpResults.map((r, i) => {
 const isClient = isClientHost(r.domain);
 return (
 <a
 key={i}
 href={r.url}
 target="_blank"
 rel="noopener noreferrer"
 className={`flex items-start gap-2.5 rounded-panel px-3 py-2.5 border transition-all ${
 isClient
 ? "bg-attention-soft border-line hover:bg-attention-soft/60 "
 : "bg-surface border-line hover:bg-surface-2"
 }`}
 >
 <span className={`shrink-0 flex h-5 w-5 items-center justify-center rounded-full text-caption font-semibold mt-0.5 ${
 isClient ? "bg-ink text-white" : "bg-line text-ink-2"
 }`}>
 {r.position}
 </span>
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-1.5 flex-wrap">
 <p className={`text-caption font-semibold truncate ${isClient ? "text-attention" : "text-ink"}`}>
 {r.title}
 </p>
 {!isClient && r.platform !== "other" && r.platform !== "brand" && (
 <span className={`shrink-0 rounded px-1 py-0.5 text-caption font-semibold ${PLATFORM_LABELS[r.platform].color}`}>
 {PLATFORM_LABELS[r.platform].label}
 </span>
 )}
 {isClient && (
 <span className="shrink-0 text-caption font-semibold text-attention bg-brand-soft/60 px-1.5 py-0.5 rounded">★ Client</span>
 )}
 </div>
 <p className="text-caption text-ink-3 truncate">{r.domain} →</p>
 </div>
 </a>
 );
 })}
 </div>
 )}
 </div>

 {/* AIO Panel */}
 <div className="space-y-3">
 <div className="flex items-center gap-2">
 <p className="text-caption font-semibold text-ink-3">AI Overview Surface</p>
 <span className={`h-2 w-2 rounded-full ${aioPresent ? "bg-ink" : "bg-line"}`} />
 <span className="text-caption font-semibold text-ink-2">{aioPresent ? "Triggered" : "Not triggered"}</span>
 </div>

 {aioPresent ? (
 <>
 {/* Client signals */}
 <div className="flex flex-wrap gap-2">
 <span className={`rounded-control px-3 py-1 text-caption font-semibold ${clientCited ? "bg-positive-soft text-positive border border-positive/30" : "bg-surface-2 text-ink-3 border border-line"}`}>
 {clientCited ? "Cited as a source" : "Not cited"}
 </span>
 <span className={`rounded-control px-3 py-1 text-caption font-semibold ${mentionedInText ? "bg-info-soft text-info border border-info/30" : "bg-surface-2 text-ink-3 border border-line"}`}>
 {mentionedInText ? "Mentioned in the answer" : "Not mentioned"}
 </span>
 </div>

 {/* AIO Answer */}
 {displayText && (
 <div className="rounded-panel bg-surface border border-line p-4">
 <p className="text-caption font-semibold text-ink-3 mb-2">AI Overview Answer</p>
 <div className="text-caption text-ink-2 leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto pr-1 font-sans">
 {displayText}
 </div>
 </div>
 )}

 {/* Citations */}
 <div>
 <p className="text-caption font-semibold text-ink-3 mb-2">
 AIO Citations ({hasRichCitations ? citations.length : citedDomains.length})
 </p>
 {!hasAnyCitations ? (
 <p className="text-caption text-ink-3 italic">No citation sources logged</p>
 ) : hasRichCitations ? (
 <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
 {citations.map((c, i) => {
 const isClient = isClientHost(c.domain);
 return (
 <a
 key={i}
 href={c.url}
 target="_blank"
 rel="noopener noreferrer"
 className={`flex items-start gap-2.5 rounded-panel px-3 py-2 border transition-all ${
 isClient
 ? "bg-attention-soft border-line hover:bg-attention-soft/60 "
 : "bg-surface border-line hover:bg-surface-2"
 }`}
 >
 <span className={`shrink-0 flex h-5 w-5 items-center justify-center rounded-full text-caption font-semibold mt-0.5 ${
 isClient ? "bg-ink text-white" : "bg-line text-ink-2"
 }`}>
 {c.position}
 </span>
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-1.5 flex-wrap">
 <p className={`text-caption font-semibold ${isClient ? "text-attention" : "text-ink"}`}>
 {c.sourceName}
 </p>
 {isClient && <span className="text-caption font-semibold text-attention bg-brand-soft/60 px-1.5 py-0.5 rounded">★ Client</span>}
 </div>
 <p className="text-caption text-ink-3 truncate">{c.domain} →</p>
 </div>
 </a>
 );
 })}
 </div>
 ) : (
 <div className="space-y-1">
 {citedDomains.map((domain, i) => (
 <div key={i} className="text-caption text-ink-2 bg-surface-2 px-3 py-1.5 rounded-control border border-line">
 {i + 1}. {domain}
 </div>
 ))}
 </div>
 )}
 </div>
 </>
 ) : (
 <div className="rounded-panel bg-surface-2 border border-line p-5 text-center">
 <p className="text-caption text-ink-3 font-medium">No AI Overview for this query</p>
 <p className="text-caption text-ink-3 mt-0.5">Google served traditional organic SERP results</p>
 </div>
 )}
 </div>
 </div>
 </div>
 );
}
