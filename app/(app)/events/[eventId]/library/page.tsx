import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { AiRun, Event, EventFile } from '@/lib/types'
import { FileLibrary, type FileCardData } from '@/components/event/file-library'
import { formatAiRunDebug, showAiDebug } from '@/lib/ai/debug-format'

interface PageProps {
  params: Promise<{ eventId: string }>
}

export default async function EventLibraryPage({ params }: PageProps) {
  const { eventId } = await params
  const supabase = await createClient()

  const [{ data: event }, { data: files }] = await Promise.all([
    supabase.from('events').select('*').eq('id', eventId).single(),
    supabase.from('files').select('*').eq('event_id', eventId).order('created_at', { ascending: false }),
  ])

  if (!event) notFound()

  const fileRows = (files ?? []) as EventFile[]

  // Tally each file's proposals (by its ai_run_id) so the card can derive
  // Ready-for-review vs Applied-updates without a new DB status.
  const aiRunIds = fileRows.map((f) => f.ai_run_id).filter((id): id is string => !!id)
  const tallies = new Map<string, { pending: number; applied: number; total: number }>()
  if (aiRunIds.length > 0) {
    const { data: proposals } = await supabase
      .from('proposed_updates')
      .select('ai_run_id, status')
      .in('ai_run_id', aiRunIds)
    for (const p of proposals ?? []) {
      const key = p.ai_run_id as string
      const cur = tallies.get(key) ?? { pending: 0, applied: 0, total: 0 }
      cur.total += 1
      if (p.status === 'pending') cur.pending += 1
      if (p.status === 'applied') cur.applied += 1
      tallies.set(key, cur)
    }
  }

  // Dev-only: pull per-run cost telemetry so the card can show a debug line.
  const debugByRun = new Map<string, string>()
  if (showAiDebug() && aiRunIds.length > 0) {
    const { data: runs } = await supabase
      .from('ai_runs')
      .select('id, model, total_tokens, estimated_cost_usd')
      .in('id', aiRunIds)
    for (const r of (runs ?? []) as Pick<AiRun, 'id' | 'model' | 'total_tokens' | 'estimated_cost_usd'>[]) {
      const line = formatAiRunDebug(r)
      if (line) debugByRun.set(r.id, line)
    }
  }

  const cards: FileCardData[] = fileRows.map((file) => {
    const t = file.ai_run_id ? tallies.get(file.ai_run_id) : undefined
    return {
      file,
      pending: t?.pending ?? 0,
      applied: t?.applied ?? 0,
      total: t?.total ?? 0,
      debug: file.ai_run_id ? debugByRun.get(file.ai_run_id) ?? null : null,
    }
  })

  return <FileLibrary event={event as Event} eventId={eventId} files={cards} />
}
