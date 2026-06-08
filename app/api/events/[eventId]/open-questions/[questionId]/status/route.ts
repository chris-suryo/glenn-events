import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const Schema = z.object({
  status: z.enum(['open', 'answered']),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; questionId: string }> }
) {
  const { questionId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // RLS on open_questions ensures user is an event member
  const { error } = await supabase
    .from('open_questions')
    .update({ status: parsed.data.status })
    .eq('id', questionId)

  if (error) {
    console.error('open question status update error:', error)
    return NextResponse.json({ error: 'Failed to update question status' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
