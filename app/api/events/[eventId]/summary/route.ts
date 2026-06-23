import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateEventSummary, type SummaryInput } from '@/lib/ai/event-summary'
import type { Event, Task, Vendor, BudgetItem, Risk, OpenQuestion, Decision, TimelineItem } from '@/lib/types'

// Generates a Glenn-authored brief via a synchronous LLM call — give it headroom.
export const maxDuration = 30

function deterministicFallback(event: Event, vendors: Vendor[], budgetEstimated: number): string {
  const type = (event.event_type || 'Event').trim()
  const cap = type.charAt(0).toUpperCase() + type.slice(1)
  const idParts = [
    event.attendee_target ? `for ${event.attendee_target} guests` : null,
    event.location ? `at ${event.location}` : null,
  ].filter(Boolean)
  const confirmed = vendors.filter((v) => v.status === 'confirmed').length
  const tail = vendors.length > 0
    ? ` ${confirmed} of ${vendors.length} vendors confirmed${budgetEstimated > 0 ? `, ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(budgetEstimated)} budgeted so far` : ''}.`
    : ''
  return `${cap}${idParts.length ? ` ${idParts.join(' ')}` : ''}.${tail}`.trim()
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params
  const supabase = await createClient()

  // proxy.ts marks /api/* public, so enforce auth here.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date().toISOString()
  const [
    { data: event },
    { data: tasks },
    { data: vendors },
    { data: budgetItems },
    { data: risks },
    { data: openQuestions },
    { data: pendingDecisions },
    { data: upcomingTimeline },
  ] = await Promise.all([
    supabase.from('events').select('*').eq('id', eventId).single(),
    supabase.from('tasks').select('*').eq('event_id', eventId).eq('status', 'todo').order('created_at'),
    supabase.from('vendors').select('*').eq('event_id', eventId).is('archived_at', null).order('created_at'),
    supabase.from('budget_items').select('*').eq('event_id', eventId).is('archived_at', null).order('created_at'),
    supabase.from('risks').select('*').eq('event_id', eventId).eq('status', 'open').order('created_at'),
    supabase.from('open_questions').select('*').eq('event_id', eventId).eq('status', 'open').order('created_at'),
    supabase.from('decisions').select('*').eq('event_id', eventId).eq('status', 'pending').order('created_at'),
    supabase.from('timeline_items').select('*').eq('event_id', eventId).gte('starts_at', now).order('starts_at', { ascending: true }).limit(5),
  ])

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  }

  const typedEvent = event as Event
  const typedVendors = (vendors ?? []) as Vendor[]
  const typedBudget = (budgetItems ?? []) as BudgetItem[]
  const budgetEstimated = typedBudget.reduce((s, b) => s + (b.estimated_cost ?? 0), 0)

  let summary: string
  if (!process.env.ANTHROPIC_API_KEY) {
    summary = deterministicFallback(typedEvent, typedVendors, budgetEstimated)
  } else {
    const input: SummaryInput = {
      name: typedEvent.name,
      eventType: typedEvent.event_type,
      eventDate: typedEvent.event_date,
      location: typedEvent.location,
      attendeeTarget: typedEvent.attendee_target,
      budgetEstimated,
      budgetTarget: typedEvent.budget_target,
      unpricedCount: typedBudget.filter((b) => b.estimated_cost === null).length,
      vendors: typedVendors.map((v) => ({ name: v.name, status: v.status, cost: v.estimated_cost })),
      openTasks: ((tasks ?? []) as Task[]).map((t) => ({ title: t.title, priority: t.priority, due: t.due_date })),
      openRisks: ((risks ?? []) as Risk[]).map((r) => ({ title: r.title, severity: r.severity })),
      openQuestions: ((openQuestions ?? []) as OpenQuestion[]).map((q) => q.question),
      pendingDecisions: ((pendingDecisions ?? []) as Decision[]).map((d) => d.title),
      nextItems: ((upcomingTimeline ?? []) as TimelineItem[]).map((t) => ({ title: t.title, startsAt: t.starts_at })),
    }
    try {
      summary = await generateEventSummary(input)
    } catch (err) {
      console.error('event-summary generation failed', err)
      return NextResponse.json({ error: 'Could not generate the summary right now. Try again in a moment.' }, { status: 502 })
    }
  }

  if (!summary) {
    return NextResponse.json({ error: 'The summary came back empty. Try again.' }, { status: 502 })
  }

  const updatedAt = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('events')
    .update({ ai_summary: summary, ai_summary_updated_at: updatedAt })
    .eq('id', eventId)

  if (updateError) {
    // Most likely cause before migration 014 is applied: the ai_summary column
    // doesn't exist yet. Surface a clear, actionable message.
    console.error('event-summary save failed', updateError)
    return NextResponse.json(
      { error: 'Generated the brief but could not save it. Apply migration 014 (events.ai_summary) — see docs/DEPLOYMENT.md.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ summary, updated_at: updatedAt })
}
