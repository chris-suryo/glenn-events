import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Event, Task, Vendor, BudgetItem, Risk, ProposedUpdate, OpenQuestion, Decision, TimelineItem, ActivityLog } from '@/lib/types'
import { CommandCenter } from '@/components/event/command-center'
import type { CommandCenterBrief } from '@/components/event/event-brief-panel'

interface PageProps {
  params: Promise<{ eventId: string }>
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
  ])

  if (!event) notFound()

  const typedEvent = event as Event
  const typedTasks = (tasks ?? []) as Task[]
  const typedVendors = (vendors ?? []) as Vendor[]
  const typedBudgetItems = (budgetItems ?? []) as BudgetItem[]
  const typedRisks = (risks ?? []) as Risk[]
  const typedOpenQuestions = (openQuestions ?? []) as OpenQuestion[]
  const typedPendingDecisions = (pendingDecisions ?? []) as Decision[]

  const priorityOrder: Record<Task['priority'], number> = { high: 0, medium: 1, low: 2 }
  const commandCenterBrief: CommandCenterBrief = {
    openTaskCount: typedTasks.length,
    topTasks: [...typedTasks]
      .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
      .slice(0, 3)
      .map(t => ({ title: t.title, priority: t.priority })),
    vendorSummary: {
      confirmedCount: typedVendors.filter(v => v.status === 'confirmed').length,
      totalCount: typedVendors.length,
    },
    budgetSummary: {
      estimated: typedBudgetItems.reduce((s, b) => s + (b.estimated_cost ?? 0), 0),
      target: typedEvent.budget_target,
      unpricedCount: typedBudgetItems.filter(b => b.estimated_cost === null).length,
    },
    openRiskCount: typedRisks.length,
    openQuestionCount: typedOpenQuestions.length,
    pendingDecisionCount: typedPendingDecisions.length,
  }

  return (
    <CommandCenter
      event={typedEvent}
      commandCenterBrief={commandCenterBrief}
      openTasks={typedTasks}
      vendors={typedVendors}
      openRisks={typedRisks}
      pendingUpdates={(pendingUpdates ?? []) as ProposedUpdate[]}
      openQuestions={typedOpenQuestions}
      pendingDecisions={typedPendingDecisions}
      upcomingTimeline={(upcomingTimeline ?? []) as TimelineItem[]}
      budgetItems={typedBudgetItems}
      recentActivity={(recentActivity ?? []) as ActivityLog[]}
    />
  )
}
