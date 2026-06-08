import Link from 'next/link'
import { Sparkles } from 'lucide-react'

interface AiSourceBadgeProps {
  eventId: string
  sourceMessageId: string | null
}

// Replaces the static "AI" badge on all AI-generated records.
// Links to the /chat page so the user can trace where each item came from.
export function AiSourceBadge({ eventId, sourceMessageId }: AiSourceBadgeProps) {
  const href = sourceMessageId
    ? `/events/${eventId}/chat?source=${sourceMessageId}`
    : `/events/${eventId}/chat`

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-primary/30 hover:text-primary hover:bg-primary/[0.04] transition-colors"
      title="View source message in chat"
    >
      <Sparkles className="h-2.5 w-2.5" />
      AI source
    </Link>
  )
}
