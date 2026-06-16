import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Event, EventFile } from '@/lib/types'
import { FileLibrary } from '@/components/event/file-library'

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

  return (
    <FileLibrary
      event={event as Event}
      eventId={eventId}
      initialFiles={(files ?? []) as EventFile[]}
    />
  )
}
