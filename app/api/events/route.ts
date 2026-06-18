import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { createEvent } from '@/lib/events/create-event'

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

    const result = await createEvent(supabase, user, parsed.data)
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ id: result.eventId })
  } catch (err) {
    console.error('POST /api/events unexpected error:', err)
    return NextResponse.json({ error: 'Could not create event.' }, { status: 500 })
  }
}
