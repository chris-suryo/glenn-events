import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Event, Message } from '@/lib/types'
import { ChatView } from '@/components/event/chat-view'
import { getReviewState } from '@/lib/events/review-state'

interface PageProps {
  params: Promise<{ eventId: string }>
  searchParams: Promise<{ source?: string }>
}

export default async function EventChatPage({ params, searchParams }: PageProps) {
  const { eventId } = await params
  const { source } = await searchParams
  const supabase = await createClient()

  const [{ data: event }, { data: messages }, reviewState] = await Promise.all([
    supabase.from('events').select('*').eq('id', eventId).single(),
    supabase.from('messages').select('*').eq('event_id', eventId).order('created_at'),
    getReviewState(eventId),
  ])

  if (!event) notFound()

  return (
    <ChatView
      event={event as Event}
      messages={(messages ?? []) as Message[]}
      pendingUpdates={reviewState.pendingUpdates}
      aiRuns={reviewState.aiRuns}
      files={reviewState.files}
      highlightMessageId={source ?? null}
    />
  )
}
