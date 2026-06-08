import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const Schema = z.object({
  status: z.enum(['prospect', 'contacted', 'confirmed', 'declined']),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string; vendorId: string }> }
) {
  const { vendorId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // RLS on vendors ensures user is an event member
  const { error } = await supabase
    .from('vendors')
    .update({ status: parsed.data.status })
    .eq('id', vendorId)

  if (error) {
    console.error('vendor status update error:', error)
    return NextResponse.json({ error: 'Failed to update vendor status' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
