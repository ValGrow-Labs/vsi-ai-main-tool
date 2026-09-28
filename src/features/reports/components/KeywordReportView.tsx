import Image from "next/image";
import PrintButton from "@/components/PrintButton";
import type {
 KeywordReportContent,
 KeywordReportBranding,
 SummaryNarrative,
 DetailedNarrative,
 TasksNarrative,
 KeywordReportSnapshot,
 KeywordReportHistoryRow,
} from "@/lib/keyword-report-builder";

const TYPE_LABEL: Record<KeywordReportContent["type"], string> = {
 keyword_summary: "Executive Summary",
 keyword_detailed: "Detailed Strategy Report",
 keyword_tasks: "Execution Task List",
};

const GROUP_COLOR: Record<"Content" | "Technical" | "Off-page", string> = {
 Content: "bg-info-soft border-info/30 text-info",
 Technical: "bg-surface-2 border-line text-ink-2",
 "Off-page": "bg-positive-soft border-positive/30 text-positive",
};

const OWNER_COLOR: Record<"Writer" | "Developer" | "SEO" | "Outreach", string> = {
 Writer: "bg-info-soft text-info",
 Developer: "bg-surface-2 text-ink-2",
 SEO: "bg-attention-soft text-attention",
 Outreach: "bg-positive-soft text-positive",
};

const EFFORT_LABEL: Record<"S" | "M" | "L", string> = {
 S: "Small · hours",
 M: "Medium · 1-2 days",
 L: "Large · 3+ days",
};

function shortDate(d: string) {
 return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function KeywordReportView({ content }: { content: KeywordReportContent }) {
 const c = content;
 const color = c.branding.primaryColor;

 return (
 <div className="min-h-screen bg-surface-2 text-ink">
 <style>{`
 @media print {
 @page { size: A4; margin: 14mm; }
 .no-print { display: none !important; }
 body { background: white !important; }
 .print-page { background: white !important; box-shadow: none !important; padding: 0 !important; }
 .avoid-break { page-break-inside: avoid; }
 }
 `}</style>

 <div className="no-print sticky top-0 z-20 bg-surface border-b border-line">
 <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
 <p className="text-caption text-ink-3">Confidential · Generated {shortDate(c.generatedAt)}</p>
 <PrintButton color={color} />
 </div>
 </div>

 <div className="max-w-4xl mx-auto my-6 print:my-0">
 <div className="print-page bg-surface rounded-panel border border-line overflow-hidden">
 <ReportHeader branding={c.branding} client={c.client} keyword={c.keyword} type={c.type} />

 {c.aioOffTopic && (
 <div className="px-8 sm:px-12 pt-6">
 <div className="rounded-control border border-critical/30 bg-critical-soft px-4 py-3">
 <p className="text-caption font-semibold text-critical mb-1">AI Overview topic mismatch</p>
 <p className="text-body text-ink">
 Google&rsquo;s AI Overview answer for this query is actually about <strong>{c.aioOffTopic.actualTopic}</strong>, not the client&rsquo;s industry. The recommendations below are a disambiguation strategy, not citation injection.
 </p>
 </div>
 </div>
 )}

 {/* Body - dispatch by type */}
 <div className="px-8 sm:px-12 py-8 space-y-10">
 <SnapshotStrip snapshot={c.snapshot} />

 {c.type === "keyword_summary" && <SummaryBody narrative={c.narrative} />}
 {c.type === "keyword_detailed" && <DetailedBody narrative={c.narrative} snapshot={c.snapshot} history={c.history} />}
 {c.type === "keyword_tasks" && <TasksBody narrative={c.narrative} />}
 </div>

 <ReportFooter branding={c.branding} color={color} />
 </div>
 </div>
 </div>
 );
}

// ─── Shared bits ────────────────────────────────────────────────

function ReportHeader({
 branding, client, keyword, type,
}: { branding: KeywordReportBranding; client: KeywordReportContent["client"]; keyword: string; type: KeywordReportContent["type"] }) {
 const color = branding.primaryColor;
 return (
 <div
 className="relative px-8 sm:px-12 pt-10 pb-8 print:py-6"
 style={{
 background: `linear-gradient(135deg, ${color}10 0%, ${color}05 50%, transparent 100%)`,
 borderBottom: `3px solid ${color}`,
 }}
 >
 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
 <div className="flex items-center gap-4 min-w-0">
 {branding.logoUrl ? (
 <div className="h-16 w-16 rounded-panel bg-surface border border-line p-2 shrink-0 flex items-center justify-center">
 <Image src={branding.logoUrl} alt={branding.displayName} width={56} height={56} className="object-contain max-h-12" unoptimized />
 </div>
 ) : (
 <div className="h-16 w-16 rounded-panel flex items-center justify-center text-white font-semibold text-xl shrink-0" style={{ backgroundColor: color }}>
 {branding.displayName.charAt(0).toUpperCase()}
 </div>
 )}
 <div className="min-w-0">
 <p className="text-caption font-semibold tracking-[0.18em]" style={{ color }}>{branding.displayName}</p>
 <h1 className="text-display font-semibold text-ink mt-1 leading-tight">{TYPE_LABEL[type]}</h1>
 <p className="text-body text-ink-2 mt-1">Keyword: <strong>&ldquo;{keyword}&rdquo;</strong></p>
 </div>
 </div>
 <div className="text-left sm:text-right shrink-0 border-l-0 sm:border-l border-line sm:pl-6">
 <p className="text-caption text-ink-3 font-medium">Prepared for</p>
 <p className="text-lg font-semibold text-ink mt-0.5">{client.brandName ?? client.name}</p>
 {client.website && <p className="text-caption text-ink-3 mt-0.5">{client.website}</p>}
 </div>
 </div>
 </div>
 );
}

function ReportFooter({ branding, color }: { branding: KeywordReportBranding; color: string }) {
 return (
 <footer className="px-8 sm:px-12 py-6 border-t border-line bg-surface-2">
 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
 <div>
 <p className="text-caption text-ink-3 font-semibold">{branding.displayName}</p>
 {branding.footer && <p className="text-caption text-ink-2 leading-relaxed whitespace-pre-wrap mt-1.5 max-w-xl">{branding.footer}</p>}
 </div>
 {branding.supportEmail && (
 <a href={`mailto:${branding.supportEmail}`} className="text-caption hover:underline shrink-0" style={{ color }}>{branding.supportEmail}</a>
 )}
 </div>
 </footer>
 );
}

function SnapshotStrip({ snapshot }: { snapshot: KeywordReportSnapshot }) {
 const chatgptValue = (() => {
 if (!snapshot.chatgptChecked) return "Not captured";
 if (snapshot.chatgptEntityMatch === false) return "Wrong business";
 if (snapshot.chatgptBrandCited) return "Cited";
 if (snapshot.chatgptBrandMentioned) return "Mentioned";
 return "Not mentioned";
 })();

 const items = [
 { label: "Google rank", value: snapshot.rankPosition ? `#${snapshot.rankPosition}` : "Not in top 10" },
 { label: "AI Overview", value: snapshot.aioPresent ? "Present" : "Not triggered" },
 {
 label: "AIO citation",
 value: snapshot.clientCited ? "Cited" : snapshot.mentionedInText ? "Mentioned" : snapshot.aioPresent ? "Not mentioned" : "-",
 },
 { label: "ChatGPT", value: chatgptValue },
 ];
 return (
 <section className="avoid-break">
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 {items.map((it) => (
 <div key={it.label} className="rounded-panel ring-1 ring-line bg-surface p-4">
 <p className="text-caption text-ink-3 font-semibold">{it.label}</p>
 <p className="text-xl font-semibold text-ink mt-1">{it.value}</p>
 </div>
 ))}
 </div>
 <p className="text-caption text-ink-3 mt-2">Snapshot captured {shortDate(snapshot.capturedAt)}</p>
 </section>
 );
}

// ─── Summary body ───────────────────────────────────────────────

function SummaryBody({ narrative }: { narrative: SummaryNarrative }) {
 return (
 <>
 <section className="avoid-break">
 <h2 className="text-xl font-semibold text-ink leading-snug">{narrative.headline}</h2>
 <p className="text-body text-ink-2 leading-relaxed mt-3 whitespace-pre-line">{narrative.narrative}</p>
 </section>

 <section className="avoid-break">
 <h3 className="text-body font-semibold text-ink-3 mb-3">What we&rsquo;ll do</h3>
 <div className="space-y-2.5">
 {narrative.priorityActions.map((a, i) => (
 <div key={i} className="rounded-panel border border-line bg-surface p-4">
 <div className="flex items-start gap-3">
 <span className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-caption font-semibold text-white">{i + 1}</span>
 <div className="flex-1 min-w-0">
 <p className="text-body font-semibold text-ink">{a.title}</p>
 <p className="text-caption text-ink-2 mt-0.5 leading-relaxed">{a.why}</p>
 </div>
 </div>
 </div>
 ))}
 </div>
 </section>

 <section className="avoid-break rounded-panel bg-attention-soft border border-line p-4">
 <p className="text-caption font-semibold text-attention mb-1">Why this matters</p>
 <p className="text-body text-ink leading-relaxed">{narrative.whyItMatters}</p>
 </section>

 <section className="avoid-break rounded-panel bg-surface-2 border border-line p-4">
 <p className="text-caption font-semibold text-ink-3 mb-1">Next check-in</p>
 <p className="text-body text-ink">{narrative.nextCheckIn}</p>
 </section>
 </>
 );
}

// ─── Detailed body ──────────────────────────────────────────────

function DetailedBody({
 narrative, snapshot, history,
}: { narrative: DetailedNarrative; snapshot: KeywordReportSnapshot; history: KeywordReportHistoryRow[] }) {
 return (
 <>
 <Section title="Executive summary">
 <p className="text-body text-ink leading-relaxed">{narrative.executiveSummary}</p>
 </Section>

 <Section title="Situation analysis">
 <p className="text-body text-ink leading-relaxed whitespace-pre-line">{narrative.situationAnalysis}</p>
 </Section>

 <Section title="Google SERP - top 10">
 {snapshot.serp.length === 0 ? (
 <p className="text-caption text-ink-3">No SERP data captured.</p>
 ) : (
 <div className="space-y-1">
 {snapshot.serp.slice(0, 10).map((r, i) => (
 <div key={i} className={`rounded-control p-3 border ${r.isClient ? "bg-attention-soft border-line" : "bg-surface-2 border-line"}`}>
 <div className="flex items-baseline gap-3">
 <span className="text-caption font-semibold text-ink-3 w-6 shrink-0">{r.position}.</span>
 <div className="flex-1 min-w-0">
 <p className="text-body font-semibold text-ink">{r.title}</p>
 <p className="text-caption text-ink-3">{r.domain}{r.isClient ? " · CLIENT" : ""}</p>
 {r.snippet && <p className="text-caption text-ink-2 mt-1 leading-relaxed">{r.snippet}</p>}
 </div>
 </div>
 </div>
 ))}
 </div>
 )}
 </Section>

 <Section title="AI Overview answer">
 {snapshot.aioFullText ? (
 <div className="rounded-control bg-surface-2 border border-line p-4">
 <p className="text-body text-ink leading-relaxed whitespace-pre-line">{snapshot.aioFullText.slice(0, 2200)}</p>
 </div>
 ) : (
 <p className="text-caption text-ink-3">Google did not return an AI Overview answer for this query.</p>
 )}
 <p className="text-body text-ink leading-relaxed mt-3 whitespace-pre-line">{narrative.aioAnalysis}</p>
 </Section>

 <Section title="ChatGPT visibility">
 {snapshot.chatgptChecked ? (
 <>
 <div className="flex flex-wrap items-center gap-2 mb-3 text-caption">
 {snapshot.chatgptEntityMatch === false ? (
 <span className="rounded-control bg-brand-soft px-2.5 py-0.5 font-semibold text-brand-strong ring-1 ring-brand/40">⚠ Wrong entity</span>
 ) : (
 <>
 {snapshot.chatgptBrandCited && (
 <span className="rounded-control bg-positive-soft px-2.5 py-0.5 font-semibold text-positive ring-1 ring-positive/30">✓ Cited as source</span>
 )}
 {snapshot.chatgptBrandMentioned && !snapshot.chatgptBrandCited && (
 <span className="rounded-control bg-info-soft px-2.5 py-0.5 font-semibold text-info ring-1 ring-info/30">~ Mentioned</span>
 )}
 {!snapshot.chatgptBrandMentioned && !snapshot.chatgptBrandCited && (
 <span className="rounded-control bg-critical-soft px-2.5 py-0.5 font-semibold text-critical ring-1 ring-critical/30">✗ Not mentioned</span>
 )}
 </>
 )}
 {snapshot.chatgptMentionCount != null && snapshot.chatgptMentionCount > 0 && snapshot.chatgptEntityMatch !== false && (
 <span className="text-caption text-ink-3">{snapshot.chatgptMentionCount}× named</span>
 )}
 {snapshot.chatgptCompetitors.length > 0 && (
 <span className="text-caption text-ink-3">vs {snapshot.chatgptCompetitors.length} competitor{snapshot.chatgptCompetitors.length === 1 ? "" : "s"}</span>
 )}
 </div>

 {snapshot.chatgptEntityMatch === false && (
 <div className="mb-3 rounded-control border border-brand/40 bg-brand-soft p-3">
 <p className="text-caption font-semibold text-brand-strong mb-1">Brand-name collision</p>
 <p className="text-caption text-brand-strong leading-relaxed">
 ChatGPT&rsquo;s answer mentions the brand name but appears to describe{" "}
 <strong>{snapshot.chatgptActualEntity ?? "a different organisation"}</strong>. Treat &ldquo;mentioned&rdquo; as a false positive for this snapshot.
 </p>
 </div>
 )}

 {snapshot.chatgptResponse && (
 <details className="mb-3 rounded-control border border-line bg-surface-2 p-3">
 <summary className="text-caption font-semibold text-ink-2 cursor-pointer">Verbatim ChatGPT response</summary>
 <p className="mt-2 text-caption text-ink-2 leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto">
 {snapshot.chatgptResponse}
 </p>
 </details>
 )}

 {snapshot.chatgptCompetitors.length > 0 && (
 <div className="mb-3">
 <p className="text-caption text-ink-3 font-semibold mb-1">Competitors ChatGPT named</p>
 <div className="flex flex-wrap gap-1.5">
 {snapshot.chatgptCompetitors.map((c, i) => (
 <span key={i} className="rounded-control bg-surface-2 px-2.5 py-0.5 text-caption text-ink-2">{c}</span>
 ))}
 </div>
 </div>
 )}

 <p className="text-body text-ink leading-relaxed whitespace-pre-line">{narrative.chatgptAnalysis}</p>
 </>
 ) : (
 <p className="text-caption text-ink-3">ChatGPT-style check was not captured for this snapshot. {narrative.chatgptAnalysis ? <span className="text-ink-2">{narrative.chatgptAnalysis}</span> : null}</p>
 )}
 </Section>

 <Section title="Competitive landscape">
 <div className="space-y-2">
 {narrative.competitiveLandscape.map((row, i) => (
 <div key={i} className="rounded-control border border-line bg-surface p-3">
 <p className="text-body font-semibold text-ink">{row.domain}</p>
 <p className="text-caption text-ink-2 mt-0.5 leading-relaxed">{row.whyTheyWin}</p>
 </div>
 ))}
 </div>
 </Section>

 <Section title="Recommended strategy">
 <div className="space-y-3">
 {narrative.recommendedStrategy.map((phase, i) => (
 <div key={i} className="rounded-panel border border-line bg-surface p-4">
 <p className="text-caption font-semibold text-attention mb-2">{phase.phase}</p>
 <ul className="list-disc list-inside space-y-1 text-body text-ink">
 {phase.actions.map((a, j) => <li key={j} className="leading-relaxed">{a}</li>)}
 </ul>
 </div>
 ))}
 </div>
 </Section>

 {history.length > 1 && (
 <Section title="History">
 <div className="rounded-control border border-line overflow-hidden">
 <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-surface-2 text-caption text-ink-3 font-semibold">
 <div className="col-span-3">Date</div>
 <div className="col-span-2 text-center">Rank</div>
 <div className="col-span-2 text-center">AIO</div>
 <div className="col-span-2 text-center">Cited</div>
 <div className="col-span-3">Gap</div>
 </div>
 {history.slice(0, 12).map((row, i) => (
 <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2 text-caption border-t border-line items-center">
 <div className="col-span-3 text-ink-2">{shortDate(row.capturedAt)}</div>
 <div className="col-span-2 text-center font-semibold">{row.rankPosition ? <span className="text-info">#{row.rankPosition}</span> : <span className="text-ink-3 text-caption">Not&nbsp;top&nbsp;10</span>}</div>
 <div className="col-span-2 text-center">{row.aioPresent ? <span className="text-attention">Yes</span> : <span className="text-ink-3">No</span>}</div>
 <div className="col-span-2 text-center">{row.clientCited ? <span className="text-positive">✓</span> : <span className="text-ink-3">✗</span>}</div>
 <div className="col-span-3 text-ink-2">{row.gapLabel.replace(/_/g, " ")}</div>
 </div>
 ))}
 </div>
 </Section>
 )}

 <Section title="Risks & assumptions">
 <p className="text-body text-ink leading-relaxed">{narrative.risks}</p>
 </Section>
 </>
 );
}

// ─── Tasks body ─────────────────────────────────────────────────

function TasksBody({ narrative }: { narrative: TasksNarrative }) {
 const groups: Array<"Content" | "Technical" | "Off-page"> = ["Content", "Technical", "Off-page"];

 return (
 <>
 <div className="rounded-panel border border-info/30 bg-info-soft p-4">
 <p className="text-caption font-semibold text-info mb-1">How to use this report</p>
 <p className="text-body text-ink leading-relaxed">
 Each task below is a ready-to-assign ticket with an owner role, effort, impact, and acceptance criteria. Copy any task into ClickUp, Linear, Notion, or your tracker of choice - they&rsquo;re written to be executable without further clarification.
 </p>
 </div>

 {groups.map((group) => {
 const tasks = narrative.tasks.filter((t) => t.group === group);
 if (tasks.length === 0) return null;
 return (
 <Section key={group} title={group}>
 <div className="space-y-3">
 {tasks.map((t) => (
 <div key={t.id} className={`rounded-panel border p-4 ${GROUP_COLOR[t.group]}`}>
 <div className="flex items-start gap-3 mb-2">
 <span className="shrink-0 text-caption font-semibold text-ink-3 bg-surface rounded px-2 py-1 border border-line">{t.id}</span>
 <p className="text-body font-semibold text-ink flex-1">{t.title}</p>
 </div>
 <div className="flex flex-wrap items-center gap-2 mb-2">
 <span className={`rounded-full px-2 py-0.5 text-caption font-semibold ${OWNER_COLOR[t.owner]}`}>{t.owner}</span>
 <span className="rounded-full bg-surface border border-line-strong px-2 py-0.5 text-caption font-semibold text-ink-2">{EFFORT_LABEL[t.effort]}</span>
 <span className="rounded-full bg-surface border border-line-strong px-2 py-0.5 text-caption font-semibold text-ink-2">Impact: {t.impact}</span>
 </div>
 <p className="text-body text-ink leading-relaxed mb-3">{t.description}</p>
 <div>
 <p className="text-caption font-semibold text-ink-3 mb-1">Acceptance criteria</p>
 <ul className="space-y-1">
 {t.acceptanceCriteria.map((ac, i) => (
 <li key={i} className="text-caption text-ink-2 leading-relaxed flex items-start gap-2">
 <span className="shrink-0 text-ink-3 mt-0.5">☐</span>
 <span>{ac}</span>
 </li>
 ))}
 </ul>
 </div>
 </div>
 ))}
 </div>
 </Section>
 );
 })}
 </>
 );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
 return (
 <section className="avoid-break">
 <div className="flex items-baseline gap-3 mb-3">
 <span className="inline-block w-1.5 h-6 rounded-full mt-0.5 bg-ink" />
 <h2 className="text-lg font-semibold text-ink">{title}</h2>
 </div>
 <div>{children}</div>
 </section>
 );
}
