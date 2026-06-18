import { createClient } from '@/lib/supabase/server'
import type { AiRun, EventFile, ProposedUpdate } from '@/lib/types'

export interface ReviewState {
  pendingUpdates: ProposedUpdate[]
  aiRuns: AiRun[]
  files: EventFile[]
}

/**
 * Single source of truth for the pending-review surface. Both the persistent
 * Review companion (mounted in the event layout) and the Ask Glenn panel
 * (/chat) read through this, so the companion chip, the Command Center card,
 * and the chat panel can never show divergent review state.
 */
export async function getReviewState(eventId: string): Promise<ReviewState> {
  const supabase = await createClient()
  const [{ data: pendingUpdates }, { data: files }, { data: aiRuns }] = await Promise.all([
    supabase
      .from('proposed_updates')
      .select('*')
      .eq('event_id', eventId)
      .eq('status', 'pending')
      .order('created_at'),
    supabase.from('files').select('*').eq('event_id', eventId),
    supabase
      .from('ai_runs')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  return {
    pendingUpdates: (pendingUpdates ?? []) as ProposedUpdate[],
    aiRuns: (aiRuns ?? []) as AiRun[],
    files: (files ?? []) as EventFile[],
  }
}
