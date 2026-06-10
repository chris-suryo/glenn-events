'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Event, Task, Vendor, BudgetItem, Risk, ProposedUpdate, OpenQuestion, Decision, TimelineItem, ActivityLog } from '@/lib/types'
import { EventBriefPanel, type CommandCenterBrief } from './event-brief-panel'
import { ProposedUpdatesBadge } from './proposed-updates-badge'
import { activityDot, activityLabel, timeAgo } from '@/lib/activity'
import { Card, CardContent } from '@/components/ui/card'
import {
  Activity, AlertTriangle, CheckCircle2,
  ChevronRight, DollarSign, HelpCircle, Scale, Sparkles, Trash2, Users,
} from 'lucide-react'

type TabKey = 'tasks' | 'vendors' | 'budget' | 'timeline' | 'decisions'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'tasks',     label: 'Tasks'     },
  { key: 'vendors',   label: 'Vendors'   },
  { key: 'budget',    label: 'Budget'    },
  { key: 'timeline',  label: 'Timeline'  },
  { key: 'decisions', label: 'Decisions' },
]

interface NeedsAttentionItem {
  id: string
  title: string
  badge: string
  context: string | null
  href: string
  tone: 'review' | 'risk' | 'question' | 'task' | 'timeline' | 'decision'
}

interface ReadinessStatus {
  title: 'Review pending' | 'Needs attention' | 'On track'
  detail: string
  tone: 'review' | 'attention' | 'track'
  href: string | null
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function priorityDot(priority: Task['priority']) {
  if (priority === 'high')   return 'bg-rose-500'
  if (priority === 'medium') return 'bg-amber-400'
  return 'bg-slate-300'
}

function priorityLabel(priority: Task['priority']) {
  if (priority === 'high') return 'High'
  if (priority === 'medium') return 'Medium'
  return 'Low'
}

function vendorDot(status: Vendor['status']) {
  if (status === 'confirmed') return 'bg-emerald-500'
  if (status === 'declined')  return 'bg-rose-400'
  if (status === 'contacted') return 'bg-sky-400'
  return 'bg-slate-300'
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
): ReadinessStatus {
  if (pendingUpdates.length > 0) {
    return {
      title: 'Review pending',
      detail: `${plural(pendingUpdates.length, 'suggestion')} ${pendingUpdates.length === 1 ? 'is' : 'are'} waiting`,
      tone: 'review',
      href: `/events/${eventId}/chat`,
    }
  }

  const highRiskCount = openRisks.filter((risk) => risk.severity === 'high').length
  const overdueTaskCount = openTasks.filter((task) => isOverdue(task.due_date)).length
  const highPriorityTaskCount = openTasks.filter((task) => task.priority === 'high' && !isOverdue(task.due_date)).length
  const parts = [
    highRiskCount > 0 ? plural(highRiskCount, 'high risk') : null,
    openQuestions.length > 0 ? plural(openQuestions.length, 'question') : null,
    overdueTaskCount > 0 ? plural(overdueTaskCount, 'overdue task') : null,
    highPriorityTaskCount > 0 ? plural(highPriorityTaskCount, 'high-priority task') : null,
    pendingDecisions.length > 0 ? plural(pendingDecisions.length, 'decision') : null,
  ].filter((part): part is string => Boolean(part))

  if (parts.length > 0) {
    const href = highRiskCount > 0
      ? `/events/${eventId}/plan?tab=risks`
      : openQuestions.length > 0
        ? `/events/${eventId}/plan?tab=open-questions`
        : overdueTaskCount > 0 || highPriorityTaskCount > 0
          ? `/events/${eventId}/plan?tab=tasks`
          : `/events/${eventId}/plan?tab=decisions`

    return {
      title: 'Needs attention',
      detail: `${joinParts(parts)} ${parts.length === 1 ? 'needs' : 'need'} review`,
      tone: 'attention',
      href,
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
    items.push({
      id: 'pending-updates',
      title: `Review ${plural(pendingUpdates.length, 'suggestion')}`,
      badge: 'Review suggestions',
      context: 'Approve or dismiss new plan updates.',
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
      href: `/events/${eventId}/plan?tab=risks`,
      tone: 'risk',
    })
  }

  for (const question of openQuestions) {
    items.push({
      id: `question-${question.id}`,
      title: question.question,
      badge: 'Needs answer',
      context: null,
      href: `/events/${eventId}/plan?tab=open-questions`,
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
      href: `/events/${eventId}/plan?tab=tasks`,
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
      href: `/events/${eventId}/plan?tab=timeline`,
      tone: 'timeline',
    })
  }

  for (const decision of pendingDecisions) {
    items.push({
      id: `decision-${decision.id}`,
      title: `Decide: ${decision.title}`,
      badge: 'Decide',
      context: snippet(decision.description),
      href: `/events/${eventId}/plan?tab=decisions`,
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
  if (tone === 'attention') return 'border-amber-200 bg-amber-50/60 text-amber-700'
  return 'border-emerald-200 bg-emerald-50/50 text-emerald-700'
}

function StatusIcon({ tone }: { tone: ReadinessStatus['tone'] }) {
  if (tone === 'track') return <CheckCircle2 className="h-4 w-4" />
  return <AlertTriangle className="h-4 w-4" />
}

const TIMELINE_COLORS: Record<TimelineItem['type'], string> = {
  deadline:  'bg-rose-100 text-rose-700',
  milestone: 'bg-indigo-100 text-indigo-700',
  planning:  'bg-amber-100 text-amber-700',
  task:      'bg-emerald-100 text-emerald-700',
}

function ViewAllLink({ href, count }: { href: string; count: number }) {
  if (count === 0) return null
  return (
    <div className="pt-2.5">
      <Link
        href={href}
        className="text-xs text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-0.5"
      >
        View all in Plan
        <ChevronRight className="h-3 w-3" />
      </Link>
    </div>
  )
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
  const [activeTab, setActiveTab] = useState<TabKey>('tasks')
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

  const readinessStatus = buildReadinessStatus(
    event.id,
    pendingUpdates,
    openRisks,
    openTasks,
    openQuestions,
    pendingDecisions,
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

  const tabCounts: Record<TabKey, number> = {
    tasks:     openTasks.length,
    vendors:   vendors.length,
    budget:    budgetItems.length,
    timeline:  upcomingTimeline.length,
    decisions: pendingDecisions.length,
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

              <div className="rounded-xl border bg-card shadow-[0px_1px_3px_rgba(0,0,0,0.05)] p-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Next best actions</p>
                </div>
                {nextBestActions.length > 0 ? (
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

            <div className="lg:col-span-3 rounded-xl border bg-card shadow-[0px_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">

              <div className="flex border-b bg-muted/30">
                {TABS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveTab(key)}
                    className={`flex-1 py-2.5 text-xs font-medium transition-colors relative whitespace-nowrap
                      ${activeTab === key
                        ? 'text-primary bg-background border-b-2 border-primary -mb-px'
                        : 'text-muted-foreground hover:text-foreground'
                      }`}
                  >
                    {label}
                    {tabCounts[key] > 0 && (
                      <span className={`ml-1 text-[10px] font-semibold
                        ${activeTab === key ? 'text-primary' : 'text-muted-foreground/60'}`}>
                        {tabCounts[key]}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="px-4 py-3 min-h-[180px]">

                {activeTab === 'tasks' && (
                  <>
                    {openTasks.length === 0
                      ? <p className="text-sm text-muted-foreground py-4 text-center">No open tasks — all clear.</p>
                      : openTasks.slice(0, 5).map((task) => {
                        const desc = snippet(task.description)
                        return (
                          <div key={task.id} className="py-2.5 border-b last:border-0">
                            <div className="flex items-center gap-3">
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${priorityDot(task.priority)}`} />
                              <span className="text-sm flex-1 min-w-0 truncate">{task.title}</span>
                              <span className="text-[10px] text-muted-foreground shrink-0">{priorityLabel(task.priority)}</span>
                              {task.due_date && (
                                <span className="text-xs text-muted-foreground shrink-0">{shortDate(task.due_date)}</span>
                              )}
                            </div>
                            {desc ? (
                              <p className="text-xs text-muted-foreground mt-1 pl-4 truncate">{desc}</p>
                            ) : null}
                          </div>
                        )
                      })
                    }
                    <ViewAllLink href={`/events/${event.id}/plan?tab=tasks`} count={openTasks.length} />
                  </>
                )}

                {activeTab === 'vendors' && (
                  <>
                    {vendors.length === 0
                      ? <p className="text-sm text-muted-foreground py-4 text-center">No vendors yet.</p>
                      : vendors.slice(0, 5).map((vendor) => {
                        const noteLine = snippet(vendor.notes)
                        return (
                          <div key={vendor.id} className="py-2.5 border-b last:border-0">
                            <div className="flex items-center gap-3">
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${vendorDot(vendor.status)}`} />
                              <span className="text-sm flex-1 min-w-0 truncate">{vendor.name}</span>
                              {vendor.category && (
                                <span className="text-xs text-muted-foreground shrink-0">{vendor.category}</span>
                              )}
                              <span className="text-xs text-muted-foreground capitalize shrink-0">{vendor.status}</span>
                            </div>
                            {vendor.contact_name ? (
                              <p className="text-xs text-muted-foreground mt-1 pl-4">Contact: {vendor.contact_name}</p>
                            ) : null}
                            {noteLine ? (
                              <p className="text-xs text-muted-foreground mt-0.5 pl-4 truncate">{noteLine}</p>
                            ) : null}
                          </div>
                        )
                      })
                    }
                    <ViewAllLink href={`/events/${event.id}/plan?tab=vendors`} count={vendors.length} />
                  </>
                )}

                {activeTab === 'budget' && (
                  <>
                    {(totalEstimated > 0 || unpricedBudgetCount > 0) && (
                      <div className="py-2 border-b mb-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                        <span className="text-xs text-muted-foreground">Total estimated:</span>
                        <span className="text-sm font-semibold">{formatCurrency(totalEstimated)}</span>
                        {unpricedBudgetCount > 0 && (
                          <span className="text-xs text-muted-foreground">
                            · {unpricedBudgetCount} unpriced item{unpricedBudgetCount !== 1 ? 's' : ''}
                          </span>
                        )}
                        {event.budget_target && (
                          <span className="text-xs text-muted-foreground">
                            of {formatCurrency(event.budget_target)}
                          </span>
                        )}
                      </div>
                    )}
                    {budgetItems.length === 0
                      ? <p className="text-sm text-muted-foreground py-4 text-center">No budget items yet.</p>
                      : budgetItems.slice(0, 5).map((item) => (
                        <div key={item.id} className="flex items-center gap-3 py-2.5 border-b last:border-0">
                          <span className="text-sm flex-1 min-w-0 truncate">
                            {item.description.replace(/\s*\(Vendor reference:[^)]+\)/, '')}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0">{item.category}</span>
                          <span className="text-xs font-medium shrink-0">
                            {item.estimated_cost !== null ? formatCurrency(item.estimated_cost) : 'Cost TBD'}
                          </span>
                        </div>
                      ))
                    }
                    <ViewAllLink href={`/events/${event.id}/plan?tab=budget`} count={budgetItems.length} />
                  </>
                )}

                {activeTab === 'timeline' && (
                  <>
                    {upcomingTimeline.length === 0
                      ? <p className="text-sm text-muted-foreground py-4 text-center">No upcoming milestones.</p>
                      : upcomingTimeline.slice(0, 5).map((item) => (
                        <div key={item.id} className="flex items-center gap-3 py-2.5 border-b last:border-0">
                          {item.starts_at && (
                            <span className="text-xs text-muted-foreground w-14 shrink-0">{shortDate(item.starts_at)}</span>
                          )}
                          <span className="text-sm flex-1 min-w-0 truncate">{item.title}</span>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${TIMELINE_COLORS[item.type]}`}>
                            {item.type}
                          </span>
                        </div>
                      ))
                    }
                    <ViewAllLink href={`/events/${event.id}/plan?tab=timeline`} count={upcomingTimeline.length} />
                  </>
                )}

                {activeTab === 'decisions' && (
                  <>
                    {pendingDecisions.length === 0
                      ? <p className="text-sm text-muted-foreground py-4 text-center">No pending decisions.</p>
                      : pendingDecisions.slice(0, 5).map((dec) => (
                        <div key={dec.id} className="flex items-start gap-3 py-2.5 border-b last:border-0">
                          <Scale className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground/50" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm truncate">{dec.title}</p>
                            {dec.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">{dec.description}</p>
                            )}
                          </div>
                        </div>
                      ))
                    }
                    <ViewAllLink href={`/events/${event.id}/plan?tab=decisions`} count={pendingDecisions.length} />
                  </>
                )}
              </div>
            </div>

          </div>

        </div>
      </div>

      <Link
        href={`/events/${event.id}/chat`}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
      >
        <Sparkles className="h-4 w-4" />
        Ask Glenn
      </Link>

    </div>
  )
}
