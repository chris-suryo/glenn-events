import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ExtractUpdatesSchema } from '@/lib/validators/extract'
import { mockExtract, groupExtracted, summarizeExtracted } from '@/lib/ai/mock-extract'
import { llmExtract } from '@/lib/ai/llm-extract'

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

  // Rate limit — max 20 AI extractions per user per hour (DB-backed, no extra dependencies)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: recentRuns } = await supabase
    .from('ai_runs')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', user.id)
    .gte('created_at', oneHourAgo)

  if ((recentRuns ?? 0) >= 20) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. You can submit up to 20 updates per hour. Try again shortly.' },
      { status: 429 }
    )
  }

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

    // 2. Fetch recent conversation history for multi-turn context (last 10 messages = ~5 turns)
    const { data: historyRows } = await supabase
      .from('messages')
      .select('role, content')
      .eq('event_id', eventId)
      .neq('id', message.id)             // exclude the message we just saved
      .order('created_at', { ascending: false })
      .limit(10)

    const conversationHistory = (historyRows ?? [])
      .reverse()                          // chronological order for the LLM
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    // 3. Run extraction — real LLM if API key set, deterministic mock otherwise
    let extracted: ReturnType<typeof mockExtract>
    let assistantContent: string
    let understoodSummary: string[]
    let recommendedSummary: string[]

    if (process.env.ANTHROPIC_API_KEY) {
      const result = await llmExtract(input_text, conversationHistory)
      extracted = result.items
      assistantContent = result.responseMessage
      const fallbackSummary = summarizeExtracted(input_text, extracted)
      understoodSummary = result.understoodSummary.length > 0
        ? result.understoodSummary
        : fallbackSummary.understoodSummary
      recommendedSummary = result.recommendedSummary.length > 0
        ? result.recommendedSummary
        : fallbackSummary.recommendedSummary
    } else {
      extracted = mockExtract(input_text)
      const summary = summarizeExtracted(input_text, extracted)
      understoodSummary = summary.understoodSummary
      recommendedSummary = summary.recommendedSummary
      // Fallback response for mock mode
      assistantContent = extracted.length === 0
        ? "Got it — I saved your note. I didn't see anything that needs to update the event plan yet, but you can tell me about vendors, tasks, costs, deadlines, risks, or decisions anytime."
        : `Got it — I found ${extracted.length} thing${extracted.length !== 1 ? 's' : ''} to add to the plan. Review the suggestions on the right and click Apply on anything that looks right.`
    }

    const grouped = groupExtracted(extracted)

    const outputJson = {
      understood_summary: understoodSummary,
      recommended_summary: recommendedSummary,
      tasks: grouped.tasks.map((i) => i.payload),
      vendors: grouped.vendors.map((i) => i.payload),
      budget_items: grouped.budget_items.map((i) => i.payload),
      timeline_items: grouped.timeline_items.map((i) => i.payload),
      decisions: grouped.decisions.map((i) => i.payload),
      risks: grouped.risks.map((i) => i.payload),
      open_questions: grouped.open_questions.map((i) => i.payload),
    }

    // 4. Save ai_run
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

    // 5. Insert proposed_updates
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

    // 6. Save Glenn's conversational response as an assistant message
    await supabase.from('messages').insert({
      event_id: eventId,
      user_id:  user.id,
      role:     'assistant',
      content:  assistantContent,
    })

    await supabase.from('activity_log').insert({
      event_id: eventId,
      actor_user_id: user.id,
      action: 'proposed_updates_created',
      entity_type: 'ai_run',
      entity_id: aiRun.id,
      metadata_json: { total: extracted.length },
    })

    return NextResponse.json({
      message_id: message.id,
      ai_run_id: aiRun.id,
      assistant_message: assistantContent,
      understood_summary: understoodSummary,
      recommended_summary: recommendedSummary,
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
