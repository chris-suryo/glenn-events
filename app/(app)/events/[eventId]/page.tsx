import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Event, Task, Vendor, BudgetItem, Risk, ProposedUpdate } from '@/lib/types'
import { CommandCenter } from '@/components/event/command-center'

interface PageProps {
  params: Promise<{ eventId: string }>
}

export default async function EventCommandCenterPage({ params }: PageProps) {
  const { eventId } = await params
  const supabase = await createClient()

  const [
    { data: event },
    { data: tasks },
    { data: vendors },
    { data: budgetItems },
    { data: risks },
    { data: pendingUpdates },
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
  ])

  if (!event) notFound()

  const totalBudgetEstimated = (budgetItems ?? []).reduce(
    (sum: number, item: BudgetItem) => sum + (item.estimated_cost ?? 0),
    0
  )

  return (
    <CommandCenter
      event={event as Event}
      openTasks={(tasks ?? []) as Task[]}
      vendors={(vendors ?? []) as Vendor[]}
      openRisks={(risks ?? []) as Risk[]}
      pendingUpdates={(pendingUpdates ?? []) as ProposedUpdate[]}
      totalBudgetEstimated={totalBudgetEstimated}
    />
  )
}
