import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const Schema = z.object({
  // null = unassign
  owner_user_id: z.string().uuid().nullable(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; taskId: string }> }
) {
  const { eventId, taskId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  // Verify the target user (if set) is a member of this event
  if (parsed.data.owner_user_id) {
    const { data: membership } = await supabase
      .from('event_members')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', parsed.data.owner_user_id)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Assignee is not a member of this event' }, { status: 400 })
    }
  }

  // RLS on tasks scopes to event members; the event_id guard + 0-row check turn a
  // non-existent/unauthorized id into a 404 instead of a false "ok".
  const { data, error } = await supabase
    .from('tasks')
    .update({ owner_user_id: parsed.data.owner_user_id })
    .eq('id', taskId)
    .eq('event_id', eventId)
    .select('id')

  if (error) {
    console.error('task assign error:', error)
    return NextResponse.json({ error: 'Failed to assign task' }, { status: 500 })
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  await supabase.from('activity_log').insert({
    event_id:      eventId,
    actor_user_id: user.id,
    action:        'task_assigned',
    entity_type:   'task',
    entity_id:     taskId,
    metadata_json: { owner_user_id: parsed.data.owner_user_id },
  })

  return NextResponse.json({ ok: true })
}
