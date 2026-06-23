import Link from 'next/link'
import type { Event, Task } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronRight } from 'lucide-react'
import { formatEventDateTime } from '@/lib/utils'

export interface CommandCenterBrief {
  openTaskCount: number
  topTasks: Array<{ title: string; priority: Task['priority'] }>
  vendorSummary: { confirmedCount: number; totalCount: number }
  budgetSummary: { estimated: number; target: number | null; unpricedCount: number }
  openRiskCount: number
  openQuestionCount: number
  pendingDecisionCount: number
}

export interface EventBriefRow {
  label: 'Next' | 'Confirmed' | 'Needs attention' | 'Budget'
  value: string
  href?: string
  tone?: 'attention' | 'neutral'
}

interface EventBriefPanelProps {
  event: Event
  commandCenterBrief?: CommandCenterBrief | null
  eventId?: string
  rows?: EventBriefRow[]
}

function buildIdentityLine(event: Event): string {
  const parts: string[] = []
  parts.push(event.event_type || event.name)
  if (event.event_date) {
    const formatted = formatEventDateTime(event.event_date, { year: false }, event.timezone ?? undefined)
    if (formatted) parts.push(formatted)
  }
  if (event.attendee_target) parts.push(`${event.attendee_target} guests`)
  if (event.location) parts.push(event.location)
  return parts.join(' · ')
}

export function EventBriefPanel({ event, commandCenterBrief: brief, eventId, rows = [] }: EventBriefPanelProps) {
  const hasPlanData = !!brief && (
    brief.openTaskCount > 0 ||
    brief.vendorSummary.totalCount > 0 ||
    brief.budgetSummary.estimated > 0 ||
    brief.budgetSummary.target !== null ||
    brief.budgetSummary.unpricedCount > 0 ||
    brief.openRiskCount > 0 ||
    brief.openQuestionCount > 0 ||
    brief.pendingDecisionCount > 0
  )

  const identityLine = buildIdentityLine(event)
  const showRows = rows.length > 0

  return (
    <Card className="border bg-primary/[0.03]">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Event brief
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasPlanData || showRows ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-muted-foreground">
              {identityLine}
            </p>

            {showRows && (
              <div className="divide-y rounded-lg border bg-background/60">
                {rows.map((row) => {
                  const content = (
                    <div className="flex justify-between gap-4 px-3 py-2 text-xs">
                      <span className="shrink-0 font-medium text-muted-foreground">{row.label}</span>
                      <span className={`text-right font-medium ${row.tone === 'attention' ? 'text-amber-700' : 'text-foreground'}`}>
                        {row.value}
                      </span>
                    </div>
                  )

                  return row.href ? (
                    <Link key={row.label} href={row.href} className="block hover:bg-muted/30 transition-colors">
                      {content}
                    </Link>
                  ) : (
                    <div key={row.label}>{content}</div>
                  )
                })}
              </div>
            )}

            {!showRows && eventId ? (
              <Link
                href={`/events/${eventId}/chat`}
                className="text-xs text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-0.5"
              >
                Add details in Ask Glenn
                <ChevronRight className="h-3 w-3" />
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground leading-relaxed">
              <strong className="text-foreground font-semibold">{event.name}</strong>
              {identityLine !== event.name ? ` · ${identityLine}` : ''}
            </p>
            {event.description && (
              <p className="text-sm text-muted-foreground leading-relaxed border-t pt-2">{event.description}</p>
            )}
            {eventId ? (
              <Link
                href={`/events/${eventId}/chat`}
                className="text-xs text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-0.5"
              >
                Tell Glenn what you know
                <ChevronRight className="h-3 w-3" />
              </Link>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
