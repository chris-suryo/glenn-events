import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const Schema = z.object({
  decision: z.string().min(1, 'Decision text is required').max(2000),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; decisionId: string }> }
) {
  const { eventId, decisionId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  // RLS on decisions scopes to event members; the event_id guard + 0-row check make a
  // missing/already-resolved decision a 404 instead of a false "ok".
  const { data, error } = await supabase
    .from('decisions')
    .update({
      status: 'decided',
      decision: parsed.data.decision,
      decided_at: new Date().toISOString(),
    })
    .eq('id', decisionId)
    .eq('event_id', eventId)
    .eq('status', 'pending') // only resolve pending decisions
    .select('id')

  if (error) {
    console.error('decision resolve error:', error)
    return NextResponse.json({ error: 'Failed to resolve decision' }, { status: 500 })
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Decision not found or already resolved' }, { status: 404 })
  }

  await supabase.from('activity_log').insert({
    event_id:      eventId,
    actor_user_id: user.id,
    action:        'decision_resolved',
    entity_type:   'decision',
    entity_id:     decisionId,
    metadata_json: {},
  })

  return NextResponse.json({ ok: true })
}
