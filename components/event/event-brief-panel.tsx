import type { Event } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Sparkles } from 'lucide-react'

interface EventBriefPanelProps {
  event: Event
}

function generateBrief(event: Event): string {
  const parts: string[] = []

  if (event.name) parts.push(`**${event.name}**`)
  if (event.event_type) parts.push(`is a ${event.event_type}`)
  if (event.event_date) {
    const date = new Date(event.event_date)
    const formatted = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    parts.push(`scheduled for ${formatted}`)
  }
  if (event.location) parts.push(`in ${event.location}`)
  if (event.attendee_target) parts.push(`targeting ${event.attendee_target} attendees`)
  if (event.budget_target) {
    const budget = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(event.budget_target)
    parts.push(`with a budget of ${budget}`)
  }

  if (parts.length === 0) return 'No event details yet. Tell Glenn what you know to get started.'

  return parts.join(', ') + '.'
}

export function EventBriefPanel({ event }: EventBriefPanelProps) {
  const brief = generateBrief(event)

  return (
    <Card className="border bg-accent/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Current event brief
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {brief.split('**').map((part, i) =>
            i % 2 === 1
              ? <strong key={i} className="text-foreground font-medium">{part}</strong>
              : part
          )}
        </p>
        {event.description && (
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{event.description}</p>
        )}
      </CardContent>
    </Card>
  )
}
