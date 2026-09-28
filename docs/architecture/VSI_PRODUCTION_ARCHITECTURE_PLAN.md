# VSI: Production Architecture Audit and Migration Plan

> **Point-in-time document (2026-09-18).** Several findings below have since been addressed: the
> Dockerfile sets `BUILD_STANDALONE=1` and uses Node 22, analysis jobs have a table (migration 040),
> and the `USING (true)` and other isolation gaps were closed by migrations 043 and 044. Verify any
> finding against the current code before acting on it.

Status: **audit and plan only. No application code, schema, or configuration has been changed.**
Date: 2026-09-18 · Repository state: `main` @ `74df45a`
Companion document: [`docs/design/VSI_REDESIGN_GEO_PLAN.md`](../design/VSI_REDESIGN_GEO_PLAN.md). It holds the UX and visual layer, and its screens are built inside the module phases below.

---

## How this audit was done, and its limits

- I read the code directly: the middleware, `lib/auth*`, both Supabase clients, all 51 API routes, every dashboard and admin page, the `lib/` services, `schema.sql`, 33 migrations, the Dockerfile, `next.config.ts`, the deploy guide, and the env templates. Every claim cites a file.
- **I could not see the live database.** Every database finding comes from the migration files. Two facts make the live state uncertain:
  1. The deploy guide tells operators to create `using (true)` "dev" policies.
  2. Migration 033 creates a policy on `messages(sender_id, receiver_id)`, but those columns don't exist in migration 031, so 033 very likely failed partway through.

  **The first task in Phase 0 is to dump the live `pg_policies` and schema** and compare them with this document.
- The local `.env.local` uses the placeholder Supabase URL. That puts the app in "dummy" mode, where signing in works with any password for the one allowed email and every data query returns nothing.

---

## 0. Executive summary

VSI has a **real core engine** and a **mostly mocked product surface**, held together by an **auth layer that cannot be trusted**.

**What's real and worth keeping:**
- The keyword pipeline (`lib/run-pipeline.ts`): Google rank, Google AI Mode, AI Overviews, and ChatGPT, written to `search_results` as history.
- The computed `gap_label` status on each result.
- Per-keyword citation strategy, including a page audit of the client's ranking page.
- Keyword reports and weekly reports, with share tokens.
- The `tasks` table, with before/after snapshots and automatic outcome verification (`lib/task-outcome.ts`).
- A chat context builder that reads real data (`lib/chat-context.ts`).
- Invites and onboarding (`claim_invite`), pilot caps, admin analytics, feedback, and prompt management.

**What's mocked:**
- The dashboard, Site Audit (there is no engine), Rank Tracking, GEO / Pixel Rank Tracking, Competitors, Next Actions, and the AI Chat page.
- Admin Agencies, Users, and Overview stats.
- Notifications and Messages.
- The keyword research metrics.

**What blocks shipping (section 5):**
1. **Any signed-in user can make themselves super admin** by updating their own `profiles.role` through the public anon key. The update policy has no `WITH CHECK` and no column restriction.
2. **Every shared report is readable by anonymous users.** The token is checked only in the route, not in RLS.
3. **`client_keyword_analyses` is open to anonymous users** for read, write, and delete (`USING (true)`).
4. **The app trusts plain cookies as a session.** Setting `vsi_session=authenticated` plus the allowed email in `vsi_user_email` produces a `super_admin` session (`lib/auth.ts`, the fallback to `dynamicSession()`).
5. **With a missing or invalid search API key, the pipeline stores invented results.** `lib/serpapi.ts` and `lib/serper.ts` return fabricated answers in which the client is cited, and nothing stops them being saved as real history.
6. **Scheduled runs can't work as written.** The cron job uses the anon key with no user, and RLS blocks it, unless the insecure dev policies are live.
7. **The whole product is locked to one hardcoded email** (`lib/auth-config.ts`), so multi-organization use is impossible. The invite system that would support it is switched off.

---

## 1. Audit by area

| # | Area | Current state (evidence) |
|---|---|---|
| 1 | Repository | Next 16.2.6 app at the root, React 19, Tailwind v4. Non-production folders `apps/login-prototype`, `apps/marketing`, `archive/`, `examples/` are excluded from `tsconfig`. `graphify-out/` is code-analysis output. A stray `~/.claude/skills` folder is committed at the repo root. |
| 2 | Next.js app | App Router only. **No server actions (0).** All mutations go through API routes or the browser Supabase client. `src/middleware.ts` uses the convention the dev server reports as deprecated in favour of `proxy`. |
| 3 | Routes | 43 page routes. 9 are redirects or duplicates (`services/{all,all-services,seo,seo-tracked,geo,geo-tracked}` all render the same static component; `research` and `tasks-audits` redirect). The real per-project data is only under `/dashboard/clients/[id]/**`. |
| 4 | App shell | `dashboard/layout.tsx`: sidebar, topbar, pilot banner, floating chat. Projects are listed on the server, then merged on the client with **`localStorage` "custom clients"** (`lib/client-store.ts`). |
| 5 | Authentication | Supabase email/password (`LoginPage.tsx`), plus a **custom Google OAuth that never creates a Supabase session** (`api/auth/google`, `api/auth/callback/google`), plus a Supabase PKCE callback. All three issue client-readable `vsi_session=authenticated` / `vsi_user_email` cookies. `getSession()` trusts those cookies when Supabase has no user. Everything is restricted to `AUTHORIZED_EMAIL = "valgrowlabs444@gmail.com"`. |
| 6 | Authorization | `requireAgency` / `requireSuperAdmin` exist, and there is no project-level check helper. Routes that do check ownership re-query `clients.agency_id` inline (tasks, citation-strategy, run-client, keyword-report). **16 routes have no authentication check in the handler.** Roles are only `super_admin | pilot`. `is_disabled` is stored but never enforced. |
| 7 | Supabase | Only the anon key is used. **No service-role client exists**, although a migration comment assumes one ("pipeline reads via service_role anyway"). Both server and browser clients silently fall back to a dummy URL and key. |
| 8 | Schema | 14 tables (section 2D). Organizations are called `agencies` and projects are called `clients`. There is no competitors table, no findings table, no site-audit tables, no jobs table (apart from `cron_runs`), no audit log, and no org or project membership table. |
| 9 | RLS | Enabled on all tables, but with critical holes (section 5). Isolation between agencies is otherwise correct for `clients`, `tracked_keywords`, `search_results`, `tasks`, and `reports` (authenticated). |
| 10 | API routes | 51 routes. **7 have no callers:** `aio`, `analyze`, `rank`, `search`, `serp-rankings`, `prompts/simulate`, `debug/aio`. There are two chat routes. There is no input validation library; checks are ad hoc. Errors often return `error.message` from the database. Full inventory in section 2E. |
| 11 | Server actions | None. |
| 12 | Site Audit | **No engine or API.** `SiteAuditView.tsx` renders 12 hardcoded `DEFAULT_AUDIT_ITEMS`. The score is hardcoded to `70`, while its own formula gives 48. The progress modal runs on timers. Task creation sends `group_name: "technical_seo"`, which the database rejects. The only real page-level audit is `citation_strategy.clientPageAudit` per keyword. |
| 13 | GEO / AI Visibility | **Data is real:** `search_results` holds `aio_*` (AI Mode), `ai_overview_*`, `chatgpt_*`, `cited_domains`, `citations_json`, and `gap_label`. **The product pages are mocks:** `AIVisibilityView` (`DEFAULT_ROWS`) and `ServiceModuleView`. The `ai_engine` column is never written. |
| 14 | Rank Tracking | **Data is real** (`rank_position`, `rank_url`, `serp_results_json`, history by `created_at`). **The UI is a mock** (`ServiceModuleView`, which also exports hardcoded CSV rows). Three rank endpoints have no callers. |
| 15 | Competitor Analysis | **The page is a mock** (602 lines, `Math.random`). There is **no configured competitor list** anywhere. Competitor signals exist only as observations (`cited_domains`, `chatgpt_competitors`, `chatgpt_cited_urls`). The dashboard hardcodes HubSpot, Monday.com, and Pipedrive for every client. |
| 16 | Next Actions | Four overlapping implementations: `NextActionsView` (hardcoded `ACTION_ITEMS`), `NextActionsModule` (hardcoded), `NextActionCard` (assistant), and **`OpportunityPanel` (real, from `lib/opportunities.ts`, on the client page)**. Three of them create invalid tasks. |
| 17 | AI Chat | The `/dashboard/chat` nav page is **an animated demo** (`AIChatDemo`, timers). The real chat is `ChatFloating`. Its scope comes **from the URL**, so it is "global" (all projects) everywhere except `/clients/[id]` pages. `/api/chat` and `/api/assistant/chat` are duplicates and neither requires a session. **With no LLM key, `streamVsiEngineFallback` invents metrics** ("24 AI mentions… 18.2% increase"). |
| 18 | Reports | Real: `reports` table, `report-builder.ts` (weekly), `keyword-report-builder.ts`, public `/r/[token]`, and async generation with a pollable status. Content is a snapshot built from `search_results` and briefs. Site audit, competitor, and task data are not included. |
| 19 | Dashboard | Almost entirely invented (`ExecutiveDashboardView`: fallbacks `12/8/10/4.2`, ChatGPT `91`, competitor citations `38`, fixed "+4%"; `CompetitorOverviewModule`, `RecentActivityModule`, `NextActionsModule`, `ScanProgressModal`). The results query is not filtered by project, and for non-admins it has no row limit. The keyword research panel's AI %, per-engine inclusion (including Perplexity and Gemini), and 12-month trend are **seeded pseudo-random numbers** (`api/research`). |
| 20 | Super Admin | Guarded by `requireSuperAdmin` in the layout, which forged cookies pass. **Real pages:** invites, analytics, feedback, prompts, cron runs, QA, settings, client engines. **Mocked pages:** Agencies (`MOCK_AGENCIES`), Users (`MOCK_USERS`; the real `admin_list_users()` RPC exists and is unused), and Overview stats (users `4820`, revenue `58400`…), which also query a **non-existent `keywords` table**. |
| 21 | Projects | The `clients` table is real. Creating a project writes to Supabase, then **falls back to a `localStorage`-only "ghost" project `client-<timestamp>`** on failure. The sidebar merges those ghosts in. `clients/[id]` invents a "Valgrow Labs" project for ids `valgrow-labs-001`, `1`, and `3`. The selector navigates to `/dashboard?client=`, which only the dashboard reads. |
| 22 | Organizations | The `agencies` table has branding, pilot flags, and caps (triggers `enforce_keyword_limit`, `enforce_agency_client_cap`). Invite-based onboarding creates an agency. There is no organization admin UI. Branding is split between `localStorage`, cookies, and `api/agency/settings`. `agency-settings` shows a hardcoded Agency ID. |
| 23 | Users and roles | `profiles.role`: `schema.sql` defines `owner|analyst|viewer`, but migration 006's `add column if not exists role … check (super_admin|pilot)` is a no-op on databases built from `schema.sql`, so **the live constraint is unknown**. The code knows only `super_admin | pilot`. There are no organization roles and no project membership. |
| 24 | Background jobs | There is no jobs table and no queue. `after()` combined with status columns is used for keyword reports and citation strategy. `run-client` runs synchronously for up to 300s, even though the code comments note a proxy limit of about 60 to 90s. The cron route (`CRON_SECRET`) uses the anon client, so it **can't read clients or write results under the intended RLS**. No scheduler is configured in `vercel.json` or documented for Coolify. |
| 25 | Mock / demo data | 40 files, classified in section 4. |
| 26 | Environment | `.env.example` is committed and contains placeholders only; I found no secrets in git history. Server keys (SerpAPI, Serper, OpenAI, Gemini, Anthropic, OpenRouter, Firecrawl, Google OAuth, `CRON_SECRET`, `ANALYTICS_SALT`) are server-only and not `NEXT_PUBLIC`. There are `VITE_*` fallbacks left over from the prototype. |
| 27 | Error handling | Frequent silent `catch {}` blocks that fall through to mock data, which masks failures. Several UI actions report success when they failed (task creation). Raw database error messages are returned to clients. |
| 28 | Logging | 67 `console.*` calls. There is no error tracker and no structured logger. `track.ts` writes hashed-user product analytics to `analytics_events`. `cron_runs` logs scheduled runs. There is no audit log for admin or auth actions. |
| 29 | Tests | **None.** There is only `scripts/test-run-check.ts`, a hand-rolled assertion script. There is no test runner in `package.json`. |
| 30 | Deployment | **Dockerfile (Coolify):** it copies `.next/standalone`, but `next.config.ts` only emits standalone output when `BUILD_STANDALONE` is set, and the Dockerfile never sets it, so the image **would fail to start as written** unless Coolify supplies it. **Vercel:** `vercel.json` is present, so the production target is ambiguous. **Deploy guide:** outdated migration paths, it instructs creating `using(true)` dev policies, and it doesn't cover cron scheduling or migration order. **Runtime:** Node 20 in Docker, while Supabase is deprecating anything below 22. |

---

## 2. Architecture maps

### A. Current architecture

```
Browser
 ├─ Pages (mostly client components)
 │    ├─ Dashboard, Site Audit, GEO, Rank, Competitors, Next Actions, Chat page ──► hardcoded arrays / timers  (MOCK)
 │    ├─ /dashboard/clients/[id]/** ────────────────────────────────────────────► Supabase (anon key + user JWT)  (REAL)
 │    ├─ Tasks ─────────────────────────────────────────────────────────────────► Supabase + /api/tasks          (REAL)
 │    └─ Sidebar project list ─► server list ∪ localStorage "custom clients"       (MIXED)
 │    Browser Supabase client used directly for writes (clients/new, onboarding, feedback)
 │
 ├─ Cookies: vsi_session=authenticated, vsi_user_email  (set by JS and by routes; TRUSTED by server)
 │
Next.js server
 ├─ middleware.ts ── session = Supabase user OR cookie flag + allowed email
 ├─ lib/auth.getSession ── Supabase user → profile, ELSE cookie → fake super_admin session
 ├─ 51 API routes ── some check agency ownership inline; 16 check nothing
 ├─ after() jobs (keyword report, citation strategy)
 ├─ in-memory fallback stores (notifications, messages): shared across users
 │
External: Serper · SerpAPI (AI Mode, AI Overview) · OpenAI/OpenRouter/Gemini/Anthropic · Firecrawl · Google OAuth
Supabase: Postgres + RLS (holes) + Auth + Storage (agency logos)
Cron caller (unspecified) ──► /api/cron/run-due-clients (anon client; blocked by RLS)
```

### B. Target architecture

```
                     ┌─────────────── Platform (super admin) ───────────────┐
                     │ orgs · users · projects · jobs · usage · health · audit log │
                     └──────────────────────────────────────────────────────┘
Organization (agencies) ── members (org_role: owner | admin | member | viewer)
   └── Project (clients) ── the single context every module reads
         ├── Domain, brand, location              (clients columns; one source of truth)
         ├── Keywords                             (tracked_keywords; domain/brand come from the project)
         ├── Competitors                          (NEW project_competitors)
         ├── Scans / jobs                         (NEW jobs: queued → running → completed | failed)
         │     ├── keyword checks → search_results (rank + AI Mode + AI Overviews + ChatGPT history)
         │     └── site audit    → site_audits + site_audit_pages (NEW)
         ├── Findings                             (NEW findings: one table for every module, fingerprinted)
         ├── Tasks                                (tasks + finding_id + source; verification generalized)
         ├── Reports                              (reports; built by the same summary functions)
         └── Notifications                        (from real events only)

Server layers
  lib/auth/session.ts        Supabase user only → profile (platform_role, org_role, disabled) → org
  lib/auth/authorize.ts      authorize(session, { projectId, permission }), used by every route
  lib/project-context.ts     active project (cookie + ownership check), used by every page
  lib/modules/*              site-audit, geo, search, competitors: raw data → findings
  lib/findings.ts            upsert / resolve by fingerprint, used by every module
  lib/project-summary.ts     the one aggregation, used by Dashboard, Reports, and AI Chat
  lib/jobs/*                 enqueue, claim (FOR UPDATE SKIP LOCKED), run step, finish; cron tick + after() kick
  lib/supabase/admin.ts      service role, server-only; used only by the job runner and platform admin
```

### C. Module dependency map (target)

```
            Project (domain, keywords, competitors, engines)
          ┌────────────┬───────────────┬──────────────────┐
          ▼            ▼               ▼                  ▼
     Site Audit   Keyword checks   (same checks)     Competitors config
          │        ├─ Search/Rank ──┐                     │
          │        └─ GEO / AI ─────┼──────── uses ───────┘
          ▼                         ▼
      findings ◄──────────── findings (geo, search, competitor)
          │
          ▼
   Next Actions (open findings, ranked) ──► Tasks ──► re-check (job) ──► findings resolved/verified
          │                                                   │
          └─────────────── project-summary ◄──────────────────┘
                              │        │         │
                          Dashboard  Reports   AI Chat
```

### D. Database relationship map

Current (✓ exists · ✗ missing · ⚠ problem):

```
auth.users 1─1 profiles(role ⚠ super_admin|pilot vs owner|analyst|viewer; is_disabled ⚠ unenforced; agency_id)
agencies 1─* profiles, clients, tracked_keywords, search_results, tasks, reports, feedback, analytics_events
clients 1─* tracked_keywords(domain ⚠ + brand ⚠ duplicated per keyword), search_results, tasks, reports,
            client_keyword_analyses(⚠ no agency_id, RLS open)
tracked_keywords 1─* search_results (FK set null), tasks (FK cascade), reports (keyword reports)
search_results  (gap_label generated; citation_strategy jsonb; ai_engine ✗ unused)
tasks  (✗ finding_id, ✗ source, status todo|in_progress|done|skipped, outcome_status verified|regressed|neutral)
notifications (agency_id ⚠ no FK; user_id null = broadcast ⚠)   messages (⚠ no agency_id)
invites · system_settings · prompts · cron_runs · qa_testers · qa_checks
✗ project_competitors  ✗ findings  ✗ site_audits / pages  ✗ jobs  ✗ audit_log  ✗ org roles/membership
```

Missing indexes: `search_results(tracked_keyword_id, created_at desc)` (used for "latest per keyword" everywhere), `search_results(client_id, created_at desc)` on its own, `tasks(client_id, status)`, `notifications(agency_id, …)`.
Inconsistent statuses: `reports.status` (`pending|ready|failed`), `citation_strategy_status`, `tasks.status`, `feedback.status`, `messages.status`. They will be unified under `jobs.status` for long-running work.
Inconsistent IDs: `messages.id` is `text`, `notifications.related_client` is text rather than an FK, and the code carries fake ids (`valgrow-labs-001`, `client-<ts>`, `0000…0001`).

Target additions (all additive; no table renames; UI says "Organization" and "Project"):

| Table / change | Purpose |
|---|---|
| `profiles.platform_role` (`super_admin` or null), `profiles.org_role` (`owner/admin/member/viewer`), locked by a column-guard trigger | separate platform role from organization role |
| `project_members(project_id, user_id, role)`, optional | per-project restriction; the default is every org member |
| `project_competitors(id, agency_id, client_id, name, domain, created_at)` | single competitor list |
| `jobs(id, agency_id, client_id, type, status, progress, total, payload, result, error, attempts, requested_by, created_at, started_at, finished_at)` plus a unique partial index on `(client_id, type) where status in ('queued','running')` | lifecycle, and no duplicate jobs |
| `site_audits(id, client_id, job_id, score, pages_scanned, created_at)` and `site_audit_pages(audit_id, url, status_code, data jsonb)` | audit history |
| `findings(id, agency_id, client_id, source, type, severity, fingerprint, status open/resolved/verified/dismissed, data jsonb, tracked_keyword_id, page_url, first_seen_at, last_seen_at, resolved_at)`, unique on `(client_id, fingerprint)` | one findings model |
| `tasks.finding_id` FK, `tasks.source` | finding → task |
| `audit_log(id, actor_id, agency_id, action, target, meta, created_at)` | admin and auth trail |
| an `agency_id` foreign key on `notifications` and `client_keyword_analyses` | isolation |

### E. API dependency map and target boundary

| Route(s) | Today | Target |
|---|---|---|
| `tasks`, `tasks/[id]`, `tasks/reorder`, `tasks/import-from-report` | real, ownership checked | keep; add `authorize`, `finding_id`, `source` |
| `run-client` | real, synchronous | becomes "enqueue keyword-check job" (returns a job id) |
| `cron/run-due-clients` | broken under RLS | becomes the job-runner tick (service role, `CRON_SECRET`) |
| `check` | real live check; no auth in handler | keep (the "Check a search" tool) with `authorize` and a rate limit |
| `citation-strategy`, `…/status`, `opportunity-brief`, `keyword-report/*`, `reports/generate` | real, `after()` + status | move onto `jobs` (keep the URLs, add `job_id`) |
| `chat`, `assistant/chat` | duplicates, no auth | **one** `assistant/chat`: session required, active-project scope, no fabricated fallback |
| `chat/feedback`, `feedback` | real | keep |
| `clients/[id]/identity`, `clients/[id]/settings`, `agency/settings` | real | keep with `authorize`; branding moves out of `localStorage` |
| `clients/ai-keywords` | real LLM; no auth; writes to the open table | `authorize` + fix the table's RLS |
| `research` | seeded fake metrics | remove the fabricated fields; keep only the real SERP data, or retire |
| `citation-content` | SSRF-capable, no auth | `authorize`, block private IPs, allow http/https only, timeout and size cap |
| `resolve` | open Gemini proxy | remove |
| `aio`, `analyze`, `rank`, `search`, `serp-rankings`, `prompts/simulate`, `debug/aio` | no callers | remove (or keep `debug/aio` for super admins only) |
| `notifications/*`, `messages` | in-memory fallbacks, fake data | rewrite on RLS-safe tables with real events; Messages depends on **D6** |
| `export` | real, `agencyId` from the query string | `authorize`; scope to the active project |
| `admin/*` | real writes, fake-able guard | keep; the guard becomes real once auth is fixed; add `audit_log` writes |
| `auth/google`, `auth/callback/google` | custom OAuth without a Supabase session | remove; use Supabase's Google provider via `auth/callback` |
| `auth/callback` | open redirect through `next` | allow relative paths only |
| `qa/*` | RPC-based tester flow | keep (separate public QA mode) |

**Boundary rule:** every route starts with `const ctx = await authorize(req, { projectId?, permission })`. That returns 401, 403, or 404, never data from another organization. Inputs are validated with one schema helper. Responses use one error shape, `{ error: { code, message } }`, with no raw database messages.

### F. Authentication and authorization map

```
CURRENT                                          TARGET
Login ─► Supabase password | custom Google      Login ─► Supabase Auth only (password, Google provider, invites)
      ─► JS sets vsi_session cookie                    ─► Supabase SSR cookies only (httpOnly)
Middleware: Supabase user OR cookie flag        Middleware/proxy: refresh Supabase session; redirect if none
getSession: user → profile ELSE cookie ⇒        getSession: user → profile (platform_role, org_role, is_disabled)
            fake super_admin                               disabled ⇒ signed out; no fallback in prod
Single allowed email                            Invite-only signup (existing invites + claim_invite)
Roles: super_admin | pilot                      platform_role: super_admin · org_role: owner/admin/member/viewer
Checks: inline, inconsistent, 16 routes none    authorize(): user → org → project → permission (every route)
RLS: holes (section 5)                          RLS: org isolation on every table; no anon table reads;
                                                     public report through a SECURITY DEFINER RPC by token
```

Permission matrix (target):

| Permission | viewer | member | admin | owner | super_admin |
|---|---|---|---|---|---|
| View project data, reports, chat | ✓ | ✓ | ✓ | ✓ | ✓ (any org) |
| Run checks and audits, create and edit tasks | | ✓ | ✓ | ✓ | ✓ |
| Manage projects, keywords, competitors, engines | | | ✓ | ✓ | ✓ |
| Manage members and invites (own org) | | | ✓ | ✓ | ✓ |
| Org settings, branding, delete org | | | | ✓ | ✓ |
| Platform: orgs, all users, jobs, health, settings | | | | | ✓ |

### G. Data flow (target)

```
Project config ─► enqueue job ─► runner claims job ─► external APIs ─► raw rows (search_results / site_audit_pages)
   ─► module analyzer ─► findings upsert (new, still present, resolved) ─► notifications (critical / completed)
   ─► project-summary (read-time aggregation) ─► Dashboard · Reports · AI Chat
```

### H. Project context flow (target)

```
Project switcher ─► POST /api/project/select {projectId}
   ─► server checks ownership ─► sets httpOnly cookie vsi_project ─► router.refresh()
Every page:   const project = await getActiveProject(session)   // cookie → validate → first project fallback
Every client component: receives project from the server layout (context provider); no localStorage
?client= / /clients/[id] deep links override the cookie and update it
Switch ⇒ layout re-renders server-side ⇒ no stale Project A data (no client caches keyed without projectId)
```

### I. Finding → Task → Verification flow (target)

```
Scan completes ─► analyzer emits candidate findings (type, fingerprint, severity, data)
  ├─ fingerprint new           ─► INSERT finding (open) ─► notify if critical
  ├─ fingerprint seen again    ─► UPDATE last_seen_at
  └─ open finding NOT re-seen  ─► status = resolved, resolved_at = now
         └─ has task with status done ─► task.outcome_status = verified; finding = verified
Next Actions = open findings ranked by severity × reach, with a "Create task" (task.finding_id, source)
Task done ─► "We'll check again on the next scan" (or "Re-check now" enqueues a job)
The existing task-outcome.ts (gap-label before/after) becomes the GEO analyzer's resolution rule.
```

### J. Super Admin architecture (target)

| Section | Data source | Exists today |
|---|---|---|
| Overview | counts from agencies, profiles, clients, tracked_keywords, jobs (running/failed), audit_log | partial (fake stats, wrong table) |
| Organizations | agencies + member and project counts; create, edit, disable (`is_disabled` exists) | mocked page; the PATCH/DELETE API is real |
| Users | the `admin_list_users()` RPC; invite, disable, set role | mocked page; RPC and API exist |
| Projects | clients across orgs; last job, open findings | `admin/clients/[id]` engines only |
| Jobs | the `jobs` table, plus `cron_runs` until migrated | cron runs only |
| Usage | `analytics_events` (existing), external API call counts per org (new counter on jobs) | analytics only |
| System health | a `/api/health` check of the DB, provider keys, and last successful cron tick | missing |
| Audit log | `audit_log` | missing |
| Settings, prompts, QA, feedback, invites | existing | real |

---

## 3. Gap analysis (from the code)

Legend: **C** connected · **P** partially connected · **D** disconnected · **M** mocked · **Dup** duplicated · **X** missing

| Module | DB | Project context | Keywords | Competitors | Findings | Tasks | Verification | Dashboard | Reports | AI Chat | History | Jobs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Site Audit | **X** (no engine) | D (`localStorage` `clients[0]`) | D | D | X | **broken** (invalid payload) | X | D | D | D | X | M (timer modal) |
| GEO / AI visibility | C (`search_results`) | P (only `/clients/[id]`) | C | P (from citations only) | P (in-memory `gap_label` → `opportunities.ts`) | P (keyword panel valid; dashboard buttons broken) | P (AI Mode only) | M | C (keyword reports) | P (URL scope) | C | P (sync + broken cron) |
| Rank Tracking | C | P | C | D | X | D | P (rank not used in the outcome) | M (fallback 4.2) | P | P | C (not displayed) | P |
| Competitor Analysis | P (observations only) | D | D | **X** (no config) | X | D | X | M (HubSpot…) | D | P | P | X |
| Next Actions | M; real only in `OpportunityPanel` | D | P | D | P | broken ×3 | X | M | D | D | X | n/a |
| Tasks | C | P | C | n/a | X (no `finding_id`) | C | C (keyword tasks) | M | P (import from report) | C | C | n/a |
| AI Chat | C (context) | P (URL-derived) | C | P | P | C (open tasks) | n/a | n/a | D | Dup (2 routes); page M | n/a | n/a |
| Reports | C | P | C | P | X | P | X | n/a | C | D | C (snapshots) | P (`after()`) |
| Dashboard | M | D (not filtered by project) | P | M | X | M | X | M | D | D | M (fake trend) | M |
| Super Admin | P | n/a | n/a | n/a | n/a | n/a | n/a | M (stats) | n/a | n/a | n/a | P (`cron_runs`) |
| Projects | C + Dup (`localStorage`) | P | C | X | n/a | C | n/a | P | C | P | n/a | n/a |
| Organizations | C | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| Users and roles | P (2 roles) | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| Notifications | M | D | n/a | n/a | X (no events) | X | X | n/a | n/a | n/a | n/a | X |
| Global search | X | | | | | | | | | | | |

---

## 4. Mock and demo data inventory

Classes: **A** legitimate seed/example · **B** development-only · **C** accidental production mock · **D** fallback state

| Location | What | Class | Migration |
|---|---|---|---|
| `lib/serpapi.ts`, `lib/serper.ts`, `lib/serpapi-service.ts` | fabricated SERP and AI answers (client cited) when a key is missing | **B, reachable in prod → C (critical)** | allow only when `VSI_DEMO_MODE=1` and not in production; otherwise throw `ProviderNotConfigured`; the pipeline never saves a demo row (`isDemo` is recorded) |
| `lib/ai-provider.ts` `streamVsiEngineFallback` | invented chat answers with metrics | **C (critical)** | replace with "AI chat isn't configured" |
| `lib/auth.ts` `dynamicSession`, `0000…0001/0002`, `user@example.com` | fake super-admin session | B → C | only when `isDummySupabase()` **and** `NODE_ENV !== 'production'`; remove the cookie fallback |
| `api/chat`, `api/assistant/chat`, `clients/new`, `keywords/new`, `agency-settings` | fallback agency id `0000…0001` | C | require the session's organization |
| `lib/client-store.ts`, `clients/page.tsx`, `Sidebar.tsx` | `VALGROW_LABS_CLIENT`, `localStorage` projects | C | delete; the server is the single source |
| `clients/new/page.tsx` | `client-<ts>` ghost project on insert failure | C | show the error; no ghost |
| `clients/[id]/page.tsx`, `clients/[id]/settings` | invented Valgrow Labs for ids `valgrow-labs-001`, `1`, `3` | C | `notFound()` |
| `ExecutiveDashboardView`, `AIVisibilityMetricsRow`, `DashboardChartsGrid`, `CompetitorOverviewModule`, `RecentActivityModule`, `NextActionsModule`, `ScanProgressModal`, `ProjectContextBar` | fabricated KPIs, competitors, activity, actions, progress, timestamps | C | rebuild on `project-summary` (Phase 8) |
| `api/research` | seeded AI %, engine rates, trend, part of the difficulty score | C | drop fabricated fields; label estimates; no unsupported engines |
| `SiteAuditView` `DEFAULT_AUDIT_ITEMS`, `AuditHeader`, `AuditProgressModal` | hardcoded audit, score 70, timer progress | C (the UI copy is reusable as A) | the real engine (Phase 4) |
| `NextActionsView` `ACTION_ITEMS`, `NextActionCard` | hardcoded actions | C | findings-based Next Actions |
| `AIVisibilityView` `DEFAULT_ROWS`, `ServiceModuleView` | hardcoded GEO and rank tables, hardcoded CSV | C | GEO and Search pages on real data |
| `dashboard/competitors/page.tsx` | `Math.random` competitor data | C | a real competitors module |
| `CompetitorAnalysisCard`, `AIChatDemo`, `AIChatHero` | scripted demo chat | C in the app (A on marketing) | the chat page becomes the real chat |
| `dashboard/prompts/page.tsx` | simulated results with `DEFAULT_PRESETS` | presets A, results C | hide from nav; retire or rebuild on `/api/check` |
| `api/notifications` `fallbackStore`, `NotificationDropdown` test generator | in-memory shared store, fake alerts | C | real events only |
| `api/messages` `fallbackMessages` + in-memory | fake inbox | C | **D6** |
| `admin/agencies`, `admin/users` `MOCK_*`; `admin/page.tsx` stats | fake platform data; wrong `keywords` table | C | the real queries and RPC that already exist |
| `run-check.ts` `isDemo` / `dataSource` | labels demo data | D (keep) | keep, and stop saving demo rows |
| `DashboardOnboarding` steps, `AuditProcessWorkflow` copy, `aether-flow-hero` random particles | static explanatory copy and decoration | A | keep |
| `components/valgrow/hero.tsx` "4820" | marketing-page claim | A if true | check with marketing |
| `scripts/test-run-check.ts`, `apps/*`, `archive/`, `examples/` | prototypes and scripts | B | keep out of the build (already excluded) |

---

## 5. Security findings (ranked)

| ID | Severity | Finding | Evidence | Fix (phase) |
|---|---|---|---|---|
| S1 | **Critical** | Signed-in users can set their own `role` and `agency_id`, which gives super admin and access to any organization. Direct Supabase API signups (if email signup is enabled in the project) make this reachable by anyone. | `schema.sql:44`, `migration_006:116` (update using `id = auth.uid()` with no check) | a column-guard trigger or column-level `REVOKE UPDATE`; set roles only through admin RPCs (P0) |
| S2 | **Critical** | Anonymous users can read every non-expired shared report. | `migration_014:38` | drop the policy; add `get_shared_report(token)` SECURITY DEFINER (P0) |
| S3 | **Critical** | `client_keyword_analyses` is open to anonymous read, write, and delete. | `migration_032:22-36` (never dropped) | drop them; add org-scoped policies (P0) |
| S4 | High | Anonymous users can list active invite codes, including `super_admin` invites. | `migration_006:65-70` | a `validate_invite(code)` RPC; no table read (P0) |
| S5 | High | Forged cookies produce a super-admin app session and pass the middleware. | `lib/auth.ts` (end of `getSession`), `middleware.ts` | trust Supabase only (P0) |
| S6 | High | 16 routes have no handler auth, including paid-API proxies (cost abuse); `citation-content` can fetch any URL (SSRF, including the internal network); `resolve` is an open LLM proxy. | section 1 #10 | remove unused routes; `authorize()`; URL guard; rate limits (P0/P12) |
| S7 | High | Demo fallbacks save invented results that tasks are then "verified" against. | section 4 | P0 |
| S8 | Medium | `notifications` and `messages` rows with a null user are readable and writable across organizations; the in-memory server stores are shared by all users. | `migration_033:104-117`, the routes | P0/P11 |
| S9 | Medium | Stored XSS: message HTML rendered with `dangerouslySetInnerHTML`. | `messages/[id]/page.tsx:271` | sanitize or render as text (P0) |
| S10 | Medium | Open redirect via `?next=`; the OAuth state check is skipped when the state or cookie is missing. | `auth/callback/route.ts`, `api/auth/callback/google` | P0 |
| S11 | Medium | Disabled users can still sign in; there's no rate limiting; raw database errors reach the client. | `lib/auth.ts`; the routes | P1/P12 |
| S12 | Medium | The deploy guide instructs creating `using(true)` policies. | `DEPLOY.md` §2 | rewrite the guide; verify the live DB (P0) |
| S13 | Low | No CSP header (the others are present); the logo bucket is public (intended). | `next.config.ts` | P12 |
| S14 | Info | No secrets in the repo or its history; server keys aren't `NEXT_PUBLIC`; no service-role key is in use. | scan | keep it that way; the service role stays server-only |

**Production risks beyond security:** results are fabricated when keys are missing; cron is non-functional; Docker `standalone` doesn't match; the deploy target is ambiguous; synchronous 300s runs sit behind a roughly 60 to 90s proxy; the dashboard query is unbounded; the live schema has drifted from the migrations; there are no tests; there's no error tracking.

---

## 6. Phased migration plan

The phases follow your order, adjusted to the repository. **Security comes first** (Phase 0), and **the job foundation moves before Site Audit and GEO**, because both depend on it. Each phase ends with `npm run build`, `npm run lint`, its tests, and a run of the app. The UI work for each module follows the redesign plan.

| Phase | Name | Scope | Depends on | Size |
|---|---|---|---|---|
| **0** | **Stop-ship security + truth** | Dump the live policies and schema, then write a **baseline migration** from them. Fix S1 to S4 and S8 (RLS). Remove the cookie-trust session (S5). Remove or lock the unused and open routes, and add the SSRF guard (S6). Close the open redirect and the OAuth state gap (S10). Sanitize messages (S9). Block demo fallbacks from being saved and remove the fabricated chat fallback (S7). Correct the deploy guide. | D1 | M |
| 1 | Foundation | Supabase-only auth (Google through the Supabase provider); invite-only signup replaces the single-email lock; `platform_role` + `org_role`; enforce `is_disabled`; `authorize()`; `getActiveProject()` + switcher; remove `localStorage` projects and ghost projects; one error shape and one validation helper. | 0, D5 | L |
| 2 | Shared data | `project_competitors`; keyword domain and brand from the project; `findings` + `lib/findings.ts`; `tasks.finding_id` / `source`; `lib/task-payload.ts` (fixes the 4 broken task creators); missing indexes. | 1 | M |
| 3 | Jobs | `jobs` table; `lib/supabase/admin.ts` (server-only); runner (claim with `SKIP LOCKED`, chunked steps, retries, timeouts); cron tick fixed; `after()` kick; `run-client` becomes enqueue; reports and strategy move to jobs; status UI (queued/running/completed/failed with progress). | 2, D2, D3 | L |
| 4 | Site Audit | Crawl engine (homepage + sitemap sample), `site_audits` history, analyzer → findings, UI from the redesign plan, "Pages AI finds hard to use" from `clientPageAudit`. | 3, D8 | L |
| 5 | GEO | Analyzer from `search_results` → findings (6 types, redesign plan §10); `lib/geo.ts`; `/dashboard/geo`; verification generalizes `task-outcome.ts` to ChatGPT and AI Overviews. | 3 | L |
| 6 | Search / Rank | Real Search Visibility (current, change, history per keyword); rank findings (lost top 10, big drops); remove duplicate endpoints. | 3 | M |
| 7 | Competitors | Competitor setup in project settings (suggested from cited domains); comparison from the shared calculation; competitor gap findings. | 2, 5 | M |
| 8 | Dashboard | `lib/project-summary.ts`; Overview rebuilt with no fabricated values; loading, empty, error, and success states. | 4–7 | M |
| 9 | AI Chat | One route; session required; active-project scope by default; context from `project-summary` + findings + tasks; says clearly when data is missing; the chat page becomes the real chat. | 8 | S |
| 10 | Reports + history | The report builder uses `project-summary` (site audit, search, GEO, competitors, actions); a before/after history view (audit score, AI visibility %, rank). | 8 | M |
| 11 | Notifications + search | Event-driven notifications (job completed/failed, new critical finding, task assigned/completed, verification); global search limited to the user's org and projects; Messages per D6. | 3, 2 | M |
| 12 | Super Admin | Real Orgs, Users (the existing RPC), Projects, Jobs, Usage, Health (`/api/health`), `audit_log`; remove fake stats. | 1, 3 | M |
| 13 | Hardening | Rate limits on run, check, and chat; CSP; structured logger with redaction; error tracking (D10); dependency updates; Node 22. | all | M |
| 14 | Testing | Section 7 suite in CI. | runs alongside every phase | L |
| 15 | Deployment verification | Settle the target (D4); fix Docker `standalone`; migrations in CI; cron scheduler; env checklist; smoke tests against staging. | all | S |

---

## 7. Test strategy

Tooling (**D7**): **Vitest** for unit and integration, **Playwright** for end-to-end, and the **Supabase CLI local stack** (Docker) so RLS is tested against real Postgres. Tests are written alongside each phase, not all at the end.

| Area | Tests |
|---|---|
| Authentication | Sign in, sign out, expired session → login; forged `vsi_*` cookies → 401/redirect; disabled user blocked; invite signup claims exactly once. |
| Authorization | Permission matrix per role (§2F); every route returns 401 without a session and 403/404 for another org's project; super admin can read any org. |
| RLS (SQL tests) | For each table: org A's user can't select, insert, update, or delete org B's rows; anon can't read tables; users can't change their own `role` or `agency_id`; shared reports only via the RPC with a valid token. |
| Project isolation and switching | Switch A → B changes every page, the chat scope, and exports; a stale cookie for a revoked project falls back safely. |
| Site Audit | Crawler against local fixture sites (broken links, missing titles, blocked AI crawlers) → expected findings; re-audit after a fix → resolved. |
| GEO | `lib/geo.ts` metric definitions (fixtures of `search_results`); analyzer emits the expected findings; engine toggles give "not turned on" or "coming soon"; missing data never becomes `false`. |
| Rank | Change detection, history ordering, top-10 lost finding. |
| Competitors | CRUD; comparison uses identical counting for "you" and competitors. |
| Tasks + verification | Create from a finding (valid payload); done → re-scan → finding resolved → task verified; regression path. |
| Dashboard | Aggregates equal module totals; empty project shows empty states, never numbers. |
| AI Chat | The context contains only the active project's data; with no data it says so; with no provider it errors plainly (no fabricated text). |
| Reports | Built from `project-summary`; public token access works; expired token 404s; no cross-org token leakage. |
| Super Admin | Non-admins are blocked server-side; org disable locks its users out; audit log entries are written. |
| Jobs | Duplicate enqueue rejected; crash mid-run → retried or failed; timeout → failed with a message; progress reported. |
| API validation and errors | Malformed input → 400 with the standard shape; provider failure, timeout, or rate limit → user-readable message; never a blank page (error boundaries). |
| **End-to-end golden path** | Create org → invite user → sign in → create project (domain) → add keywords → add competitors → run site audit → run AI and rank check (with **recorded provider responses** so CI costs nothing and is deterministic) → findings appear → create task → mark done → re-run → finding verified → dashboard updates → AI Chat answers "what should I fix first" using the updated findings. |

---

## 8. Decisions needed before Phase 0

| ID | Decision | Recommendation |
|---|---|---|
| **D1** | Give me a way to read the **live** database schema and policies. Either run `select * from pg_policies` plus a schema dump and share it, or give me access to a staging project. Is there a staging Supabase project? | Required. Phase 0 fixes must target the live state, not the migration files. |
| D2 | Introduce `SUPABASE_SERVICE_ROLE_KEY` (server-only, used only by the job runner and platform admin) | Yes. Cron and background jobs can't work under RLS without it. |
| D3 | Job execution model | A jobs table in Postgres, with a runner triggered by a cron tick every minute plus an `after()` kick. It needs no new infrastructure and its state survives restarts. The alternative is a separate worker container on Coolify. |
| D4 | Production target: **Coolify (Docker)** or **Vercel**? | Pick one. The Dockerfile's `standalone` output needs fixing if Coolify. |
| D5 | Replace the single allowed email with **invite-only signup** (existing invites) and move Google sign-in to Supabase's provider | Yes. |
| D6 | The Messages inbox (fake senders, not part of the product model) | Hide it and remove it later; notifications cover real events. |
| D7 | Add test tooling: Vitest, Playwright, and the Supabase CLI (needs Docker locally and in CI) | Yes. |
| D8 | Site Audit engine: build a real crawler (a new table and likely one HTML-parser dependency) | Yes (redesign plan D1-A). |
| D9 | Keep database names `agencies` and `clients`; the UI says Organization and Project | Yes. Renames are risky and add nothing. |
| D10 | Error tracking service (for example Sentry) or logs only | Your call; it affects Phase 13 only. |

Carried over from the redesign plan: color decision D2 still stands. Its mock-data question (D3) is now settled by this brief: production paths use real data only.
