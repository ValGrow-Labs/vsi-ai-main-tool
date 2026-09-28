# VSI Supabase Setup

Date: 2026-09-19 · Branch: `feat/redesign-geo` · Decision: VSI stays on Supabase (Postgres, Auth, RLS, Realtime). No ORM, no other auth library, no custom database layer.

This guide gets VSI from its current state onto a real development or staging Supabase project, and lists what must be fixed before production. It is written from an audit of the code and the SQL in this repository.

**No real Supabase project was connected when this was written.** `.env.local` still holds the placeholder URL. Anything marked *not run* has not been executed against a database. Results of what was and wasn't tested are in [VSI_SUPABASE_VALIDATION_RESULTS.md](../validation/VSI_SUPABASE_VALIDATION_RESULTS.md).

> **Status update (2026-09-28).** Parts of this guide describe the code as it was on 2026-09-19. Since then:
> - The database is the numbered chain `supabase/migrations/001_baseline.sql` … `045_analytics_event_allowlist.sql`, applied in order with `supabase db push` (section 10). It was applied cleanly to a fresh VSI staging project.
> - 043, 044 and 045 are the security migrations (tenant isolation, disabled accounts, invites, shared reports, feedback/analytics, QA functions, analytics event types). The isolation gaps listed in section 8 were written before them; re-check any gap against the current policies before acting on it.
> - Self-service sign-up exists, the single hard-coded account is gone, and password reset works: "Forgot password?" on the sign-in form emails a link to `/auth/reset-password` (section 6).
> - Redirect URLs for every environment: `<origin>/auth/callback` **and** `<origin>/auth/reset-password`.

---

## 1. Supabase architecture

```
Browser ── anon key ──► Supabase Auth      (sign-in, session cookies)
   │                    Supabase Realtime  (notification events)
   │                    PostgREST          (a few forms write directly)
   ▼
Next.js server (pages, /api routes, middleware)
   └─ anon key + the user's session cookie ──► PostgREST ──► Postgres + RLS
                                          └──► SerpAPI / Serper, OpenRouter / OpenAI /
                                               Anthropic / Gemini, Firecrawl
```

- **One key.** Every Supabase client uses the anon (publishable) key: `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`, and an inline copy in `src/middleware.ts`. **The service-role key is not used anywhere.**
- **RLS is the security boundary.** The server acts as the signed-in user, so whatever RLS allows is what the user can do. The browser holds the same key, so application-side filtering is convenience, not protection.
- **No user, no access.** A request with no signed-in user (the cron route, for example) sees nothing that RLS protects.
- **Organization** = one `agencies` row. A user belongs to one through `profiles.agency_id`. A **project** = one `clients` row. Almost every tenant table carries `agency_id` and `client_id`.
- **Session flow:** `middleware.ts` checks the Supabase user on every non-public path. `getSession()` in `src/lib/auth.ts` checks it again, then loads the profile and organization, including the disabled flags. `getProjectContext()` picks the active project from the `vsi_project` cookie, but only from the list of projects the user's organization owns, so a forged cookie falls back to the first project.
- **Super Admin** is enforced on the server: `requireSuperAdmin()` in the admin layout and again in every admin page, `adminApiSession()` in all 11 admin API routes. No admin page relies on hiding things in the browser.
- **Placeholder mode:** when `NEXT_PUBLIC_SUPABASE_URL` is empty or a placeholder and `NODE_ENV` is not `production`, VSI runs with a local cookie session and no database. Query retries are off in that mode (commit `033725b`). With a real URL, retries stay on and cookie sessions are refused.

## 2. Required environment variables

`.env.example` lists every name with guidance and no values.

| Variable | Needed | Browser? | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | yes, by design | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | yes, by design | Anon / publishable key |
| `SERPAPI_KEY` | for real search data | no | SerpAPI. `SERPAPI_API_KEY` is an older name for the same key |
| `SERPER_API_KEY` | optional | no | serper.dev, used for rankings when set and different |
| `SEARCHAPI_KEY` | no | no | Legacy fallback name. Leave empty |
| `OPENROUTER_API_KEY` | effectively yes | no | Briefs, reports, citation strategy, analysis |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` / `GOOGLE_API_KEY` | optional | no | AI Chat providers; OpenAI also runs the ChatGPT check |
| `AI_PROVIDER` | optional | no | Preferred chat provider |
| `FIRECRAWL_API_KEY` | optional | no | Page fetching for citation work |
| `CRON_SECRET` | optional | no | Turns on the scheduled-check route. Empty means the route answers 503 |
| `ANALYTICS_SALT` | recommended | no | Stable hashing of user ids in analytics |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` | local only | no | Local-development Google flow (section 7) |
| `BUILD_STANDALONE` | optional | build | Docker bundle |

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are still read as fallbacks. They can't work in the browser, because Next.js only inlines `NEXT_PUBLIC_` names. Don't use them.
- **Checked:** no server-only value from `.env.local` appears in the compiled browser bundle (67 files scanned). Only `.env.example` has ever been committed. No credential appears in any tracked file.

## 3. Local setup

**Without a database (today's default).** Copy `.env.example` to `.env.local` and leave the Supabase URL as the placeholder. Sign in with the authorized email and any password of 6 or more characters. Pages show their empty states. Nothing is stored.

**Against a real development project:**
1. Create a Supabase project for development. Do not share it with staging or production.
2. Put its URL and anon key in `.env.local`.
3. Apply the database (section 10).
4. Create the user (section 6) and run the seed: `supabase/seed/dev_seed.sql`.
5. `npm run dev`, then sign in with that user's real password.

With a real URL, the local cookie session and the local Google button switch off on their own.

## 4. Staging setup

1. A **separate** Supabase project named for staging.
2. Apply the database (section 10), create the user, run the seed.
3. In the hosting platform, set the variables from section 2 for the staging deployment only. Mark the two `NEXT_PUBLIC_` names as available at build time.
4. Supabase → Authentication → URL Configuration: Site URL = the staging origin. Redirect URLs: `<origin>/auth/callback` and `<origin>/auth/reset-password`.
5. Leave `CRON_SECRET` empty and the three `GOOGLE_*` names empty.
6. Run `supabase/tests/tenant_isolation_checks.sql` and `supabase/tests/037_platform_admin_checks.sql` in the SQL editor and record the result.

## 5. Production setup

The same as staging, on its own Supabase project and its own keys, plus:
- fix the blockers in section 12 first;
- never run `supabase/seed/dev_seed.sql` or the isolation test there;
- turn on backups before the first real customer (section 14);
- do not copy staging keys.

`docs/deployment/DEPLOY.md` is out of date: it tells you to create `USING (true)` development policies, which removes tenant isolation. Do not follow its database section.

## 6. Authentication configuration

How it works today:
- **Email and password** through Supabase Auth (`LoginPage.tsx` → `signInWithPassword`). This is the only sign-in that works against a real project.
- **Accounts:** any confirmed account can sign in. Disabled accounts (or members of a disabled organization) are signed out and refused by the middleware, the API and the database. A new account without an organization is sent to `/onboarding`.
- **Sign-out:** `logoutAndRedirect()` signs out of Supabase and clears the local markers.
- **Session persistence:** Supabase cookies, refreshed by the middleware.
- **Protected routes:** everything except `/`, `/login`, `/privacy`, `/r/*`, `/qa`, `/api/qa`, `/api/cron`, `/api/auth`, `/auth/callback`.
- **Welcome toast:** a one-time `vsi_welcome` cookie set at sign-in and read once on the dashboard. Uncommitted; to be verified on the real project.
- **Password reset:** "Forgot password?" on the sign-in form opens `ForgotPasswordModal`, which asks Supabase to email a recovery link to `/auth/reset-password`. That page turns the link into Supabase's recovery session and sets the new password (`src/lib/password-reset.ts`). `<origin>/auth/reset-password` must be an allowed redirect URL.
- **Sign-up:** self-service on `/login` ("Create account"); the confirmation email returns to `/auth/callback`. `/auth/login` and `/auth/register` only redirect.

Supabase dashboard settings:
- Providers → Email: enabled.
- "Confirm email": with no sign-up page, create users in the dashboard and tick **Auto confirm user**.
- "Allow new users to sign up": **turn it off**. Two insert policies let any signed-in user create organization rows (section 8), so open sign-up adds risk and no benefit.
- Creating the first user: Authentication → Users → Add user, with the email from `auth-config.ts`. The seed script then links it to an organization. To do that by hand: `update public.profiles set agency_id = '<org id>', role = 'super_admin' where id = '<user id>';` in the SQL editor.

## 7. Google OAuth configuration

**Google sign-in does not work against a real Supabase project.**

- `/api/auth/google` and `/api/auth/callback/google` are a custom flow that only sets local cookies. Both refuse to run unless Supabase is a placeholder and the build is not production, and the login page hides the button in the same condition.
- `/auth/callback` can exchange a Supabase OAuth code, but nothing in the app starts that flow. There is no `signInWithOAuth` call.

To offer Google in staging or production, a small piece of work is needed: enable the Google provider in Supabase, add `<origin>/auth/callback` to the redirect URLs, and have the button call `supabase.auth.signInWithOAuth({ provider: "google" })`. That was not done here, because authentication is not to be changed in this phase. The single-email rule would still apply.

## 8. RLS strategy

**The rule:** a row is visible when its `agency_id` equals the organization of the signed-in user (`profiles.agency_id` for `auth.uid()`), or when `is_super_admin()` is true. `is_super_admin()` is `SECURITY DEFINER` and `STABLE` (migration 007). Users can't change their own `role`, `agency_id` or disabled flags: a trigger from migration 037 rejects it.

RLS is enabled on all 21 public tables.

| Table | Organization A reads B? | A writes B? | Policy |
|---|---|---|---|
| `clients`, `tracked_keywords`, `search_results` | no | no | `<table>_agency_all` (`schema.sql`) |
| `tasks` | no | no | migration 018 |
| `site_audits` | no | no | migration 035 |
| `project_competitors` | no | no | migration 036 (checks the project as well as the organization) |
| `reports`, signed-in | no | no | migration 014 |
| `feedback` | no, own rows only | no | migration 020 |
| `profiles` | no, own row only | no | `schema.sql`, migration 037 |
| `invites` | no | no | migrations 007, 037 |
| **`reports`, not signed in** | **yes, every organization's reports** | no | `reports_public_read_by_token`, migration 014 |
| **`notifications`** | **yes, rows with no user** | **yes** | migration 030 |
| **`messages`** | **yes, rows with no user** | **yes** | migration 031 |
| **`client_keyword_analyses`** | **yes, everything** | **yes** | migration 032, `USING (true)` |
| `agencies` | no | any signed-in user can **insert** organization rows | migrations 005, 006 |

**Isolation gaps found in the SQL.** None was changed in this phase, because each fix alters behaviour and needs your decision.

1. **High: anyone with the anon key can read every shared report.** `reports_public_read_by_token` allows `share_token is not null and not expired`. It never compares the token to anything, so a plain list request returns every organization's report content. Its comment says the route validates the token, but RLS doesn't know that. Fix: drop the policy, add a `SECURITY DEFINER` function `get_shared_report(p_token)`, and have `src/app/r/[token]/page.tsx` call it.
2. **High: `client_keyword_analyses` is open to everyone**, signed in or not, for read, write and delete. The application doesn't use the table at all. Fix: drop the table, or replace the four policies with a project-ownership rule.
3. **High: `notifications` and `messages` rows with no user are readable and writable by anyone**, including visitors who aren't signed in: `user_id IS NULL OR user_id = auth.uid()`, with no role restriction. `/api/messages` inserts without a `user_id`, so every message it stores is such a row, and `messages` has no organization column at all. Fix: own rows only, `TO authenticated`, and have the route set `user_id`.
4. **Medium: any signed-in user can create organization rows** (`WITH CHECK (true)` on two insert policies). Onboarding now goes through `complete_onboarding()`, so both policies can go.
5. **Medium: the QA functions** (`qa_login`, `qa_save_check`, `qa_list_checks`) are callable without signing in, protected by a short code, with no rate limit.
6. **Low:** `prompts` and `system_settings` are readable by every signed-in user. `analytics_events` accepts rows with no organization (insert only). The logo bucket is public by intent.

**Application layer, which RLS does not cover:**
- 13 API routes have no authentication of their own and rely on the middleware: `aio`, `analyze`, `check`, `citation-content`, `export`, `messages`, `notifications/[id]`, `notifications/clear-all`, `prompts/simulate`, `rank`, `resolve`, `search`, `serp-rankings`. Several call paid APIs with no rate limit.
- `/api/export` takes the organization id from the query string. Only RLS stops a cross-organization export.
- `/api/qa/login` is public with no rate limit.

**Testing it:** `supabase/tests/tenant_isolation_checks.sql` builds two organizations, acts as a user of one and as a visitor, and tries to read and write the other organization's rows in every tenant table. It rolls itself back. *Not run yet.*

## 9. Realtime configuration

- **Status in the repository: not enabled.** No migration adds `notifications` to the `supabase_realtime` publication. Unless that was done by hand in the dashboard, the app's subscription receives nothing, and the list only updates on load, on the app's own actions, and on the `new-notification-created` browser event.
- **What the client does** (`src/contexts/NotificationsContext.tsx`): one channel per session. `INSERT` and `UPDATE` are filtered with `user_id=eq.<signed-in user>`. `DELETE` is unfiltered because Postgres can't filter deletes. The channel is removed on unmount, bursts are coalesced into at most two fetches, and the Supabase client loads after the page is up. No fault found in the code.
- **To turn it on**, in the SQL editor:
  ```sql
  alter publication supabase_realtime add table public.notifications;
  alter table public.notifications replica identity full;
  ```
  `replica identity full` makes delete events carry the old row. Realtime applies RLS to each subscriber, so fix gap 3 above first: until then, events for rows with no user reach everyone.
- **Not verified:** events arriving, cross-user silence, unread counts updating. These need the real project.
- `messages` has no Realtime. It refreshes every 15 seconds while the tab is visible.

## 10. Database migration process

Apply `supabase/migrations/001_baseline.sql` … `045_analytics_event_allowlist.sql` in number order, with the Supabase CLI linked to the target project (`supabase db push`, after checking `supabase db push --dry-run`). Never point the CLI at a project you have not confirmed is the intended VSI environment. `supabase/schema.sql` is not part of this chain.

Before applying 040 to a database that already has migration history, check whether it already has the original 040 (the version without the `analysis_jobs_one_running_per_client` index). The CLI skips a version it has already recorded, so a changed 040 is never re-applied there.

*The notes below were written for the older, hand-applied files and are kept for history.*

What you need to know first:
- **Migration 033 fails.** Its `messages_user_access` policy uses `sender_id` and `receiver_id`, columns the `messages` table doesn't have. In the SQL editor the whole file rolls back. Nothing the application uses comes only from 033, so skip it. (`notifications.ai_engine`, which the app reads, comes from migration 030.)
- **Migration 038 is new and repairs a fresh install.** `schema.sql` creates `profiles.role` limited to `owner`, `analyst`, `viewer`. Migration 006 meant to change that to `super_admin`, `pilot`, but it uses `add column if not exists` on a column that already exists, so nothing changes and no migration drops the old rule. On a new database every `super_admin` or `pilot` write is rejected, which breaks onboarding, the admin role changes and `is_super_admin()`. 038 replaces the constraint and nothing else. It is safe on a database that is already correct. *Not run.*
- Re-running: most migrations are safe to repeat. `migration_004` and `migration_028` are not.
- **The live schema may differ from these files.** Earlier audits found drift, and migrations 035, 036 and 037 were never confirmed as applied anywhere. For a new project that doesn't matter. For an existing one, compare before trusting it.
- Migrations that touch tenant data or security get a check script in `supabase/tests/`, like 037's.
- A proper migration tool (the Supabase CLI) would fix ordering and drift. It isn't adopted here, to avoid changing how the project works during setup.

## 11. External API configuration

| Service | Key | Used for |
|---|---|---|
| SerpAPI | `SERPAPI_KEY` | Google rankings, AI Mode, AI Overviews, keyword research |
| Serper | `SERPER_API_KEY` | Google rankings, when set |
| OpenRouter | `OPENROUTER_API_KEY` | Briefs, reports, citation strategy, analysis, chat fallback |
| OpenAI | `OPENAI_API_KEY` | The ChatGPT check, chat, optional reports and strategy |
| Anthropic, Gemini | their keys | AI Chat; Gemini also powers "Resolve" on a notification |
| Firecrawl | `FIRECRAWL_API_KEY` | Fetching cited pages |

**The rule is no automatic paid calls.** What the code does today:

| Started by | Paid? | Notes |
|---|---|---|
| Run check, Run searches, brief, citation strategy, report buttons | yes | Explicit click |
| Site Audit, including the one started when a project is created | **no** | It only fetches the customer's own pages |
| A check finishing | yes | Adds a second AI call (the entity check) when the brand is mentioned but not cited, and one Firecrawl fetch per cited page. Part of the check the user started, but more than one credit |
| Opening keyword research for a keyword | yes | One SerpAPI call when the results view opens. Reloading the page spends again |
| Admin → System Health, "test" buttons | yes, small | Explicit click. Opening the page only shows which keys are configured |
| The cron route | would be | **Cannot run today**: nothing schedules it, `CRON_SECRET` is empty, and it has no database access (section 12). New projects default to `check_frequency = 'weekly'` in the database, so switching cron on would start spending without any click. The seed uses `manual` |

**Invented results when a search key is missing.** `src/lib/serper.ts`, `src/lib/serpapi.ts` and `src/lib/serpapi-service.ts` return made-up results (domains such as `industry-leader.com`, with the client shown as cited) when no key is set. The saving pipeline detects this and refuses to store it. `/api/check` returns it with a demo flag. `/api/research`, `/api/search` and `/api/prompts/simulate` return it with **no flag at all**. On staging, set `SERPAPI_KEY`, or treat those three screens as unreliable.

AI features with no key configured fail honestly: a plain "not available" message, no invented numbers.

## 12. Security rules

Rules to keep:
- Secrets live only in environment variables and are never committed. `.env*` is gitignored except `.env.example`.
- Nothing secret gets a `NEXT_PUBLIC_` prefix. The service-role key is not used; if it ever is, it stays on the server.
- Every new tenant table gets `agency_id`, RLS enabled, policies limited `TO authenticated`, and a check in `supabase/tests/`.
- No policy with `USING (true)` on tenant data, no `OR ... IS NULL` escape, and no policy without a role clause.
- Every API route authenticates itself (`requireAgency()`, `getSession()` or `adminApiSession()`), and never trusts an organization or project id from the request.
- Super Admin checks stay on the server.

**Open before production:**

| # | Item | Severity |
|---|---|---|
| 1 | Shared reports readable by anyone (section 8, gap 1) | High |
| 2 | `client_keyword_analyses` open to everyone (gap 2) | High |
| 3 | `notifications` and `messages` rows with no user (gap 3) | High |
| 4 | 13 API routes with no authentication of their own, several spending paid credits | High |
| 5 | Single hard-coded account: no second user can sign in | Blocks multi-tenant use |
| 6 | Password reset and Google sign-in don't work against real Supabase | Medium |
| 7 | Any signed-in user can create organization rows (gap 4) | Medium |
| 8 | QA functions and `/api/qa/login` have no rate limit | Medium |
| 9 | Invented search results shown without a flag when a key is missing | Medium |
| 10 | The scheduled-check route can never work: it has no user, so RLS returns no projects and it answers "ok, 0 processed" | Medium |
| 11 | Message body rendered as raw HTML (`messages/[id]/page.tsx:266`, `dangerouslySetInnerHTML`), and any visitor can insert messages (item 3), so stored script injection is possible | Medium, High together with item 3 |

Item 10 needs a decision, not a patch: either a server-only service-role client used by that one route, or `SECURITY DEFINER` functions. Both are deliberate exceptions to "one key".

## 13. Performance considerations

- Commit `033725b` stays: with a placeholder URL, query retries are off. With a real URL the default retries remain.
- The auth-round-trip change (F1) and the index migration (F6) are **not** implemented. They wait for measurements on a real project with real data.
- Once staging has data, measure: sign-in and per-request auth latency; the `search_results` read (up to 3000 rows over 120 days); `tracked_keywords`; the `site_audits.checks` JSON; AI Visibility queries; Reports; notifications; page navigation.
- The measurement script and the candidate index SQL are described in `docs/performance/`. Run `EXPLAIN ANALYZE` before adding any index.
- Put the Supabase project and the hosting region close together. Every page makes several round trips.

## 14. Backup and recovery

Nothing in the repository handles backups. It is all Supabase configuration.
- **Staging:** the plan's daily backups are enough. The seed rebuilds the test data.
- **Production:** turn on Point-in-Time Recovery before the first customer. Know the restore procedure and try it once, into a scratch project.
- **Before any migration on production:** take a backup, or confirm the latest one, and keep the rollback SQL beside the migration.
- **Deletes cascade.** Deleting an organization removes its projects, searches, results, audits, tasks and reports. Migration 026 adds disable flags; prefer disabling to deleting.
- **Auth users** live in `auth.users` and are covered by the database backup. API keys are not: keep them in the hosting platform and a password manager.
- **Storage:** one public bucket, `agency-logos`. Logos can be uploaded again; they are not part of the database backup.
