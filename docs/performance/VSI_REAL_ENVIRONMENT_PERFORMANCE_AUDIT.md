# VSI real-environment performance audit

> **Correction (2026-09-28): the database measured here was not VSI's.** The Supabase project used
> for this audit (named "Blynk" in the Supabase account, see section 2) was later confirmed to be a
> separate, unrelated project. Every database figure below (region, rows, latency) describes that
> project, not VSI. Do not use them for VSI capacity or latency decisions, and do not connect VSI to
> that project. Code-level findings marked [V] were read in VSI's code and are unaffected. The
> runtime has since moved to Node 22 for Docker builds.

Date: 2026-09-20. Branch `feat/redesign-geo`. Application code was **not** modified. Nothing was committed.

How to read the evidence labels used below:

- **[M]** measured by me in this audit.
- **[D]** derived by arithmetic from measured numbers (labelled as an estimate, not a measurement).
- **[V]** read in the code and re-checked by me.
- **[A]** reported by the read-only code review (three parallel reviewers) and **not** independently re-checked. Treat as a lead, not a fact.

## 1. Executive summary

**The dominant cost is not the database. It is the number of sequential network round trips the server makes, multiplied by the distance between the app server and Supabase.**

- The database does its work in milliseconds. On a realistic local copy (21,600 search results) the heaviest page query takes about 30 ms with RLS on and about 4 ms once the RLS check is written in its once-per-query form [M]. The real project has recorded essentially no app queries yet, and its only measured statement, the new workspace function, ran in 6.95 ms [M].
- The Supabase project is in Tokyo (`ap-northeast-1`). From this machine (India) one Supabase request costs **about 265-280 ms** on a new connection [M]. The middleware's own Auth call adds **about 170-185 ms to every request that carries a session** [M].
- The dashboard layout makes **5 sequential round trips (11 requests) before any page code runs**, and nothing on the dashboard streams, so the sidebar and top bar cannot paint until all 5 finish [V]. At the measured per-trip cost that is roughly 0.85-1.0 s of pure network wait before the page's own query [D]. The same code with the server next to the database would wait about 0.1 s [D].
- No ordinary page open spends money. One URL-triggered exception exists (`/dashboard?q=...`, section 8).

**What this audit could not measure.** The authenticated pages (dashboard, Site Audit, Search Visibility, AI Visibility, Competitors, Next Actions, Tasks, Reports, AI Chat) were **not timed in a browser**, because no login was available and the real database holds no projects, so those pages would only show empty states. Section 3 says exactly what is measured and what is not. The measurement harness is built and tested on the public login page; it needs a login and a project with data to finish the job (section 12).

**Recommended order:** (1) put the app server in the same region as Supabase, (2) remove redundant round trips in the layout and auth path, (3) let the dashboard shell paint before data, (4) slim and bound the polling endpoints, (5) rewrite the RLS checks in their once-per-query form. Sections 10 and 11 give the detail and what to leave alone.

## 2. Measurement environment

| Item | Value |
|---|---|
| App | Next.js 16.2.6 production build (`next build`, 518 s), started with `next start` on a spare port, on this development machine |
| Supabase | Real project, region `ap-northeast-1` (Tokyo), `ACTIVE_HEALTHY`. The project is named "Blynk" in the Supabase account. |
| Database state | 2 auth users, 2 profiles (both `pilot`, one with an organization), 1 organization, **0 projects, 0 keywords, 0 results, 0 audits, 0 tasks, 0 reports** [M] |
| Client location | Chennai, India (Cloudflare edge `MAA`) |
| Machine | 16 GB RAM, but **about 0.1-1.7 GB available** during the audit (Docker/WSL 1.3 GB, several Chrome and VS Code processes) and about 45% CPU in use by other work [M] |
| Instrumentation | A preload script logged every incoming request and every server-side `fetch()` (host, path, status, time to first byte) and **blocked paid hosts at the network layer** (SerpAPI, Serper, Firecrawl, OpenRouter, OpenAI, Anthropic, Gemini, Perplexity). The paid keys were also blanked. Nothing could spend money. |
| Runtime | Node 20. `@supabase/supabase-js` warns that Node 20 is deprecated. |

**Limits that matter for every number below.**

1. **Browser-side timings are upper bounds.** Under this machine's load, a 65 kB script served from localhost took 3-4 s to arrive in the browser [M], which is contention, not network. Use browser numbers only for comparing pages, never as absolute values.
2. **The Tokyo round-trip figures are worst-case for a server in India.** Where the production server will run is **UNVERIFIED** (no deployment config was found). The per-trip cost is an input to every [D] estimate.
3. **The database is empty**, so nothing here shows row-volume effects on the real project. Volume effects come from a separate local copy (section 5).

## 3. Page-by-page timings

### What was measured

| Page | Cold load | Warm navigation | Status |
|---|---|---|---|
| Login page (public) | measured [M] | measured [M] | see below |
| Login to dashboard | **not measured** | - | needs a login |
| Dashboard, Site Audit, Search Visibility, AI Visibility, Competitors, Next Actions, Tasks, Reports, AI Chat | **not measured** | **not measured** | needs a login and a project with data |

### Login page in a real browser (production build, contended machine)

| Load | TTFB | First paint | Meaningful content | Hydrated (interactive) | Requests | Transferred | JS |
|---|---|---|---|---|---|---|---|
| Cold #1 | 1393 ms | 3464 ms | 5583 ms | 5732 ms | 18 | 349 kB | 237 kB |
| Cold #2 | 1212 ms | 2704 ms | 6290 ms | 6340 ms | 18 | 349 kB | 237 kB |
| Cold #3 | 528 ms | 2308 ms | 4240 ms | 4319 ms | 18 | 349 kB | 237 kB |
| Warm reload | 355 ms | 604 ms | 1428 ms | 1500 ms | 18 | 8 kB | 0 |

Sizes are compressed transfer sizes. Slowest cold requests: the 65 kB Supabase browser client chunk (3-4 s) and a 16 kB script (2.4-3.1 s), which is the contention noted above. The first server response after start took 3.8 s (module warm-up, one time).

### Server-side numbers that are reliable [M]

| What | Result |
|---|---|
| Public `/login`, no session, first byte (curl, 8 requests) | 125-330 ms (it renders a page) |
| `/dashboard` redirect with **no** cookie (no Supabase call) | median **32 ms** and **39 ms** in two runs |
| Same redirect with a session cookie (middleware calls Supabase Auth) | median **203 ms** and **223 ms** |
| **Cost of the middleware's Auth call** | **about 170-185 ms per request** |
| One Supabase REST request, new connection (curl, 12 samples) | connect 55-100 ms, TLS 105-190 ms, first byte median **265-280 ms**, worst 1384 ms |

## 4. Network waterfall findings

### Dashboard critical path before any page code runs [V]

| Trip | Awaited call | Where |
|---|---|---|
| 1 | `supabase.auth.getUser()` in middleware (network call) | `src/middleware.ts` |
| 2 | `requireAgency()` then `supabase.auth.getUser()` again (network call) | `src/lib/auth.ts` `getSession` |
| 3 | `profiles` with the `agencies` embed, `.single()` | `src/lib/auth.ts` |
| 4 | `clients` list (no limit) and `agencies.max_clients`, in parallel | `src/app/dashboard/layout.tsx` |
| 5 | Setup counts and competitors, in parallel (5 count queries + 1 read) | `loadOnboardingState` |
| 6 | The page's own data | each page |

- Trips 1-5 are the layout: **5 round trips, 11 requests**. Trip 6 is the page. [V] for the layout chain.
- Auth is checked over the network **twice** per request (trips 1 and 2) [V].
- Two of the five counts in trip 5 (`search_results` exact count, `tasks` count) are not used by the layout's onboarding state [A].
- Every dashboard page exports `force-dynamic` and the build lists all dashboard routes as dynamic [M]. No `Suspense` wraps layout data, and `loading.tsx` sits inside the layout, so it cannot show until the layout is done [A].
- `router.refresh()` reruns the whole chain [A].

### Per page (trips after the layout) [A]

| Page | Page queries | Trips after layout |
|---|---|---|
| Overview, Next Actions, AI Chat | one large parallel fan-out (`loadProjectOverview`: audits, up to 3000 results, more results for the citation strategy, up to 1000 tasks) | 1 |
| Site Audit | audits (12) + comparisons (60) | 1 |
| Search Visibility | keywords + up to 3000 results | 1 |
| AI Visibility | up to 3000 results, then a **second sequential** trip for answer evidence | 2 |
| Competitors | up to 3000 results + up to 400 rows of `serp_results_json` | 1 |
| Tasks | up to 500 tasks with descriptions | 1 |
| Reports | `/dashboard/reports` **redirects**, so the whole layout chain runs **twice** (about 11 trips); the sidebar link already goes straight to the target | 0 then 1 |

### Client requests on every dashboard load

- `/api/messages` on mount, then **every 15 s** while the tab is visible [V for the poll and the query, A for the interval].
- `/api/notifications` on mount and on realtime events, plus one realtime channel [A].
- Each of these requests also passes through middleware, so each pays the ~170 ms Auth call [D].

## 5. Supabase and database findings

### Measured on the real project [M]

- `pg_stat_statements` contains only migration statements and one call to `create_own_organization` (6.95 ms). The app has run essentially no queries against it, so there are no real slow queries to report yet.
- Performance advisors: **27** `auth_rls_initplan` warnings (RLS policies re-evaluating `auth.uid()` per row, on 14 tables), **35** `multiple_permissive_policies` warnings (13 tables; several policies apply to the same action, for example on `clients` for four actions), **17** unindexed foreign keys, and 44 "unused index" notes.
- **Do not act on the "unused index" notes.** The database is empty, so nothing has used any index yet.

### Measured on a realistic local copy (throw-away Postgres, migrations 001-039, 21,600 search results / 61 MB, 3,600 for the main project) [M]

Median of 5 runs after a warm-up, as the real `authenticated` role.

| Query (app shape) | RLS as written | RLS bypassed | RLS in once-per-query form (local what-if) |
|---|---|---|---|
| exact count of `search_results` (layout, every page) | 30.2 ms | 2.6 ms | 2.6 ms |
| `search_results` 120 days / 3000 rows, 15 columns (AI Visibility) | 29.4 ms | 5.1 ms | 5.7 ms |
| `search_results` 120 days / 3000 rows, 5 columns (Search Visibility) | 28.0 ms | 3.7 ms | 3.8 ms |
| `serp_results_json` 45 days / 400 rows (Competitors) | 17.6 ms | 1.0 ms | 1.7 ms |
| tasks, 500 rows | 3.1 ms | 0.3 ms | 0.4 ms |
| everything else (profile, clients, audits, reports, notifications, messages, competitors) | under 2 ms | | |

**Cause, from the query plan.** The `search_results` policies read `is_super_admin() OR agency_id = ANY(...)`. Postgres runs `is_super_admin()` **once per row**: for 3,600 rows the plan shows about 4,600 buffer hits against 83 for the index itself. The once-per-query form `(select is_super_admin())` runs it once. This is the standard fix behind the advisor's `auth_rls_initplan` warning. The what-if was applied to the local copy only.

**Reading this honestly.** At today's volume the gain is about 25 ms per large query, and those queries run in parallel, so the page-level gain is roughly 25-30 ms [D]. That is small next to a ~170 ms round trip. The cost grows in proportion to rows, so it is a **scaling** problem, not the current bottleneck.

### Indexes [V]

- `search_results` has `(agency_id, client_id, created_at desc)` and `(client_id, keyword, created_at desc)`. On the local copy the planner used the second for the page queries with a bitmap scan and did not need the first. No missing index caused a slow plan at this volume [M].
- Unindexed foreign keys are `clients.agency_id`, `tracked_keywords.agency_id`, `search_results.tracked_keyword_id`, and several `created_by` columns. They matter for cascading deletes and joins at scale, not for today's reads.

### Limits already in the schema [V]

A new self-service workspace gets `max_keywords = 10` (column default, enforced by trigger) and no project cap. This is not a performance issue, but it bounds the largest project a new workspace can have.

## 6. Next.js / server findings

- **Middleware runs on every request** except static assets, including `/api/*` polling, RSC navigations and prefetches, and it calls `supabase.auth.getUser()` (network) **before** checking whether the path is public [A for the matcher, M for the cost]. Even a public page pays about 170 ms if the browser sent a session cookie [M: `/login` with a session cookie took about 300-500 ms vs 130-330 ms without].
- **Auth is verified twice per request** (middleware, then `getSession`) [V].
- **Uncached loaders create their own Supabase client** (a `cookies()` read plus a new client each), roughly 5-12 per request. `getSession`, `loadProjects`, `loadSetupStatus`, `loadProjectCompetitors`, `loadProjectFlags` and `loadTrackedKeywords` are wrapped in React `cache()`; the rest are not [A]. CPU cost is **UNVERIFIED**.
- **No streaming.** No `Suspense` around layout data, no `unstable_cache` or `use cache` anywhere, all dashboard routes `force-dynamic` [A, M for the build listing].
- **API routes:** `/api/messages` selects `*` with no limit and no user filter (it relies on RLS) and, when the table is empty, returns hard-coded fallback messages on every poll [V]. `/api/notifications` selects `*` for the user with no limit [V].
- **Housekeeping:** `middleware.ts` is the deprecated Next 16 name for `proxy.ts` (no cost). Node 20 is deprecated by supabase-js.

## 7. Frontend findings

Sizes are from this audit's fresh production build [M]; browser timings carry the contention caveat.

| Route | First-load JS raw | gzip | brotli |
|---|---|---|---|
| `/privacy` (framework floor) | 517 kB | 149 kB | 141 kB |
| `/login` | 811 kB | 230 kB | 217 kB |
| `/dashboard` | 807 kB | 241 kB | 229 kB |
| `/dashboard/tasks` | 839 kB | 250 kB | 238 kB |
| `/dashboard/geo` | 856 kB | 255 kB | 243 kB |
| `/dashboard/check` | 890 kB | 264 kB | 252 kB |
| `/dashboard/clients/new` | 1060 kB | 307 kB | 291 kB |

- The dashboard layer adds about 290 kB raw (about 90 kB gzip) over the floor.
- **framer-motion (118 kB raw, 39 kB gzip) ships on every dashboard page** because `NotificationDropdown` is imported by the top bar, although it matters only when the dropdown opens [A].
- `ChatFloating` (657 lines) and `FeedbackModal` (630 lines) are mounted eagerly on every dashboard page even when closed. `next/dynamic` is not used anywhere [A].
- The Supabase browser client (246 kB raw, 65 kB gzip) is correctly lazy-loaded on the dashboard, but is in the first load of `/login`, `/dashboard/clients/new` and `/dashboard/feedback` [A].
- No chart, markdown or date library exists. Two dependencies (`hls.js`, `@floating-ui/react`) are unused, and about 785 kB of images in `public/` are unreferenced. Neither costs runtime [A].
- `MessagesContext` re-renders every consumer on each 15 s poll because its context value is not memoized [A].
- Unpaginated, unvirtualized lists: notifications (each row an animated element), messages, and the task board (up to 500 rows with drag-and-drop) [A].

## 8. External API findings

**No ordinary dashboard page triggers a paid call from navigation, prefetch or mount** [A, with the one exception below re-checked by me]. Site Audit, Search Visibility, AI Visibility, Competitors, Next Actions, Tasks, Reports and AI Chat only read Supabase on open. AI providers run only when a chat message is sent. `/api/cron/run-due-clients` requires `CRON_SECRET`.

**The exception [V].** Opening `/dashboard?q=<search>` renders `KeywordResearchView`, whose mount effect POSTs `/api/research`, which calls SerpAPI. There is no cache or dedupe, so a **reload, back/forward, or a shared link re-spends** on each load. It is reached by the keyword lookup form and the suggested-search links, so it starts from a user's own search, but the spend is tied to the URL and not to the click.

**Other points to know [A]:**

- After a Quick check finishes, one Firecrawl scrape per citation fires automatically (post-action, not on open).
- One chat send can make up to 4 paid calls if the first attempt fails and retries.
- Nine `/api/*` routes that can spend money (`/api/check`, `/api/aio`, `/api/rank`, `/api/serp-rankings`, `/api/search`, `/api/analyze`, `/api/resolve`, `/api/prompts/simulate`, `/api/citation-content`) require only a signed-in Supabase user, with **no organization check and no rate limit**. Seven of them have no caller in the app. This is a cost and security exposure, not a page-load cost.
- Also reported and **UNVERIFIED**: `/api/export` takes `agencyId` from the query string and relies on RLS; `/api/citation-content` has a raw `fetch(url)` fallback without the safe-fetch guard.

## 9. Root causes

1. **Too many sequential round trips before the page can render** (5 in the layout, 6 with the page), each costing a full network round trip to the database region. [V for the count, M for the per-trip cost]
2. **Auth verified over the network twice per request and on every request type**, including polls and prefetches, at about 170-185 ms each. [M]
3. **Nothing on the dashboard streams**, so all of the above is on the path to first paint. [A]
4. **RLS policies evaluated per row**, which inflates large reads 6-10x. A scaling risk, not yet a current cost. [M, local]
5. **Unbounded, frequently repeated reads and a 15 s poll**, each paying middleware plus a query. [V, A]
6. **A larger-than-necessary dashboard bundle** (framer-motion, chat and feedback code on every page). [M sizes, A causes]

**Classification:** mainly **Next.js/server (round-trip count) combined with deployment distance to Supabase**. The database and the external APIs are not the current bottleneck. The frontend adds cost mostly on slow devices.

## 10. Recommended fixes, ordered by measured impact

| # | Fix | Problem and evidence | Pages | Expected impact | Risk | Changes functionality? |
|---|---|---|---|---|---|---|
| 1 | **Run the app server in the same region as Supabase** (or move the database close to the server) | Every round trip costs about 170-280 ms from India to Tokyo [M]. The invariant is trips x distance. | All authenticated pages, all APIs | Layout wait from about 0.85-1.0 s to about 0.1 s if latency drops to ~10-20 ms per trip [D]. Largest single gain, no code. | Low. Needs the production region confirmed (**UNVERIFIED**) | No |
| 2 | **Remove redundant trips in the auth and layout path.** (a) Stop verifying the user twice (middleware then `getSession`); (b) merge the `agencies.max_clients` read into the profile embed; (c) drop the two unused counts (`search_results`, `tasks`) from the layout path and load them where used | Trips 1 and 2 both call Auth [V]; two counts are unused by the layout [A] | All dashboard pages | Up to 1-2 fewer sequential trips, about 170-340 ms here [D] | (a) **Medium-high**: it touches authentication, so any replacement must keep verifying the session; decide with the owner. (b) and (c) low | No |
| 3 | **Let the dashboard shell paint before data** (Suspense around layout data, move onboarding state out of the blocking path) | All 5 trips are on the path to first paint and `loading.tsx` is inside the layout [A] | All dashboard pages | First paint no longer waits for trips 3-5; perceived load drops by roughly the layout wait | Medium (layout structure) | No, but the order things appear changes |
| 4 | **Slim and bound the polling endpoints.** Add a limit and a column list to `/api/messages` and `/api/notifications`; replace or slow the 15 s timer; stop returning fabricated fallback messages | `select *`, no limit, every 15 s, each request also pays ~170 ms in middleware [V, A, M] | Every dashboard page (in the layout) | Removes about 4 requests per minute per open tab and the growth with mailbox size | Low-medium | **Yes**: lists become paginated; fallback data removed |
| 5 | **Rewrite RLS checks in their once-per-query form** (`(select auth.uid())`, `(select is_super_admin())`) and consolidate duplicate permissive policies | Per-row function calls: 30 ms vs 4 ms for a 3,000-row read locally [M]; 27 + 35 advisor warnings [M] | All data pages, more as data grows | 6-10x lower database time on large reads; about 25-30 ms per page today [D], growing with rows | **Medium (security-sensitive).** Semantics must stay identical; rerun `supabase/tests/tenant_isolation_checks.sql` after | No |
| 6 | **Lazy-load framer-motion, `ChatFloating` and `FeedbackModal`** | 118 kB raw / 39 kB gzip of framer-motion on every dashboard page [M, A]; both components mounted while closed [A] | All dashboard pages | About 10-15% less first-load JS on `/dashboard`; helps hydration on slow CPUs | Low | No |
| 7 | **Stop repeating large reads.** Overview and Next Actions read `search_results` three times; the Chat page runs the full overview fan-out for four checklist rows; Competitors reads 400 wide rows and keeps a fraction; AI Visibility adds a second trip for evidence | [A] | Overview, Next Actions, AI Chat, Competitors, AI Visibility | Fewer bytes and one fewer trip on AI Visibility; small at today's volume | Low-medium | No |
| 8 | **Make `/dashboard?q=` spend only once per search** (cache or require a click) | [V] SerpAPI call per URL load | Overview lookup | Removes repeat paid calls on reload and back/forward | Low | **Yes**: a reload no longer refetches |
| 9 | **Fix `/dashboard/reports` double render** by linking or redirecting once, and add the missing foreign-key indexes | [A] two full layout runs; unindexed FKs [M] | Reports; large tables later | Reports about halves; indexes matter at scale | Low | No |

## 11. Things that should NOT be changed

- **Do not remove or weaken RLS, the middleware's authentication, or `getUser` verification** to gain speed. Any auth change in fix 2(a) must still verify the session.
- **Do not drop "unused" indexes.** They look unused only because the database is empty.
- **Do not cache authenticated data broadly** or add global caching. React `cache()` already dedupes the loaders that matter, within a request.
- **Do not remove `force-dynamic`** blindly; these pages depend on the signed-in user.
- **Keep the earlier optimizations** from commit `033725b` (placeholder-URL retry delays, notification/messages loading, repeated project reads, AI Visibility parallelization).
- **Keep the head-only count queries** (`select id, { count: "exact", head: true }`); they transfer no rows.
- **Do not lower the site-audit poll or the report polls**; they run only while a job is running.
- **Do not add loading shortcuts, fake data or timeouts** to hide slow requests.

## 12. Verification plan

1. **Get the missing timings.** Add `VSI_PERF_EMAIL` and `VSI_PERF_PASSWORD` for an account that has an organization to the gitignored `.env.local`, and create one project with a handful of searches (through the app, or with the reviewed `supabase/seed/dev_seed.sql`). Then run the harness against a production build (`next build`, `next start`) with paid hosts blocked. It records login to dashboard, cold and warm loads for the nine pages, request counts, payload sizes, slowest requests, first meaningful content and hydration, plus server time to first byte and each Supabase call's time per request.
2. **Find the real per-trip cost.** Run the same harness from the intended production region. Compare with the ~170-280 ms figures above; fix 1 is validated when the layout wait drops accordingly.
3. **Prove each change with before/after numbers**, one change at a time: round trips per page (from the server log), layout time to first byte, and browser first paint. A change without a measured improvement is not kept.
4. **For RLS changes:** run `EXPLAIN (ANALYZE, BUFFERS)` on the real query shapes at realistic volume, then `supabase/tests/tenant_isolation_checks.sql`, and confirm results are identical.
5. **Paid-call check:** rerun with paid hosts blocked and assert the harness records **zero** blocked outbound calls while opening every page.
6. **Bundle check:** compare first-load JS per route (`route-bundle-stats.json`) before and after fix 6.
7. **Regression checks:** the existing test suite (180 tests) and the browser sign-in and create-account checks.

**Harness location.** The instrumentation and browser scripts are in the session scratchpad, outside the repository. They can be added under `docs/performance/tools/` if you want them versioned.
