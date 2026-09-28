# VSI — ValGrow Search Intelligence

VSI shows how a business appears in Google search and in AI answers (Google AI Overviews, ChatGPT), and turns what it finds into tasks and reports. Next.js 16 (App Router) with Supabase (Postgres, Auth, row-level security).

## Requirements

- Node.js 22 (see `.nvmrc`; the Docker image uses `node:22-alpine`, and `@supabase/supabase-js` requires Node 22 or later)
- A Supabase project of your own for development. Never point a local or staging setup at another environment's project.

## Local development

1. `npm ci`
2. Copy `.env.example` to `.env.local` and fill in the Supabase URL and anon key. Every variable is described in `.env.example`; provider keys are optional, and without them provider features report that they are not configured.
3. Apply the database: `supabase/migrations/001_baseline.sql` … `045_analytics_event_allowlist.sql`, in order (see section 10 of [docs/architecture/VSI_SUPABASE_SETUP.md](docs/architecture/VSI_SUPABASE_SETUP.md)).
4. `npm run dev`, then open http://localhost:3000.

## Checks

- `npm test`: unit, route and database-policy tests (the database tests replay the migrations in an in-memory PGlite database; no Supabase project or provider is contacted).
- `npx tsc --noEmit`: type check.
- `npm run lint`: ESLint.

## Documentation

- [docs/architecture/VSI_SUPABASE_SETUP.md](docs/architecture/VSI_SUPABASE_SETUP.md): database, authentication, redirect URLs, environment variables.
- [docs/deployment/DEPLOY.md](docs/deployment/DEPLOY.md): building and running the Docker image (Coolify). The deployment target has not been decided yet.
