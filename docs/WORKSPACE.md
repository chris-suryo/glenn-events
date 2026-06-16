# Glenn Events — Workspace (Base of Operations)

This is the fast-resume page for any Claude Code session. Read it first, then
`docs/PRODUCT_CHECKPOINT.md` for product state and `CLAUDE.md` for architecture
and the Branch Closeout Checklist.

---

## Current Milestone State

| Milestone | Status | What it shipped |
|---|---|---|
| M20 | Done | Event Library: file upload → private `event-files` bucket → PDF/TXT extraction via shared `runExtraction` → Review → provenance. **Images source-only.** Migration 009. |
| M20b | Done | Hardening: files UPDATE RLS fix (migration 010), Ask Glenn paperclip upload, derived Library card states, Activity source-batch grouping. |
| M21 | Done | Source-backed Review package cards + source preview drawer (`01d94fb`). |
| m22-workspace-docs | Done | Workspace + AI cost audit + demo playbook docs (`9636b41`). Docs only. |
| **M22** | **Done** | `m22-image-extraction-with-ai-debug` (pushed, head `96f38bc`): PNG/JPG screenshot extraction via Claude vision + lightweight AI run telemetry/debug line + composer attachment staging. Migration 011. See `docs/AI_COST_AUDIT.md`. |
| Next | Planned | Frontend polish arc (see `docs/PRODUCT_CHECKPOINT.md` → Roadmap) + wedding scenario validation. |

The core loop is unchanged: **messy input or source file → Glenn proposes
structured plan updates → user reviews (nothing applies silently) → plan updates
→ source / provenance / activity trail.**

---

## Branch Naming Conventions

- Format: `m<NN>-<short-kebab-description>` (e.g. `m22-image-extraction-with-ai-debug`).
- Sub-milestones get a letter suffix: `m20b`, `m22a`.
- Docs-only or scoped slices keep the milestone number and a descriptive tail
  (e.g. `m22-workspace-docs`).
- Branch from the latest accepted milestone branch (the most recent merged/accepted
  `feat:`), not from stale WIP branches.

---

## Repo Guardrails

These are hard rules. Violating them has broken sessions before.

- **`.claude/launch.json` must remain UNSTAGED.** It carries local dev-launcher
  config and shows up as modified in `git status`. Never `git add` it; never
  include it in a commit.
- **`git stash@{0}` is the `m19-visual-polish` WIP.** Do **not** pop, apply, drop,
  or otherwise touch it. It is parked intentionally. Leave the stash list exactly
  as you found it.
- **No push unless the user explicitly asks.** Commit locally; stop there.
- **No service-role key in app routes.** Service role is `scripts/`-only (RLS +
  authenticated user context everywhere else).
- **Don't restage or "clean up" unrelated working-tree changes** you didn't make.

---

## Migration / Storage Prerequisites

Before live QA of file/extraction features, the target Supabase project needs:

- **Migrations applied through the latest** (`supabase/migrations/`). As of M21
  that means **009** (`event_library_files`) and **010** (`files_update_policy`).
  M22 will add **011** (`ai_run_telemetry`).
- **`event-files` storage bucket** exists (private, RLS-enforced). Created/used by
  migration 009 + `lib/upload-file.ts`.
- **`ANTHROPIC_API_KEY` set** for real extraction; without it the app falls back to
  deterministic mock extraction and images/PDFs stay source-only.
- Migrations are sequential `NNN_description.sql`. The next one is **011**.

---

## How to Resume Work

1. `git status --short` — confirm you're on the expected branch and that
   `.claude/launch.json` is the only stray change (leave it).
2. `git stash list` — confirm `stash@{0}` is still the `m19-visual-polish` WIP,
   untouched.
3. `git log --oneline -5` — confirm the latest accepted milestone.
4. Read `docs/PRODUCT_CHECKPOINT.md` (product state) and `CLAUDE.md` (architecture).
5. If picking up a planned milestone, check for a plan in `~/.claude/plans/` and
   the relevant `docs/` playbook (e.g. `AI_COST_AUDIT.md` for M22).
6. Confirm prerequisites above if the work touches files/extraction.

---

## How to Close Out a Branch

Follow the **Branch Closeout Checklist** in `CLAUDE.md`. In short: record branch
name, commit hash, files changed, validation + manual QA status, known
limitations, and the next recommended branch; run `git diff --check` and report
`git status --short`; confirm `.claude/launch.json` is unstaged, the stash is
untouched, and that nothing was pushed unless requested. Update
`docs/PRODUCT_CHECKPOINT.md` to reflect the new milestone.
