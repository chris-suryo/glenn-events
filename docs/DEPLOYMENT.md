# Glenn Events — Deployment Guide

## Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (production or staging)
- A [Vercel](https://vercel.com) account (Hobby tier is non-commercial — a paid pilot needs **Pro**)
- An [Anthropic](https://console.anthropic.com) API key
- (Optional) A [Sentry](https://sentry.io) project for error monitoring

---

## 1. Supabase setup

1. Create a new Supabase project (keep it separate from your local dev project)
2. Run **all migrations in order** via Settings → SQL Editor:
   - `001_init.sql` — full schema: 17 tables, RLS policies, indexes
   - `002_rls_tighten_members_and_statuses.sql` — tightens membership policies + adds status CHECKs
   - `003_profiles_insert_policy.sql` — lets users insert their own profile row
   - `004_open_questions_answer.sql` — adds `open_questions.answer` column
   - `005_grant_authenticated_permissions.sql` — **critical**: grants SELECT/INSERT/UPDATE/DELETE on all tables to the `authenticated` role. Without this, PostgREST returns 403 even when RLS policies are correct.
   - `006_fix_rls_bootstrap.sql` — fixes org/event creation RLS bootstrap and adds the event delete policy. Without this, new users cannot create organizations or events.
   - `007_vendor_correction_proposals.sql` — correction metadata on `proposed_updates`
   - `008_archive_and_corrections.sql` — soft-archive columns (`archived_at`, `archived_reason`)
   - `009_event_library_files.sql` — event library file metadata + Storage policies
   - `010_files_update_policy.sql` — adds the missing `files` UPDATE policy
   - `011_ai_run_telemetry.sql` — model/provider/token/cost tracking on `ai_runs`
   - `012_profile_event_type_preference.sql` — adds `profiles.typical_event_types` (guided onboarding)
   - `013_public_profiles_view.sql` — `public_profiles` view + `shares_event_or_org()` so co-members can resolve each other's name/avatar in shared events (profiles base RLS stays self-only)
   - `014_event_ai_summary.sql` — adds `events.ai_summary` + `events.ai_summary_updated_at` for the cached, Glenn-authored Overview brief (generated on demand via `POST /api/events/[id]/summary`). The Overview shows a data-assembled brief until this is applied and a summary is generated; no new RLS needed.
   - `015_event_timezone.sql` — adds `events.timezone` (IANA) so day-of times render in the event's local wall-clock (timestamptz only stores a UTC instant). Backfills existing rows + defaults new rows to `America/New_York`. The app falls back to `America/New_York` (see `DEFAULT_EVENT_TZ` in `lib/utils.ts`) until this is applied, so times render correctly for US-Eastern events beforehand.
3. Note your project URL and anon key from Settings → API

> **Migrations are applied manually — there is no migration runner in this repo.** Apply each migration's SQL in the SQL Editor (dev *and* hosted), in order, and keep this list current whenever you add a `supabase/migrations/NNN_*.sql`.

---

## 2. Vercel setup

1. Push this repo to GitHub
2. In Vercel: **Add New… → Project → Import** your GitHub repo
3. Vercel auto-detects Next.js — no build config needed:
   - Framework preset: **Next.js**
   - Build command: `next build` (default)
   - Output: handled by the Next.js preset (do **not** set Output Directory to `.next`)
4. Set all required environment variables (see below)
5. Deploy

> **No `vercel.json` is needed.** Per-route timeouts use Next's native
> `export const maxDuration` (already set to 60 on the slow Claude routes:
> `extract-updates`, `files`, `onboard`) — Vercel honors it directly.

---

## 3. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** (apply to Production, Preview, and Development as needed).

### Required

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public key |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |

### Optional

| Variable | Effect when set |
|---|---|
| `SENTRY_DSN` | Enables Sentry server-side error capture |
| `NEXT_PUBLIC_SENTRY_DSN` | Enables Sentry client-side error capture |
| `SENTRY_AUTH_TOKEN` | Uploads source maps so Sentry stack traces show original code |
| `SENTRY_ORG` | Required alongside `SENTRY_AUTH_TOKEN` |
| `SENTRY_PROJECT` | Required alongside `SENTRY_AUTH_TOKEN` |

**Do NOT set `SUPABASE_SERVICE_ROLE_KEY` in Vercel.** That key is for local dev scripts only (`npm run seed`) and must never be present in the app environment.

**Do NOT set `SEED_USER_EMAIL` or `SEED_USER_PASSWORD` in Vercel.** Those are local dev-only seed script variables.

---

## 4. Graceful degradation

The app works without optional env vars:

| Missing var | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | Falls back to deterministic mock extractor — real LLM not used |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Sentry silently disabled — errors only go to server logs |
| `SENTRY_AUTH_TOKEN` | Source maps not uploaded — stack traces in Sentry less readable |

---

## 5. Auth callback URL

Supabase needs to know your production URL to send password reset emails to the right callback:

1. Supabase → Authentication → URL Configuration
2. Set **Site URL** to your Vercel domain (e.g. `https://your-app.vercel.app`, or your custom domain)
3. Add to **Redirect URLs**: `https://your-app.vercel.app/auth/callback`
   - If you use Vercel preview deployments for auth-flow testing, also add the preview pattern `https://*-your-team.vercel.app/auth/callback`

> **Critical:** skipping this step breaks password-reset and OAuth — Supabase
> will reject the callback because it doesn't match an allowed redirect.

---

## 6. Local development

```bash
cp .env.example .env.local
# Fill in your values

npm install
npm run dev          # starts on localhost:3000
npm run seed         # creates demo event (idempotent)
npm run seed:reset   # wipe and re-seed demo event
```

---

## 7. Verifying a deployment

After deploying, run through the MVP demo:

1. Visit your Vercel URL → you should be redirected to `/login`
2. Sign up with a new account
3. Create an event via `/events/new`
4. Paste the demo scenario into Glenn input → real Claude extraction should return structured updates
5. Approve a few → check the destination tabs (Tasks, Vendors, Budget)
6. Test forgot-password flow: sign out → "Forgot your password?" → check email

---

## 8. Staging vs. production

For a proper staging setup:
- Create a second Supabase project for staging
- In Vercel, scope env vars by environment: set staging Supabase credentials on the **Preview** environment and production credentials on **Production** (same Anthropic key is fine)
- Vercel automatically builds a **preview deployment** for every branch/PR — use these for feature-branch QA
- Remember to add each preview/staging domain to Supabase **Redirect URLs** (see §5) or auth flows will fail there
