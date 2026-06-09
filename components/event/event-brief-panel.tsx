import Link from 'next/link'
import type { Event } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronRight, Sparkles } from 'lucide-react'

export interface GlennBriefView {
  understoodSummary: string[]
  createdAt: string
}

interface EventBriefPanelProps {
  event: Event
  glennBrief?: GlennBriefView | null
  pendingSuggestionsCount?: number
  eventId?: string
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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function EventBriefPanel({ event, glennBrief, pendingSuggestionsCount = 0, eventId }: EventBriefPanelProps) {
  const staticBrief = generateBrief(event)
  const hasGlennSummary = (glennBrief?.understoodSummary.length ?? 0) > 0

  return (
    <Card className="border bg-primary/[0.03]">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
          <Sparkles className="h-3 w-3 text-primary" />
          Glenn&apos;s current brief
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasGlennSummary ? (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-1.5 text-sm leading-relaxed text-foreground">
              {glennBrief!.understoodSummary.map((summary) => (
                <li key={summary} className="flex gap-2">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-primary/70" />
                  <span>{summary}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-muted-foreground">
              Last updated from chat · {timeAgo(glennBrief!.createdAt)}
            </p>
            {pendingSuggestionsCount > 0 && eventId ? (
              <Link
                href={`/events/${eventId}/chat`}
                className="text-xs font-medium text-primary hover:text-primary/80 inline-flex items-center gap-0.5 transition-colors"
              >
                Review Glenn&apos;s suggestions
                <ChevronRight className="h-3 w-3" />
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {staticBrief.split('**').map((part, i) =>
                i % 2 === 1
                  ? <strong key={i} className="text-foreground font-semibold">{part}</strong>
                  : part
              )}
            </p>
            {event.description && (
              <p className="text-sm text-muted-foreground leading-relaxed border-t pt-2">{event.description}</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Tell Glenn what changed in chat to build a live brief here.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
