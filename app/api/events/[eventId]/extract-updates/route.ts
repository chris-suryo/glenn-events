import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ExtractUpdatesSchema } from '@/lib/validators/extract'
import { runExtraction } from '@/lib/ai/run-extraction'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params
  const supabase = await createClient()

  // Auth check — proxy.ts marks /api/* public, so we enforce here
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Body validation
  const body = await request.json().catch(() => null)
  const parsed = ExtractUpdatesSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const result = await runExtraction({
    supabase,
    eventId,
    userId: user.id,
    inputText: parsed.data.input_text,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const { data } = result
  return NextResponse.json({
    message_id: data.message_id,
    ai_run_id: data.ai_run_id,
    assistant_message: data.assistant_message,
    understood_summary: data.understood_summary,
    recommended_summary: data.recommended_summary,
    grouped: {
      tasks: data.grouped.tasks,
      vendors: data.grouped.vendors,
      budget_items: data.grouped.budget_items,
      timeline_items: data.grouped.timeline_items,
      decisions: data.grouped.decisions,
      risks: data.grouped.risks,
      open_questions: data.grouped.open_questions,
    },
  })
}
