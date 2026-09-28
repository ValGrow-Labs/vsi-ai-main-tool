"use client";

import React, { useState } from "react";
import Link from "next/link";
import { HelpCircle, Search, BookOpen, Globe, Terminal, ShieldCheck, FileText, MessageSquare, ChevronRight, ChevronDown, ChevronUp, ExternalLink, CheckCircle2, AlertCircle, Lightbulb, ArrowRight, Send, Layers, BarChart2, TrendingUp, Users, CheckSquare, Sliders, Compass, MessageSquareText, ListChecks } from "lucide-react";
import {
  GoogleLogo,
  OpenAILogo,
  GeminiLogo,
  PerplexityLogo,
} from "@/components/ui/ai-logos";

type HelpCategory =
  | "all-features"
  | "ai-visibility"
  | "site-audit"
  | "prompts"
  | "tasks-reports"
  | "glossary"
  | "faqs"
  | "contact";

interface HelpArticle {
  id: string;
  category: HelpCategory;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  badge?: string;
  content: React.ReactNode;
}

export default function HelpCenterPage() {
  const [activeCategory, setActiveCategory] = useState<HelpCategory>("all-features");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedArticleId, setExpandedArticleId] = useState<string | null>("feat-visibility");
  const [contactSubject, setContactSubject] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [ticketSent, setTicketSent] = useState(false);
  const [ticketSending, setTicketSending] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);

  const categories = [
    {
      id: "all-features" as HelpCategory,
      label: "Platform & Features Guide",
      icon: Compass,
      desc: "What each page & tool does",
    },
    {
      id: "ai-visibility" as HelpCategory,
      label: "AI search questions",
      icon: MessageSquareText,
      desc: "How ChatGPT, Google & Perplexity work",
    },
    {
      id: "site-audit" as HelpCategory,
      label: "Site Audit & Technical Fixes",
      icon: ShieldCheck,
      desc: "Fixing robots.txt & schema issues",
    },
    {
      id: "prompts" as HelpCategory,
      label: "Prompt Management",
      icon: Terminal,
      desc: "Testing queries & simulation",
    },
    {
      id: "tasks-reports" as HelpCategory,
      label: "Tasks & Client Reports",
      icon: FileText,
      desc: "Action board & exporting strategy PDFs",
    },
    {
      id: "glossary" as HelpCategory,
      label: "Plain-English Glossary",
      icon: BookOpen,
      desc: "Definitions of terms & metrics",
    },
    {
      id: "faqs" as HelpCategory,
      label: "Frequently Asked Questions",
      icon: HelpCircle,
      desc: "Common doubts & instant answers",
    },
    {
      id: "contact" as HelpCategory,
      label: "Contact Support",
      icon: MessageSquare,
      desc: "Ask our engineering team",
    },
  ];

  const articles: HelpArticle[] = [
    // Feature Guides
    {
      id: "feat-visibility",
      category: "all-features",
      title: "Where Your Brand Appears (AI Visibility View)",
      subtitle: "Understand how your website is ranked on Google Search vs AI assistants",
      icon: BarChart2,
      badge: "Core Feature",
      content: (
        <div className="space-y-3.5 text-caption text-ink-2 dark:text-ink-3 leading-relaxed">
          <p>
            This page provides a unified summary of how your brand shows up when people search on Google or ask AI engines.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="p-3 rounded-panel bg-surface-2 dark:bg-surface-2/40 border border-line/70 dark:border-line space-y-1">
              <span className="font-semibold text-ink dark:text-ink">Direct AI Citations</span>
              <p className="text-caption text-ink-3 dark:text-ink-3">
                When an AI model (like ChatGPT, Gemini, or Perplexity) generates an answer and links directly to your website as a clickable source link.
              </p>
            </div>
            <div className="p-3 rounded-panel bg-surface-2 dark:bg-surface-2/40 border border-line/70 dark:border-line space-y-1">
              <span className="font-semibold text-ink dark:text-ink">Organic SERP Rank</span>
              <p className="text-caption text-ink-3 dark:text-ink-3">
                Your standard numerical ranking on traditional Google search results for target keywords (e.g. Position #1 or #3).
              </p>
            </div>
          </div>
          <p className="pt-1">
            <strong>How to use this page:</strong> Filter by keyword or status (Winning, Opportunity, Missing) to see where you need to publish content or add structured schema.
          </p>
        </div>
      ),
    },
    {
      id: "feat-audit",
      category: "all-features",
      title: "Site Audit & AI Bot Diagnostics",
      subtitle: "Find out if AI search crawlers can read and index your pages",
      icon: ShieldCheck,
      badge: "Technical",
      content: (
        <div className="space-y-3.5 text-caption text-ink-2 dark:text-ink-3 leading-relaxed">
          <p>
            Traditional search bots (Googlebot) read HTML. Modern AI search bots (like <code>GPTBot</code>, <code>PerplexityBot</code>, and <code>ClaudeBot</code>) require permission in your <code>robots.txt</code> file and clean structured data to cite you.
          </p>
          <div className="bg-brand-soft/70 border border-brand/40 dark:border-brand/40 p-3.5 rounded-panel space-y-1 text-brand-strong dark:text-brand-strong">
            <p className="font-semibold">Common Doubt: &quot;Why is my AI audit score low?&quot;</p>
            <p className="text-caption text-brand-strong dark:text-brand-strong">
              The most common reason is a wildcard <code>Disallow: /</code> in your robots.txt file blocking AI user-agents, or missing JSON-LD Organization and FAQ schema.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "feat-next-actions",
      category: "all-features",
      title: "Next Actions & Citation Opportunities",
      subtitle: "Prioritized recommendations to win citations from competitors",
      icon: ListChecks,
      badge: "Strategy",
      content: (
        <div className="space-y-3.5 text-caption text-ink-2 dark:text-ink-3 leading-relaxed">
          <p>
            The Next Actions engine analyzes search gaps where competitors are being cited by AI models instead of your brand, and calculates the easiest fixes.
          </p>
          <ul className="list-disc pl-5 space-y-1 text-[11.5px]">
            <li><strong>Add Comparison Tables:</strong> AI models love clear Markdown/HTML comparison tables for &quot;best vs&quot; queries.</li>
            <li><strong>Publish Structured FAQs:</strong> Direct Q&amp;A format is the #1 format extracted by Google AI Overviews.</li>
            <li><strong>Claim Directory Citations:</strong> AI models look up trusted aggregators (G2, Trustpilot, Crunchbase, Wikipedia).</li>
          </ul>
        </div>
      ),
    },
    {
      id: "feat-prompts",
      category: "all-features",
      title: "AI Prompt Management",
      subtitle: "Test what ChatGPT, Gemini, and Perplexity say about your brand",
      icon: Terminal,
      badge: "Testing",
      content: (
        <div className="space-y-3.5 text-caption text-ink-2 dark:text-ink-3 leading-relaxed">
          <p>
            Instead of manually typing queries into multiple AI tools, VSI lets you evaluate prompts across all major LLM engines in 3 steps:
          </p>
          <ol className="list-decimal pl-5 space-y-1 text-[11.5px]">
            <li>Select an AI model (Google AIO, ChatGPT, Gemini, Perplexity).</li>
            <li>Enter your target search phrase (e.g. <em>best saas platform</em>) and website domain.</li>
            <li>Click <strong>Run Test Prompt</strong> to simulate the live answer and see if your website link appears in citations.</li>
          </ol>
        </div>
      ),
    },
    {
      id: "feat-tasks",
      category: "all-features",
      title: "Tasks & Action Board",
      subtitle: "Track SEO and GEO optimization tickets from idea to execution",
      icon: CheckSquare,
      badge: "Workflow",
      content: (
        <div className="space-y-3.5 text-caption text-ink-2 dark:text-ink-3 leading-relaxed">
          <p>
            The Action Board is a Kanban workspace designed for SEO strategists and developers. You can convert diagnostic audit findings directly into actionable tasks, assign them to team members, and track status (To Do, In Progress, Completed).
          </p>
        </div>
      ),
    },

    // AI Visibility & GEO Doubts
    {
      id: "geo-citation-vs-mention",
      category: "ai-visibility",
      title: "What is the difference between an AI Citation and an AI Mention?",
      subtitle: "Understanding how AI models reference your brand",
      icon: MessageSquareText,
      content: (
        <div className="space-y-3.5 text-caption text-ink-2 dark:text-ink-3 leading-relaxed">
          <p>
            <strong>AI Mention:</strong> When an AI writes your brand name in text (e.g. &quot;ValGrow Labs is a popular search intelligence tool&quot;) but does <em>not</em> provide a clickable link.
          </p>
          <p>
            <strong>Direct AI Citation:</strong> When the AI model provides a live, clickable source link directly to your website URL at the top or bottom of its response. Citations drive high-intent referral traffic and establish domain authority.
          </p>
        </div>
      ),
    },
    {
      id: "geo-how-llms-choose",
      category: "ai-visibility",
      title: "How do LLMs (ChatGPT, Gemini, Perplexity) choose who to recommend?",
      subtitle: "The mechanics of AI Search Retrieval-Augmented Generation (RAG)",
      icon: MessageSquareText,
      content: (
        <div className="space-y-3.5 text-caption text-ink-2 dark:text-ink-3 leading-relaxed">
          <p>
            When a user asks a question, modern AI models do not rely solely on their training data. They perform a <strong>Live Web Grounding Search</strong>:
          </p>
          <ol className="list-decimal pl-5 space-y-1.5 text-[11.5px]">
            <li>The AI executes 3–5 real-time background search queries on search indexes.</li>
            <li>It extracts top matching paragraphs from high-authority websites.</li>
            <li>It synthesizes a direct answer and adds source citations to the pages that provided the clearest, most reliable data.</li>
          </ol>
        </div>
      ),
    },

    // Site Audit Doubts
    {
      id: "audit-robots-txt",
      category: "site-audit",
      title: "How do I unblock AI bots in robots.txt?",
      subtitle: "Ensuring GPTBot, PerplexityBot, and Google-Extended can index your site",
      icon: ShieldCheck,
      content: (
        <div className="space-y-3.5 text-caption text-ink-2 dark:text-ink-3 leading-relaxed">
          <p>
            If your site audit shows an AI crawler block, check your website&apos;s <code>robots.txt</code> file (located at <code>yourwebsite.com/robots.txt</code>).
          </p>
          <div className="p-3 rounded-panel bg-ink text-positive font-mono text-caption leading-relaxed">
            User-agent: GPTBot<br />
            Allow: /<br /><br />
            User-agent: PerplexityBot<br />
            Allow: /<br /><br />
            User-agent: ClaudeBot<br />
            Allow: /
          </div>
          <p className="text-caption text-ink-3">
            Adding the snippet above allows AI search engines to crawl and cite your content in real-time answers.
          </p>
        </div>
      ),
    },

    // Glossary
    {
      id: "glossary-terms",
      category: "glossary",
      title: "Plain-English Glossary of Search & AI Terms",
      subtitle: "Quick definitions of common industry acronyms",
      icon: BookOpen,
      content: (
        <div className="space-y-3 text-caption text-ink-2 dark:text-ink-3 leading-relaxed">
          <div className="grid grid-cols-1 gap-2.5">
            <div className="p-3 rounded-panel bg-surface-2 dark:bg-surface-2/40 border border-line/70 dark:border-line">
              <span className="font-semibold text-ink dark:text-ink">GEO (Generative Engine Optimization)</span>
              <p className="text-caption text-ink-3 dark:text-ink-3 mt-0.5">
                The modern evolution of SEO focused on getting recommended and cited inside AI-generated responses (ChatGPT, Google AI, Perplexity).
              </p>
            </div>
            <div className="p-3 rounded-panel bg-surface-2 dark:bg-surface-2/40 border border-line/70 dark:border-line">
              <span className="font-semibold text-ink dark:text-ink">AI Overview (AIO)</span>
              <p className="text-caption text-ink-3 dark:text-ink-3 mt-0.5">
                Google&apos;s AI-generated snapshot shown at the very top of Google Search results, summarizing information from multiple web sources.
              </p>
            </div>
            <div className="p-3 rounded-panel bg-surface-2 dark:bg-surface-2/40 border border-line/70 dark:border-line">
              <span className="font-semibold text-ink dark:text-ink">Citation Share of Voice</span>
              <p className="text-caption text-ink-3 dark:text-ink-3 mt-0.5">
                The percentage of times your website is cited by AI models compared to your competitors for target keyword clusters.
              </p>
            </div>
            <div className="p-3 rounded-panel bg-surface-2 dark:bg-surface-2/40 border border-line/70 dark:border-line">
              <span className="font-semibold text-ink dark:text-ink">JSON-LD Schema Markup</span>
              <p className="text-caption text-ink-3 dark:text-ink-3 mt-0.5">
                Hidden machine-readable code on your webpage that explicitly tells AI models who you are, what products you sell, and your verified pricing.
              </p>
            </div>
          </div>
        </div>
      ),
    },
  ];

  // Filter articles based on active category and search query
  const filteredArticles = articles.filter((art) => {
    const matchesCategory = activeCategory === "all-features" || art.category === activeCategory;
    const matchesSearch =
      art.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      art.subtitle.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Support requests are stored in the product feedback inbox (the feedback table), which the
  // VSI team reads in the admin area. There is no email delivery and no promised response time.
  const handleSendTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactSubject.trim() || !contactMessage.trim() || ticketSending) return;
    setTicketSending(true);
    setTicketError(null);
    setTicketSent(false);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "question",
          subject: contactSubject.trim(),
          message: contactMessage.trim(),
          page_url: "/dashboard/help",
          context_data: { submitted_from: "help_contact_support" },
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Your request wasn't sent. Please try again.");
      }
      setTicketSent(true);
      setContactSubject("");
      setContactMessage("");
      setTimeout(() => setTicketSent(false), 8000);
    } catch (err) {
      setTicketError(err instanceof Error ? err.message : "Your request wasn't sent. Please try again.");
    } finally {
      setTicketSending(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-64px)] bg-canvas text-ink overflow-hidden font-sans">
      
      {/* ── 1. HELP CENTER SIDEBAR ── */}
      <aside className="w-72 border-r border-line dark:border-line hidden md:flex flex-col bg-surface dark:bg-surface/70 shrink-0 select-none">
        
        {/* Top Header */}
        <div className="p-5 border-b border-line dark:border-line space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-panel bg-brand-soft text-brand-strong flex items-center justify-center font-semibold">
              <HelpCircle size={18} className="stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-body font-semibold text-ink dark:text-ink">
                Help
              </h2>
              <p className="text-caption text-ink-3 dark:text-ink-3 font-medium">
                Guides, FAQs &amp; Explanations
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Categories */}
        <nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto custom-scrollbar">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setActiveCategory(cat.id);
                  setExpandedArticleId(null);
                }}
                className={`w-full p-3 rounded-panel text-left transition-all flex items-center gap-3 cursor-pointer ${
                  isActive
                    ? "bg-brand-soft border-2 border-line-strong text-brand-strong"
                    : "bg-transparent hover:bg-surface-2 dark:hover:bg-surface-2/50 text-ink-2 dark:text-ink-3 border border-transparent"
                }`}
              >
                <div className={`w-8 h-8 rounded-panel flex items-center justify-center shrink-0 ${
                  isActive
                    ? "bg-brand-soft text-brand-strong"
                    : "bg-surface-2 dark:bg-surface-2 text-ink-3"
                }`}>
                  <Icon size={16} className="stroke-[2.2]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-caption font-semibold truncate ${isActive ? "text-brand-strong" : "text-ink dark:text-ink"}`}>
                    {cat.label}
                  </p>
                  <p className="text-[10.5px] text-ink-3 dark:text-ink-3 font-medium truncate mt-0.5">
                    {cat.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Bottom AI Assistant Callout */}
        <div className="p-4 border-t border-line dark:border-line">
          <div className="bg-surface-2 border border-brand/40 dark:border-brand/40 rounded-panel p-3.5 space-y-2">
            <div className="flex items-center gap-2 text-caption font-semibold text-ink dark:text-ink">
              <MessageSquareText size={15} className="text-brand-strong" />
              <span>Have an instant question?</span>
            </div>
            <p className="text-caption text-ink-3 dark:text-ink-3 font-medium leading-tight">
              Ask our AI Assistant to explain any metric or ranking issue in real-time.
            </p>
            <Link
              href="/dashboard/chat"
              className="inline-flex items-center gap-1 text-caption font-semibold text-brand-strong hover:underline pt-0.5"
            >
              <span>Ask in AI Chat</span>
              <ArrowRight size={12} />
            </Link>
          </div>
        </div>

      </aside>

      {/* ── 2. MAIN CONTENT AREA ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto custom-scrollbar">
        
        {/* Top Search Bar & Header Banner */}
        <div className="p-6 sm:p-8 bg-surface-2 dark:from-muted/20 dark:via-background border-b border-line/70 dark:border-line space-y-4">
          <div className="max-w-4xl mx-auto space-y-2">
            <div className="flex items-center gap-2 text-caption font-semibold text-brand-strong">
              <span className="h-px w-6 bg-brand" aria-hidden />
              <span className="uppercase tracking-[0.14em]">Help</span>
            </div>
            <h1 className="text-display font-semibold text-ink md:text-[2rem] md:leading-10">
              What can we help you with?
            </h1>
            <p className="text-caption sm:text-body text-ink-3 dark:text-ink-3 font-normal max-w-2xl">
              Search any tool, metric, or concept on the site to see what it does and how to get the most value for your business.
            </p>

            {/* Instant Search Bar */}
            <div className="pt-2 relative max-w-xl">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search help, for example: what is a citation, site audit score, how to test prompts"
                className="w-full bg-surface dark:bg-surface border border-line dark:border-line rounded-panel pl-11 pr-4 py-3 text-caption text-ink placeholder:text-ink-3 focus:outline-none focus:border-line-strong"
              />
            </div>
          </div>
        </div>

        {/* Dynamic Category View */}
        <div className="p-6 sm:p-8 max-w-4xl mx-auto w-full space-y-6 flex-1">
          
          {/* Quick Category Tabs Pills on Mobile */}
          <div className="md:hidden flex items-center gap-2 overflow-x-auto pb-2">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3 py-1.5 rounded-full text-caption font-semibold whitespace-nowrap transition-colors ${
                  activeCategory === cat.id
                    ? "bg-ink text-white"
                    : "bg-surface-2 dark:bg-surface-2 text-ink-2 dark:text-ink-3"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* CONTACT SUPPORT VIEW */}
          {activeCategory === "contact" ? (
            <div className="space-y-6 animate-fadeIn">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-ink dark:text-ink">
                  Contact support &amp; Technical Help
                </h2>
                <p className="text-caption text-ink-3 dark:text-ink-3 font-medium">
                  Still have doubts or need custom setup assistance? Send our team a message.
                </p>
              </div>

              {ticketSent && (
                <div className="p-4 rounded-panel bg-positive-soft border border-positive/30 dark:border-positive/30 text-positive dark:text-positive text-caption font-semibold flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  <span>Your request was saved to the VSI team&apos;s inbox. You can find it under Feedback &rarr; Your feedback.</span>
                </div>
              )}
              {ticketError && (
                <div role="alert" className="p-4 rounded-panel bg-critical/10 border border-critical/20 text-critical text-caption font-semibold flex items-center gap-2">
                  <AlertCircle size={16} />
                  <span>{ticketError}</span>
                </div>
              )}

              <form onSubmit={handleSendTicket} className="bg-surface dark:bg-surface border border-line/80 dark:border-line rounded-panel p-6 space-y-4">
                <div>
                  <label className="text-caption font-semibold text-ink dark:text-ink block mb-1">
                    Subject / What you need help with
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Help understanding my citation ranking results"
                    value={contactSubject}
                    onChange={(e) => setContactSubject(e.target.value)}
                    className="w-full bg-surface-2/70 dark:bg-surface-2/40 border border-line dark:border-line rounded-panel px-3.5 py-2 text-caption font-medium text-ink focus:outline-none focus:border-line-strong"
                  />
                </div>

                <div>
                  <label className="text-caption font-semibold text-ink dark:text-ink block mb-1">
                    Detailed Description
                  </label>
                  <textarea
                    rows={4}
                    required
                    placeholder="Describe your question or doubt..."
                    value={contactMessage}
                    onChange={(e) => setContactMessage(e.target.value)}
                    className="w-full bg-surface-2/70 dark:bg-surface-2/40 border border-line dark:border-line rounded-panel p-3 text-caption text-ink focus:outline-none focus:border-line-strong resize-none"
                  />
                </div>

                <div className="flex items-center justify-end">
                  <button
                    type="submit"
                    disabled={ticketSending}
                    className="px-6 py-2.5 rounded-panel bg-ink hover:bg-ink-2 text-white text-caption font-semibold transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-60"
                  >
                    <Send size={13} />
                    <span>{ticketSending ? "Sending…" : "Send Support Ticket"}</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            /* ARTICLES ACCORDION LIST */
            <div className="space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-ink dark:text-ink">
                  {categories.find((c) => c.id === activeCategory)?.label || "Guides"}
                </h2>
                <span className="text-caption font-semibold text-ink-3">
                  {filteredArticles.length} {filteredArticles.length === 1 ? "article" : "articles"}
                </span>
              </div>

              {filteredArticles.length === 0 ? (
                <div className="bg-surface dark:bg-surface border border-line/80 dark:border-line rounded-panel p-10 text-center space-y-2">
                  <p className="text-body font-semibold text-ink-2 dark:text-ink-3">
                    No articles found matching &quot;{searchQuery}&quot;
                  </p>
                  <p className="text-caption text-ink-3">
                    Try searching for terms like &apos;citation&apos;, &apos;audit&apos;, &apos;prompts&apos;, or &apos;rank&apos;.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredArticles.map((art) => {
                    const isExpanded = expandedArticleId === art.id;
                    const Icon = art.icon;

                    return (
                      <div
                        key={art.id}
                        className="bg-surface dark:bg-surface border border-line/80 dark:border-line rounded-panel overflow-hidden transition-all"
                      >
                        {/* Accordion Header */}
                        <button
                          type="button"
                          onClick={() => setExpandedArticleId(isExpanded ? null : art.id)}
                          className="w-full p-4.5 text-left flex items-center justify-between gap-4 cursor-pointer hover:bg-surface-2/50 dark:hover:bg-surface-2/30 transition-colors"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            <div className="w-10 h-10 rounded-panel bg-brand-soft text-brand-strong flex items-center justify-center shrink-0">
                              <Icon size={18} className="stroke-[2.2]" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h3 className="text-caption sm:text-body font-semibold text-ink dark:text-ink truncate">
                                  {art.title}
                                </h3>
                                {art.badge && (
                                  <span className="text-caption font-semibold bg-brand-soft text-brand-strong px-2 py-0.5 rounded-full shrink-0">
                                    {art.badge}
                                  </span>
                                )}
                              </div>
                              <p className="text-caption text-ink-3 dark:text-ink-3 font-medium truncate mt-0.5">
                                {art.subtitle}
                              </p>
                            </div>
                          </div>

                          <div className="w-7 h-7 rounded-control bg-surface-2 dark:bg-surface-2 text-ink-3 flex items-center justify-center shrink-0">
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        </button>

                        {/* Accordion Body */}
                        {isExpanded && (
                          <div className="p-5 pt-2 border-t border-line dark:border-line/60 bg-surface-2/30 dark:bg-surface-2/10 animate-fadeIn">
                            {art.content}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
