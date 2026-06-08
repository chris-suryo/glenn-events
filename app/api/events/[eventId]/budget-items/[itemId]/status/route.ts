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
  const { itemId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // RLS on budget_items ensures user is an event member
  const { error } = await supabase
    .from('budget_items')
    .update({ status: parsed.data.status })
    .eq('id', itemId)

  if (error) {
    console.error('budget item status update error:', error)
    return NextResponse.json({ error: 'Failed to update budget item status' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
