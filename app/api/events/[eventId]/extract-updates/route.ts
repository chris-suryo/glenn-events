import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ExtractUpdatesSchema } from '@/lib/validators/extract'
import { mockExtract, groupExtracted } from '@/lib/ai/mock-extract'

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

  const { input_text } = parsed.data

  // Event access — RLS-safe: only returns row if user is event member
  const { data: event } = await supabase
    .from('events')
    .select('id')
    .eq('id', eventId)
    .single()

  if (!event) {
    return NextResponse.json({ error: 'Event not found or access denied' }, { status: 404 })
  }

  try {
    // 1. Save user message
    const { data: message, error: msgErr } = await supabase
      .from('messages')
      .insert({
        event_id: eventId,
        user_id: user.id,
        role: 'user',
        content: input_text,
      })
      .select('id')
      .single()

    if (msgErr || !message) {
      console.error('message insert error:', msgErr)
      return NextResponse.json({ error: 'Failed to save message' }, { status: 500 })
    }

    // 2. Run deterministic mock extraction
    const extracted = mockExtract(input_text)
    const grouped = groupExtracted(extracted)

    const outputJson = {
      tasks: grouped.tasks.map((i) => i.payload),
      vendors: grouped.vendors.map((i) => i.payload),
      budget_items: grouped.budget_items.map((i) => i.payload),
      timeline_items: grouped.timeline_items.map((i) => i.payload),
      decisions: grouped.decisions.map((i) => i.payload),
      risks: grouped.risks.map((i) => i.payload),
      open_questions: grouped.open_questions.map((i) => i.payload),
    }

    // 3. Save ai_run
    const { data: aiRun, error: runErr } = await supabase
      .from('ai_runs')
      .insert({
        event_id: eventId,
        source_message_id: message.id,
        status: 'pending_review',
        input_text,
        output_json: outputJson,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (runErr || !aiRun) {
      console.error('ai_run insert error:', runErr)
      return NextResponse.json({ error: 'Failed to create AI run' }, { status: 500 })
    }

    // 4. Insert proposed_updates
    if (extracted.length > 0) {
      const rows = extracted.map((item) => ({
        event_id: eventId,
        ai_run_id: aiRun.id,
        source_message_id: message.id,
        update_type: item.update_type,
        payload_json: item.payload,
        confidence: item.confidence,
        status: 'pending',
        rationale: item.rationale,
      }))

      const { error: updatesErr } = await supabase.from('proposed_updates').insert(rows)
      if (updatesErr) {
        console.error('proposed_updates insert error:', updatesErr)
        return NextResponse.json({ error: 'Failed to create proposed updates' }, { status: 500 })
      }
    }

    // 5. Activity log (best-effort — don't fail the request if this errors)
    const countByType: Record<string, number> = {}
    for (const item of extracted) {
      countByType[item.update_type] = (countByType[item.update_type] ?? 0) + 1
    }

    await supabase.from('activity_log').insert({
      event_id: eventId,
      actor_user_id: user.id,
      action: 'proposed_updates_created',
      entity_type: 'ai_run',
      entity_id: aiRun.id,
      metadata_json: { total: extracted.length, by_type: countByType },
    })

    return NextResponse.json({
      message_id: message.id,
      ai_run_id: aiRun.id,
      grouped: {
        tasks: grouped.tasks,
        vendors: grouped.vendors,
        budget_items: grouped.budget_items,
        timeline_items: grouped.timeline_items,
        decisions: grouped.decisions,
        risks: grouped.risks,
        open_questions: grouped.open_questions,
      },
    })
  } catch (err) {
    console.error('Extract unexpected error:', err)
    return NextResponse.json({ error: 'Unexpected error during extraction' }, { status: 500 })
  }
}
