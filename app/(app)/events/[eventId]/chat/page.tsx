import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { AiRun, Event, EventFile, Message, ProposedUpdate } from '@/lib/types'
import { ChatView } from '@/components/event/chat-view'

interface PageProps {
  params: Promise<{ eventId: string }>
  searchParams: Promise<{ source?: string }>
}

export default async function EventChatPage({ params, searchParams }: PageProps) {
  const { eventId } = await params
  const { source } = await searchParams
  const supabase = await createClient()

  const [{ data: event }, { data: messages }, { data: pendingUpdates }, { data: files }] = await Promise.all([
    supabase.from('events').select('*').eq('id', eventId).single(),
    supabase.from('messages').select('*').eq('event_id', eventId).order('created_at'),
    supabase
      .from('proposed_updates')
      .select('*')
      .eq('event_id', eventId)
      .eq('status', 'pending')
      .order('created_at'),
    supabase.from('files').select('*').eq('event_id', eventId),
  ])

  if (!event) notFound()

  const { data: aiRuns } = await supabase
    .from('ai_runs')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <ChatView
      event={event as Event}
      messages={(messages ?? []) as Message[]}
      pendingUpdates={(pendingUpdates ?? []) as ProposedUpdate[]}
      aiRuns={(aiRuns ?? []) as AiRun[]}
      files={(files ?? []) as EventFile[]}
      highlightMessageId={source ?? null}
    />
  )
}
