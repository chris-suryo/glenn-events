# Glenn Events — Frontend Direction

> **Status:** Planning doc. Locked 2026-06-16 after a frontend audit + visual-direction
> sprint. No app code changed by this document. It records the agreed visual direction
> and the branch plan so implementation sessions stay aligned.
>
> Read alongside `docs/PRODUCT_SOUL.md` (north star) and `CLAUDE.md` (architecture rules).
>
> **Typography correction (June 2026, post-implementation).** The original plan repointed
> `--font-heading` to Fraunces, which rendered every card title / heading (e.g. dashboard event
> cards like "PDF Upload 4") in heavy serif — too editorial for operational UI. **Corrected:**
> `--font-heading` stays **Geist Sans**; Fraunces is loaded only as an **opt-in `--font-display` /
> `font-display` utility**, applied to nothing by default. Reserve display serif for *select*
> moments only (onboarding/landing hero, the "Event Brief" page title, premium empty states).
> Normal UI — cards, list rows, nav labels, buttons, metadata — is Geist Sans. The warm canvas,
> paper-card surface, and the rest of the tokens are kept.
>
> **IA naming (June 2026):** the shell renames to **Home · Plan · Files** (page header "Event
> Brief"; "Files" = Event Library + Activity). See `docs/M19_PRODUCT_DIRECTION.md`.

---

## 1. Locked visual direction

**Operations Desk + Dossier hybrid, with Mission Control reserved as a later opt-in dark theme.**

One line: *Glenn should feel like a calm, premium, source-backed event operations workspace — warm and editorial to work in, rigorous and traceable where it matters.*

### 1a. Default daily aesthetic — "Operations Desk"

The everyday look, light mode, what every user sees by default:

- **Warm bone canvas** — an off-white, faintly warm background that recedes (not stark white, not cool gray).
- **Ink-indigo accent** — a single deepened indigo as the brand/action accent. One decisive accent, not a rainbow.
- **Fraunces serif — opt-in for select moments only** — onboarding/landing hero, the "Event Brief" page title, premium empty states. Applied to nothing by default; NOT on event-card names, list rows, nav, or general titles. Never body or UI chrome. *(See the June-2026 correction above.)*
- **Geist Sans for UI** — all interface text, labels, buttons, inputs, body copy.
- **Geist Mono / tabular numerals for data** — costs, dates, counts, metrics, telemetry. Aligned, instrument-grade figures.
- **Paper-card surfaces** — one unified card material (border + soft warm shadow), not two competing elevation systems.
- **Calm, premium, operational** — generous whitespace, intentional hierarchy, tasteful motion. A serious tool a professional event operator would trust.

### 1b. Provenance aesthetic — "The Dossier"

Glenn's differentiator is source-backed AI change management. The provenance surfaces
(Review, Plan, Library, Activity) should make that *felt*, not just labeled:

- **Source artifacts feel like real documents** — paper-edge framing, real thumbnails
  (image preview / PDF first page / text snippet), recognizable type chrome. A screenshot
  must not look identical to a contract.
- **Exhibit / citation language** across Review, Plan, Library, and Activity — sources read
  like labeled exhibits; facts carry citation references back to their origin.
- **Facts feel traceable** to the file, message, or screenshot they came from.
- **"Click a fact → see its source" is a core product idea** — selecting a record in the Plan
  should be able to surface the exact source (and highlighted line/region) that justifies it.

This is the through-line that separates Glenn from a generic dashboard: nothing applies
silently, the source stays attached, and Review is the decision point.

### 1c. Later — "Mission Control" (dark theme, deferred)

A future opt-in theme for power moments and demos — **not** the default:

- **Cool slate / dark cockpit** canvas with elevated panels.
- **Luminous accents** on AI/active elements.
- **Scanline / extraction motion** — Glenn visibly "reading" a source.
- **Count-up / debug / cost moments** — the M22 AI telemetry rendered as live cockpit data.
- Ships as an **opt-in dark theme later, never the default.** The token foundation
  (branch 1) defines these values dormant so the theme can be enabled without a rebuild.

---

## 2. Why this direction was chosen

- **It serves the product thesis.** Source → proposed updates → review → plan → provenance.
  The Dossier layer makes the differentiator visible; nothing else in the market frames AI
  event changes as traceable exhibits.
- **It is premium without being risky.** A warm, editorial light theme reads premium and
  trustworthy for daily, daytime, real planning work — where a dark-first cockpit would fight
  legibility, printing, and sharing.
- **It keeps wow on demand.** Mission Control (dark, luminous, scanline) is the demo
  showstopper, held as a theme so the daily UX never bets on flash.
- **It aligns with PRODUCT_SOUL §10** — clean, premium, calm accent, readable tables, strong
  empty states, obvious review actions; explicitly *not* a cluttered dashboard, fake gradients,
  or a consumer party-app aesthetic.
- **It is buildable on the current stack** — Tailwind v4 tokens, shadcn/`@base-ui` primitives,
  `next/font`, `next-themes`. No new UI framework.

---

## 3. What "wow but practical" means for Glenn

Wow that *earns its keep* — every flourish also does a job:

- **Real source thumbnails** everywhere a source appears (composer, chat, Library, Review).
  Wow factor + directly fixes the "image.png" problem.
- **"Glenn is reading" signature** — one shared working state (calm shimmer in light, scanline
  in dark) that makes the extraction *magic moment* legible.
- **Click-a-fact → see-its-source** — the single most differentiated, screenshot-worthy
  interaction, and it is mostly wiring existing provenance to a highlight.
- **Apply = settle-and-lift** — applied review items visibly leave for the plan, so trust is felt.
- **Tabular mono numerals** — quietly makes budgets/counts read instrument-grade.

Not wow: decorative animation, gratuitous gradients/glow, motion without meaning, charts for
their own sake.

---

## 4. How this differs from generic SaaS / shadcn dashboards

- **One editorial voice, not default Inter-on-white.** Fraunces titles + warm bone canvas
  give Glenn a recognizable identity instead of the stock shadcn look.
- **One unified surface, not card-on-card.** A single paper-card material with deliberate
  asymmetry — not endless identical gray cards or uniform icon grids.
- **Provenance as a first-class visual system.** Exhibits and citations are the product's
  spine; generic dashboards have no equivalent.
- **Data has its own type tier.** Mono tabular numerals for money/dates/counts vs. proportional
  Sans for prose — most SaaS dashboards use one font for everything.
- **Motion explains state, never decorates.** Extraction, apply, and drawer transitions teach
  the user what just happened.

---

## 5. What not to do

- **Do not go dark-first.** Mission Control is a theme, not the default.
- **No fake AI gradients, glow everywhere, neon, or noise textures.** One accent; restraint.
- **Do not let the serif leak into UI/body** — titles and hero only (wedding-aesthetic risk).
- **Do not make provenance loud.** Citations are *available*, not shouting on every row.
- **No card-in-card nesting** unless genuinely necessary.
- **One signature motion per moment**, ≤320ms, transform/opacity only, always honoring
  `prefers-reduced-motion`. No count-up on everything.
- **Do not break the trust model** — source stays attached, nothing applies silently, Review
  stays the decision point.
- **Do not refactor product flows in foundation/token branches** — token/primitive/shell only.

---

## 6. How this supports long-term onboarding & dashboard consolidation

- **A token + type foundation is the prerequisite** for any onboarding revamp or dashboard
  consolidation — both need a settled visual language first, or they bake in drift.
- **The unified surface + shell header** (branches 1 and 3) give consolidation a consistent
  frame: one `SurfaceHeader`, persistent event context, a persistent "Tell Glenn" affordance,
  and a persistent Review badge that follows the user — the spine a consolidated command
  center hangs on.
- **The provenance/exhibit system** (branch 2) is what an onboarding flow can *teach against*:
  "upload a file → watch Glenn read it → see the source stay attached." Onboarding becomes a
  guided tour of the real loop, not a separate tutorial UI.
- **Mission Control telemetry** gives a future "AI activity / cost" surface a home without
  redesign.

---

## 7. Branch sequence

Sequenced around the active M22 work (image/screenshot extraction + AI telemetry). Branch 1 is
M22-clean; branch 2 builds new components now but wires into M22-touched files only after M22
merges.

### Branch 1 — `frontend-aesthetic-foundation`
- Tokens, typography, canvas, and card/shell surface.
- Warm Operations Desk palette (bone canvas, ink-indigo, warm graphite borders).
- Fraunces title treatment (display font) in the shell.
- Geist Mono / tabular-numeral data treatment exposed.
- Shadow/elevation, motion, and source-artifact tokens defined.
- Mission Control dark palette **defined but dormant** (no toggle, default light).
- **Scope:** `app/globals.css`, `app/layout.tsx`, `components/providers/theme-provider.tsx`
  (if needed), `components/ui/card.tsx`, `components/shared/app-header.tsx`,
  `components/shared/app-sidebar.tsx`.
- **Fastest visible win AND best long-term foundation.**

### Branch 2 — `frontend-source-artifact-kit`
- A shared `SourceArtifact` component (real image / PDF / text thumbnails).
- **Image thumbnails inline in Ask Glenn after send** (fixes "image.png").
- Richer Event Library source cards (artifact framing, grouping, organization).
- Exhibit / citation component (the Dossier provenance language).
- Animated `SourcePreviewDrawer`.
- **Wire into Library / Review / chat only after M22 is merged** (those files are M22-active).

### Branch 3 — `frontend-shell-command-header`
- Global event context in the header.
- Persistent "Tell Glenn" affordance.
- Persistent pending-Review badge that follows the user across surfaces.
- Navigation polish (animated mobile nav; remove the duplicate sidebar event-name fetch).

---

## 8. Token intent (reference for branch 1)

Concise intent, not final values — implementation tunes the exact OKLCH.

| Token group | Intent |
|---|---|
| `--background` | warm bone (off-white, low warm chroma) |
| `--foreground` | warm near-black ink |
| `--border` / `--input` | warm graphite |
| `--primary` | deepened ink-indigo |
| `--card` | faintly-warm near-white, lifts above canvas |
| `--success/-warning/-danger/-info` + `-surface` | semantic status pair (light + dormant dark) |
| `--review` + `--review-surface` | review/decision accent (aliases primary) |
| `--cite` | source-citation accent (dormant; branch 2 consumes) |
| `--font-display` | Fraunces, **opt-in only** (select hero/editorial moments); `--font-heading` stays Geist Sans |
| `--font-data` | Geist Mono (numerals/data) |
| `--text-display/-h1/-h2/-body/-meta` | fluid type scale (clamp) |
| `--shadow-card/-raised/-overlay` | one paper-card elevation system |
| `--artifact-edge/-wash/-radius` | source-artifact framing (dormant; branch 2 consumes) |
| `--ease-out/-in-out`, `--dur-fast/-/-slow` | motion tokens + global reduced-motion |
| `.dark { … }` | Mission Control values, dormant (no toggle, default light) |

---

## 9. Finalized implementation prompt — branch 1 only

> **Branch:** `frontend-aesthetic-foundation`
>
> **Setup:** Create the branch off the latest accepted base (the branch containing the
> completed M22 work and this doc) and implement on it. **Do not commit or push until the
> changes are reviewed and approved.** Never stage `.claude/launch.json`; never touch
> `git stash@{0}`.
>
> **Goal:** Establish the token + typography foundation and **visibly** shift the app to the
> Operations Desk aesthetic (warm-bone canvas, Fraunces serif titles, Geist Mono numerals,
> unified paper-card surface). Also define — but leave dormant — the Mission Control dark
> palette and the provenance/artifact tokens that branch 2 will consume. Token / primitive /
> shell level only; no product-flow refactors.
>
> **Scope — only these files (all M22-clean):**
> - `app/globals.css`
> - `app/layout.tsx`
> - `components/providers/theme-provider.tsx` *(new, if needed)*
> - `components/ui/card.tsx`
> - `components/shared/app-header.tsx`, `components/shared/app-sidebar.tsx`
>
> **Do NOT touch:** `lib/ai/*`, `app/api/events/[eventId]/files/route.ts`,
> `app/(app)/events/[eventId]/library/page.tsx`, `components/event/file-library.tsx`,
> `components/event/attach-button.tsx`, `components/event/review-package-card.tsx`,
> `components/event/glenn-input.tsx`, `lib/types/index.ts`, `supabase/migrations/011_*`, and any
> extraction / review / apply / provenance logic or onboarding/dashboard work.
>
> **Tasks:**
> 1. **Canvas & ink:** retune light theme to warm-bone canvas, warm near-black foreground, warm
>    graphite borders, deepened ink-indigo primary; define dormant Mission Control dark values
>    (no toggle).
> 2. **Semantic color tokens:** add `success/warning/danger/info/review` + `-surface` variants
>    and a `cite` accent; register them as Tailwind v4 theme variables so utility classes exist.
> 3. **Typography:** import Fraunces via `next/font/google`, expose `--font-display`, repoint
>    `--font-heading` to it, use it for title-level treatment in the shell only; keep Geist Sans
>    as UI body; expose `--font-data` (Geist Mono); add a tabular-numeral utility; add fluid
>    `display/h1/h2/body/meta` text tokens.
> 4. **Card / elevation:** add `shadow-card/-raised/-overlay`; update `components/ui/card.tsx` to
>    the unified paper-card surface. Do not refactor hand-rolled card divs yet.
> 5. **Artifact / motion tokens:** add `artifact-edge/-wash/-radius` (for branch 2), `ease`/
>    `duration` tokens, and global `prefers-reduced-motion` handling.
> 6. **Theme provider:** add a `next-themes` provider if needed; default theme stays light; no
>    toggle; no visible dark behavior yet.
> 7. **Shell title treatment:** use the display font for event/app title treatment in
>    `app-header.tsx` and/or `app-sidebar.tsx` only; no navigation behavior changes.
>
> **Acceptance:**
> - App visibly shifts warmer / more premium in light mode; no product behavior changes; no
>   extraction/review/apply logic changes; existing routes still compile; M22 files untouched.
> - New utilities exist: `text-display`, `bg-success-surface`, `shadow-card`, `tabular-nums`,
>   `font-display`/`font-heading`, and a `cite` color token.
> - Mission Control dark tokens defined but dormant.
> - `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check` all pass.
> - Report files changed, exact token changes, visual impact, verification results, screenshots
>   if possible, and final `git status --short`; confirm `.claude/launch.json` unstaged and
>   `git stash@{0}` untouched. **No commit, no push** until approved.

---

*End of planning doc. Implementation happens on `frontend-aesthetic-foundation`; this file is
documentation only.*
