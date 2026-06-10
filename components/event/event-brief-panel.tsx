import Link from 'next/link'
import type { Event, Task } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronRight } from 'lucide-react'

export interface CommandCenterBrief {
  openTaskCount: number
  topTasks: Array<{ title: string; priority: Task['priority'] }>
  vendorSummary: { confirmedCount: number; totalCount: number }
  budgetSummary: { estimated: number; target: number | null; unpricedCount: number }
  openRiskCount: number
  openQuestionCount: number
  pendingDecisionCount: number
}

interface EventBriefPanelProps {
  event: Event
  commandCenterBrief?: CommandCenterBrief | null
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

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function priorityDot(priority: Task['priority']): string {
  if (priority === 'high') return 'bg-rose-500'
  if (priority === 'medium') return 'bg-amber-400'
  return 'bg-slate-300'
}

function buildIdentityLine(event: Event): string {
  const parts: string[] = [event.name]
  if (event.event_date) {
    const formatted = new Date(event.event_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    parts.push(formatted)
  }
  if (event.location) parts.push(event.location)
  if (event.attendee_target) parts.push(`~${event.attendee_target} attendees`)
  return parts.join(' · ')
}

function buildSummaryLine(brief: CommandCenterBrief): string | null {
  const taskPart = brief.openTaskCount > 0
    ? `${brief.openTaskCount} open task${brief.openTaskCount !== 1 ? 's' : ''}`
    : null

  const vendorPart = brief.vendorSummary.totalCount > 0
    ? `${brief.vendorSummary.confirmedCount} of ${brief.vendorSummary.totalCount} vendor${brief.vendorSummary.totalCount !== 1 ? 's' : ''} confirmed`
    : null

  const pieces = [taskPart, vendorPart].filter(Boolean)
  if (pieces.length === 0) return null
  return `This event currently has ${pieces.join(', ')}.`
}

function buildBudgetLine(s: CommandCenterBrief['budgetSummary']): string {
  if (s.estimated > 0 && s.target !== null) return `${formatCurrency(s.estimated)} of ${formatCurrency(s.target)} target`
  if (s.estimated > 0) return formatCurrency(s.estimated)
  if (s.unpricedCount > 0 && s.target !== null) return `$0 of ${formatCurrency(s.target)} · ${s.unpricedCount} unpriced`
  if (s.unpricedCount > 0) return `$0 · ${s.unpricedCount} unpriced item${s.unpricedCount !== 1 ? 's' : ''}`
  if (s.target !== null) return `$0 of ${formatCurrency(s.target)} target`
  return '$0'
}

function buildAttentionLine(brief: CommandCenterBrief): string {
  const parts: string[] = []
  if (brief.openRiskCount > 0) parts.push(`${brief.openRiskCount} risk${brief.openRiskCount !== 1 ? 's' : ''}`)
  if (brief.openQuestionCount > 0) parts.push(`${brief.openQuestionCount} question${brief.openQuestionCount !== 1 ? 's' : ''}`)
  if (brief.pendingDecisionCount > 0) parts.push(`${brief.pendingDecisionCount} decision${brief.pendingDecisionCount !== 1 ? 's' : ''}`)
  return parts.join(', ')
}

export function EventBriefPanel({ event, commandCenterBrief: brief, pendingSuggestionsCount = 0, eventId }: EventBriefPanelProps) {
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

  const showBudgetRow = !!brief && (
    brief.budgetSummary.estimated > 0 ||
    brief.budgetSummary.target !== null ||
    brief.budgetSummary.unpricedCount > 0
  )

  const showAttentionRow = !!brief && (
    brief.openRiskCount > 0 ||
    brief.openQuestionCount > 0 ||
    brief.pendingDecisionCount > 0
  )

  return (
    <Card className="border bg-primary/[0.03]">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Event brief
        </CardTitle>
      </CardHeader>
      <CardContent>
        {hasPlanData && brief ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-muted-foreground">
              {buildIdentityLine(event)}
            </p>

            {buildSummaryLine(brief) && (
              <p className="text-sm leading-relaxed text-foreground">
                {buildSummaryLine(brief)}
              </p>
            )}

            {brief.topTasks.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {brief.topTasks.slice(0, 3).map((t) => (
                  <li key={t.title} className="flex items-center gap-2 text-xs text-foreground">
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${priorityDot(t.priority)}`} />
                    <span className="min-w-0 truncate">{t.title}</span>
                  </li>
                ))}
              </ul>
            )}

            {(showBudgetRow || showAttentionRow) && (
              <div className="flex flex-col gap-1 border-t pt-2">
                {showBudgetRow && (
                  <div className="flex justify-between gap-4 text-xs">
                    <span className="text-muted-foreground shrink-0">Budget</span>
                    <span className="font-medium text-right">{buildBudgetLine(brief.budgetSummary)}</span>
                  </div>
                )}
                {showAttentionRow && (
                  <div className="flex justify-between gap-4 text-xs">
                    <span className="text-muted-foreground shrink-0">Needs attention</span>
                    <span className="font-medium text-amber-600 text-right">{buildAttentionLine(brief)}</span>
                  </div>
                )}
              </div>
            )}

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
              {generateBrief(event).split('**').map((part, i) =>
                i % 2 === 1
                  ? <strong key={i} className="text-foreground font-semibold">{part}</strong>
                  : part
              )}
            </p>
            {event.description && (
              <p className="text-sm text-muted-foreground leading-relaxed border-t pt-2">{event.description}</p>
            )}
            {eventId ? (
              <Link
                href={`/events/${eventId}/chat`}
                className="text-xs text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-0.5"
              >
                Tell Glenn what changed to build your event brief.
                <ChevronRight className="h-3 w-3" />
              </Link>
            ) : (
              <p className="text-xs text-muted-foreground">
                Tell Glenn what changed to build your event brief.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
