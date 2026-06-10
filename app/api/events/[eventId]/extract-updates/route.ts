import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ExtractUpdatesSchema } from '@/lib/validators/extract'
import { mockExtract, groupExtracted, summarizeExtracted, type ExtractedItem } from '@/lib/ai/mock-extract'
import { llmExtract } from '@/lib/ai/llm-extract'
import { dedupeExtractedItems } from '@/lib/ai/dedupe'
import type { EventStateContext, UpdateType } from '@/lib/types'

type CountByType = Record<UpdateType, number>
type ExtractionMode = 'anthropic' | 'mock'

interface ExtractionDiagnostics {
  mode: ExtractionMode
  raw_count: number
  raw_count_by_type: CountByType
  kept_count: number
  kept_count_by_type: CountByType
  deduped_count: number
  dropped: Array<{
    update_type: UpdateType
    label: string
    reason: string
  }>
  inserted_count: number
}

const EMPTY_COUNTS: CountByType = {
  task: 0,
  vendor: 0,
  budget_item: 0,
  timeline_item: 0,
  decision: 0,
  risk: 0,
  open_question: 0,
}

function shouldIncludeDiagnostics(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.GLENN_EXTRACT_DEBUG === '1'
}

function countByType(items: ExtractedItem[]): CountByType {
  const counts = { ...EMPTY_COUNTS }
  for (const item of items) {
    counts[item.update_type] += 1
  }
  return counts
}

function itemLabel(item: ExtractedItem): string {
  const payload = item.payload as unknown as Record<string, unknown>
  const raw =
    payload.title ??
    payload.name ??
    payload.question ??
    payload.description ??
    payload.category ??
    'Untitled suggestion'

  return typeof raw === 'string' && raw.trim().length > 0
    ? raw.trim().slice(0, 120)
    : 'Untitled suggestion'
}

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
    .select('id, name, event_type, event_date, location, attendee_target, budget_target')
    .eq('id', eventId)
    .single()

  if (!event) {
    return NextResponse.json({ error: 'Event not found or access denied' }, { status: 404 })
  }

  try {
    // 0. Fetch compact event state for LLM context and app-side dedupe (parallel, all RLS-safe)
    const [
      { data: existingTaskRows },
      { data: existingVendorRows },
      { data: existingBudgetRows },
      { data: existingRiskRows },
      { data: existingQuestionRows },
      { data: pendingUpdateRows },
      { data: recentAiRunRows },
    ] = await Promise.all([
      supabase
        .from('tasks')
        .select('title, status, priority, description')
        .eq('event_id', eventId)
        .in('status', ['todo', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(15),
      supabase
        .from('vendors')
        .select('name, category, status, estimated_cost, contact_name, notes')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('budget_items')
        .select('category, description, estimated_cost, status')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('risks')
        .select('title, severity, description, mitigation')
        .eq('event_id', eventId)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('open_questions')
        .select('question')
        .eq('event_id', eventId)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(8),
      supabase
        .from('proposed_updates')
        .select('update_type, payload_json')
        .eq('event_id', eventId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(15),
      supabase
        .from('ai_runs')
        .select('output_json')
        .eq('event_id', eventId)
        .order('created_at', { ascending: false })
        .limit(3),
    ])

    // Derive a display label from a pending proposed_update's payload
    function pendingLabel(updateType: string, payloadJson: unknown): string {
      if (typeof payloadJson !== 'object' || payloadJson === null) return '(unknown)'
      const p = payloadJson as Record<string, unknown>
      let field: unknown
      switch (updateType) {
        case 'task':          field = p['title']; break
        case 'vendor':        field = p['name']; break
        case 'budget_item':   field = p['description']; break
        case 'risk':          field = p['title']; break
        case 'open_question': field = p['question']; break
        case 'decision':      field = p['title']; break
        case 'timeline_item': field = p['title']; break
        default:              field = null
      }
      return typeof field === 'string' && field.trim().length > 0 ? field : '(unknown)'
    }

    // Parse ai_run output_json for summary bullets (same pattern as page.tsx)
    function stringArray(val: unknown): string[] {
      if (!Array.isArray(val)) return []
      return val.filter((s): s is string => typeof s === 'string').slice(0, 4)
    }

    const eventStateContext: EventStateContext = {
      event: {
        name: (event.name as string) ?? '',
        event_type: (event.event_type as string | null) ?? null,
        event_date: (event.event_date as string | null) ?? null,
        location: (event.location as string | null) ?? null,
        attendee_target: (event.attendee_target as number | null) ?? null,
        budget_target: (event.budget_target as number | null) ?? null,
      },
      existing_tasks: (existingTaskRows ?? []).map((t) => ({
        title: t.title as string,
        status: t.status as 'todo' | 'in_progress',
        priority: t.priority as 'low' | 'medium' | 'high',
        description: (t.description as string | null) ?? null,
      })),
      existing_vendors: (existingVendorRows ?? []).map((v) => ({
        name: v.name as string,
        category: (v.category as string | null) ?? null,
        status: v.status as 'prospect' | 'contacted' | 'confirmed' | 'declined',
        estimated_cost: (v.estimated_cost as number | null) ?? null,
        contact_name: (v.contact_name as string | null) ?? null,
        notes: (v.notes as string | null) ?? null,
      })),
      existing_budget_items: (existingBudgetRows ?? []).map((b) => ({
        category: b.category as string,
        description: b.description as string,
        estimated_cost: (b.estimated_cost as number | null) ?? null,
        status: b.status as 'estimated' | 'committed' | 'paid',
      })),
      existing_risks: (existingRiskRows ?? []).map((r) => ({
        title: r.title as string,
        severity: r.severity as 'low' | 'medium' | 'high',
        description: (r.description as string | null) ?? null,
        mitigation: (r.mitigation as string | null) ?? null,
      })),
      existing_open_questions: (existingQuestionRows ?? []).map((q) => ({
        question: q.question as string,
      })),
      pending_proposed_updates: (pendingUpdateRows ?? []).map((u) => ({
        update_type: u.update_type as UpdateType,
        label: pendingLabel(u.update_type as string, u.payload_json),
      })),
      recent_ai_run_summaries: (recentAiRunRows ?? [])
        .map((run) => {
          const o =
            typeof run.output_json === 'object' && run.output_json !== null
              ? (run.output_json as Record<string, unknown>)
              : {}
          return {
            understood_summary: stringArray(o['understood_summary']),
            recommended_summary: stringArray(o['recommended_summary']),
          }
        })
        .filter(
          (s) => s.understood_summary.length > 0 || s.recommended_summary.length > 0,
        ),
    }

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
    let rawExtracted: ReturnType<typeof mockExtract>
    let assistantContent = ''
    let understoodSummary: string[]
    let recommendedSummary: string[]

    const extractionMode: ExtractionMode = process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'mock'

    if (extractionMode === 'anthropic') {
      const result = await llmExtract(input_text, conversationHistory, eventStateContext)
      rawExtracted = result.items
      assistantContent = result.responseMessage
      const fallbackSummary = summarizeExtracted(input_text, rawExtracted)
      understoodSummary = result.understoodSummary.length > 0
        ? result.understoodSummary
        : fallbackSummary.understoodSummary
      recommendedSummary = result.recommendedSummary.length > 0
        ? result.recommendedSummary
        : fallbackSummary.recommendedSummary
    } else {
      rawExtracted = mockExtract(input_text)
      const summary = summarizeExtracted(input_text, rawExtracted)
      understoodSummary = summary.understoodSummary
      recommendedSummary = summary.recommendedSummary
    }

    // 3b. App-side dedupe — runs for both LLM and mock paths
    const dedupeResult = dedupeExtractedItems(rawExtracted, eventStateContext)
    const extracted = dedupeResult.kept

    if (extractionMode === 'mock') {
      // Fallback response for mock mode (uses deduped count)
      assistantContent = extracted.length === 0
        ? "Got it — I saved your note. I didn't see anything that needs to update the event plan yet, but you can tell me about vendors, tasks, costs, deadlines, risks, or decisions anytime."
        : `Got it — I found ${extracted.length} thing${extracted.length !== 1 ? 's' : ''} to add to the plan. Review the suggestions on the right and click Apply on anything that looks right.`
    }

    // When all extracted items were deduped, override the assistant message for both paths.
    // The LLM's responseMessage references proposals that no longer exist in the queue.
    if (extracted.length === 0 && dedupeResult.deduped_count > 0) {
      assistantContent =
        "I reviewed this and didn't add new suggestions — these items already appear to be tracked in the plan or queued for review."
    }

    const grouped = groupExtracted(extracted)
    const includeDiagnostics = shouldIncludeDiagnostics()
    let diagnostics: ExtractionDiagnostics | null = includeDiagnostics
      ? {
          mode: extractionMode,
          raw_count: rawExtracted.length,
          raw_count_by_type: countByType(rawExtracted),
          kept_count: extracted.length,
          kept_count_by_type: countByType(extracted),
          deduped_count: dedupeResult.deduped_count,
          dropped: dedupeResult.dropped.map((drop) => ({
            update_type: drop.dropped_item.update_type,
            label: itemLabel(drop.dropped_item),
            reason: drop.reason,
          })),
          inserted_count: 0,
        }
      : null

    const outputJson = {
      understood_summary: understoodSummary,
      recommended_summary: recommendedSummary,
      deduped_count: dedupeResult.deduped_count,
      ...(diagnostics ? { diagnostics } : {}),
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
    let insertedCount = 0
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
      insertedCount = rows.length
    }

    if (diagnostics) {
      diagnostics = { ...diagnostics, inserted_count: insertedCount }
      const outputJsonWithDiagnostics = {
        ...outputJson,
        diagnostics,
      }

      await supabase
        .from('ai_runs')
        .update({ output_json: outputJsonWithDiagnostics })
        .eq('id', aiRun.id)

      if (process.env.GLENN_EXTRACT_DEBUG === '1') {
        console.info('glenn extraction diagnostics', diagnostics)
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
      metadata_json: {
        total: extracted.length,
        deduped_count: dedupeResult.deduped_count,
      },
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
