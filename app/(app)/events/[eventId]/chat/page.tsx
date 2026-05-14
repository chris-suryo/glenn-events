import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Event, Message, ProposedUpdate } from '@/lib/types'
import { ChatView } from '@/components/event/chat-view'

interface PageProps {
  params: Promise<{ eventId: string }>
}

export default async function EventChatPage({ params }: PageProps) {
  const { eventId } = await params
  const supabase = await createClient()

  const [{ data: event }, { data: messages }, { data: pendingUpdates }] = await Promise.all([
    supabase.from('events').select('*').eq('id', eventId).single(),
    supabase.from('messages').select('*').eq('event_id', eventId).order('created_at'),
    supabase
      .from('proposed_updates')
      .select('*')
      .eq('event_id', eventId)
      .eq('status', 'pending')
      .order('created_at'),
  ])

  if (!event) notFound()

  return (
    <ChatView
      event={event as Event}
      messages={(messages ?? []) as Message[]}
      pendingUpdates={(pendingUpdates ?? []) as ProposedUpdate[]}
    />
  )
}
