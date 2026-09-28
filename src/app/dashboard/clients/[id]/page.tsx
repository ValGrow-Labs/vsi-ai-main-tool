import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAgency } from "@/lib/auth";
import { SERVICE_TYPE_LABELS, LOCATIONS } from "@/types/search";
import type { ServiceType, Location } from "@/types/search";
import RunButton from "@/components/RunButton";
import OpportunityPanel from "@/components/OpportunityPanel";
import { Globe, MapPin, Briefcase, Calendar, Plus, ExternalLink, ArrowRight, Activity, ShieldCheck, CheckCircle2, Lightbulb } from "lucide-react";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
 const { id } = await params;
 const supabase = await createClient();
 const session = await requireAgency();

  const isSuperAdmin = session.role === "super_admin";
  let client: any = null;

  try {
    const clientQuery = supabase.from("clients").select("*").eq("id", id);
    const { data: dbClient } = await (isSuperAdmin ? clientQuery : clientQuery.eq("agency_id", session.agencyId)).single();
    if (dbClient) {
      client = dbClient;
    }
  } catch {}

  if (!client) notFound();

  const svc = SERVICE_TYPE_LABELS[(client.service_type as ServiceType) || "seo_geo"] ?? SERVICE_TYPE_LABELS["seo_geo"];

  let keywords: any[] = [];
  try {
    const { data: kwData } = await supabase
      .from("tracked_keywords")
      .select("id, keyword, domain, brand, location, track_type, is_active, ai_brief, ai_brief_at")
      .eq("client_id", id);
    if (kwData) keywords = kwData;
  } catch {}

  const kwAll = keywords ?? [];
  const kwActive = kwAll.filter((k) => k.is_active);
  const kwSEO = kwActive.filter((k) => k.track_type === "seo" || k.track_type === "both");
  const kwGEO = kwActive.filter((k) => k.track_type === "geo" || k.track_type === "both");
  const kwBoth = kwActive.filter((k) => k.track_type === "both");

  let latestResults: any[] = [];
  try {
    const { data: resData } = await supabase
      .from("search_results")
      .select("id, tracked_keyword_id, keyword, domain, track_type, rank_position, aio_present, client_cited, mentioned_in_text, cited_domains, gap_label, created_at")
      .eq("client_id", id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (resData) latestResults = resData;
  } catch {}

 const seenKeywords = new Set<string>();
 const latestPerKeyword = (latestResults ?? []).filter((r) => {
 const key = `${r.keyword}::${r.track_type}`;
 if (seenKeywords.has(key)) return false;
 seenKeywords.add(key);
 return true;
 });

 const results = latestPerKeyword;
 const gapCounts = results.reduce((acc, r) => {
 acc[r.gap_label] = (acc[r.gap_label] ?? 0) + 1;
 return acc;
 }, {} as Record<string, number>);

 const stats = [
    { label: "Active Keywords", value: kwActive.length, sub: `${kwAll.length} total tracked`, color: "text-ink" },
    ...(client.service_type !== "geo" ? [
      { label: "SEO Tracked", value: kwSEO.length, sub: "rank tracking", color: "text-brand-strong" },
    ] : []),
    ...(client.service_type !== "seo" ? [
      { label: "GEO Tracked", value: kwGEO.length, sub: "AIO tracking", color: "text-positive" },
    ] : []),
    ...(client.service_type === "seo_geo" ? [
      { label: "Both Pipelines", value: kwBoth.length, sub: "full intelligence", color: "text-ink-2" },
    ] : []),
  ];

  const gapStats = [
    { label: "Aligned", key: "aligned", color: "text-positive border-positive/30 bg-positive/10" },
    { label: "Ranked & Cited, Unnamed", key: "aligned_no_mention", color: "text-info border-info/30 bg-info/10" },
    { label: "AI-Mentioned", key: "ai_mentioned", color: "text-info border-info/30 bg-info/10" },
    { label: "AI-Invisible", key: "search_strong_ai_invisible", color: "text-brand-strong border-line bg-brand-soft" },
    { label: "Double Loss", key: "weak_double_loss", color: "text-critical border-critical/30 bg-critical/10" },
    { label: "GEO Cited & Named", key: "geo_cited", color: "text-positive border-positive/30 bg-positive/10" },
    { label: "GEO Cited, Unnamed", key: "geo_cited_no_mention", color: "text-info border-info/30 bg-info/10" },
    { label: "GEO Mentioned", key: "geo_mentioned", color: "text-info border-info/30 bg-info/10" },
    { label: "GEO Invisible", key: "geo_invisible", color: "text-brand-strong border-line bg-brand-soft" },
    { label: "No AIO Trigger", key: "geo_no_aio", color: "text-ink-3 border-line bg-surface-2" },
    { label: "SEO Ranked", key: "seo_ranked", color: "text-positive border-positive/30 bg-positive/10" },
    { label: "Ranked, No AIO", key: "seo_ranked_no_aio", color: "text-positive border-positive/30 bg-positive/10" },
    { label: "SEO Not Ranked", key: "seo_not_ranked", color: "text-critical border-critical/30 bg-critical/10" },
  ].filter((g) => (gapCounts[g.key] ?? 0) > 0);

 return (
    <div className="mx-auto w-full max-w-[1240px] animate-fade-in space-y-8 px-4 pb-24 pt-6 font-sans md:px-8 md:pt-9 xl:px-10">
      {/* Top Header & Navigation Tabs */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6 border-b border-line pb-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h1 className="text-display font-semibold text-ink truncate">
              {client.name}
            </h1>
            <span className="rounded-control bg-brand-soft border border-line text-brand-strong px-3 py-0.5 text-caption font-semibold">
              {svc.short}
            </span>
            {isSuperAdmin && (
              <span className="rounded-control bg-surface-2 border border-line text-ink-3 px-2.5 py-0.5 text-caption">
                ID: {id.slice(0, 8)}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-ink-3">
            {client.website && (
              <a 
                href={client.website.startsWith('http') ? client.website : `https://${client.website}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-brand-strong hover:underline font-semibold"
              >
                <Globe size={13} />
                <span>{client.website}</span>
                <ExternalLink size={11} />
              </a>
            )}
            {client.industry && (
              <span className="flex items-center gap-1.5">
                <Briefcase size={13} className="text-ink-3" />
                <span>{client.industry}</span>
              </span>
            )}
            {client.country && (
              <span className="flex items-center gap-1.5">
                <MapPin size={13} className="text-ink-3" />
                <span>{client.country}</span>
              </span>
            )}
          </div>

          {(client as unknown as { last_auto_run_at?: string }).last_auto_run_at && (
            <p className="text-caption text-ink-3 mt-2 flex items-center gap-2">
              <Activity size={12} className="text-positive" />
              <span>Last Scan: <strong className="text-ink">{new Date((client as unknown as { last_auto_run_at: string }).last_auto_run_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</strong></span>
            </p>
          )}
        </div>

        {/* Action Tabs Bar + Run Scan Button */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-surface border border-line p-1.5 rounded-panel flex items-center gap-1.5 flex-wrap">
            <Link
              href={`/dashboard/clients/${id}/keywords/new`}
              className="inline-flex items-center gap-1.5 rounded-panel bg-ink hover:bg-ink-2 px-3.5 py-1.5 text-caption font-semibold text-white transition-colors"
            >
              <Plus size={13} />
              <span>Add searches</span>
            </Link>
            <Link
              href={`/dashboard/clients/${id}/keywords`}
              className="inline-flex items-center rounded-panel px-3.5 py-1.5 text-caption font-semibold text-ink-3 hover:text-ink hover:bg-surface-2 transition-colors"
            >
              Keywords
            </Link>
            <Link
              href={`/dashboard/clients/${id}/tasks`}
              className="inline-flex items-center rounded-panel px-3.5 py-1.5 text-caption font-semibold text-ink-3 hover:text-ink hover:bg-surface-2 transition-colors"
            >
              Tasks
            </Link>
            <Link
              href={`/dashboard/clients/${id}/reports`}
              className="inline-flex items-center rounded-panel px-3.5 py-1.5 text-caption font-semibold text-ink-3 hover:text-ink hover:bg-surface-2 transition-colors"
            >
              Reports
            </Link>
            <Link
              href="/dashboard/settings"
              className="inline-flex items-center rounded-panel px-3.5 py-1.5 text-caption font-semibold text-ink-3 hover:text-ink hover:bg-surface-2 transition-colors"
            >
              Settings
            </Link>
          </div>

          <RunButton clientId={id} keywordCount={kwActive.length} />
        </div>
      </div>

      {/* ── Section 1: Metric Cards Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {stats.map((s) => (
          <div
            key={s.label}
            className="bg-surface rounded-panel p-6 border border-line transition-all flex flex-col justify-between"
          >
            <div>
              <span className="text-caption font-semibold text-ink-3 block mb-2">
                {s.label}
              </span>
              <p className={`text-3xl font-semibold tracking-tight ${s.color}`}>
                {s.value}
              </p>
            </div>
            <p className="text-caption font-medium text-ink-3 mt-4 pt-3 border-t border-line">
              {s.sub}
            </p>
          </div>
        ))}
      </div>

      {/* ── Section 2: Gap Breakdown Grid ── */}
      {gapStats.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-caption font-semibold text-ink-3 flex items-center gap-2">
              <Lightbulb size={14} className="text-brand-strong" />
              <span>Gap Breakdown - {results.length} Keyword{results.length !== 1 ? "s" : ""} (Latest Snapshot Each)</span>
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {gapStats.map((g) => (
              <div
                key={g.key}
                className="bg-surface border border-line rounded-panel p-4 flex items-center justify-between gap-3"
              >
                <div>
                  <p className="text-2xl font-semibold text-ink">{gapCounts[g.key]}</p>
                  <p className="text-caption font-medium text-ink-3 mt-0.5">{g.label}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-control text-caption font-semibold border ${g.color}`}>
                  {g.key.includes("loss") || g.key.includes("not_ranked") ? "ACTION" : "LOGGED"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {kwActive.length === 0 && (
        <div className="rounded-panel border border-dashed border-line bg-surface p-12 text-center">
          <Lightbulb size={36} className="text-brand-strong mx-auto mb-3" />
          <p className="text-base font-semibold text-ink mb-1">No Active Keywords Tracked</p>
          <p className="text-caption text-ink-3 max-w-md mx-auto mb-6">
            Add target search queries to trigger automated answer box audits and competitor visibility mapping.
          </p>
          <Link
            href={`/dashboard/clients/${id}/keywords/new`}
            className="inline-flex items-center gap-2 rounded-panel bg-ink hover:bg-ink-2 px-5 py-2.5 text-caption font-semibold text-white transition-colors"
          >
            <Plus size={15} /> ADD KEYWORDS
          </Link>
        </div>
      )}

      {/* ── Section 3: Opportunity Intelligence Panel ── */}
      {results.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-5 flex-wrap gap-4 border-b border-line pb-4">
            <div>
              <h2 className="text-lg font-semibold text-ink tracking-tight flex items-center gap-2">
                <span>Keyword Opportunities</span>
                <span className="text-caption font-medium text-brand-strong bg-brand-soft border border-line rounded-control px-2.5 py-0.5">
                  Ranked by Priority
                </span>
              </h2>
              <p className="text-caption text-ink-3 mt-0.5">
                Generate an AI brief or open a keyword diagnosis to view your battle plan against competitors.
              </p>
            </div>
            <Link
              href={`/dashboard/clients/${id}/results`}
              className="flex items-center gap-1.5 text-caption font-semibold text-brand-strong hover:underline bg-surface border border-line px-3.5 py-1.5 rounded-panel"
            >
              <span>View All Diagnostics</span>
              <ArrowRight size={13} />
            </Link>
          </div>

          <OpportunityPanel
            results={results}
            clientId={id}
            briefsByKeywordId={Object.fromEntries(
              kwAll
                .filter((k) => k.ai_brief)
                .map((k) => [k.id, k.ai_brief])
            )}
          />
        </div>
      )}

      {/* ── Section 4: Client Configuration Details Card ── */}
      <div className="rounded-panel border border-line bg-surface p-6">
        <h2 className="text-caption font-semibold text-ink-3 mb-5 flex items-center gap-2">
          <ShieldCheck size={16} className="text-brand-strong" />
          <span>Client Architecture & Configuration</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { label: "Brand Anchor Name", value: client.brand_name },
            { label: "Target Location", value: (LOCATIONS[client.default_location as Location] ?? LOCATIONS.ae).label },
            { label: "Service Package", value: svc.label },
            { label: "Industry Category", value: client.industry },
            { label: "Operating Country", value: client.country },
            { label: "Onboarding Date", value: new Date(client.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) },
          ].filter((r) => r.value).map((row) => (
            <div key={row.label} className="bg-surface-2 border border-line p-4 rounded-panel">
              <p className="text-caption font-semibold text-ink-3">{row.label}</p>
              <p className="text-body font-semibold text-ink mt-1">{row.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
 );
}
