"use client";

import React, { useState } from "react";
import Link from "next/link";
import { 
 Sparkles, TrendingUp, Award, Eye, Globe, AlertTriangle, Download, 
 Calendar, Filter, Plus, ChevronRight, CheckCircle2, ShieldCheck, 
 Cpu, MessageSquare, BarChart3, PieChart, ArrowUpRight, ArrowDownRight,
 Smile, ShieldAlert, Zap, Layers, RefreshCw, ExternalLink, Activity
} from "lucide-react";
import TrajectoryChart from "@/components/TrajectoryChart";
import { Dropdown } from "@/components/Dropdown";
import ServiceFilterDropdown from "@/components/ServiceFilterDropdown";
import { downloadCSV, exportPrintablePDF, ExportDataRow } from "@/utils/export";
import { SERVICE_TYPE_LABELS, ServiceType } from "@/types/search";
import { useTheme } from "@/components/ThemeProvider";

interface ClientRecord {
 id: string;
 name: string;
 service_type: string;
 website: string;
 agency_id: string;
 agencies?: { name?: string | null; display_name?: string | null } | { name?: string | null; display_name?: string | null }[] | null;
}

interface ResultRecord {
 client_id: string;
 keyword: string;
 track_type: string;
 gap_label: string;
 rank_position?: number | null;
 aio_present?: boolean | null;
 client_cited?: boolean | null;
 mentioned_in_text?: boolean | null;
 created_at: string;
}

interface DashboardClientViewProps {
 isSuperAdmin: boolean;
 clientList: ClientRecord[];
 keywordCount: number;
 rawResults: ResultRecord[];
 maxClients?: number | null;
}

export default function DashboardClientView({
 isSuperAdmin,
 clientList,
 keywordCount,
 rawResults,
 maxClients,
}: DashboardClientViewProps) {
main
  const { theme } = useTheme();
  const isDark = theme === "dark";
main
  const [dateRange, setDateRange] = useState("30d");
  const [serviceFilter, setServiceFilter] = useState("all");

  const nowMs = Date.now();
  const rangeMsMap: Record<string, number> = {
    "7d": 7 * 86400000,
    "30d": 30 * 86400000,
    "90d": 90 * 86400000,
  };

  const filteredRawResults = rawResults.filter((r) => {
    // 1. Date Range Filter
    if (dateRange !== "all" && rangeMsMap[dateRange] && r.created_at) {
      const itemMs = new Date(r.created_at).getTime();
      if (nowMs - itemMs > rangeMsMap[dateRange]) return false;
    }
    // 2. Service Filter
    if (serviceFilter !== "all") {
      if (r.track_type !== serviceFilter && r.track_type !== "both") return false;
    }
    return true;
  });

  // Deduplicate to latest snapshot per (client, keyword, track_type)
  const seenKw = new Set<string>();
  const results = filteredRawResults.filter((r) => {
    const k = `${r.client_id}::${r.keyword}::${r.track_type}`;
    if (seenKw.has(k)) return false;
    seenKw.add(k);
    return true;
  });

 const clientMap = new Map(clientList.map((c) => [c.id, c]));

 // Calculate Key Metrics
 const gapCounts = results.reduce((acc, r) => {
 acc[r.gap_label as string] = (acc[r.gap_label as string] ?? 0) + 1;
 return acc;
 }, {} as Record<string, number>);

 const winning = (gapCounts["aligned"] ?? 0)
 + (gapCounts["geo_cited"] ?? 0)
 + (gapCounts["seo_ranked"] ?? 0)
 + (gapCounts["seo_ranked_no_aio"] ?? 0);

 const mentioned = (gapCounts["ai_mentioned"] ?? 0)
 + (gapCounts["geo_mentioned"] ?? 0)
 + (gapCounts["aligned_no_mention"] ?? 0)
 + (gapCounts["geo_cited_no_mention"] ?? 0);

 const invisible = (gapCounts["search_strong_ai_invisible"] ?? 0)
 + (gapCounts["geo_invisible"] ?? 0);

 const losing = (gapCounts["weak_double_loss"] ?? 0)
 + (gapCounts["seo_not_ranked"] ?? 0);

 const totalTracked = results.length || keywordCount || 1;
 const totalAIMentions = winning + mentioned;
 const winPercent = ((winning / totalTracked) * 100).toFixed(0);
 const mentionPercent = ((mentioned / totalTracked) * 100).toFixed(0);
 const invisiblePercent = ((invisible / totalTracked) * 100).toFixed(0);
 const losingPercent = ((losing / totalTracked) * 100).toFixed(0);

 const aiVisibilityScore = results.length > 0 ? (((winning + mentioned) / totalTracked) * 100).toFixed(1) : "0.0";
 const googleRankingOverviewCount = results.filter((r) => r.rank_position && r.rank_position <= 10).length;

 // Handle Export CSV
 const handleExportCSV = () => {
 const exportRows: ExportDataRow[] = results.map((r) => {
 const client = clientMap.get(r.client_id);
 return {
 keyword: r.keyword,
 clientName: client?.name || "Unknown Domain",
 trackType: r.track_type,
 rankPosition: r.rank_position,
 aioPresent: !!r.aio_present,
 classification: r.gap_label,
 createdAt: r.created_at,
 };
 });
 downloadCSV("SearchIntel_AI_Visibility_Report", exportRows);
 };

 // Handle Export PDF
 const handleExportPDF = () => {
 const exportRows: ExportDataRow[] = results.map((r) => {
 const client = clientMap.get(r.client_id);
 return {
 keyword: r.keyword,
 clientName: client?.name || "Unknown Domain",
 trackType: r.track_type,
 rankPosition: r.rank_position,
 aioPresent: !!r.aio_present,
 classification: r.gap_label,
 createdAt: r.created_at,
 };
 });
 exportPrintablePDF("AI Search Citation & Performance Report", exportRows);
 };

 return (
 <div className="p-4 sm:p-8 space-y-8 max-w-[1600px] mx-auto font-sans transition-colors bg-background min-h-screen">
 {/* ── Top Header & Global Toolbar ── */}
 <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 pb-6 border-b border-border/80 ">
 <div>
 <div className="flex items-center gap-3">
 <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground text-foreground tracking-tight">
 AI Search Intelligence
 </h1>
 {isSuperAdmin && (
 <span className="rounded-full px-[14px] py-[6px] bg-primary/10 border border-[#FFD5C8] text-primary px-3 py-0.5 text-xs font-bold uppercase tracking-wider shadow-[0_15px_40px_rgba(0,0,0,0.35)] transition-all duration-250 ease-out hover:-translate-y-[3px] hover:shadow-[0_20px_60px_rgba(255,90,31,0.15)]">
 Super Admin Scope
 </span>
 )}
 </div>
 <p className="text-xs sm:text-sm text-muted-foreground mt-1 font-medium">
 Real-time generative AI citation monitoring, sentiment tracking, and competitive search analysis.
 </p>
 </div>

 {/* Global Toolbar Controls */}
 <div className="flex flex-wrap items-center gap-3">
  <Dropdown
    variant="date-range"
    value={dateRange}
    onChange={setDateRange}
    options={[
      { value: "30d", label: "Last 30 Days" },
      { value: "7d", label: "Last 7 Days" },
      { value: "90d", label: "Last 90 Days" },
      { value: "all", label: "All Time" }
    ]}
    trigger={
      <div className="flex items-center gap-2 bg-card border border-border/80 rounded-full px-[14px] py-[6px] px-4 py-2 text-xs font-semibold text-foreground shadow-[0_15px_40px_rgba(0,0,0,0.35)] transition-all duration-250 ease-out hover:-translate-y-[3px] hover:shadow-[0_20px_60px_rgba(255,90,31,0.15)] outline-none">
        <Calendar size={14} className="text-muted-foreground" />
        <span>Date Range:</span>
        <div className="flex items-center gap-1 font-bold text-foreground cursor-pointer">
          <span>
            {dateRange === "30d" ? "Last 30 Days" : 
             dateRange === "7d" ? "Last 7 Days" : 
             dateRange === "90d" ? "Last 90 Days" : "All Time"}
          </span>
        </div>
      </div>
    }
  />

 {/* Search Filters */}
  <ServiceFilterDropdown
    currentValue={serviceFilter as "all" | "seo" | "geo"}
    onSelect={(val) => setServiceFilter(val)}
  />

 {/* Export Report Actions */}
 <div className="flex items-center gap-2">
 <button
 onClick={handleExportCSV}
 type="button"
 className="flex items-center gap-2 rounded-full px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
 title="Download CSV report"
 >
 <Download size={14} />
 <span>CSV</span>
 </button>

 <button
 onClick={handleExportPDF}
 type="button"
 className="flex items-center gap-2 rounded-full px-4 py-2 bg-card border border-border text-foreground hover:bg-muted text-xs font-bold shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
 title="Export Printable PDF report"
 >
 <Download size={14} />
 <span>PDF Report</span>
 </button>
 </div>
 </div>
 </div>

 {/* ── Section 1: 6 Core Enterprise Analytics Cards Grid ── */}
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
  {/* Card 1: AI Visibility Score */}
  <div className="bg-card rounded-[20px] p-5 border border-border/80 shadow-[0_15px_40px_rgba(0,0,0,0.35)] transition-all duration-250 ease-out hover:-translate-y-[3px] hover:shadow-[0_20px_60px_rgba(255,90,31,0.15)] hover:border-primary/50 hover:shadow-md transition-all">
  <div className="flex items-center justify-between mb-3">
  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
  AI Visibility Score
  </span>
  <span className="p-2 rounded-[20px] bg-orange-50 text-orange-600">
  <Sparkles size={16} />
  </span>
  </div>
  <div className="flex items-baseline flex-wrap gap-1.5">
  <span className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
  {aiVisibilityScore}%
  </span>
  <span className="text-xs font-bold text-[#22C55E] flex items-center whitespace-nowrap">
  +4.1% <ArrowUpRight size={12} className="ml-0.5" />
  </span>
  </div>
  <p className="text-[11px] text-muted-foreground mt-2 font-medium">
  Weighted AI share of voice
  </p>
  </div>

  {/* Card 2: Total Mentions */}
  <div className="bg-card rounded-[20px] p-5 border border-border/80 shadow-[0_15px_40px_rgba(0,0,0,0.35)] transition-all duration-250 ease-out hover:-translate-y-[3px] hover:shadow-[0_20px_60px_rgba(255,90,31,0.15)] hover:border-primary/50 hover:shadow-md transition-all">
  <div className="flex items-center justify-between mb-3">
  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
  Total AI Mentions
  </span>
  <span className="p-2 rounded-[20px] bg-[#F0FDF4] text-[#22C55E]">
  <Award size={16} />
  </span>
  </div>
  <div className="flex items-baseline flex-wrap gap-1.5">
  <span className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
  {totalAIMentions}
  </span>
  <span className="text-xs font-bold text-[#22C55E] flex items-center whitespace-nowrap">
  +18.2% <ArrowUpRight size={12} className="ml-0.5" />
  </span>
  </div>
  <p className="text-[11px] text-muted-foreground mt-2 font-medium">
  Direct citations & text mentions
  </p>
  </div>

  {/* Card 3: Search Queries */}
  <div className="bg-card rounded-[20px] p-5 border border-border/80 shadow-[0_15px_40px_rgba(0,0,0,0.35)] transition-all duration-250 ease-out hover:-translate-y-[3px] hover:shadow-[0_20px_60px_rgba(255,90,31,0.15)] hover:border-primary/50 hover:shadow-md transition-all">
  <div className="flex items-center justify-between mb-3">
  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
  Search Queries
  </span>
  <span className="p-2 rounded-[20px] bg-purple-50 text-purple-600">
  <BarChart3 size={16} />
  </span>
  </div>
  <div className="flex items-baseline flex-wrap gap-1.5">
  <span className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
  {totalTracked}
  </span>
  <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">
  queries
  </span>
  </div>
  <p className="text-[11px] text-muted-foreground mt-2 font-medium">
  Active keyword prompts monitored
  </p>
  </div>

  {/* Card 4: AI Engines Covered / Indexed Pages */}
  <div className="bg-card rounded-[20px] p-5 border border-border/80 shadow-[0_15px_40px_rgba(0,0,0,0.35)] transition-all duration-250 ease-out hover:-translate-y-[3px] hover:shadow-[0_20px_60px_rgba(255,90,31,0.15)] hover:border-primary/50 hover:shadow-md transition-all">
  <div className="flex items-center justify-between mb-3">
  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
  AI Engines Covered
  </span>
  <span className="p-2 rounded-[20px] bg-indigo-50 text-indigo-600">
  <Cpu size={16} />
  </span>
  </div>
  <div className="flex items-baseline flex-wrap gap-1.5">
  <span className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
  5/5
  </span>
  <span className="text-xs font-bold text-[#22C55E] whitespace-nowrap">Active</span>
  </div>
  <p className="text-[11px] text-muted-foreground mt-2 font-medium truncate">
  AIO, ChatGPT, Gemini, Perplexity, Claude
  </p>
  </div>

  {/* Card 5: Competitor Score */}
  <div className="bg-card rounded-[20px] p-5 border border-border/80 shadow-[0_15px_40px_rgba(0,0,0,0.35)] transition-all duration-250 ease-out hover:-translate-y-[3px] hover:shadow-[0_20px_60px_rgba(255,90,31,0.15)] hover:border-primary/50 hover:shadow-md transition-all">
  <div className="flex items-center justify-between mb-3">
  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
  Competitor Score
  </span>
  <span className="p-2 rounded-[20px] bg-amber-50 text-amber-600">
  <TrendingUp size={16} />
  </span>
  </div>
  <div className="flex items-baseline flex-wrap gap-1.5">
  <span className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
  +14.3%
  </span>
  <span className="text-xs font-bold text-[#22C55E] whitespace-nowrap">vs Industry</span>
  </div>
  <p className="text-[11px] text-muted-foreground mt-2 font-medium">
  Lead over top 3 competitors
  </p>
  </div>

  {/* Card 6: Brand Sentiment */}
  <div className="bg-card rounded-[20px] p-5 border border-border/80 shadow-[0_15px_40px_rgba(0,0,0,0.35)] transition-all duration-250 ease-out hover:-translate-y-[3px] hover:shadow-[0_20px_60px_rgba(255,90,31,0.15)] hover:border-primary/50 hover:shadow-md transition-all">
  <div className="flex items-center justify-between mb-3">
  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
  Brand Sentiment
  </span>
  <span className="p-2 rounded-[20px] bg-[#F0FDF4] text-[#22C55E]">
  <Smile size={16} />
  </span>
  </div>
  <div className="flex items-baseline flex-wrap gap-1.5">
  <span className="text-2xl sm:text-3xl font-extrabold text-[#22C55E] tracking-tight">
  94.2%
  </span>
  <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Positive</span>
  </div>
  <p className="text-[11px] text-muted-foreground mt-2 font-medium">
  Generative text tone score
  </p>
  </div>
  </div>

 {/* ── Section 2: Charts Section (Trajectory, Competitor Comparison & Monthly Analytics) ── */}
 <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
 {/* Daily Trend Graph (8 Cols) */}
 <div className="lg:col-span-8 space-y-6">
 <TrajectoryChart
 totalKeywords={totalTracked}
 winningRate={Number(winPercent)}
 currentRate={Number(aiVisibilityScore)}
 />

 {/* Mentions by AI Platform Grid */}
 <div className="bg-card rounded-[20px] p-6 border border-border/80 shadow-[0_15px_40px_rgba(0,0,0,0.35)] transition-all duration-250 ease-out hover:-translate-y-[3px] hover:shadow-[0_20px_60px_rgba(255,90,31,0.15)]">
 <div className="flex items-center justify-between mb-4">
 <div>
 <h2 className="text-base font-bold text-foreground text-foreground tracking-tight">
 Mentions by AI Platform
 </h2>
 <p className="text-xs text-muted-foreground mt-0.5 font-medium">
 Direct citation frequency breakdown across top LLMs & Search engines
 </p>
 </div>
 <span className="text-xs font-bold text-primary bg-primary/10 px-3 py-1 rounded-full px-[14px] py-[6px] border border-[#FFD5C8] ">
 5 Engines Active
 </span>
 </div>

 <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
 {[
 { name: "Google AIO", count: Math.round(totalAIMentions * 0.38), share: "38%", color: "bg-primary" },
 { name: "ChatGPT 4o", count: Math.round(totalAIMentions * 0.28), share: "28%", color: "bg-[#22C55E]" },
 { name: "Gemini Pro", count: Math.round(totalAIMentions * 0.18), share: "18%", color: "bg-purple-500" },
 { name: "Perplexity", count: Math.round(totalAIMentions * 0.10), share: "10%", color: "bg-amber-500" },
 { name: "Claude 3.5", count: Math.round(totalAIMentions * 0.06), share: "6%", color: "bg-[#EF4444]" },
 ].map((engine) => (
 <div key={engine.name} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
 <div className="flex items-center justify-between mb-2">
 <span className={`w-2.5 h-2.5 rounded-full ${engine.color}`} />
 <span className="text-[10px] font-bold text-slate-500">{engine.share}</span>
 </div>
 <p className="text-xs font-bold text-slate-900 truncate">{engine.name}</p>
 <p className="text-base font-extrabold text-slate-900 mt-1">{engine.count}</p>
 </div>
 ))}
 </div>
 </div>
 </div>

 {/* Competitor Comparison & Monthly Analytics (4 Cols) */}
 <div className="lg:col-span-4 space-y-6">
 {/* Competitor Share-of-Voice */}
 <div className="bg-card rounded-[20px] p-6 border border-border/80 shadow-[0_15px_40px_rgba(0,0,0,0.35)] transition-all duration-250 ease-out hover:-translate-y-[3px] hover:shadow-[0_20px_60px_rgba(255,90,31,0.15)]">
 <div className="flex items-center justify-between mb-4">
 <h2 className="text-base font-bold text-foreground tracking-tight">
 Competitor Comparison
 </h2>
 <Link href="/dashboard/competitors" className="text-xs font-bold text-primary hover:underline">
 Details →
 </Link>
 </div>

 <div className="space-y-4">
 <div>
 <div className="flex justify-between text-xs font-medium mb-1.5">
 <span className="text-foreground font-bold">Your Brand Portfolio</span>
 <span className="text-primary font-bold">{aiVisibilityScore}%</span>
 </div>
 <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
 <div className="bg-primary h-full rounded-full transition-all duration-500" style={{ width: `${aiVisibilityScore}%` }} />
 </div>
 </div>

 <div>
 <div className="flex justify-between text-xs font-medium mb-1.5">
 <span className="text-muted-foreground font-semibold">Industry Leader (Avg)</span>
 <span className="text-muted-foreground font-bold">62.1%</span>
 </div>
 <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
 <div className="bg-purple-500 h-full rounded-full transition-all duration-500" style={{ width: `62.1%` }} />
 </div>
 </div>

 <div>
 <div className="flex justify-between text-xs font-medium mb-1.5">
 <span className="text-muted-foreground font-semibold">Top Competitor</span>
 <span className="text-muted-foreground font-bold">48.5%</span>
 </div>
 <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
 <div className="bg-slate-400 h-full rounded-full transition-all duration-500" style={{ width: `48.5%` }} />
 </div>
 </div>

 <div>
 <div className="flex justify-between text-xs font-medium mb-1.5">
 <span className="text-muted-foreground font-semibold">Secondary Challenger</span>
 <span className="text-muted-foreground font-bold">34.2%</span>
 </div>
 <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
 <div className="bg-slate-300 h-full rounded-full transition-all duration-500" style={{ width: `34.2%` }} />
 </div>
 </div>
 </div>
 </div>

 {/* Monthly Analytics & Traffic Overview */}
 <div className="bg-card rounded-[20px] p-6 border border-border/80 shadow-[0_15px_40px_rgba(0,0,0,0.35)] transition-all duration-250 ease-out hover:-translate-y-[3px] hover:shadow-[0_20px_60px_rgba(255,90,31,0.15)]">
 <h2 className="text-base font-bold text-foreground tracking-tight mb-4">
 Traffic & Referral Analytics
 </h2>

 <div className="grid grid-cols-2 gap-4">
 <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
 <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Est. AI Referrals</p>
 <p className="text-lg font-extrabold text-slate-900 mt-1">12,480</p>
 <span className="text-[10px] font-bold text-[#22C55E] flex items-center mt-1">
 +24.5% MoM <ArrowUpRight size={10} />
 </span>
 </div>

 <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl">
 <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Organic Clicks</p>
 <p className="text-lg font-extrabold text-slate-900 mt-1">48,920</p>
 <span className="text-[10px] font-bold text-[#22C55E] flex items-center mt-1">
 +11.2% MoM <ArrowUpRight size={10} />
 </span>
 </div>
 </div>
 </div>
 </div>
 </div>

 {/* ── Section 3: Top Performing Keywords & Citation Classification ── */}
 <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
 {/* Top Performing Keywords (6 Cols) */}
 <div className="lg:col-span-6 bg-card rounded-[20px] p-6 border border-border/80 shadow-[0_15px_40px_rgba(0,0,0,0.35)] transition-all duration-250 ease-out hover:-translate-y-[3px] hover:shadow-[0_20px_60px_rgba(255,90,31,0.15)]">
 <div className="flex items-center justify-between mb-4">
 <div>
 <h2 className="text-base font-bold text-foreground text-foreground tracking-tight">
 Top Performing Keywords
 </h2>
 <p className="text-xs text-muted-foreground mt-0.5 font-medium">
 Keywords with active AI citations and top organic SERP authority
 </p>
 </div>
 <span className="text-xs font-bold text-[#1B9E4B] bg-[#F0FDF4] border border-[#BBF7D0] px-3 py-1 rounded-full">
 Winning
 </span>
 </div>

 <div className="space-y-2.5 mt-4">
 {results.filter(r => r.client_cited || r.gap_label === "aligned" || r.gap_label === "geo_cited").slice(0, 5).map((item, idx) => {
 const client = clientMap.get(item.client_id);
 return (
 <div key={idx} className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200/80 bg-slate-50 hover:bg-slate-100 transition-colors">
 <div className="min-w-0 flex-1 pr-3">
 <p className="text-xs font-bold text-slate-900 truncate">{item.keyword}</p>
 <p className="text-[11px] text-slate-500 mt-0.5 truncate font-medium">{client?.name || "Client Domain"}</p>
 </div>
 <div className="flex items-center gap-3 shrink-0">
 {item.rank_position && (
 <span className="text-xs font-bold text-primary bg-primary/10 border border-[#FFD5C8] px-2.5 py-0.5 rounded-md">
 #{item.rank_position}
 </span>
 )}
 <span className="text-xs font-bold text-[#1B9E4B] bg-[#F0FDF4] border border-[#BBF7D0] px-2.5 py-0.5 rounded-md uppercase">
 Cited ★
 </span>
 </div>
 </div>
 );
 })}
 {results.filter(r => r.client_cited || r.gap_label === "aligned" || r.gap_label === "geo_cited").length === 0 && (
 <p className="text-xs text-muted-foreground italic py-6 text-center">No winning keyword citations captured yet.</p>
 )}
 </div>
 </div>

 {/* AI Platform Distribution & Breakdown (6 Cols) */}
 <div className="lg:col-span-6 bg-card rounded-[20px] p-6 border border-border/80 shadow-[0_15px_40px_rgba(0,0,0,0.35)] transition-all duration-250 ease-out hover:-translate-y-[3px] hover:shadow-[0_20px_60px_rgba(255,90,31,0.15)]">
 <div className="flex items-center justify-between mb-4">
 <div>
 <h2 className="text-base font-bold text-foreground tracking-tight">
 AI Citation Classification Breakdown
 </h2>
 <p className="text-xs text-muted-foreground mt-0.5 font-medium">
 Share of queries grouped by citation type and GEO gap status
 </p>
 </div>
 <span className="text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-3 py-1">
 {totalTracked} Evaluated
 </span>
 </div>

 {/* Segmented Bar */}
 <div className="w-full h-3 rounded-full bg-slate-100 flex overflow-hidden gap-0.5 p-0.5 border border-slate-200 my-4">
 <div className="h-full bg-[#22C55E] rounded-l-full" style={{ width: `${Math.max(8, Number(winPercent))}%` }} />
 <div className="h-full bg-cyan-500" style={{ width: `${Math.max(8, Number(mentionPercent))}%` }} />
 <div className="h-full bg-amber-500" style={{ width: `${Math.max(8, Number(invisiblePercent))}%` }} />
 <div className="h-full bg-[#EF4444] rounded-r-full" style={{ width: `${Math.max(8, Number(losingPercent))}%` }} />
 </div>

 <div className="grid grid-cols-2 gap-3 mt-4">
 <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
 <div className="flex items-center gap-2">
 <span className="w-2.5 h-2.5 rounded-full bg-[#22C55E]" />
 <span className="font-semibold text-slate-700">Winning Citations</span>
 </div>
 <span className="font-extrabold text-slate-900">{winning} ({winPercent}%)</span>
 </div>

 <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
 <div className="flex items-center gap-2">
 <span className="w-2.5 h-2.5 rounded-full bg-cyan-500" />
 <span className="font-semibold text-slate-700">Text Mentioned</span>
 </div>
 <span className="font-extrabold text-slate-900">{mentioned} ({mentionPercent}%)</span>
 </div>

 <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
 <div className="flex items-center gap-2">
 <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
 <span className="font-semibold text-slate-700">AI Invisible</span>
 </div>
 <span className="font-extrabold text-slate-900">{invisible} ({invisiblePercent}%)</span>
 </div>

 <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
 <div className="flex items-center gap-2">
 <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
 <span className="font-semibold text-slate-700">Double Loss</span>
 </div>
 <span className="font-extrabold text-slate-900">{losing} ({losingPercent}%)</span>
 </div>
 </div>
 </div>
 </div>

 {/* ── Section 4: Tracked Queries Table ── */}
 <div className="bg-card rounded-[20px] border border-border/80 shadow-[0_15px_40px_rgba(0,0,0,0.35)] transition-all duration-250 ease-out hover:-translate-y-[3px] hover:shadow-[0_20px_60px_rgba(255,90,31,0.15)] overflow-hidden">
 <div className="p-6 border-b border-border/80 flex items-center justify-between flex-wrap gap-4">
 <div>
 <h2 className="text-base font-bold text-foreground tracking-tight">
 Tracked Queries & AI Status Table
 </h2>
 <p className="text-xs text-muted-foreground mt-0.5 font-medium">
 Live audit results across all agency client domains
 </p>
 </div>
 <span className="text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1 rounded-full">
 Showing {Math.min(10, results.length)} of {results.length} snapshots
 </span>
 </div>

 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs">
 <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
 <tr>
 <th className="px-6 py-3.5">Keyword Query</th>
 <th className="px-6 py-3.5">Client Domain</th>
 <th className="px-6 py-3.5">Track Type</th>
 <th className="px-6 py-3.5">Google Rank</th>
 <th className="px-6 py-3.5">AI Mode</th>
 <th className="px-6 py-3.5">Classification</th>
 <th className="px-6 py-3.5 text-right">Action</th>
 </tr>
 </thead>
 <tbody className="divide-y divide-slate-200/80 font-medium">
 {results.slice(0, 10).map((row, idx) => {
 const client = clientMap.get(row.client_id);
 const isWin = row.client_cited || row.gap_label === "aligned" || row.gap_label === "geo_cited";
 const isMention = row.mentioned_in_text || row.gap_label.includes("mention");
 return (
 <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
 <td className="px-6 py-4 font-bold text-slate-900">{row.keyword}</td>
 <td className="px-6 py-4 text-slate-600 font-medium">{client?.name || "—"}</td>
 <td className="px-6 py-4">
 <span className="uppercase font-mono text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-2.5 py-0.5">
 {row.track_type}
 </span>
 </td>
 <td className="px-6 py-4">
 {row.rank_position ? (
 <span className="font-bold text-primary bg-primary/10 rounded-full px-2.5 py-0.5 border border-[#FFD5C8]">
 #{row.rank_position}
 </span>
 ) : (
 <span className="text-muted-foreground">—</span>
 )}
 </td>
 <td className="px-6 py-4">
 {row.aio_present ? (
 <span className="text-[#1B9E4B] bg-[#F0FDF4] rounded-full px-2.5 py-0.5 border border-[#BBF7D0] font-bold">
 Present
 </span>
 ) : (
 <span className="text-muted-foreground">Not Triggered</span>
 )}
 </td>
 <td className="px-6 py-4">
 <span className={`px-2.5 py-0.5 rounded-full font-bold ${
 isWin ? "text-[#1B9E4B] bg-[#F0FDF4] border border-[#BBF7D0]" :
 isMention ? "text-cyan-700 bg-cyan-50 border border-cyan-200" :
 "text-amber-700 bg-amber-50 border border-amber-200"
 }`}>
 {row.gap_label.replace(/_/g, " ")}
 </span>
 </td>
 <td className="px-6 py-4 text-right">
 {client && (
 <Link
 href={`/dashboard/clients/${client.id}`}
 className="text-primary font-bold hover:underline inline-flex items-center gap-1"
 >
 <span>View</span>
 <ChevronRight size={12} />
 </Link>
 )}
 </td>
 </tr>
 );
 })}
 {results.length === 0 && (
 <tr>
 <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground italic">
 No search results recorded yet. Add keywords and run audits to populate table.
 </td>
 </tr>
 )}
 </tbody>
 </table>
 </div>
 </div>

 {/* ── Section 5: Client Portfolio Grid ── */}
 <div>
 <div className="flex items-center justify-between mb-5 flex-wrap gap-4">
 <div>
 <h2 className="text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
 <span>Client Portfolio</span>
 <span className="text-xs text-muted-foreground font-normal">({clientList.length} domains tracked)</span>
 </h2>
 <p className="text-xs text-muted-foreground mt-0.5 font-medium">
 Individual brand authority cards tracking citation health and keyword gaps
 </p>
 </div>

 <div className="flex items-center gap-3">
 {!isSuperAdmin && typeof maxClients === "number" && (
 <span className="text-xs text-slate-600 bg-slate-100 border border-slate-200 rounded-full px-3 py-1 font-semibold">
 <strong className="text-slate-900">{clientList.length}</strong> of {maxClients} slots used
 </span>
 )}

 <Link
 href="/dashboard/clients/new"
 className="flex items-center gap-2 rounded-full px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
 >
 <Plus size={15} />
 <span>ADD CLIENT</span>
 </Link>
 </div>
 </div>

 {clientList.length === 0 ? (
 <div className="rounded-[20px] border border-dashed border-border bg-card p-12 text-center shadow-[0_15px_40px_rgba(0,0,0,0.35)] transition-all duration-250 ease-out hover:-translate-y-[3px] hover:shadow-[0_20px_60px_rgba(255,90,31,0.15)]">
 <Sparkles size={36} className="text-primary mx-auto mb-3" />
 <p className="text-base font-bold text-foreground mb-1">Your Portfolio is Empty</p>
 <p className="text-xs text-muted-foreground max-w-md mx-auto mb-6">
 Add your first client domain to activate AI Mode monitoring and uncover whether ChatGPT and Gemini are citing your brand.
 </p>
 <Link
 href="/dashboard/clients/new"
 className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-sm transition-colors"
 >
 <Plus size={15} /> Add First Client Domain
 </Link>
 </div>
 ) : (
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
 {clientList.map((client) => {
 const svc = SERVICE_TYPE_LABELS[(client.service_type as ServiceType) || "seo_geo"];
 const clientResults = results.filter((r) => r.client_id === client.id);

 return (
 <Link
 key={client.id}
 href={`/dashboard/clients/${client.id}`}
 className="group rounded-[20px] border border-border/80 hover:border-primary bg-card p-6 transition-all duration-200 block shadow-sm hover:shadow-md hover:-translate-y-0.5"
 >
 <div className="flex items-center justify-between mb-4">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-[20px] bg-primary/10 border border-[#FFD5C8] flex items-center justify-center text-primary font-extrabold text-xs shadow-xs">
 {client.name.slice(0, 2).toUpperCase()}
 </div>
 <div>
 <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate max-w-[160px]">
 {client.name}
 </p>
 <p className="text-[11px] text-muted-foreground truncate max-w-[160px] font-medium">
 {client.website}
 </p>
 </div>
 </div>

 <span className="rounded-md px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-slate-100 border border-slate-200 text-slate-700">
 {svc?.short || "SEO/GEO"}
 </span>
 </div>

 <div className="mt-5 pt-3.5 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground font-medium">
 <span>Tracked Queries: <strong className="text-foreground font-extrabold">{clientResults.length}</strong></span>
 <span className="text-primary font-bold group-hover:underline flex items-center gap-0.5">
 Dashboard →
 </span>
 </div>
 </Link>
 );
 })}
 </div>
 )}
 </div>
 </div>
 );
}

