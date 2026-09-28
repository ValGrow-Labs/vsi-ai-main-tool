# VSI QA Checklist

> **Out of date (2026-09-28). Do not use as written.** This checklist predates the current app. In particular:
> it names `https://searchintel.valgrowlabs.com` as the site under test (the production domain is not
> confirmed); it expects scheduled checks to run from `/api/cron/run-due-clients` (they are not functional:
> nothing schedules the route and it cannot see projects); sign-in and sign-up are now on `/login`
> (`/auth/login` and `/auth/register` only redirect); and several `/admin/*` pages moved (see the
> redirects in `next.config.ts`). Rewrite it against the current app before the next test round.

Hand this to a tester. They tick each box with **PASS / FAIL / N/A** and note any defects. Test on the live site at `https://searchintel.valgrowlabs.com` unless otherwise stated.

**Tester:** _____________________  **Date:** _____________________  **Browser/OS:** _____________________

---

## 1. Auth & onboarding

| # | Test | Pass / Fail / Notes |
|---|---|---|
| 1.1 | Visit `/` while logged out → redirected to `/auth/login` | |
| 1.2 | Click "Register your agency" on login → reaches `/auth/register` | |
| 1.3 | Register without an invite code → friendly error, no account created | |
| 1.4 | Register with an invalid invite code → "Invalid invite code" error | |
| 1.5 | Register with a valid pilot invite code (super admin generates from `/admin/invites`) → account created, redirected to `/onboarding` | |
| 1.6 | Onboarding shows "Pilot access — up to 10 keywords" banner | |
| 1.7 | Submit blank agency name → button stays disabled (or validation error) | |
| 1.8 | Enter agency name "Test Agency" → click Launch → reach `/dashboard` | |
| 1.9 | Re-using a consumed invite code on a new registration fails | |
| 1.10 | Sign out from sidebar → redirected to login | |
| 1.11 | Log back in → see the agency, not a fresh onboarding | |

---

## 2. Super admin

| # | Test | Pass / Fail / Notes |
|---|---|---|
| 2.1 | Logged in as super admin → "Super Admin" link visible in sidebar | |
| 2.2 | Click Super Admin → `/admin` shows agencies / users / invites counts | |
| 2.3 | `/admin/invites` → generate a new pilot invite code → copy code | |
| 2.4 | Generated invite appears in the list with status "Open" | |
| 2.5 | After someone redeems an invite → status flips to "Used" | |
| 2.6 | `/admin/agencies` → lists every agency in the system with usage | |
| 2.7 | `/admin/users` → lists every user with their agency | |
| 2.8 | `/admin/settings` → toggle "ChatGPT visibility check" off → save reflects immediately | |
| 2.9 | `/admin/settings` → change default cron frequency from weekly to daily → save | |
| 2.10 | `/admin/cron-runs` → shows history of cron ticks (after cron has run at least once) | |
| 2.11 | `/admin/test-serpapi` → run a test query (e.g. `best seo agency dubai`) → see AI Mode response in JSON | |
| 2.12 | Logged in as pilot user → `/admin` redirects to `/dashboard` (no access) | |

---

## 3. Agency branding (white-label)

| # | Test | Pass / Fail / Notes |
|---|---|---|
| 3.1 | Sidebar shows the "Branding" link near the agency name | |
| 3.2 | `/dashboard/agency-settings` loads with current branding values | |
| 3.3 | Upload a logo (PNG/JPEG, under 1MB) → preview appears | |
| 3.4 | Try uploading a file over 1MB → friendly error | |
| 3.5 | Change brand colour with picker → preview button updates live | |
| 3.6 | Save settings → reload page → values persist | |
| 3.7 | After save, sidebar shows the new logo + display name | |
| 3.8 | Remove logo → reload → no logo shows, fallback works | |

---

## 4. Clients

| # | Test | Pass / Fail / Notes |
|---|---|---|
| 4.1 | `/dashboard/clients/new` → all required fields validated | |
| 4.2 | Create a client with name "Test Client", website, brand name, location, service package | |
| 4.3 | New client appears in sidebar and on `/dashboard/clients` | |
| 4.4 | Pilot user can create up to 10 keywords across all clients (verify trigger blocks the 11th) | |
| 4.5 | Click into client → page shows stats, "No keywords yet" empty state | |
| 4.6 | Header has buttons: + Add Keywords / Keywords / Reports / Settings / Run Now | |
| 4.7 | Sub-pages reachable: keywords list, settings, reports, results | |

---

## 5. Keywords

| # | Test | Pass / Fail / Notes |
|---|---|---|
| 5.1 | `/dashboard/clients/[id]/keywords/new` → paste 3 keywords on separate lines | |
| 5.2 | Click "Parse & Preview" → preview rows render | |
| 5.3 | Change track type for each row → "Save 3 keywords" persists | |
| 5.4 | Keywords appear in the keyword list view | |
| 5.5 | Click into a single keyword → keyword detail page renders without error | |
| 5.6 | Detail page shows empty state until first Run Now | |

---

## 6. Per-client settings

| # | Test | Pass / Fail / Notes |
|---|---|---|
| 6.1 | `/dashboard/clients/[id]/settings` loads with three tri-state toggles (Inherit / On / Off) | |
| 6.2 | Set "AI Mode capture" to Off → save → run a keyword → no AI Mode data captured | |
| 6.3 | Set "AI Mode capture" back to Inherit → run a keyword → AI Mode captured again | |
| 6.4 | Change check frequency to Daily → save → reflects on client overview | |
| 6.5 | Advanced override: set brief model override to `z-ai/glm-4.5-air:free` → save → next AI Brief uses that model (verify via /admin/cron-runs or logs) | |
| 6.6 | Set location override to `us` → save → run keyword → snapshot used US location | |

---

## 7. Run Now (manual pipeline)

| # | Test | Pass / Fail / Notes |
|---|---|---|
| 7.1 | On a client with active keywords → click green "Run Now" button | |
| 7.2 | UI shows progress / loading indicator | |
| 7.3 | After completion, "Latest snapshots" table populates | |
| 7.4 | Each snapshot row has: keyword, track, gap label, date | |
| 7.5 | Click a snapshot keyword → detail page shows AI Mode answer text, citations, SERP rank | |
| 7.6 | AI Mode citation links are clickable and open in a new tab | |
| 7.7 | SERP result rows are clickable and open in a new tab | |
| 7.8 | If a commercial query (e.g. `best seo agency dubai`) → AI Mode panel populated with text + references | |
| 7.9 | ChatGPT stat card shows ✓ / ~ / ✗ status (if ChatGPT enabled) | |
| 7.10 | Gap breakdown card on client overview reflects new snapshot counts | |

---

## 8. AI Brief

| # | Test | Pass / Fail / Notes |
|---|---|---|
| 8.1 | On a keyword detail page → "Generate AI Brief" button visible | |
| 8.2 | Click Generate → status shows "Generating..." | |
| 8.3 | Within ~60s → brief renders with: situation, 3 actions, content angle, key insight | |
| 8.4 | Actions reference the actual query and competitor domains (not generic) | |
| 8.5 | Brief persists across page reloads | |
| 8.6 | Click "↻ Regenerate" → fresh brief overwrites the previous one | |
| 8.7 | When underlying signals change (rank moves, new citation), brief shows "Outdated" pill | |
| 8.8 | Hide / Show buttons collapse / expand the brief without re-generating | |

---

## 9. Citation strategy (Firecrawl + LLM)

| # | Test | Pass / Fail / Notes |
|---|---|---|
| 9.1 | On a keyword with captured citations → "Citation Strategy" panel visible | |
| 9.2 | "⚡ Analyse citations" button enabled when competitor citations exist | |
| 9.3 | Click Analyse → loading state shows "Analysing citations..." | |
| 9.4 | After ~30-60s → panel renders TL;DR, patterns, gaps, 3-step plan, sources analysed | |
| 9.5 | Sources analysed list shows clickable URLs with word counts | |
| 9.6 | A failed scrape is marked red with "scrape failed" label | |
| 9.7 | The recommendations reference real tactics (Reddit, Bing Webmaster, listicle structure) — not generic SEO advice | |
| 9.8 | "↻ Re-analyse" overwrites previous strategy | |

---

## 10. ChatGPT visibility

| # | Test | Pass / Fail / Notes |
|---|---|---|
| 10.1 | After running a keyword with ChatGPT enabled → ChatGPT card shows ✓ / ~ / ✗ | |
| 10.2 | Below the snapshot → ChatGPT Response panel shows the full LLM answer text | |
| 10.3 | Cited sources panel inside ChatGPT Response shows clickable URLs (only when OPENAI_API_KEY set; empty list when using OpenRouter fallback) | |
| 10.4 | Competitors list shows other agencies/brands the LLM mentioned | |
| 10.5 | Disabling ChatGPT in super admin settings → next snapshot has no ChatGPT data | |

---

## 11. Reports

| # | Test | Pass / Fail / Notes |
|---|---|---|
| 11.1 | Client page → click "Reports" → page loads with empty state if no reports yet | |
| 11.2 | Click "+ Generate weekly report" → loading state → success banner with share link | |
| 11.3 | Click the share link → opens `/r/<token>` in new tab → branded report renders | |
| 11.4 | Open the share URL in a NEW browser (no login) → still renders (public access) | |
| 11.5 | Report header shows agency logo, display name, client name, date range | |
| 11.6 | Hero metrics: keywords tracked, avg rank, AI Mode visibility %, ChatGPT % | |
| 11.7 | Wins / Losses sections render only when comparable data exists | |
| 11.8 | Opportunities section lists high-priority gap keywords | |
| 11.9 | Footer shows agency footer text + support email (if set) | |
| 11.10 | "Save as PDF" button → browser's print dialog opens → can save a clean PDF | |
| 11.11 | Past reports list on the client Reports tab shows previously-generated reports with share URLs | |

---

## 12. Cron auto-runs

> Only testable after CRON_SECRET is set and a scheduled task is configured on the host.

| # | Test | Pass / Fail / Notes |
|---|---|---|
| 12.1 | Manually trigger: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://searchintel.valgrowlabs.com/api/cron/run-due-clients` returns JSON with `clients_processed` + `keywords_processed` | |
| 12.2 | Without the bearer token → 401 Unauthorized | |
| 12.3 | After a successful tick → `/admin/cron-runs` shows the run with green "No errors" | |
| 12.4 | A client's overview page shows "Last automatic run: <recent timestamp>" | |
| 12.5 | A client with check_frequency=manual is NOT picked up by cron | |
| 12.6 | A client where the interval hasn't elapsed is NOT picked up | |

---

## 13. Mobile responsiveness

| # | Test | Pass / Fail / Notes |
|---|---|---|
| 13.1 | On a phone (or DevTools at 375px width) → sidebar collapses behind hamburger | |
| 13.2 | Tap hamburger → drawer slides in with full menu | |
| 13.3 | Dashboard overview stat cards stack into 2 columns | |
| 13.4 | Client page header stacks vertically, action buttons wrap | |
| 13.5 | Latest snapshots table renders as card list (no horizontal scroll needed) | |
| 13.6 | Keyword detail AI Mode answer is readable, no text overflow | |
| 13.7 | Reports page mobile-friendly | |
| 13.8 | Public report URL (`/r/...`) opens cleanly on mobile | |

---

## 14. Edge cases & errors

| # | Test | Pass / Fail / Notes |
|---|---|---|
| 14.1 | Run Now with zero active keywords → friendly message, no error | |
| 14.2 | Try to view another agency's client URL directly → 404 | |
| 14.3 | Try to view another agency's keyword URL directly → 404 | |
| 14.4 | Visit `/r/<random-bad-token>` → 404 page | |
| 14.5 | Generate AI Brief while LLM is rate-limited → red error box shows actual error | |
| 14.6 | Citation Strategy with no competitor citations → button disabled with explanation | |
| 14.7 | Page load while logged out (other than public paths) → bounces to login with `?next=` | |

---

## 15. Sign-off

- [ ] All blocking defects logged with screenshots + reproduction steps
- [ ] Confirmed which features are blocked vs cosmetic
- [ ] Tester signature: _____________________
