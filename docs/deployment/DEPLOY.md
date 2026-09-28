# VSI — Deployment Guide (Coolify)

> **Updated 2026-09-28.** The database, environment-variable and authentication steps live in
> [docs/architecture/VSI_SUPABASE_SETUP.md](../architecture/VSI_SUPABASE_SETUP.md); sections 2 and 4
> below only point there. The Coolify steps still apply. The deployment target (Coolify with this
> Dockerfile, or Vercel) has not been decided, and nothing here means VSI is deployed.

## Prerequisites
- Coolify instance with Docker support
- Private Git repository (GitHub / GitLab / Gitea)
- Supabase project with schema applied
- Provider keys for the providers you choose (see `.env.example`); none are needed to build or start the app

## 1. Source

The code is already in the team's private repository. Deploy from a reviewed branch; `.env.local` is
git-ignored and must never be committed.

## 2. Database

Apply `supabase/migrations/001_baseline.sql` … `045_analytics_event_allowlist.sql` to the confirmed
VSI project for this environment, as described in section 10 of
[VSI_SUPABASE_SETUP.md](../architecture/VSI_SUPABASE_SETUP.md). Never create `USING (true)` policies:
they remove the separation between organizations.

## 3. Create the app in Coolify

1. New Resource → Application
2. Source: your private Git repo
3. Branch: `main`
4. Build Pack: **Dockerfile** (Coolify detects the included Dockerfile)
5. Port: `3000`

## 4. Set environment variables in Coolify panel

`.env.example` lists every variable with its purpose. For a production deployment:

- **Build time:** `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` of this environment's own VSI project (never another environment's).
- **Runtime:** `ANALYTICS_SALT` (a long random string), and the keys of the providers you chose (`SERPAPI_KEY`, `OPENROUTER_API_KEY` or `OPENAI_API_KEY`, optionally `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `FIRECRAWL_API_KEY`).
- **Leave empty:** `VSI_QA_ENABLED`, `QA_COOKIE_SECRET`, `VSI_ALLOW_DEMO_DATA`, `GOOGLE_*` and `CRON_SECRET` (scheduled checks are not functional yet).
- The Dockerfile sets `BUILD_STANDALONE=1` itself.

## 5. Deploy

Click **Deploy** in Coolify. Build takes 2-3 minutes (Docker multi-stage).

After deploy, verify:
- Hit the public URL
- HTTP headers should NOT show `Next.js`, `Vercel`, or `Cloudflare-Workers`
- `Server: VSI` should be present
- No `X-Powered-By` header

## 6. Custom domain (optional)

In Coolify → app settings → Domains, add your custom domain.
Coolify auto-provisions SSL via Let's Encrypt.

---

## Tech-stack masking checklist

| Vector | Status |
|---|---|
| HTTP `X-Powered-By` | Removed via `poweredByHeader: false` |
| `Server` header | Set to "VSI" |
| Build ID | Opaque timestamp-based |
| Source maps | Disabled in production |
| Telemetry | `NEXT_TELEMETRY_DISABLED=1` |
| Search engine indexing | Blocked via robots meta |
| Referrer | `strict-origin-when-cross-origin` |
| Inner JS bundles | Aggressively minified by Next.js production build |
| External API endpoints | Called server-side only — never appear in client network tab |

---

## Updating in production

```bash
git add .
git commit -m "Your update"
git push
```

Coolify auto-deploys on push (if webhook is enabled) or you can hit "Deploy" manually.
