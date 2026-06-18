import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ReviewCompanion } from '@/components/event/review-companion'
import { getReviewState } from '@/lib/events/review-state'

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ eventId: string }>
}) {
  const { eventId } = await params
  const supabase = await createClient()
  const [{ data: event }, reviewState] = await Promise.all([
    supabase.from('events').select('id').eq('id', eventId).single(),
    getReviewState(eventId),
  ])

  if (!event) notFound()

  return (
    <ReviewCompanion
      eventId={eventId}
      pendingUpdates={reviewState.pendingUpdates}
      aiRuns={reviewState.aiRuns}
      files={reviewState.files}
    >
      {children}
    </ReviewCompanion>
  )
}
