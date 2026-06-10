import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProposedUpdatesBadgeProps {
  count: number
  eventId: string
}

export function ProposedUpdatesBadge({ count, eventId }: ProposedUpdatesBadgeProps) {
  return (
    <Link
      href={`/events/${eventId}/chat`}
      aria-label={`${count} proposed update${count !== 1 ? 's' : ''} to review`}
      className={cn(
        buttonVariants({ variant: 'outline', size: 'sm' }),
        'gap-2 border-primary/30 text-primary hover:bg-primary/5 inline-flex items-center'
      )}
    >
      <ClipboardList className="h-4 w-4" />
      <span className="hidden sm:inline">Glenn found</span>
      <Badge className="h-5 px-1.5 text-xs">{count}</Badge>
      <span className="hidden sm:inline">proposed update{count !== 1 ? 's' : ''}</span>
      <span className="sm:hidden">to review</span>
    </Link>
  )
}
