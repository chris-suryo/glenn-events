# Glenn Events — Phase 5: Approve / Reject Proposed Updates

## Current status (end of Phase 4)

| Phase | Status |
|-------|--------|
| 1 — App shell | ✅ Done |
| 2 — Supabase schema / RLS / seed | ✅ Done |
| 3 — Real-data runtime + command center | ✅ Done |
| UI vibe pass | ✅ Done |
| 4 — Mock AI extraction | ✅ Done |
| **5 — Approve / reject into plan of record** | 🔜 Next |

---

## What already works (Phase 4)

- User types messy notes into `GlennInput` on the command center
- `POST /api/events/[eventId]/extract-updates` runs:
  1. Auth check (`supabase.auth.getUser()`) → 401 if unauthenticated
  2. RLS-safe event read → 404 if not a member
  3. Inserts `messages` row (`role: 'user'`)
  4. Calls `mockExtract(input_text)` from `lib/ai/mock-extract.ts`
  5. Inserts `ai_runs` row (`status: 'pending_review'`)
  6. Inserts `proposed_updates` rows (`status: 'pending'`)
  7. Inserts `activity_log` row
  8. Returns `{ message_id, ai_run_id, grouped }`
- `GlennInput` shows success toast, clears textarea, calls `router.refresh()`
- The "Glenn found N proposed updates" badge appears in the command center header
- `ProposedUpdatesQueue` in `/chat` renders all pending updates with Apply / Reject buttons
- Each card shows the type badge (color-coded), title, description, rationale, and per-item Apply/Reject
- Bulk "Approve all" / "Reject all" buttons present and wired to the API (currently 501)

---

## Files involved in Phase 4

| File | Role |
|------|------|
| `lib/ai/mock-extract.ts` | Pure deterministic extractor — 10 sentence-level matchers |
| `lib/types/index.ts` | Payload types updated: `owner_name`, `vendor_name`, nullable `confidence`/`input_text`, `'planning'` added to timeline type |
| `app/api/events/[eventId]/extract-updates/route.ts` | Full extraction route (replaced 501 stub) |
| `components/event/glenn-input.tsx` | Client component — submits text, handles response |
| `components/event/proposed-updates-queue.tsx` | Client component — renders queue, calls approve/reject API |
| `components/event/proposed-updates-badge.tsx` | Header badge — links to `/chat` |
| `app/(app)/events/[eventId]/chat/page.tsx` | Fetches messages + pending updates, renders `ChatView` |

---

## What Phase 5 needs to implement

### 1. `app/api/updates/[id]/approve/route.ts`

Replace the current 501 stub with:

1. Auth: `createClient()` + `supabase.auth.getUser()` → 401
2. Fetch the `proposed_updates` row by `id` → 404 if missing
3. Verify user is an event member: read `events` from the update's `event_id` via RLS → 403 if denied
4. Read `update_type` and `payload_json` from the row
5. Insert into the destination table based on `update_type` (see payload mapping below)
6. Update `proposed_updates` row: `status = 'applied'`, `reviewed_by = user.id`, `reviewed_at = now()`
7. Insert `activity_log` row: `action = 'proposed_update_applied'`, `entity_type = update_type`, `entity_id = new row id`
8. Return `{ ok: true, inserted_id: <new row id> }`

### 2. `app/api/updates/[id]/reject/route.ts`

Replace the current 501 stub with:

1. Auth + membership check (same as approve)
2. Update `proposed_updates` row: `status = 'rejected'`, `reviewed_by = user.id`, `reviewed_at = now()`
3. Insert `activity_log` row: `action = 'proposed_update_rejected'`, `entity_type = update_type`, `entity_id = id`
4. Return `{ ok: true }`

---

## Payload mapping — approve writes

For each `update_type`, insert into the destination table using `payload_json`. All inserts must set:
- `event_id` — from the `proposed_updates` row
- `proposed_update_id` — the `proposed_updates` row id
- `source_message_id` — from the `proposed_updates` row
- `ai_run_id` — from the `proposed_updates` row
- `ai_generated = true`

### `task` → `tasks`

```ts
{
  event_id,
  title:        payload.title,
  description:  payload.description,
  status:       payload.status,           // 'todo'
  priority:     payload.priority,
  due_date:     payload.due_date,
  // owner_user_id: skip — payload has owner_name (string), not a UUID
  proposed_update_id, source_message_id, ai_run_id, ai_generated: true,
}
```

### `vendor` → `vendors`

```ts
{
  event_id,
  name:           payload.name,
  category:       payload.category,
  contact_name:   payload.contact_name,
  email:          payload.email,
  phone:          payload.phone,
  status:         payload.status,
  estimated_cost: payload.estimated_cost,
  notes:          payload.notes,
  proposed_update_id, source_message_id, ai_run_id, ai_generated: true,
}
```

### `budget_item` → `budget_items`

```ts
{
  event_id,
  category:       payload.category,
  description:    payload.description,
  estimated_cost: payload.estimated_cost,
  actual_cost:    payload.actual_cost,
  status:         payload.status,
  // vendor_id: skip — payload has vendor_name (string), not a UUID
  proposed_update_id, source_message_id, ai_run_id, ai_generated: true,
}
```

### `timeline_item` → `timeline_items`

```ts
{
  event_id,
  title:       payload.title,
  description: payload.description,
  starts_at:   payload.starts_at,
  ends_at:     payload.ends_at,
  type:        payload.type,
  proposed_update_id, source_message_id, ai_run_id, ai_generated: true,
}
```

### `decision` → `decisions`

```ts
{
  event_id,
  title:       payload.title,
  description: payload.description,
  status:      payload.status,
  decision:    payload.decision,
  proposed_update_id, source_message_id, ai_run_id, ai_generated: true,
}
```

### `risk` → `risks`

```ts
{
  event_id,
  title:       payload.title,
  description: payload.description,
  severity:    payload.severity,
  status:      payload.status,
  mitigation:  payload.mitigation,
  proposed_update_id, source_message_id, ai_run_id, ai_generated: true,
}
```

### `open_question` → `open_questions`

```ts
{
  event_id,
  question:    payload.question,
  status:      payload.status,
  proposed_update_id, source_message_id, ai_run_id, ai_generated: true,
}
```

---

## Exact files Phase 5 should touch

| File | Action |
|------|--------|
| `app/api/updates/[id]/approve/route.ts` | Replace 501 stub with full implementation |
| `app/api/updates/[id]/reject/route.ts` | Replace 501 stub with full implementation |
| `lib/types/index.ts` | No changes expected — types are already aligned |
| `components/event/proposed-updates-queue.tsx` | Already calls the API; may need to handle new success/error states |

Do **not** touch:
- `lib/ai/mock-extract.ts` (extractor is Phase 4, done)
- `app/api/events/[eventId]/extract-updates/route.ts` (done)
- Any migration files (schema is complete)
- UI vibe components

---

## Security requirements

- Both routes must use `createClient()` from `@/lib/supabase/server` — never service role key
- Auth check first: `supabase.auth.getUser()` → 401
- Membership check second: fetch `proposed_updates` by id, then read the event via RLS — if the user has no membership RLS returns nothing → 404/403
- Never read `proposed_updates` with a bypass — let RLS do the membership gate
- Idempotency: if `status` is already `applied` or `rejected`, return 409 rather than double-applying

---

## Current approve/reject stub state

Both routes currently return:

```json
{ "error": "Not implemented" }
```

with status 501. `ProposedUpdatesQueue` already calls them and handles errors via `toast.error()`.

---

## Manual test steps after Phase 5

1. Log in as `dev@example.com` / `devpassword123`
2. Open an event → Command Center
3. Paste the demo scenario into Glenn input and click **Tell Glenn**
4. Click **Chat** in sidebar → 9 pending update cards appear
5. Click **Apply** on "Final headcount due to venue" → toast "Update applied." → card disappears
6. Click **Timeline** in sidebar → "Final headcount due to venue" row appears with `ai_generated` badge
7. Click **Reject** on a task card → toast "Update rejected." → card disappears
8. Click **Approve all** on remaining cards → all disappear → queue shows empty state
9. Check Tasks, Vendors, Budget, Decisions, Risks pages — approved items should appear
10. Verify the command center stats update (task count, vendor count, etc.)

---

## Known limitations going into Phase 5

- `owner_name` from task/open_question payload is a plain string — there is no user-lookup to resolve it to a `owner_user_id`. Phase 5 should ignore `owner_name` and leave `owner_user_id` null.
- `vendor_name` from budget_item payload similarly cannot be resolved to a `vendor_id` without a lookup. Leave `vendor_id` null for now.
- The `ai_runs` row remains in `status: 'pending_review'` after individual approvals. Phase 5 should update it to `'completed'` once all its proposed_updates are reviewed (or leave this for Phase 6 polish).
- The approve route does not currently prevent double-applying if called twice on the same update. Add a status check: if `status != 'pending'` return 409.
