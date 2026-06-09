# Glenn Events — Deployment Guide

## Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (production or staging)
- A [Netlify](https://netlify.com) account
- An [Anthropic](https://console.anthropic.com) API key
- (Optional) A [Sentry](https://sentry.io) project for error monitoring

---

## 1. Supabase setup

1. Create a new Supabase project (keep it separate from your local dev project)
2. Run **all six migrations** in order via Settings → SQL Editor:
   - `001_init.sql` — full schema: 17 tables, RLS policies, indexes
   - `002_...` / `003_...` — incremental schema additions
   - `004_open_questions_answer.sql` — adds `open_questions.answer` column
   - `005_grant_authenticated_permissions.sql` — **critical**: grants SELECT/INSERT/UPDATE/DELETE on all tables to the `authenticated` role. Without this, PostgREST returns 403 even when RLS policies are correct.
   - `006_fix_rls_bootstrap.sql` — fixes org/event creation RLS bootstrap and adds the event delete policy. Without this, new users cannot create organizations or events.
3. Note your project URL and anon key from Settings → API

---

## 2. Netlify setup

1. Push this repo to GitHub
2. In Netlify: **Add new site → Import from Git → select your repo**
3. Build settings are already in `netlify.toml` — no changes needed:
   - Build command: `npm run build`
   - Publish directory: `.next`
4. Set all required environment variables (see below)
5. Deploy

---

## 3. Environment variables

Set these in **Netlify → Site settings → Environment variables**.

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

**Do NOT set `SUPABASE_SERVICE_ROLE_KEY` in Netlify.** That key is for local dev scripts only (`npm run seed`) and must never be present in the app environment.

**Do NOT set `SEED_USER_EMAIL` or `SEED_USER_PASSWORD` in Netlify.** Those are local dev-only seed script variables.

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
2. Set **Site URL** to your Netlify domain (e.g. `https://your-app.netlify.app`)
3. Add to **Redirect URLs**: `https://your-app.netlify.app/auth/callback`

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

1. Visit your Netlify URL → you should be redirected to `/login`
2. Sign up with a new account
3. Create an event via `/events/new`
4. Paste the demo scenario into Glenn input → real Claude extraction should return structured updates
5. Approve a few → check the destination tabs (Tasks, Vendors, Budget)
6. Test forgot-password flow: sign out → "Forgot your password?" → check email

---

## 8. Staging vs. production

For a proper staging setup:
- Create a second Supabase project for staging
- Create a second Netlify site pointing to the same repo with a `staging` branch
- Set staging-specific env vars in Netlify (different Supabase credentials, same Anthropic key)
- Use Netlify branch deploy previews for feature branches
