import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { AiRun, Event, Task, Vendor, BudgetItem, Risk, ProposedUpdate, OpenQuestion, Decision, TimelineItem, ActivityLog } from '@/lib/types'
import { CommandCenter } from '@/components/event/command-center'
import type { GlennBriefView } from '@/components/event/event-brief-panel'

interface PageProps {
  params: Promise<{ eventId: string }>
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseGlennBrief(aiRuns: AiRun[]): GlennBriefView | null {
  for (const run of aiRuns) {
    if (!run.output_json || typeof run.output_json !== 'object' || Array.isArray(run.output_json)) continue
    const output = run.output_json as Record<string, unknown>
    const understoodSummary = stringArray(output.understood_summary)
    if (understoodSummary.length === 0) continue
    return {
      understoodSummary: understoodSummary.slice(0, 4),
      createdAt: run.created_at,
    }
  }
  return null
}

export default async function EventCommandCenterPage({ params }: PageProps) {
  const { eventId } = await params
  const supabase = await createClient()

  const now = new Date().toISOString()

  const [
    { data: event },
    { data: tasks },
    { data: vendors },
    { data: budgetItems },
    { data: risks },
    { data: pendingUpdates },
    { data: openQuestions },
    { data: pendingDecisions },
    { data: upcomingTimeline },
    { data: recentActivity },
    { data: aiRuns },
  ] = await Promise.all([
    supabase.from('events').select('*').eq('id', eventId).single(),
    supabase.from('tasks').select('*').eq('event_id', eventId).eq('status', 'todo').order('created_at'),
    supabase.from('vendors').select('*').eq('event_id', eventId).order('created_at'),
    supabase.from('budget_items').select('*').eq('event_id', eventId).order('created_at'),
    supabase.from('risks').select('*').eq('event_id', eventId).eq('status', 'open').order('created_at'),
    supabase
      .from('proposed_updates')
      .select('*')
      .eq('event_id', eventId)
      .eq('status', 'pending')
      .order('created_at'),
    supabase
      .from('open_questions')
      .select('*')
      .eq('event_id', eventId)
      .eq('status', 'open')
      .order('created_at'),
    supabase
      .from('decisions')
      .select('*')
      .eq('event_id', eventId)
      .eq('status', 'pending')
      .order('created_at'),
    supabase
      .from('timeline_items')
      .select('*')
      .eq('event_id', eventId)
      .gte('starts_at', now)
      .order('starts_at', { ascending: true })
      .limit(5),
    supabase
      .from('activity_log')
      .select('*')
      .eq('event_id', eventId)
      .in('action', ['proposed_updates_created', 'proposed_update_applied', 'proposed_update_rejected'])
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('ai_runs')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(12),
  ])

  if (!event) notFound()

  const glennBrief = parseGlennBrief((aiRuns ?? []) as AiRun[])

  return (
    <CommandCenter
      event={event as Event}
      glennBrief={glennBrief}
      openTasks={(tasks ?? []) as Task[]}
      vendors={(vendors ?? []) as Vendor[]}
      openRisks={(risks ?? []) as Risk[]}
      pendingUpdates={(pendingUpdates ?? []) as ProposedUpdate[]}
      openQuestions={(openQuestions ?? []) as OpenQuestion[]}
      pendingDecisions={(pendingDecisions ?? []) as Decision[]}
      upcomingTimeline={(upcomingTimeline ?? []) as TimelineItem[]}
      budgetItems={(budgetItems ?? []) as BudgetItem[]}
      recentActivity={(recentActivity ?? []) as ActivityLog[]}
    />
  )
}
