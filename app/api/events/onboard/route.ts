import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'
import { createEvent } from '@/lib/events/create-event'
import { runExtraction } from '@/lib/ai/run-extraction'

// Creates the event, then (when there's a free-text capture) runs a synchronous
// LLM draft pass; give it the same headroom as the chat extract route.
export const maxDuration = 60

const OnboardSchema = z.object({
  name:            z.string().trim().min(1),
  event_type:      z.string().trim().optional(),
  event_date:      z.string().optional(),
  location:        z.string().trim().optional(),
  attendee_target: z.coerce.number().int().positive().optional(),
  budget_target:   z.coerce.number().nonnegative().optional(),
  capture:         z.string().trim().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const parsed = OnboardSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { name, event_type, event_date, location, attendee_target, budget_target, capture } = parsed.data

    // 1. Create the event first. This must succeed; nothing else happens otherwise.
    const created = await createEvent(supabase, user, {
      name, event_type, event_date, location, attendee_target, budget_target,
    })
    if (!created.ok) {
      return NextResponse.json({ error: created.error }, { status: created.status })
    }
    const eventId = created.eventId

    // 2. Best-effort starter draft from the user's free-text capture ONLY. The
    //    capture is the sole extraction signal — if it's empty we do NOT
    //    synthesize a prompt from structured metadata (a thin/redundant starter
    //    package is worse than none): draft stays 'skipped' and the event is
    //    still created with its fields, so the user lands cleanly and continues
    //    from the onboarding landing / composer. Extraction is also NON-FATAL and
    //    never fabricates: with no engine, runExtraction returns { ok:false }
    //    (503) and writes no proposals (the mock-fabrication guard).
    const inputText = capture?.trim() ?? ''
    let draft: 'ready' | 'empty' | 'skipped' = 'skipped'
    let aiRunId: string | undefined
    let proposedCount: number | undefined

    if (inputText) {
      try {
        const result = await runExtraction({
          supabase,
          eventId,
          userId: user.id,
          inputText,
          channel: 'onboarding',
        })
        if (result.ok) {
          aiRunId = result.data.ai_run_id
          proposedCount = result.data.proposed_count
          draft = result.data.proposed_count > 0 ? 'ready' : 'empty'
        }
        // result.ok === false (e.g. no-engine 503) → draft stays 'skipped'
      } catch (err) {
        console.error('onboard: starter draft failed (non-fatal):', err)
        // draft stays 'skipped'
      }
    }

    return NextResponse.json({
      id: eventId,
      draft,
      ai_run_id: aiRunId,
      proposed_count: proposedCount,
    })
  } catch (err) {
    console.error('POST /api/events/onboard unexpected error:', err)
    return NextResponse.json({ error: 'Could not create event.' }, { status: 500 })
  }
}
