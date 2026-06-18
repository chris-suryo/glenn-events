import type { SupabaseClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

export interface CreateEventInput {
  name: string
  description?: string
  event_type?: string
  event_date?: string
  location?: string
  attendee_target?: number
  budget_target?: number
}

export type CreateEventResult =
  | { ok: true; eventId: string }
  | { ok: false; status: number; error: string }

// Shared event-creation bootstrap used by POST /api/events (manual create form)
// and POST /api/events/onboard (guided setup). Ensures the profile + org exist,
// inserts the event, and adds the creator as an event member. Behavior is
// identical to the original inline /api/events logic — including the
// generate-UUID-before-insert trick that avoids a spurious RLS failure on the
// RETURNING clause for a brand-new org with no members yet.
export async function createEvent(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
  input: CreateEventInput,
): Promise<CreateEventResult> {
  // 1. Ensure a profile row exists (auth trigger may not have fired for some users)
  await supabase.from('profiles').upsert(
    { id: user.id, email: user.email ?? null },
    { onConflict: 'id' },
  )

  // 2. Look up the user's organization; create one if they don't have one yet
  let orgId: string
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)

  if (memberships && memberships.length > 0) {
    orgId = memberships[0].organization_id
  } else {
    // Generate the UUID here so we never need .select() after INSERT — is_org_member()
    // is false on a brand-new org (no members yet), which would fail RLS on a
    // RETURNING clause.
    orgId = randomUUID()

    const { error: orgErr } = await supabase
      .from('organizations')
      .insert({ id: orgId, name: 'My Organization', created_by: user.id })

    if (orgErr) {
      console.error('org create error:', orgErr)
      return { ok: false, status: 500, error: 'Could not create organization.' }
    }

    const { error: memberErr } = await supabase
      .from('organization_members')
      .insert({ organization_id: orgId, user_id: user.id, role: 'owner' })

    if (memberErr) {
      console.error('org member insert error:', memberErr)
      // Non-fatal: the org was created; continue
    }
  }

  // 3. Create the event — generate UUID here for the same reason as the org above
  const eventId = randomUUID()

  const { error: eventErr } = await supabase
    .from('events')
    .insert({
      id:              eventId,
      organization_id: orgId,
      name:            input.name,
      description:     input.description || null,
      event_type:      input.event_type  || null,
      event_date:      input.event_date  || null,
      location:        input.location    || null,
      attendee_target: input.attendee_target ?? null,
      budget_target:   input.budget_target   ?? null,
      status:          'planning',
      created_by:      user.id,
    })

  if (eventErr) {
    console.error('event create error:', eventErr)
    return { ok: false, status: 500, error: 'Could not create event.' }
  }

  // 4. Add the creator as an event member
  await supabase
    .from('event_members')
    .insert({ event_id: eventId, user_id: user.id, role: 'owner' })

  return { ok: true, eventId }
}
