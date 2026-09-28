import { notFound } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import type { ReportContent, KeywordRow } from "@/lib/report-builder";
import type { KeywordReportContent } from "@/lib/keyword-report-builder";
import type { SharedReportRow } from "@/lib/report-share";
import PrintButton from "@/components/PrintButton";
import KeywordReportView from "@/components/KeywordReportView";

export const dynamic = "force-dynamic";

const GAP_LABELS: Record<string, string> = {
 aligned: "Aligned",
 aligned_no_mention: "Ranking & Cited, Unnamed",
 ai_mentioned: "AI Mentioned",
 search_strong_ai_invisible: "AI Invisible",
 weak_double_loss: "Double Loss",
 geo_cited: "AI Overview Cited & Named",
 geo_cited_no_mention: "AI Overview Cited, Unnamed",
 geo_mentioned: "AI Overview Mentioned",
 geo_invisible: "AI Overview Invisible",
 geo_no_aio: "No AI Trigger",
 seo_ranked: "Ranked",
 seo_ranked_no_aio: "Ranked, No AI",
 seo_not_ranked: "Not Ranked",
};

const HERO_TONE: Record<string, { ring: string; text: string }> = {
 good: { ring: "ring-positive/30", text: "text-positive" },
 bad: { ring: "ring-critical/30", text: "text-critical" },
 neutral: { ring: "ring-brand/40", text: "text-brand-strong" },
};

function shortDate(d: string | Date) {
 return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default async function PublicReportPage({ params }: { params: Promise<{ token: string }> }) {
 const { token } = await params;
 const supabase = await createClient();
 // Reports are not readable as a table without signing in (migration 043). The token is checked
 // in the database: get_shared_report returns at most this one report, and only while the link
 // is valid (or the viewer belongs to the report's organization).
 const { data: rows, error } = await supabase.rpc("get_shared_report", { p_token: token });
 const row = (Array.isArray(rows) ? rows[0] : rows) as SharedReportRow | undefined;

 if (error) {
 console.error("[/r/:token] supabase error:", error);
 notFound();
 }
 // Expiry is enforced by get_shared_report: an expired link returns no row for the public, while
 // members of the report's own organization can still open it (e.g. from the keyword page).
 if (!row) notFound();

 // Reports that haven't finished generating shouldn't render the report
 // shell. A small placeholder is friendlier than a 404.
 if (row.status === "pending") {
 return (
 <div className="min-h-screen flex items-center justify-center bg-surface-2 px-6">
 <div className="max-w-md text-center">
 <div className="mx-auto mb-4 h-10 w-10 rounded-full border-4 border-brand/40 border-t-amber-500 animate-spin" />
 <h1 className="text-title font-semibold text-ink">Generating your report…</h1>
 <p className="text-body text-ink-3 mt-1">This page refreshes automatically. Usually under a minute.</p>
 </div>
 <meta httpEquiv="refresh" content="5" />
 </div>
 );
 }
 if (row.status === "failed") {
 return (
 <div className="min-h-screen flex items-center justify-center bg-surface-2 px-6">
 <div className="max-w-md text-center">
 <h1 className="text-title font-semibold text-ink">Report could not be generated</h1>
 <p className="text-body text-ink-3 mt-2">Open VSI and try generating it again.</p>
 </div>
 </div>
 );
 }

 // New per-keyword report types branch into a dedicated view.
 if (row.type === "keyword_summary" || row.type === "keyword_detailed" || row.type === "keyword_tasks") {
 const kwContent = row.content as KeywordReportContent | null;
 if (!kwContent || kwContent.schema !== "vsi-keyword-report-v1") {
 console.error("[/r/:token] malformed keyword report content", token);
 notFound();
 }
 return <KeywordReportView content={kwContent} />;
 }

 const raw = row.content as Partial<ReportContent> | null;
 if (!raw || !raw.branding || !raw.client || !Array.isArray(raw.hero)) {
 console.error("[/r/:token] malformed content for token", token, raw);
 notFound();
 }

 const c: ReportContent = {
 schema: raw.schema ?? "vsi-report-v1",
 generatedAt: raw.generatedAt ?? row.generated_at ?? new Date().toISOString(),
 rangeLabel: raw.rangeLabel ?? "",
 branding: {
 displayName: raw.branding!.displayName ?? "Search Intelligence",
 logoUrl: raw.branding!.logoUrl ?? null,
 primaryColor: raw.branding!.primaryColor ?? "#F59E0B",
 supportEmail: raw.branding!.supportEmail ?? null,
 footer: raw.branding!.footer ?? null,
 },
 client: raw.client!,
 hero: raw.hero ?? [],
 wins: raw.wins ?? [],
 losses: raw.losses ?? [],
 opportunities: raw.opportunities ?? [],
 totalKeywords: raw.totalKeywords ?? 0,
 websiteHealth: raw.websiteHealth ?? null,
 completedTasks: raw.completedTasks ?? null,
 competitors: raw.competitors ?? [],
 };
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

 {/* Sticky print bar */}
 <div className="no-print sticky top-0 z-20 bg-surface border-b border-line">
 <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
 <p className="text-caption text-ink-3">
 Generated {shortDate(c.generatedAt)}
 </p>
 <PrintButton color={color} />
 </div>
 </div>

 {/* The actual "paper" */}
 <div className="max-w-4xl mx-auto my-6 print:my-0">
 <div className="print-page bg-surface rounded-panel border border-line overflow-hidden">

 {/* HEADER — full-bleed brand bar */}
 <div
 className="relative px-8 sm:px-12 pt-10 pb-8 print:py-6"
 style={{
 borderBottom: `3px solid ${color}`,
 }}
 >
 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
 <div className="flex items-center gap-4 min-w-0">
 {c.branding.logoUrl ? (
 <div className="h-16 w-16 rounded-panel bg-surface border border-line p-2 shrink-0 flex items-center justify-center">
 <Image
 src={c.branding.logoUrl}
 alt={c.branding.displayName}
 width={56}
 height={56}
 className="object-contain max-h-12"
 unoptimized
 />
 </div>
 ) : (
 <div
 className="h-16 w-16 rounded-panel flex items-center justify-center text-white font-semibold text-xl shrink-0"
 style={{ backgroundColor: color }}
 >
 {c.branding.displayName.charAt(0).toUpperCase()}
 </div>
 )}
 <div className="min-w-0">
 <p className="text-body font-medium" style={{ color }}>
 {c.branding.displayName}
 </p>
 <h1 className="mt-1 text-[1.75rem] font-semibold leading-9 tracking-[-0.02em] text-ink sm:text-[2rem] sm:leading-10">
 Search Visibility Report
 </h1>
 <p className="text-body text-ink-2 mt-1">{c.rangeLabel}</p>
 </div>
 </div>
 <div className="text-left sm:text-right shrink-0 border-l-0 sm:border-l border-line sm:pl-6">
 <p className="text-caption text-ink-3">Prepared for</p>
 <p className="text-lg font-semibold text-ink mt-0.5">{c.client.name}</p>
 {c.client.website && (
 <p className="text-caption text-ink-3 mt-0.5">{c.client.website}</p>
 )}
 </div>
 </div>
 </div>

 {/* HERO METRICS */}
 <section className="px-8 sm:px-12 pt-8 avoid-break">
 <div className="grid grid-cols-2 border-y border-line lg:grid-cols-4 lg:divide-x lg:divide-line">
 {c.hero.map((m, i) => {
 const tone = m.tone ? HERO_TONE[m.tone] : null;
 return (
 <div
 key={i}
 className="py-5 pr-4 lg:px-5 lg:first:pl-0"
 >
 <p className="text-caption text-ink-3 font-medium">
 {m.label}
 </p>
 <p className={`mt-2 text-[1.75rem] font-semibold leading-8 tracking-[-0.02em] tabular ${tone?.text ?? "text-ink"}`}>
 {m.value}
 </p>
 {m.sub && (
 <p className="text-caption text-ink-3 mt-1 leading-relaxed">{m.sub}</p>
 )}
 </div>
 );
 })}
 </div>
 </section>

 {/* CONTENT SECTIONS */}
 <div className="px-8 sm:px-12 py-8 space-y-10">

 {c.websiteHealth && (
 <Section
 title="Website health"
 subtitle={`Site audit of ${c.websiteHealth.pagesChecked} pages on ${shortDate(c.websiteHealth.checkedAt)}`}
 accent={color}
 >
 <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
 <p className="text-4xl font-semibold text-ink tabular-nums">
 {c.websiteHealth.score}
 <span className="ml-1 text-base font-normal text-ink-3">/ 100</span>
 </p>
 {c.websiteHealth.previousScore !== null && (
 <p className="text-body text-ink-2">
 {c.websiteHealth.score === c.websiteHealth.previousScore
 ? "No change since the previous audit"
 : c.websiteHealth.score > c.websiteHealth.previousScore
 ? `Up ${c.websiteHealth.score - c.websiteHealth.previousScore} since the previous audit (${c.websiteHealth.previousScore})`
 : `Down ${c.websiteHealth.previousScore - c.websiteHealth.score} since the previous audit (${c.websiteHealth.previousScore})`}
 </p>
 )}
 </div>
 {c.websiteHealth.issues.length > 0 ? (
 <ul className="mt-4 space-y-1.5 text-body text-ink-2">
 {c.websiteHealth.issues.map((issue) => (
 <li key={issue} className="flex gap-2">
 <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-ink-3" />
 {issue}
 </li>
 ))}
 </ul>
 ) : (
 <p className="mt-3 text-body text-ink-2">
 {c.websiteHealth.notChecked
 ? `No problems found in the checks we could run. ${c.websiteHealth.notChecked} couldn't be checked because some pages didn't load.`
 : "Every check passed in the latest audit."}
 </p>
 )}
 </Section>
 )}

 {c.wins.length > 0 && (
 <Section
 title="Wins this period"
 subtitle="Keywords that improved in rank or gained AI Overview citations"
 accent="var(--positive)"
 badge={`+${c.wins.length}`}
 badgeBg="bg-positive-soft"
 badgeText="text-positive"
 >
 <KeywordTable rows={c.wins} showDelta highlightDelta="good" />
 </Section>
 )}

 {c.losses.length > 0 && (
 <Section
 title="Where we lost ground"
 subtitle="Keywords that dropped in rank or lost citations vs last week"
 accent="var(--critical)"
 badge={`-${c.losses.length}`}
 badgeBg="bg-critical-soft"
 badgeText="text-critical"
 >
 <KeywordTable rows={c.losses} showDelta highlightDelta="bad" />
 </Section>
 )}

 {c.opportunities.length > 0 && (
 <Section
 title="Opportunities to capture"
 subtitle="Competitors are visible here but you aren't. Each one is a page worth improving, with a known target."
 accent={color}
 badge={String(c.opportunities.length)}
 badgeBg="bg-brand-soft"
 badgeText="text-brand-strong"
 >
 <KeywordTable rows={c.opportunities} showDelta={false} />
 </Section>
 )}

 {c.competitors && c.competitors.length > 0 && (
 <Section
 title="Competitors in AI answers"
 subtitle="How many of the AI answers checked link to each competitor. Competitors chosen for this report's business are listed first."
 accent={color}
 >
 <ul className="divide-y divide-line rounded-control border border-line">
 {c.competitors.map((comp) => (
 <li key={comp.domain} className="flex items-center justify-between gap-4 px-4 py-2.5 text-body">
 <span className="text-ink">
 {comp.domain}
 {comp.tracked && <span className="ml-2 text-caption text-ink-3">Tracked competitor</span>}
 </span>
 <span className="tabular-nums text-ink-2">
 {comp.aiAnswers} {comp.aiAnswers === 1 ? "answer" : "answers"}
 </span>
 </li>
 ))}
 </ul>
 </Section>
 )}

 {c.completedTasks && (
 <Section
 title="Work completed this period"
 subtitle={`${c.completedTasks.total} ${c.completedTasks.total === 1 ? "task" : "tasks"} finished${c.completedTasks.verified > 0 ? `, ${c.completedTasks.verified} confirmed by a re-check` : ""}`}
 accent="var(--positive)"
 >
 <ul className="space-y-2 text-body">
 {c.completedTasks.items.map((t, i) => (
 <li key={i} className="flex items-start justify-between gap-4">
 <span className="text-ink">{t.title}</span>
 <span className="shrink-0 text-caption text-ink-3">
 {shortDate(t.completedAt)}
 {t.verified ? " · Confirmed" : ""}
 </span>
 </li>
 ))}
 </ul>
 </Section>
 )}

 {c.wins.length === 0 && c.losses.length === 0 && c.opportunities.length === 0 && (
 <div className="rounded-panel border border-dashed border-line-strong p-10 text-center">
 <p className="text-body text-ink-3">No ranking or AI citation changes to compare this period.</p>
 <p className="text-caption text-ink-3 mt-1">
 Wins, drops and opportunities appear here once there are checks from two consecutive weeks to compare.
 </p>
 </div>
 )}
 </div>

 {/* FOOTER */}
 <footer className="px-8 sm:px-12 py-6 border-t border-line bg-surface-2">
 <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
 <div>
 <p className="text-body text-ink-2 font-medium">
 {c.branding.displayName}
 </p>
 {c.branding.footer && (
 <p className="text-caption text-ink-2 leading-relaxed whitespace-pre-wrap mt-1.5 max-w-xl">
 {c.branding.footer}
 </p>
 )}
 </div>
 {c.branding.supportEmail && (
 <a
 href={`mailto:${c.branding.supportEmail}`}
 className="text-caption text-ink-2 hover:underline shrink-0"
 style={{ color }}
 >
 {c.branding.supportEmail}
 </a>
 )}
 </div>
 </footer>
 </div>
 </div>
 </div>
 );
}

// ── Components ───────────────────────────────────────────────────

function Section({
 title,
 subtitle,
 accent,
 badge,
 badgeBg,
 badgeText,
 children,
}: {
 title: string;
 subtitle?: string;
 accent: string;
 badge?: string;
 badgeBg?: string;
 badgeText?: string;
 children: React.ReactNode;
}) {
 return (
 <section className="avoid-break">
 <div className="flex items-baseline gap-3 mb-1">
 <span
 className="inline-block w-1.5 h-6 rounded-full mt-0.5"
 style={{ backgroundColor: accent }}
 />
 <h2 className="text-[1.1875rem] font-semibold leading-7 tracking-[-0.01em] text-ink">{title}</h2>
 {badge && (
 <span className={`rounded-full px-2 py-0.5 text-caption font-semibold ${badgeBg} ${badgeText}`}>
 {badge}
 </span>
 )}
 </div>
 {subtitle && (
 <p className="text-caption text-ink-3 ml-4 mb-4 leading-relaxed">{subtitle}</p>
 )}
 <div className="mt-3">{children}</div>
 </section>
 );
}

function KeywordTable({
 rows,
 showDelta,
 highlightDelta,
}: {
 rows: KeywordRow[];
 showDelta: boolean;
 highlightDelta?: "good" | "bad";
}) {
 return (
 <div className="rounded-panel border border-line overflow-hidden bg-surface">
 <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2.5 bg-surface-2 text-caption text-ink-3 font-medium border-b border-line">
 <div className="col-span-5">Keyword</div>
 <div className="col-span-2 text-center">Rank</div>
 <div className="col-span-2 text-center">AI Overview</div>
 <div className="col-span-2 text-center">ChatGPT</div>
 <div className="col-span-1 text-right">Status</div>
 </div>
 {rows.map((r, i) => {
 const deltaRowClass =
 showDelta && r.rankDelta != null && highlightDelta === "good" && r.rankDelta > 0
 ? "bg-positive-soft/40"
 : showDelta && r.rankDelta != null && highlightDelta === "bad" && r.rankDelta < 0
 ? "bg-critical-soft/40"
 : "";
 return (
 <div
 key={i}
 className={`border-t border-line px-4 py-3 text-caption flex flex-col gap-2 sm:grid sm:grid-cols-12 sm:gap-2 sm:items-center ${deltaRowClass}`}
 >
 <div className="sm:col-span-5 font-medium text-ink sm:truncate">{r.keyword}</div>

 <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:contents">
 <div className="sm:col-span-2 sm:text-center">
 <span className="text-ink-3 sm:hidden">Rank:</span>{" "}
 {r.rank ? (
 <span className="text-info font-semibold">#{r.rank}</span>
 ) : (
 <span className="text-ink-3">Not checked</span>
 )}
 {showDelta && r.rankDelta != null && r.rankDelta !== 0 && (
 <span
 className={`ml-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
 r.rankDelta > 0 ? "bg-positive-soft text-positive" : "bg-critical-soft text-critical"
 }`}
 >
 {r.rankDelta > 0 ? "▲" : "▼"}
 {Math.abs(r.rankDelta)}
 </span>
 )}
 </div>

 <div className="sm:col-span-2 sm:text-center">
 <span className="text-ink-3 sm:hidden">AI Overview:</span>{" "}
 {r.clientCited ? (
 <span className="text-positive font-medium">✓ Cited</span>
 ) : r.mentionedInText ? (
 <span className="text-info font-medium">~ Mentioned</span>
 ) : r.aioPresent ? (
 <span className="text-critical font-medium">✗ Invisible</span>
 ) : (
 <span className="text-ink-3">Not checked</span>
 )}
 </div>

 <div className="sm:col-span-2 sm:text-center">
 <span className="text-ink-3 sm:hidden">ChatGPT:</span>{" "}
 {r.chatgptCited ? (
 <span className="text-positive font-medium">✓ Cited</span>
 ) : r.chatgptMentioned ? (
 <span className="text-info font-medium">~ Mentioned</span>
 ) : (
 <span className="text-ink-3">Not checked</span>
 )}
 </div>

 <div className="sm:col-span-1 sm:text-right text-ink-3 text-caption">
 {GAP_LABELS[r.gap] ?? r.gap}
 </div>
 </div>
 </div>
 );
 })}
 </div>
 );
}
