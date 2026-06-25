import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const Schema = z.object({
  status: z.enum(['estimated', 'committed', 'paid']),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; itemId: string }> }
) {
  const { eventId, itemId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // RLS on budget_items scopes to event members; the event_id guard + 0-row check turn a
  // non-existent/unauthorized id into a 404 instead of a false "ok".
  const { data, error } = await supabase
    .from('budget_items')
    .update({ status: parsed.data.status })
    .eq('id', itemId)
    .eq('event_id', eventId)
    .select('id')

  if (error) {
    console.error('budget item status update error:', error)
    return NextResponse.json({ error: 'Failed to update budget item status' }, { status: 500 })
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Budget item not found' }, { status: 404 })
  }

  await supabase.from('activity_log').insert({
    event_id:      eventId,
    actor_user_id: user.id,
    action:        'budget_item_status_updated',
    entity_type:   'budget_item',
    entity_id:     itemId,
    metadata_json: { new_status: parsed.data.status },
  })

  return NextResponse.json({ ok: true })
}
