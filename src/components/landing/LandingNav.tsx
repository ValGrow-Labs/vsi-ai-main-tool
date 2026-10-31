"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Menu,
  X,
  ArrowRight,
  ChevronDown,
  ShieldCheck,
  Search,
  Bot,
  Users,
  Activity,
  FileCode,
  Sparkles,
  TrendingUp,
  Cpu,
  Layers,
  BarChart3,
  Globe,
  CheckCircle2,
  Lock,
  LayoutDashboard,
} from "lucide-react";
import { VSI_COLORS } from "./tokens";

/* -------------------------------------------------------------------------- */
/* VSI Tool Navigation Data Structure                                         */
/* -------------------------------------------------------------------------- */

type MenuKey = "overview" | "site-audit" | "radar" | "competitors" | null;

interface SubItem {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href: string;
}

interface MenuData {
  key: MenuKey;
  label: string;
  href: string;
  badge?: string;
  heading: string;
  subheading: string;
  items: SubItem[];
  highlight: {
    title: string;
    description: string;
    ctaText: string;
    ctaHref: string;
  };
}

const VSI_NAV_MODULES: MenuData[] = [
  {
    key: "overview",
    label: "Overview",
    href: "#overview",
    badge: "Command Center",
    heading: "Executive Search & Generative AI Command Center",
    subheading: "Unified telemetry across organic search rankings, AI engine citations, and technical site health in one pane.",
    items: [
      {
        icon: LayoutDashboard,
        title: "Unified Search & GEO Dashboard",
        description: "Consolidated real-time view of traditional SERP positions and AI citation share.",
        href: "#overview",
      },
      {
        icon: Activity,
        title: "Search Visibility Index (SVI)",
        description: "Blended 0-100 composite score tracking organic authority and conversational AI discovery.",
        href: "#overview",
      },
      {
        icon: Bot,
        title: "Multi-Engine Telemetry Stream",
        description: "Simultaneous sub-minute monitoring across Google, ChatGPT Search, Perplexity, and Gemini.",
        href: "#radar-simulator",
      },
      {
        icon: CheckCircle2,
        title: "Prioritized Action Queue",
        description: "Algorithmic recommendations ranked by traffic impact with direct code solutions.",
        href: "#overview",
      },
    ],
    highlight: {
      title: "One Workspace for All Search",
      description: "Consolidate fragmented SEO tools into a single command center built for both Google and generative AI models.",
      ctaText: "Explore Live Workspace",
      ctaHref: "#overview",
    },
  },
  {
    key: "site-audit",
    label: "Site Audit",
    href: "#site-audit",
    heading: "Technical Site Auditing & Health Engine",
    subheading: "Deep algorithmic inspection of website architecture, Core Web Vitals, and crawler indexing.",
    items: [
      {
        icon: ShieldCheck,
        title: "Website Health Score",
        description: "Comprehensive 0-100 technical rating with critical error and warning breakdown.",
        href: "#site-audit",
      },
      {
        icon: Activity,
        title: "Core Web Vitals & LCP",
        description: "Measure mobile render latency, Largest Contentful Paint, and hydration bottlenecks.",
        href: "#site-audit",
      },
      {
        icon: FileCode,
        title: "Knowledge Graph Schema",
        description: "Validate JSON-LD structured data and entity linkages for search engines and AI.",
        href: "#site-audit",
      },
      {
        icon: Bot,
        title: "Robots.txt & AI Crawler Rules",
        description: "Ensure GPTBot, PerplexityBot, and ClaudeBot have optimized access to public assets.",
        href: "#site-audit",
      },
    ],
    highlight: {
      title: "Real-Time Algorithmic Scans",
      description: "Find problems hurting your website and test how resolving them directly restores your ranking velocity.",
      ctaText: "Explore Site Audit",
      ctaHref: "#site-audit",
    },
  },
  {
    key: "radar",
    label: "Search & GEO Radar",
    href: "#radar-simulator",
    badge: "Dual-Engine",
    heading: "Google Search & Generative AI Telemetry",
    subheading: "Synchronize traditional organic SERP rank tracking with Generative Engine Optimization (GEO).",
    items: [
      {
        icon: Search,
        title: "Google Top 3 Rank Tracking",
        description: "Track daily keyword ranking movements, commercial intent, and SERP market share.",
        href: "#radar-simulator",
      },
      {
        icon: Sparkles,
        title: "Perplexity Pro Citation Tracking",
        description: "Track exact citations, reference rankings, and source confidence in Perplexity answers.",
        href: "#radar-simulator",
      },
      {
        icon: Bot,
        title: "ChatGPT Search 4o Synthesis",
        description: "Monitor buyer recommendation queries where your brand is synthesized in ChatGPT.",
        href: "#radar-simulator",
      },
      {
        icon: Globe,
        title: "Google AI Overviews Coverage",
        description: "Track featured source inclusions in Google's generative AI summary carousels.",
        href: "#radar-simulator",
      },
    ],
    highlight: {
      title: "Generative Engine Optimization (GEO)",
      description: "Over 35% of high-intent purchase searches now resolve in AI answers. Ensure your brand is cited.",
      ctaText: "Test Radar Simulator",
      ctaHref: "#radar-simulator",
    },
  },
  {
    key: "competitors",
    label: "Competitors",
    href: "#competitors",
    heading: "Competitive Share of Voice & Benchmarking",
    subheading: "Head-to-head visibility analysis against top market competitors across Google and AI search.",
    items: [
      {
        icon: Users,
        title: "Keyword Overlap Matrix",
        description: "Identify high-value search terms competitors rank for that your domain is missing.",
        href: "#competitors",
      },
      {
        icon: Bot,
        title: "AI Citation Gap Analysis",
        description: "Discover generative recommendation queries where competitors capture the primary citation.",
        href: "#competitors",
      },
      {
        icon: TrendingUp,
        title: "Search Visibility Index Comparison",
        description: "Benchmark organic keyword velocity and citation momentum over 30, 60, and 90 days.",
        href: "#competitors",
      },
      {
        icon: Activity,
        title: "Real-Time Movement Alerts",
        description: "Automated webhook alerts when competitor rankings drop or enter your top keyword clusters.",
        href: "#competitors",
      },
    ],
    highlight: {
      title: "Outmaneuver Competitors",
      description: "Monitor keyword overlaps, content gaps, and entity citation rates in real time.",
      ctaText: "Explore Benchmarking",
      ctaHref: "#competitors",
    },
  },
];

/* -------------------------------------------------------------------------- */
/* Navigation Component with Interactive Mega Menu (Video Template Style)     */
/* -------------------------------------------------------------------------- */

export function LandingNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeMenu, setActiveMenu] = useState<MenuKey>(null);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 12);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mega menu on click outside or escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveMenu(null);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleMouseEnter = (key: MenuKey) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setActiveMenu(key);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setActiveMenu(null);
    }, 180);
  };

  const currentMenuData = VSI_NAV_MODULES.find((m) => m.key === activeMenu);

  return (
    <header
      ref={navRef}
      onMouseLeave={handleMouseLeave}
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-200 ${
        isScrolled || activeMenu
          ? "bg-[#FFFFFF] shadow-[0_2px_14px_rgba(32,33,36,0.06)] border-b border-[#E5E7EB]"
          : "bg-[#FFFFFF] border-b border-[#E5E7EB]/70"
      }`}
    >
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-18 flex items-center justify-between">
        {/* Left: VSI Brand Logo */}
        <Link
          href="/"
          onClick={() => setActiveMenu(null)}
          className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6818] rounded-md"
        >
          <div className="w-9 h-9 rounded-md bg-[#8B6818] flex items-center justify-center text-white font-bold text-lg tracking-wider shadow-xs transition-transform duration-200 group-hover:scale-105">
            <span>V</span>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-base tracking-tight text-[#202124]">
                VSI
              </span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#F8F5ED] text-[#8B6818] border border-[#C6AD70]/40">
                SEO & GEO
              </span>
            </div>
            <span className="text-[11px] font-normal tracking-normal text-[#6B7280] hidden sm:block">
              ValGrow Search Intelligence
            </span>
          </div>
        </Link>

        {/* Center: VSI Tool Navigation Items with Mega-Menu Triggers (Video Style) */}
        <nav className="hidden md:flex items-center gap-1 lg:gap-1.5 h-full">
          {VSI_NAV_MODULES.map((module) => {
            const isOpen = activeMenu === module.key;
            return (
              <div
                key={module.key}
                onMouseEnter={() => handleMouseEnter(module.key)}
                className="relative h-full flex items-center"
              >
                <Link
                  href={module.href}
                  onClick={() => setActiveMenu(null)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-[13px] font-semibold transition-colors ${
                    isOpen
                      ? "text-[#8B6818] bg-[#F8F5ED]"
                      : "text-[#202124] hover:text-[#8B6818] hover:bg-[#F8F5ED]/70"
                  }`}
                >
                  <span>{module.label}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                      isOpen ? "rotate-180 text-[#8B6818]" : "text-[#9CA3AF]"
                    }`}
                  />
                </Link>
              </div>
            );
          })}

          {/* Pricing link */}
          <Link
            href="#pricing"
            onClick={() => setActiveMenu(null)}
            className="px-3 py-1.5 rounded-md text-[13px] font-semibold text-[#202124] hover:text-[#8B6818] hover:bg-[#F8F5ED]/70 transition-colors"
          >
            Pricing
          </Link>
        </nav>

        {/* Right: Sign in & Start Free Audit CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="/login"
            className="px-3.5 py-2 text-[13px] font-semibold text-[#202124] hover:text-[#8B6818] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6818] rounded-md"
          >
            Sign in
          </Link>
          <Link
            href="/login?mode=signup"
            className="inline-flex items-center gap-1.5 px-4.5 py-2 rounded-md bg-[#8B6818] text-white text-[13px] font-semibold hover:bg-[#785913] active:translate-y-px transition-all shadow-xs hover:shadow-[0_4px_14px_rgba(139,104,24,0.3)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6818] focus-visible:ring-offset-2"
          >
            <span>Start Free Audit</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Mobile Hamburger Button */}
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 rounded-md text-[#202124] hover:bg-[#F8F5ED] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B6818]"
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close main menu" : "Open main menu"}
        >
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* ===================================================================== */}
      {/* Interactive Mega Menu Dropdown Panel (Exact Template & Behavior)      */}
      {/* ===================================================================== */}
      <AnimatePresence>
        {activeMenu && currentMenuData && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            onMouseEnter={() => handleMouseEnter(activeMenu)}
            onMouseLeave={handleMouseLeave}
            className="hidden md:block absolute top-full inset-x-0 w-full bg-[#FFFFFF] border-b border-[#E5E7EB] shadow-[0_20px_40px_-12px_rgba(32,33,36,0.1)] z-50"
          >
            <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-7">
              <div className="grid grid-cols-12 gap-8 items-start">
                {/* Left 8 Columns: Module Header + 4 Feature Cards */}
                <div className="col-span-8 space-y-5">
                  <div className="border-b border-[#EEF0F2] pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#8B6818]" />
                      <h3 className="text-base font-bold text-[#202124] tracking-tight">
                        {currentMenuData.heading}
                      </h3>
                      {currentMenuData.badge && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F8F5ED] text-[#8B6818] border border-[#C6AD70]/40">
                          {currentMenuData.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#6B7280] mt-1">
                      {currentMenuData.subheading}
                    </p>
                  </div>

                  {/* 2x2 Feature Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    {currentMenuData.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.title}
                          href={item.href}
                          onClick={() => setActiveMenu(null)}
                          className="group p-3 rounded-xl border border-transparent hover:border-[#E5E7EB] hover:bg-[#FAF8F5] transition-all flex items-start gap-3"
                        >
                          <span className="w-8 h-8 rounded-lg bg-[#F8F5ED] border border-[#C6AD70]/30 text-[#8B6818] flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-[#8B6818] group-hover:text-white transition-colors">
                            <Icon className="w-4 h-4" />
                          </span>
                          <div>
                            <span className="text-[13px] font-bold text-[#202124] group-hover:text-[#8B6818] transition-colors block">
                              {item.title}
                            </span>
                            <span className="text-[11px] text-[#6B7280] leading-relaxed block mt-0.5">
                              {item.description}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>

                {/* Right 4 Columns: Highlight Card (Video Style) */}
                <div className="col-span-4 pl-4 border-l border-[#EEF0F2]">
                  <div className="p-5 rounded-2xl bg-[#F8F5ED] border border-[#C6AD70]/40 space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#8B6818]" />
                      <span className="text-xs font-bold uppercase tracking-wider text-[#8B6818]">
                        VSI Intelligence
                      </span>
                    </div>

                    <h4 className="text-sm font-bold text-[#202124] leading-snug">
                      {currentMenuData.highlight.title}
                    </h4>

                    <p className="text-xs text-[#6B7280] leading-relaxed">
                      {currentMenuData.highlight.description}
                    </p>

                    <Link
                      href={currentMenuData.highlight.ctaHref}
                      onClick={() => setActiveMenu(null)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#8B6818] hover:underline pt-1"
                    >
                      <span>{currentMenuData.highlight.ctaText}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===================================================================== */}
      {/* Mobile Drawer (with Collapsible Sub-features)                          */}
      {/* ===================================================================== */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-x-0 top-16 bg-[#FFFFFF] border-b border-[#E5E7EB] shadow-xl animate-fade-in p-6 max-h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 pb-4 border-b border-[#EEF0F2]">
              {VSI_NAV_MODULES.map((module) => {
                const isExpanded = mobileExpanded === module.key;
                return (
                  <div key={module.key} className="border-b border-[#EEF0F2]/60 last:border-0 pb-1">
                    <button
                      type="button"
                      onClick={() => setMobileExpanded(isExpanded ? null : module.key)}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-bold text-[#202124] hover:bg-[#F8F5ED]"
                    >
                      <span>{module.label}</span>
                      <ChevronDown
                        className={`w-4 h-4 text-[#6B7280] transition-transform ${
                          isExpanded ? "rotate-180 text-[#8B6818]" : ""
                        }`}
                      />
                    </button>

                    {isExpanded && (
                      <div className="pl-4 pr-2 py-2 space-y-2 bg-[#FAF8F5] rounded-lg mt-1">
                        {module.items.map((item) => (
                          <Link
                            key={item.title}
                            href={item.href}
                            onClick={() => setMobileOpen(false)}
                            className="block py-1 text-xs text-[#202124] hover:text-[#8B6818] font-medium"
                          >
                            {item.title}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              <Link
                href="#pricing"
                onClick={() => setMobileOpen(false)}
                className="px-3 py-2.5 rounded-md text-sm font-bold text-[#202124] hover:bg-[#F8F5ED]"
              >
                Pricing
              </Link>
            </div>

            <div className="flex flex-col gap-2.5 pt-1">
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="w-full h-11 flex items-center justify-center rounded-md border border-[#E5E7EB] bg-white text-sm font-semibold text-[#202124] hover:bg-[#F4F5F7] transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/login?mode=signup"
                onClick={() => setMobileOpen(false)}
                className="w-full h-11 flex items-center justify-center gap-2 rounded-md bg-[#8B6818] text-white text-sm font-semibold hover:bg-[#785913] transition-colors shadow-xs"
              >
                <span>Start Free Audit</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
