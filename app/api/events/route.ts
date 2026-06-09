import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { randomUUID } from 'crypto'

const CreateEventSchema = z.object({
  name:            z.string().trim().min(1),
  description:     z.string().trim().optional(),
  event_type:      z.string().trim().optional(),
  event_date:      z.string().optional(),
  location:        z.string().trim().optional(),
  attendee_target: z.coerce.number().int().positive().optional(),
  budget_target:   z.coerce.number().nonnegative().optional(),
})

export async function POST(request: NextRequest) {
  try {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError) {
    console.error('auth error:', authError)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = CreateEventSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const {
    name, description, event_type, event_date,
    location, attendee_target, budget_target,
  } = parsed.data

  // 1. Ensure a profile row exists (auth trigger may not have fired for some users)
  await supabase.from('profiles').upsert(
    { id: user.id, email: user.email ?? null },
    { onConflict: 'id' }
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
    // Generate the UUID here so we never need .select() after INSERT.
    // Chaining .insert().select() requires the SELECT RLS policy to pass too —
    // but is_org_member() is false on a brand-new org (no members yet), which
    // would cause a spurious RLS violation on the RETURNING clause.
    orgId = randomUUID()

    const { error: orgErr } = await supabase
      .from('organizations')
      .insert({ id: orgId, name: 'My Organization', created_by: user.id })

    if (orgErr) {
      console.error('org create error:', orgErr)
      return NextResponse.json({
        error: 'Could not create organization.',
      }, { status: 500 })
    }

    const { error: memberErr } = await supabase
      .from('organization_members')
      .insert({ organization_id: orgId, user_id: user.id, role: 'owner' })

    if (memberErr) {
      console.error('org member insert error:', memberErr)
      // Non-fatal: the org was created; continue
    }
  }

  // 3. Create the event — generate UUID here for same reason as org above
  const eventId = randomUUID()

  const { error: eventErr } = await supabase
    .from('events')
    .insert({
      id:              eventId,
      organization_id: orgId,
      name,
      description:     description || null,
      event_type:      event_type  || null,
      event_date:      event_date  || null,
      location:        location    || null,
      attendee_target: attendee_target ?? null,
      budget_target:   budget_target   ?? null,
      status:          'planning',
      created_by:      user.id,
    })

  if (eventErr) {
    console.error('event create error:', eventErr)
    return NextResponse.json({ error: 'Could not create event.' }, { status: 500 })
  }

  // 4. Add the creator as an event member
  await supabase
    .from('event_members')
    .insert({ event_id: eventId, user_id: user.id, role: 'owner' })

  return NextResponse.json({ id: eventId })

  } catch (err) {
    console.error('POST /api/events unexpected error:', err)
    return NextResponse.json({ error: 'Could not create event.' }, { status: 500 })
  }
}
