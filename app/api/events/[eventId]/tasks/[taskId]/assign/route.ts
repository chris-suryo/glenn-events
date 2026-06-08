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

  // RLS on tasks ensures the acting user is an event member
  const { error } = await supabase
    .from('tasks')
    .update({ owner_user_id: parsed.data.owner_user_id })
    .eq('id', taskId)

  if (error) {
    console.error('task assign error:', error)
    return NextResponse.json({ error: 'Failed to assign task' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
