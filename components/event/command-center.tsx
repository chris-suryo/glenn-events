'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Event, Task, Vendor, BudgetItem, Risk, ProposedUpdate, OpenQuestion, Decision, TimelineItem, ActivityLog } from '@/lib/types'
import { EventBriefPanel, type CommandCenterBrief } from './event-brief-panel'
import { ProposedUpdatesBadge } from './proposed-updates-badge'
import { GlennInput } from './glenn-input'
import { activityDot, activityLabel, timeAgo } from '@/lib/activity'
import { Card, CardContent } from '@/components/ui/card'
import {
  Activity, AlertTriangle, CheckCircle2,
  ChevronRight, DollarSign, HelpCircle, Sparkles, Trash2, Users,
} from 'lucide-react'

const PENDING_TYPE_LABELS: Record<string, string> = {
  task:          'task',
  vendor:        'vendor',
  budget_item:   'budget item',
  timeline_item: 'timeline item',
  decision:      'decision',
  risk:          'risk',
  open_question: 'question',
}

interface NeedsAttentionItem {
  id: string
  title: string
  badge: string
  context: string | null
  href: string
  tone: 'review' | 'risk' | 'question' | 'task' | 'timeline' | 'decision'
}

interface ReadinessStatus {
  title: 'Review pending' | 'Needs attention' | 'On track' | 'Getting started'
  detail: string
  tone: 'review' | 'attention' | 'track' | 'empty'
  href: string | null
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function firstLine(text: string | null): string | null {
  if (!text) return null
  const line = text.split('\n').map((part) => part.trim()).find(Boolean)
  return line ?? null
}

function snippet(text: string | null, max = 72): string | null {
  const line = firstLine(text)
  if (!line) return null
  return line.length > max ? `${line.slice(0, max)}…` : line
}

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`
}

function joinParts(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`
}

function isOverdue(date: string | null): boolean {
  if (!date) return false
  const due = new Date(date)
  if (Number.isNaN(due.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return due < today
}

function buildReadinessStatus(
  eventId: string,
  pendingUpdates: ProposedUpdate[],
  openRisks: Risk[],
  openTasks: Task[],
  openQuestions: OpenQuestion[],
  pendingDecisions: Decision[],
  planIsEmpty: boolean,
): ReadinessStatus {
  if (pendingUpdates.length > 0) {
    return {
      title: 'Review pending',
      detail: `${plural(pendingUpdates.length, 'update')} ${pendingUpdates.length === 1 ? 'is' : 'are'} waiting for your review`,
      tone: 'review',
      href: `/events/${eventId}/chat`,
    }
  }

  if (planIsEmpty) {
    return {
      title: 'Getting started',
      detail: 'Tell Glenn what you know — it proposes plan updates you review before anything is saved',
      tone: 'empty',
      href: null,
    }
  }

  const worstItems: Array<{ text: string; href: string }> = [
    ...openRisks
      .filter((risk) => risk.severity === 'high')
      .map((risk) => ({
        text: `${snippet(risk.title, 48) ?? risk.title} (high risk)`,
        href: `/events/${eventId}/plan?tab=risks&highlight=${risk.id}`,
      })),
    ...openTasks
      .filter((task) => isOverdue(task.due_date))
      .map((task) => ({
        text: `${snippet(task.title, 48) ?? task.title} (overdue)`,
        href: `/events/${eventId}/plan?tab=tasks&highlight=${task.id}`,
      })),
    ...openQuestions.map((question) => ({
      text: snippet(question.question, 56) ?? question.question,
      href: `/events/${eventId}/plan?tab=open-questions&highlight=${question.id}`,
    })),
    ...openTasks
      .filter((task) => task.priority === 'high' && !isOverdue(task.due_date))
      .map((task) => ({
        text: `${snippet(task.title, 48) ?? task.title} (high priority)`,
        href: `/events/${eventId}/plan?tab=tasks&highlight=${task.id}`,
      })),
    ...pendingDecisions.map((decision) => ({
      text: `Decide: ${snippet(decision.title, 44) ?? decision.title}`,
      href: `/events/${eventId}/plan?tab=decisions&highlight=${decision.id}`,
    })),
  ]

  if (worstItems.length > 0) {
    const named = worstItems.slice(0, 2).map((item) => item.text).join(' · ')
    const overflow = worstItems.length > 2 ? ` · +${worstItems.length - 2} more` : ''
    return {
      title: 'Needs attention',
      detail: `${named}${overflow}`,
      tone: 'attention',
      href: worstItems[0].href,
    }
  }

  return {
    title: 'On track',
    detail: 'No urgent blockers detected',
    tone: 'track',
    href: null,
  }
}

function buildNextBestActions(
  eventId: string,
  pendingUpdates: ProposedUpdate[],
  openQuestions: OpenQuestion[],
  openRisks: Risk[],
  openTasks: Task[],
  upcomingTimeline: TimelineItem[],
  pendingDecisions: Decision[],
): NeedsAttentionItem[] {
  const items: NeedsAttentionItem[] = []

  if (pendingUpdates.length > 0) {
    const typeCounts = new Map<string, number>()
    for (const update of pendingUpdates) {
      typeCounts.set(update.update_type, (typeCounts.get(update.update_type) ?? 0) + 1)
    }
    const typeParts = [...typeCounts.entries()].map(([type, count]) => {
      const label = PENDING_TYPE_LABELS[type] ?? type
      return count === 1 ? label : `${count} ${label}s`
    })
    items.push({
      id: 'pending-updates',
      title: `Review ${plural(pendingUpdates.length, 'update')}`,
      badge: 'Review',
      context: joinParts(typeParts),
      href: `/events/${eventId}/chat`,
      tone: 'review',
    })
  }

  for (const risk of openRisks.filter((r) => r.severity === 'high')) {
    items.push({
      id: `risk-${risk.id}`,
      title: risk.title,
      badge: 'Resolve risk',
      context: snippet(risk.mitigation) ?? snippet(risk.description),
      href: `/events/${eventId}/plan?tab=risks&highlight=${risk.id}`,
      tone: 'risk',
    })
  }

  for (const question of openQuestions) {
    items.push({
      id: `question-${question.id}`,
      title: question.question,
      badge: 'Needs answer',
      context: null,
      href: `/events/${eventId}/plan?tab=open-questions&highlight=${question.id}`,
      tone: 'question',
    })
  }

  const priorityTasks = openTasks
    .filter((task) => task.priority === 'high' || isOverdue(task.due_date))
    .sort((a, b) => {
      const aOverdue = isOverdue(a.due_date)
      const bOverdue = isOverdue(b.due_date)
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
      if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1
      return (a.due_date ?? '').localeCompare(b.due_date ?? '')
    })

  for (const task of priorityTasks) {
    items.push({
      id: `task-${task.id}`,
      title: task.title,
      badge: isOverdue(task.due_date) ? 'Overdue task' : 'Confirm',
      context: task.due_date ? `Due ${shortDate(task.due_date)}` : snippet(task.description),
      href: `/events/${eventId}/plan?tab=tasks&highlight=${task.id}`,
      tone: 'task',
    })
  }

  const timelineItems = [...upcomingTimeline]
    .sort((a, b) => {
      if (a.type !== b.type) {
        if (a.type === 'deadline') return -1
        if (b.type === 'deadline') return 1
      }
      return (a.starts_at ?? '').localeCompare(b.starts_at ?? '')
    })

  for (const item of timelineItems) {
    items.push({
      id: `timeline-${item.id}`,
      title: item.title,
      badge: item.type === 'deadline' ? 'Deadline' : 'Upcoming',
      context: item.starts_at ? shortDate(item.starts_at) : snippet(item.description),
      href: `/events/${eventId}/plan?tab=timeline&highlight=${item.id}`,
      tone: 'timeline',
    })
  }

  for (const decision of pendingDecisions) {
    items.push({
      id: `decision-${decision.id}`,
      title: `Decide: ${decision.title}`,
      badge: 'Decide',
      context: snippet(decision.description),
      href: `/events/${eventId}/plan?tab=decisions&highlight=${decision.id}`,
      tone: 'decision',
    })
  }

  return items.slice(0, 5)
}

function actionBadgeClasses(tone: NeedsAttentionItem['tone']) {
  if (tone === 'review') return 'bg-indigo-50 text-indigo-700'
  if (tone === 'risk') return 'bg-rose-50 text-rose-700'
  if (tone === 'question') return 'bg-amber-50 text-amber-700'
  if (tone === 'task') return 'bg-sky-50 text-sky-700'
  if (tone === 'timeline') return 'bg-emerald-50 text-emerald-700'
  return 'bg-slate-100 text-slate-700'
}

function statusClasses(tone: ReadinessStatus['tone']) {
  if (tone === 'review') return 'border-indigo-200 bg-indigo-50/50 text-indigo-700'
  if (tone === 'empty') return 'border-indigo-200 bg-indigo-50/50 text-indigo-700'
  if (tone === 'attention') return 'border-amber-200 bg-amber-50/60 text-amber-700'
  return 'border-emerald-200 bg-emerald-50/50 text-emerald-700'
}

function StatusIcon({ tone }: { tone: ReadinessStatus['tone'] }) {
  if (tone === 'track') return <CheckCircle2 className="h-4 w-4" />
  if (tone === 'empty') return <Sparkles className="h-4 w-4" />
  return <AlertTriangle className="h-4 w-4" />
}

interface CommandCenterProps {
  event: Event
  commandCenterBrief: CommandCenterBrief
  openTasks: Task[]
  vendors: Vendor[]
  openRisks: Risk[]
  pendingUpdates: ProposedUpdate[]
  openQuestions: OpenQuestion[]
  pendingDecisions: Decision[]
  upcomingTimeline: TimelineItem[]
  budgetItems: BudgetItem[]
  recentActivity: ActivityLog[]
}

export function CommandCenter({
  event,
  commandCenterBrief,
  openTasks,
  vendors,
  openRisks,
  pendingUpdates,
  openQuestions,
  pendingDecisions,
  upcomingTimeline,
  budgetItems,
  recentActivity,
}: CommandCenterProps) {
  const [isDeleting, startDelete] = useTransition()
  const router = useRouter()

  const confirmedVendors = vendors.filter((v) => v.status === 'confirmed')
  const totalEstimated = budgetItems.reduce((s, i) => s + (i.estimated_cost ?? 0), 0)
  const unpricedBudgetCount = budgetItems.filter((i) => i.estimated_cost === null).length
  const budgetTileValue = totalEstimated > 0
    ? formatCurrency(totalEstimated)
    : unpricedBudgetCount > 0
      ? `$0 · ${unpricedBudgetCount} unpriced item${unpricedBudgetCount !== 1 ? 's' : ''}`
      : formatCurrency(0)

  const planIsEmpty =
    openTasks.length === 0 &&
    vendors.length === 0 &&
    budgetItems.length === 0 &&
    openRisks.length === 0 &&
    openQuestions.length === 0 &&
    pendingDecisions.length === 0 &&
    upcomingTimeline.length === 0 &&
    pendingUpdates.length === 0

  const readinessStatus = buildReadinessStatus(
    event.id,
    pendingUpdates,
    openRisks,
    openTasks,
    openQuestions,
    pendingDecisions,
    planIsEmpty,
  )
  const nextBestActions = buildNextBestActions(
    event.id,
    pendingUpdates,
    openQuestions,
    openRisks,
    openTasks,
    upcomingTimeline,
    pendingDecisions,
  )

  function handleDeleteEvent() {
    if (!window.confirm(`Delete "${event.name}"? This cannot be undone — all tasks, vendors, budget, and chat history will be permanently removed.`)) return
    startDelete(async () => {
      await fetch(`/api/events/${event.id}`, { method: 'DELETE' })
      router.push('/dashboard')
    })
  }

  return (
    <div className="flex flex-col h-full">

      <div className="border-b px-6 py-4 flex items-center justify-between shrink-0 bg-card/50">
        <div>
          <h1 className="text-base font-semibold leading-tight tracking-tight">{event.name}</h1>
          <div className="flex items-center gap-2.5 mt-1 flex-wrap">
            {event.event_date && (
              <span className="text-xs text-muted-foreground">
                {new Date(event.event_date).toLocaleDateString('en-US', {
                  weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
                })}
              </span>
            )}
            {event.location && (
              <span className="text-xs text-muted-foreground">· {event.location}</span>
            )}
            {event.attendee_target && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" />
                {event.attendee_target}
              </span>
            )}
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize
              ${event.status === 'active'    ? 'bg-emerald-50 text-emerald-700' :
                event.status === 'planning'  ? 'bg-sky-50 text-sky-700' :
                event.status === 'completed' ? 'bg-slate-100 text-slate-600' :
                'bg-slate-100 text-slate-500'}`}>
              {event.status}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {pendingUpdates.length > 0 && (
            <ProposedUpdatesBadge count={pendingUpdates.length} eventId={event.id} />
          )}
          <button
            onClick={handleDeleteEvent}
            disabled={isDeleting}
            title="Delete event"
            className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-5">

          <Card className={`border shadow-[0px_1px_3px_rgba(0,0,0,0.05)] ${statusClasses(readinessStatus.tone)}`}>
            <CardContent className="py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0">
                    <StatusIcon tone={readinessStatus.tone} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold leading-tight">{readinessStatus.title}</p>
                    <p className="text-sm text-foreground/70 mt-0.5">{readinessStatus.detail}</p>
                  </div>
                </div>
                {readinessStatus.href ? (
                  <Link
                    href={readinessStatus.href}
                    className="text-xs font-medium text-foreground/70 hover:text-foreground transition-colors inline-flex items-center gap-0.5 sm:shrink-0"
                  >
                    Open
                    <ChevronRight className="h-3 w-3" />
                  </Link>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {([
              {
                icon: CheckCircle2, label: 'Open tasks',
                value: openTasks.length,
                href: `/events/${event.id}/plan?tab=tasks`,
                alert: false,
              },
              {
                icon: Users, label: 'Vendors',
                value: `${confirmedVendors.length}/${vendors.length}`,
                href: `/events/${event.id}/plan?tab=vendors`,
                alert: false,
              },
              {
                icon: DollarSign, label: 'Est. budget',
                value: budgetTileValue,
                href: `/events/${event.id}/plan?tab=budget`,
                alert: false,
                small: unpricedBudgetCount > 0 && totalEstimated === 0,
              },
              {
                icon: AlertTriangle, label: 'Open risks',
                value: openRisks.length,
                href: `/events/${event.id}/plan?tab=risks`,
                alert: openRisks.length > 0,
              },
              {
                icon: HelpCircle, label: 'Questions',
                value: openQuestions.length,
                href: `/events/${event.id}/plan?tab=open-questions`,
                alert: false,
              },
            ] as const).map(({ icon: Icon, label, value, href, alert, ...rest }) => (
              <Link key={label} href={href}>
                <Card className={`border shadow-[0px_1px_3px_rgba(0,0,0,0.05)] hover:border-primary/30 transition-colors
                  ${alert ? 'border-rose-200 bg-rose-50/40' : ''}`}>
                  <CardContent className="pt-4 pb-3.5">
                    <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
                      <Icon className={`h-3 w-3 ${alert ? 'text-rose-500' : ''}`} />
                      <span className="text-xs font-medium">{label}</span>
                    </div>
                    <p className={`font-semibold tracking-tight ${alert ? 'text-rose-600' : ''} ${'small' in rest && rest.small ? 'text-sm leading-snug' : 'text-xl'}`}>
                      {value}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

            <div className="lg:col-span-2 space-y-4 lg:order-first">
              <EventBriefPanel
                event={event}
                commandCenterBrief={commandCenterBrief}
                eventId={event.id}
              />

              {recentActivity.length > 0 && (
                <div className="rounded-xl border bg-card shadow-[0px_1px_3px_rgba(0,0,0,0.05)] p-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent</p>
                  </div>
                  <div className="space-y-2.5">
                    {recentActivity.slice(0, 5).map((entry) => (
                      <div key={entry.id} className="flex items-start gap-2">
                        <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${activityDot(entry.action)}`} />
                        <span className="text-xs text-muted-foreground flex-1 leading-snug min-w-0">
                          {activityLabel(entry)}
                        </span>
                        <span className="text-[11px] text-muted-foreground/60 shrink-0">{timeAgo(entry.created_at)}</span>
                      </div>
                    ))}
                  </div>
                  <Link
                    href={`/events/${event.id}/activity`}
                    className="text-xs text-muted-foreground hover:text-foreground mt-3 inline-block transition-colors"
                  >
                    View all activity →
                  </Link>
                </div>
              )}
            </div>

            <div className="lg:col-span-3 space-y-4">
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {planIsEmpty ? 'Tell Glenn what you know' : 'Tell Glenn what changed'}
                  </p>
                </div>
                <GlennInput
                  eventId={event.id}
                  placeholder={planIsEmpty
                    ? 'New event? Start with whatever you know — vendor, times, costs, what\'s still TBD.'
                    : undefined}
                />
              </div>

              <div className="rounded-xl border bg-card shadow-[0px_1px_3px_rgba(0,0,0,0.05)] p-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {planIsEmpty ? 'What to tell Glenn first' : 'Next best actions'}
                  </p>
                </div>
                {planIsEmpty ? (
                  <ul className="space-y-2.5">
                    {([
                      ['Food & vendors', 'who\'s providing it, and when do they arrive?'],
                      ['Costs', 'quotes, receipts, or a budget cap to track'],
                      ['Schedule', 'who\'s arriving when?'],
                      ['Still open', 'what\'s undecided or unknown?'],
                    ] as const).map(([title, hint]) => (
                      <li key={title} className="flex items-start gap-2">
                        <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                        <p className="text-xs leading-snug">
                          <span className="font-medium text-foreground">{title}</span>
                          <span className="text-muted-foreground"> — {hint}</span>
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : nextBestActions.length > 0 ? (
                  <div className="space-y-2">
                    {nextBestActions.map((item) => (
                      <Link
                        key={item.id}
                        href={item.href}
                        className="group block rounded-lg border border-transparent px-2 py-2 hover:border-border hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-start gap-2">
                          <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground group-hover:text-primary" />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${actionBadgeClasses(item.tone)}`}>
                                {item.badge}
                              </span>
                              <span className="text-xs font-medium leading-snug text-foreground group-hover:text-primary">
                                {item.title}
                              </span>
                            </div>
                            {item.context ? (
                              <p className="text-xs text-muted-foreground mt-1 leading-snug line-clamp-2">
                                {item.context}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg bg-muted/30 px-3 py-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      <p className="text-xs text-muted-foreground">No urgent actions. Keep the plan current as details change.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>
      </div>

    </div>
  )
}
