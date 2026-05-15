# Glenn Events

AI-powered event operations workspace for small event teams.

**The core loop:** dump messy planning notes → Glenn extracts structured updates → review & approve → approved updates populate your event plan.

## Stack

- Next.js (App Router, TypeScript)
- Tailwind CSS + shadcn/ui
- Supabase (Postgres, Auth, RLS)
- Zod

## Getting Started

### 1. Clone and install

```bash
npm install
```

### 2. Set up environment

```bash
cp .env.example .env.local
```

Fill in your Supabase project URL and keys. Create a project at [supabase.com](https://supabase.com).

### 3. Run database migrations

Apply `supabase/migrations/001_init.sql` via the Supabase dashboard SQL editor or the Supabase CLI:

```bash
supabase db push
```

### 4. (Optional) Seed demo data

```bash
npm run seed
```

Requires `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optional `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` in `.env.local` (or `.env`). The seed script loads those files automatically (unlike raw `tsx`, which does not).

### 5. Run dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Script | Command |
|---|---|
| Dev server | `npm run dev` |
| Production build | `npm run build` |
| Seed demo data | `npm run seed` |
| Type check | `npx tsc --noEmit` |
| Lint | `npm run lint` |

## Routes

| Route | Description |
|---|---|
| `/login` | Sign in / create account |
| `/dashboard` | Your events list |
| `/events/new` | Create a new event |
| `/events/[id]` | Event command center |
| `/events/[id]/chat` | Input history + proposed updates queue |
| `/events/[id]/tasks` | Task list |
| `/events/[id]/vendors` | Vendor tracker |
| `/events/[id]/budget` | Budget line items |
| `/events/[id]/timeline` | Milestones & deadlines |
| `/events/[id]/decisions` | Decision log |
| `/events/[id]/risks` | Risk register |
| `/settings` | Account settings |

## Architecture Notes

- Server Components by default; `"use client"` only for interactive islands
- Supabase RLS enforces membership-based data access
- Service role key is only used in dev scripts — never in app routes
- Mock AI extraction endpoint at `POST /api/events/[id]/extract-updates`
- Approval flow writes directly to destination tables via `/api/updates/[id]/approve`

See [CLAUDE.md](./CLAUDE.md) for full architecture decisions and coding standards.
