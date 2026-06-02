import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const StatusSchema = z.object({
  status: z.enum(['todo', 'in_progress', 'done', 'blocked']),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; taskId: string }> }
) {
  const { taskId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = StatusSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // RLS on tasks ensures user is an event member — no explicit event check needed
  const { error } = await supabase
    .from('tasks')
    .update({ status: parsed.data.status })
    .eq('id', taskId)

  if (error) {
    console.error('task status update error:', error)
    return NextResponse.json({ error: 'Failed to update task status' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
