export interface QATest {
  id: string;       // stable id, used for localStorage keys
  label: string;
  hint?: string;
}

export interface QASection {
  id: string;
  title: string;
  description?: string;
  tests: QATest[];
}

export const QA_SECTIONS: QASection[] = [
  {
    id: "auth",
    title: "Auth & onboarding",
    tests: [
      { id: "1.1", label: "Visit / while logged out → redirected to /auth/login" },
      { id: "1.2", label: "Click 'Register your agency' on login → reaches /auth/register" },
      { id: "1.3", label: "Register without an invite code → friendly error, no account created" },
      { id: "1.4", label: "Register with an invalid invite code → 'Invalid invite code' error" },
      { id: "1.5", label: "Register with a valid pilot invite → account created, redirected to /onboarding" },
      { id: "1.6", label: "Onboarding shows 'Pilot access — up to 10 keywords' banner" },
      { id: "1.7", label: "Submit blank agency name → validation prevents submit" },
      { id: "1.8", label: "Enter agency name → click Launch → reach /dashboard" },
      { id: "1.9", label: "Re-using a consumed invite code on a new registration fails" },
      { id: "1.10", label: "Sign out → redirected to login" },
      { id: "1.11", label: "Log back in → see the agency, not fresh onboarding" },
    ],
  },
  {
    id: "super-admin",
    title: "Super admin",
    tests: [
      { id: "2.1", label: "Logged in as super admin → 'Super Admin' link visible in sidebar" },
      { id: "2.2", label: "/admin shows agencies / users / invites counts" },
      { id: "2.3", label: "/admin/users → Invites tab → create a member invite → code shown" },
      { id: "2.4", label: "Generated invite appears in the list with status 'Open'" },
      { id: "2.5", label: "After someone redeems → status flips to 'Used'" },
      { id: "2.6", label: "/admin/organizations → lists every organization with projects, users and last activity" },
      { id: "2.7", label: "/admin/users → lists every user with their agency" },
      { id: "2.8", label: "/admin/settings → toggle 'ChatGPT visibility check' → save reflects immediately" },
      { id: "2.9", label: "/admin/settings → change default cron frequency → save" },
      { id: "2.10", label: "/admin/jobs → Scheduled runs filter shows run history (after the first run)" },
      { id: "2.11", label: "/admin/health → Search provider test → run a test search → see the AI Overview response" },
      { id: "2.12", label: "Logged in as pilot user → /admin redirects to /dashboard" },
    ],
  },
  {
    id: "branding",
    title: "Agency branding (white-label)",
    tests: [
      { id: "3.1", label: "Sidebar shows the 'Branding' link near agency name" },
      { id: "3.2", label: "/dashboard/agency-settings loads with current branding values" },
      { id: "3.3", label: "Upload a logo (PNG/JPEG, under 1MB) → preview appears" },
      { id: "3.4", label: "Uploading a file over 1MB → friendly error" },
      { id: "3.5", label: "Change brand colour with picker → preview button updates live" },
      { id: "3.6", label: "Save → reload → values persist" },
      { id: "3.7", label: "After save, sidebar shows new logo + display name" },
      { id: "3.8", label: "Remove logo → reload → fallback works (no broken image)" },
    ],
  },
  {
    id: "clients",
    title: "Clients",
    tests: [
      { id: "4.1", label: "/dashboard/clients/new → required fields validated" },
      { id: "4.2", label: "Create a client with name, website, brand, location, service" },
      { id: "4.3", label: "New client appears in sidebar and /dashboard/clients" },
      { id: "4.4", label: "Pilot user can create up to 10 keywords across all clients; 11th blocked" },
      { id: "4.5", label: "Click into client → page shows stats + 'No keywords yet'" },
      { id: "4.6", label: "Header has buttons: Add Keywords / Keywords / Reports / Settings / Run Now" },
      { id: "4.7", label: "Sub-pages reachable: keywords / settings / reports / results" },
    ],
  },
  {
    id: "keywords",
    title: "Keywords",
    tests: [
      { id: "5.1", label: "/dashboard/clients/[id]/keywords/new → paste 3 keywords on separate lines" },
      { id: "5.2", label: "Click 'Parse & Preview' → preview rows render" },
      { id: "5.3", label: "Change track type per row → 'Save N keywords' persists" },
      { id: "5.4", label: "Keywords appear in the keyword list view" },
      { id: "5.5", label: "Click into a single keyword → detail page renders without error" },
      { id: "5.6", label: "Detail page shows empty state until first Run Now" },
    ],
  },
  {
    id: "client-settings",
    title: "Per-client settings",
    tests: [
      { id: "6.1", label: "/dashboard/clients/[id]/settings loads with tri-state toggles (Inherit / On / Off)" },
      { id: "6.2", label: "Set 'AI Overview capture' to Off → save → run keyword → no AI Overview data captured" },
      { id: "6.3", label: "Set back to Inherit → run keyword → AI Overview captured again" },
      { id: "6.4", label: "Change check frequency to Daily → save → reflects on overview" },
      { id: "6.5", label: "Set brief model override → next AI Brief uses that model" },
      { id: "6.6", label: "Set location override 'us' → run keyword → snapshot used US location" },
    ],
  },
  {
    id: "run-now",
    title: "Run Now (manual pipeline)",
    tests: [
      { id: "7.1", label: "Click green 'Run Now' on a client with active keywords" },
      { id: "7.2", label: "UI shows progress / loading indicator" },
      { id: "7.3", label: "Latest snapshots table populates after completion" },
      { id: "7.4", label: "Each row shows: keyword, track, gap label, date" },
      { id: "7.5", label: "Click a snapshot → detail page shows AI Overview answer, citations, SERP rank" },
      { id: "7.6", label: "Citation links are clickable and open in new tab" },
      { id: "7.7", label: "SERP result rows are clickable and open in new tab" },
      { id: "7.8", label: "Commercial query (e.g. 'best seo agency dubai') → AI Overview populated" },
      { id: "7.9", label: "ChatGPT stat card shows ✓ / ~ / ✗ (if ChatGPT enabled)" },
      { id: "7.10", label: "Gap breakdown card reflects new snapshot counts" },
    ],
  },
  {
    id: "ai-brief",
    title: "AI Brief",
    tests: [
      { id: "8.1", label: "'Generate AI Brief' button visible on keyword detail" },
      { id: "8.2", label: "Click Generate → shows 'Generating...' state" },
      { id: "8.3", label: "Within ~60s → brief renders with situation, 3 actions, content angle, key insight" },
      { id: "8.4", label: "Actions reference actual query + competitor domains (not generic)" },
      { id: "8.5", label: "Brief uses CURRENT year (not 2024 or earlier)" },
      { id: "8.6", label: "Brief persists across page reloads" },
      { id: "8.7", label: "'↻ Regenerate' overwrites the previous brief" },
      { id: "8.8", label: "When signals change (rank moves, new citation) → 'Outdated' pill appears" },
      { id: "8.9", label: "Hide / Show buttons collapse without re-generating" },
    ],
  },
  {
    id: "citation-strategy",
    title: "Citation strategy (Firecrawl + LLM)",
    tests: [
      { id: "9.1", label: "'Citation Strategy' panel visible on keyword detail" },
      { id: "9.2", label: "'⚡ Analyse citations' enabled when competitor citations exist" },
      { id: "9.3", label: "Click Analyse → 'Analysing citations…' state" },
      { id: "9.4", label: "After ~30–60s → TL;DR, patterns, gaps, 3-step plan, sources analysed render" },
      { id: "9.5", label: "Sources analysed list shows clickable URLs with word counts" },
      { id: "9.6", label: "Failed scrape is marked red with 'scrape failed' label" },
      { id: "9.7", label: "Recommendations reference real tactics (Reddit, Bing Webmaster, listicle structure)" },
      { id: "9.8", label: "'↻ Re-analyse' overwrites previous strategy" },
    ],
  },
  {
    id: "chatgpt",
    title: "ChatGPT visibility",
    tests: [
      { id: "10.1", label: "ChatGPT card on keyword detail shows ✓ / ~ / ✗" },
      { id: "10.2", label: "Below snapshot → ChatGPT Response panel shows full LLM answer text" },
      { id: "10.3", label: "Cited sources panel shows clickable URLs (when OPENAI_API_KEY set)" },
      { id: "10.4", label: "Competitors list shows other brands the LLM mentioned" },
      { id: "10.5", label: "Disabling ChatGPT in super admin → next snapshot has no ChatGPT data" },
    ],
  },
  {
    id: "reports",
    title: "Reports",
    tests: [
      { id: "11.1", label: "Client page → 'Reports' → page loads with empty state" },
      { id: "11.2", label: "'+ Generate weekly report' → loading → success with share link" },
      { id: "11.3", label: "Click share link → /r/<token> opens → branded report renders" },
      { id: "11.4", label: "Open share URL in a NEW browser (no login) → still renders" },
      { id: "11.5", label: "Header shows agency logo, display name, client name, date range" },
      { id: "11.6", label: "Hero metrics: keywords tracked, avg rank, AI Overview %, ChatGPT %" },
      { id: "11.7", label: "Wins / Losses sections render with comparable data" },
      { id: "11.8", label: "Opportunities section lists high-priority gap keywords" },
      { id: "11.9", label: "Footer shows agency footer text + support email" },
      { id: "11.10", label: "'Save as PDF' opens print dialog → clean PDF" },
      { id: "11.11", label: "Past reports list shows previously-generated reports with share URLs" },
    ],
  },
  {
    id: "cron",
    title: "Cron auto-runs",
    description: "Only testable after CRON_SECRET is set and a scheduled task is configured.",
    tests: [
      { id: "12.1", label: "Manual curl with bearer token → JSON with clients_processed + keywords_processed" },
      { id: "12.2", label: "Without bearer token → 401 Unauthorized" },
      { id: "12.3", label: "/admin/jobs shows the scheduled run as Completed" },
      { id: "12.4", label: "Client overview shows 'Last automatic run: <recent timestamp>'" },
      { id: "12.5", label: "Client with check_frequency=manual is NOT picked up by cron" },
      { id: "12.6", label: "Client whose interval hasn't elapsed is NOT picked up" },
    ],
  },
  {
    id: "mobile",
    title: "Mobile responsiveness",
    tests: [
      { id: "13.1", label: "Phone width (~375px) → sidebar collapses behind hamburger" },
      { id: "13.2", label: "Hamburger → drawer slides in with full menu" },
      { id: "13.3", label: "Dashboard stat cards stack into 2 columns" },
      { id: "13.4", label: "Client page header stacks vertically; action buttons wrap" },
      { id: "13.5", label: "Latest snapshots table renders as card list" },
      { id: "13.6", label: "Keyword detail AI Overview answer readable, no text overflow" },
      { id: "13.7", label: "Reports page mobile-friendly" },
      { id: "13.8", label: "Public report URL (/r/...) opens cleanly on mobile" },
    ],
  },
  {
    id: "edge",
    title: "Edge cases & errors",
    tests: [
      { id: "14.1", label: "Run Now with zero active keywords → friendly message, no error" },
      { id: "14.2", label: "View another agency's client URL directly → 404" },
      { id: "14.3", label: "View another agency's keyword URL directly → 404" },
      { id: "14.4", label: "Visit /r/<random-bad-token> → 404 page" },
      { id: "14.5", label: "Generate AI Brief while LLM rate-limited → red error box with real error" },
      { id: "14.6", label: "Citation Strategy with no competitor citations → button disabled with explanation" },
      { id: "14.7", label: "Page load while logged out → bounces to login with ?next=" },
    ],
  },
];
