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
  const { decisionId } = await params
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

  // RLS on decisions ensures user is an event member
  const { error } = await supabase
    .from('decisions')
    .update({
      status: 'decided',
      decision: parsed.data.decision,
      decided_at: new Date().toISOString(),
    })
    .eq('id', decisionId)
    .eq('status', 'pending') // only resolve pending decisions

  if (error) {
    console.error('decision resolve error:', error)
    return NextResponse.json({ error: 'Failed to resolve decision' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
