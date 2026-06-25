'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Event, Task, Vendor, BudgetItem, Risk, ProposedUpdate, OpenQuestion, Decision, TimelineItem, ActivityLog } from '@/lib/types'
import { EventBriefPanel, type CommandCenterBrief, type EventBriefRow } from './event-brief-panel'
import { useReviewDrawer } from './review-companion'
import { activityDot, activityLabel, timeAgo } from '@/lib/activity'
import { Card, CardContent } from '@/components/ui/card'
import { formatEventDateTime } from '@/lib/utils'
import { parseTimelineDateValue } from '@/lib/timeline-format'
import { toast } from 'sonner'
import {
  Activity, AlertTriangle, CalendarDays, CheckCircle2,
  ChevronRight, DollarSign, HelpCircle, Loader2, MoreHorizontal, RefreshCw, Sparkles, Trash2, Users,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

const INTAKE_CHECKLIST = [
  ['Event basics', 'date/time, location, guest count'],
  ['Schedule', 'arrivals, setup, key moments, deadlines'],
  ['Vendors', 'venue, catering, AV, photography, rentals'],
  ['Budget', 'quotes, deposits, caps, unknown costs'],
  ['Open items', 'decisions, risks, questions'],
] as const

const EXAMPLE_PROMPTS = [
  'I only know the basics',
  'Add vendors and costs',
  'Build a run of show',
  'Track open questions',
  'Capture risks',
] as const

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

function shortDate(iso: string, timeZone?: string) {
  // Resolve to the event-zone calendar day (date-only values pass through), so the
  // displayed day never shifts with the viewer's browser timezone (D15).
  const parsed = parseTimelineDateValue(iso, timeZone)
  if (!parsed) return ''
  return parsed.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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
        href: `/events/${eventId}/plan?tab=open-items&highlight=${risk.id}`,
      })),
    ...openTasks
      .filter((task) => isOverdue(task.due_date))
      .map((task) => ({
        text: `${snippet(task.title, 48) ?? task.title} (overdue)`,
        href: `/events/${eventId}/plan?tab=tasks&highlight=${task.id}`,
      })),
    ...openQuestions.map((question) => ({
      text: snippet(question.question, 56) ?? question.question,
      href: `/events/${eventId}/plan?tab=open-items&highlight=${question.id}`,
    })),
    ...openTasks
      .filter((task) => task.priority === 'high' && !isOverdue(task.due_date))
      .map((task) => ({
        text: `${snippet(task.title, 48) ?? task.title} (high priority)`,
        href: `/events/${eventId}/plan?tab=tasks&highlight=${task.id}`,
      })),
    ...pendingDecisions.map((decision) => ({
      text: `Decide: ${snippet(decision.title, 44) ?? decision.title}`,
      href: `/events/${eventId}/plan?tab=open-items&highlight=${decision.id}`,
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
  openQuestions: OpenQuestion[],
  openRisks: Risk[],
  openTasks: Task[],
  upcomingTimeline: TimelineItem[],
  pendingDecisions: Decision[],
  timeZone?: string,
): NeedsAttentionItem[] {
  const items: NeedsAttentionItem[] = []

  for (const risk of openRisks.filter((r) => r.severity === 'high')) {
    items.push({
      id: `risk-${risk.id}`,
      title: risk.title,
      badge: 'Resolve risk',
      context: snippet(risk.mitigation) ?? snippet(risk.description),
      href: `/events/${eventId}/plan?tab=open-items&highlight=${risk.id}`,
      tone: 'risk',
    })
  }

  for (const question of openQuestions) {
    items.push({
      id: `question-${question.id}`,
      title: question.question,
      badge: 'Needs answer',
      context: null,
      href: `/events/${eventId}/plan?tab=open-items&highlight=${question.id}`,
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
      context: task.due_date ? `Due ${shortDate(task.due_date, timeZone)}` : snippet(task.description),
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
      context: item.starts_at ? shortDate(item.starts_at, timeZone) : snippet(item.description),
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
      href: `/events/${eventId}/plan?tab=open-items&highlight=${decision.id}`,
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

function actionDotClasses(tone: NeedsAttentionItem['tone']) {
  if (tone === 'review') return 'bg-indigo-500'
  if (tone === 'risk') return 'bg-rose-500'
  if (tone === 'question') return 'bg-amber-500'
  if (tone === 'task') return 'bg-sky-500'
  if (tone === 'timeline') return 'bg-emerald-500'
  return 'bg-slate-400'
}

/** The brief uses only **bold** Markdown — render that, leave the rest as plain text. */
function renderBriefText(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/)
    return bold
      ? <strong key={i} className="font-semibold text-foreground">{bold[1]}</strong>
      : <span key={i}>{part}</span>
  })
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
  const [isSummarizing, startSummarize] = useTransition()
  const router = useRouter()
  const { open: openReview } = useReviewDrawer()

  const confirmedVendors = vendors.filter((v) => v.status === 'confirmed')
  const totalEstimated = budgetItems.reduce((s, i) => s + (i.estimated_cost ?? 0), 0)
  const unpricedBudgetCount = budgetItems.filter((i) => i.estimated_cost === null).length

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
    openQuestions,
    openRisks,
    openTasks,
    upcomingTimeline,
    pendingDecisions,
    event.timezone ?? undefined,
  )
  const nextTimelineItem = upcomingTimeline[0]
  const eventDateLabel = formatEventDateTime(event.event_date, { year: false }, event.timezone ?? undefined)
  const highRisk = openRisks.find((risk) => risk.severity === 'high')
  const highPriorityTask = openTasks.find((task) => task.priority === 'high' || isOverdue(task.due_date))
  const confirmedParts = [
    confirmedVendors.length > 0 ? `${confirmedVendors.length} vendor${confirmedVendors.length !== 1 ? 's' : ''} confirmed` : null,
    event.attendee_target ? `${event.attendee_target} guests` : null,
    event.location,
  ].filter((part): part is string => typeof part === 'string' && part.length > 0)
  const budgetBriefValue = totalEstimated > 0 && event.budget_target !== null
    ? `${formatCurrency(totalEstimated)} of ${formatCurrency(event.budget_target)}`
    : totalEstimated > 0
      ? formatCurrency(totalEstimated)
      : event.budget_target !== null
        ? `${formatCurrency(event.budget_target)} target`
        : unpricedBudgetCount > 0
          ? `${unpricedBudgetCount} unpriced item${unpricedBudgetCount !== 1 ? 's' : ''}`
          : null

  const eventBriefRows: EventBriefRow[] = []
  if (nextTimelineItem) {
    eventBriefRows.push({
      label: 'Next',
      value: `${nextTimelineItem.title}${nextTimelineItem.starts_at ? ` · ${shortDate(nextTimelineItem.starts_at, event.timezone ?? undefined)}` : ''}`,
      href: `/events/${event.id}/plan?tab=timeline&highlight=${nextTimelineItem.id}`,
    })
  } else if (eventDateLabel) {
    eventBriefRows.push({
      label: 'Next',
      value: `Event date · ${eventDateLabel}`,
    })
  }
  if (confirmedParts.length > 0) {
    eventBriefRows.push({
      label: 'Confirmed',
      value: confirmedParts.join(' · '),
    })
  }
  if (highRisk) {
    eventBriefRows.push({
      label: 'Needs attention',
      value: `${snippet(highRisk.title, 58) ?? highRisk.title} · high risk`,
      href: `/events/${event.id}/plan?tab=open-items&highlight=${highRisk.id}`,
      tone: 'attention',
    })
  } else if (openQuestions.length > 0) {
    eventBriefRows.push({
      label: 'Needs attention',
      value: snippet(openQuestions[0].question, 64) ?? openQuestions[0].question,
      href: `/events/${event.id}/plan?tab=open-items&highlight=${openQuestions[0].id}`,
      tone: 'attention',
    })
  } else if (highPriorityTask) {
    eventBriefRows.push({
      label: 'Needs attention',
      value: snippet(highPriorityTask.title, 64) ?? highPriorityTask.title,
      href: `/events/${event.id}/plan?tab=tasks&highlight=${highPriorityTask.id}`,
      tone: 'attention',
    })
  } else if (pendingDecisions.length > 0) {
    eventBriefRows.push({
      label: 'Needs attention',
      value: `Decide: ${snippet(pendingDecisions[0].title, 54) ?? pendingDecisions[0].title}`,
      href: `/events/${event.id}/plan?tab=open-items&highlight=${pendingDecisions[0].id}`,
      tone: 'attention',
    })
  }
  if (budgetBriefValue) {
    eventBriefRows.push({
      label: 'Budget',
      value: budgetBriefValue,
      href: `/events/${event.id}/plan?tab=budget`,
    })
  }

  const eventBrief = {
    headline: (() => {
      const typeLabel = (event.event_type || 'Event').trim()
      const cap = typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1)
      const idParts = [
        event.attendee_target ? `for ${event.attendee_target} guests` : null,
        event.location ? `at ${event.location}` : null,
      ].filter(Boolean)
      return `${cap}${idParts.length ? ` ${idParts.join(' ')}` : ''}.`
    })(),
    status: (() => {
      const parts = [
        nextTimelineItem ? `Next: ${nextTimelineItem.title}${nextTimelineItem.starts_at ? ` (${shortDate(nextTimelineItem.starts_at, event.timezone ?? undefined)})` : ''}` : null,
        vendors.length > 0 ? `${confirmedVendors.length}/${vendors.length} vendors confirmed` : null,
        budgetBriefValue ? `budget ${budgetBriefValue}` : null,
        openRisks.length > 0 ? `${openRisks.length} open risk${openRisks.length !== 1 ? 's' : ''}` : null,
        openQuestions.length > 0 ? `${openQuestions.length} open question${openQuestions.length !== 1 ? 's' : ''}` : null,
      ].filter(Boolean)
      return parts.length > 0
        ? parts.join(' · ')
        : 'Tell Glenn what you know and this brief fills in as the plan takes shape.'
    })(),
  }

  const countdown = (() => {
    if (!event.event_date) return null
    // Resolve the event date to its event-zone calendar day (not the browser's), so
    // the day count doesn't drift by one for viewers in other timezones (D15).
    const target = parseTimelineDateValue(event.event_date, event.timezone ?? undefined)?.date
    if (!target) return null
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const day = new Date(target); day.setHours(0, 0, 0, 0)
    const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000)
    if (diff > 0) return { phrase: `in ${diff} ${diff === 1 ? 'day' : 'days'}`, soon: diff <= 7, past: false }
    if (diff === 0) return { phrase: 'Today', soon: true, past: false }
    return { phrase: `${-diff} ${-diff === 1 ? 'day' : 'days'} ago`, soon: false, past: true }
  })()

  const budgetTarget = event.budget_target
  const vendorProgress = vendors.length > 0 ? confirmedVendors.length / vendors.length : null
  const budgetProgress = budgetTarget !== null && budgetTarget > 0 ? Math.min(totalEstimated / budgetTarget, 1) : null
  const budgetOver = budgetTarget !== null && budgetTarget > 0 && totalEstimated > budgetTarget

  function regenerateSummary() {
    startSummarize(async () => {
      try {
        const res = await fetch(`/api/events/${event.id}/summary`, { method: 'POST' })
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          toast.error(body?.error ?? 'Could not generate the brief. Try again.')
          return
        }
        router.refresh()
      } catch {
        toast.error('Could not reach Glenn. Try again.')
      }
    })
  }

  function handleDeleteEvent() {
    if (!window.confirm(`Delete "${event.name}"? This cannot be undone — all tasks, vendors, budget, and chat history will be permanently removed.`)) return
    startDelete(async () => {
      await fetch(`/api/events/${event.id}`, { method: 'DELETE' })
      router.push('/dashboard')
    })
  }

  return (
    <div className="flex flex-col h-full">

      <div className="border-b px-6 py-4 flex flex-wrap items-center justify-between gap-y-2 shrink-0 bg-card/50">
        <div>
          <h1 className="text-base font-semibold leading-tight tracking-tight">{event.name}</h1>
          <div className="flex items-center gap-2.5 mt-1 flex-wrap">
            {event.event_date && (
              <span className="text-xs text-muted-foreground">
                {formatEventDateTime(event.event_date, { weekday: true }, event.timezone ?? undefined)}
              </span>
            )}
            {countdown && (
              <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
                countdown.past ? 'bg-muted text-muted-foreground' : countdown.soon ? 'bg-amber-50 text-amber-700' : 'bg-primary/10 text-primary'}`}>
                {countdown.phrase}
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
          {!planIsEmpty && (
            <Link
              href={`/events/${event.id}/chat`}
              className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-[0px_0px_0px_1px_rgba(255,255,255,0.12)_inset] transition-colors hover:bg-primary/90"
            >
              <span className="sm:hidden">Tell Glenn</span>
              <span className="hidden sm:inline">Tell Glenn what changed</span>
              <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Event options"
              className="flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end">
              <DropdownMenuItem variant="destructive" disabled={isDeleting} onClick={handleDeleteEvent}>
                <Trash2 />
                Delete event
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {planIsEmpty ? (
          <div className="max-w-4xl mx-auto space-y-5">
            <div className="rounded-xl border bg-card shadow-[0px_1px_3px_rgba(0,0,0,0.05)] p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-1.5 text-primary">
                    <Sparkles className="h-4 w-4" />
                    <p className="text-xs font-semibold uppercase tracking-widest">Start here</p>
                  </div>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight">Build the first plan update</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    Overview will become useful once Glenn has a few details to propose. Capture the messy notes in Ask Glenn, then review what should enter the plan.
                  </p>
                </div>
              </div>

              <Link
                href={`/events/${event.id}/chat`}
                className="mt-5 inline-flex items-center justify-center rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-[0px_0px_0px_1px_rgba(255,255,255,0.12)_inset] transition-colors hover:bg-primary/90"
              >
                Tell Glenn what you know
                <ChevronRight className="ml-1.5 h-4 w-4" />
              </Link>
            </div>

            <div className="grid gap-5 lg:grid-cols-5">
              <div className="lg:col-span-3 rounded-xl border bg-card shadow-[0px_1px_3px_rgba(0,0,0,0.05)] p-4">
                <div className="flex items-center gap-1.5 mb-3">
                  <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Intake checklist</p>
                </div>
                <ul className="grid gap-2.5 sm:grid-cols-2">
                  {INTAKE_CHECKLIST.map(([title, hint]) => (
                    <li key={title} className="rounded-lg border bg-muted/20 px-3 py-2.5">
                      <p className="text-sm font-medium leading-tight">{title}</p>
                      <p className="mt-1 text-xs leading-snug text-muted-foreground">{hint}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="lg:col-span-2 space-y-4">
                <div className="rounded-xl border bg-primary/[0.03] shadow-[0px_1px_3px_rgba(0,0,0,0.05)] p-4">
                  <div className="flex items-start gap-2">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <div>
                      <p className="text-sm font-semibold">Review before save</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Glenn proposes updates first. You approve what becomes part of the plan.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border bg-card shadow-[0px_1px_3px_rgba(0,0,0,0.05)] p-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Things you can tell Glenn</p>
                  <ul className="mt-2.5 space-y-1.5">
                    {EXAMPLE_PROMPTS.map((prompt) => (
                      <li key={prompt} className="text-xs leading-snug text-muted-foreground">&ldquo;{prompt}&rdquo;</li>
                    ))}
                  </ul>
                </div>

                <EventBriefPanel
                  event={event}
                  commandCenterBrief={commandCenterBrief}
                  eventId={event.id}
                  rows={eventBriefRows}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto space-y-5">
            {/* Event brief — Glenn's read on what this event is + how it's tracking */}
            <div className="rounded-xl border bg-card shadow-[0px_1px_3px_rgba(0,0,0,0.05)] p-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-semibold uppercase tracking-widest">Brief</span>
                </div>
                <button
                  type="button"
                  onClick={regenerateSummary}
                  disabled={isSummarizing}
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
                >
                  {isSummarizing
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <RefreshCw className="h-3 w-3" />}
                  {isSummarizing ? 'Generating…' : event.ai_summary ? 'Refresh' : 'Generate'}
                </button>
              </div>
              {event.ai_summary ? (
                <>
                  <p className="text-sm leading-relaxed text-foreground">{renderBriefText(event.ai_summary)}</p>
                  {event.ai_summary_updated_at && (
                    <p className="mt-2 text-[11px] text-muted-foreground">Glenn · updated {timeAgo(event.ai_summary_updated_at)}</p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-base font-medium leading-snug tracking-tight text-foreground">{eventBrief.headline}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{eventBrief.status}</p>
                </>
              )}
            </div>

            {/* KPI tiles — at-a-glance health */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {([
                {
                  icon: CheckCircle2, label: 'Open tasks', sub: null,
                  value: String(openTasks.length),
                  href: `/events/${event.id}/plan?tab=tasks`, alert: false,
                  progress: null, barTone: null,
                },
                {
                  icon: Users, label: 'Vendors', sub: 'confirmed',
                  value: `${confirmedVendors.length}/${vendors.length}`,
                  href: `/events/${event.id}/plan?tab=vendors`, alert: false,
                  progress: vendorProgress, barTone: 'bg-emerald-500',
                },
                {
                  icon: DollarSign, label: 'Est. budget',
                  value: formatCurrency(totalEstimated),
                  sub: budgetTarget !== null
                    ? `of ${formatCurrency(budgetTarget)}`
                    : unpricedBudgetCount > 0
                      ? `${unpricedBudgetCount} unpriced`
                      : null,
                  href: `/events/${event.id}/plan?tab=budget`, alert: budgetOver,
                  progress: budgetProgress,
                  barTone: budgetOver ? 'bg-rose-500' : budgetProgress !== null && budgetProgress >= 0.9 ? 'bg-amber-500' : 'bg-emerald-500',
                },
                {
                  icon: AlertTriangle, label: 'Open risks', sub: null,
                  value: String(openRisks.length),
                  href: `/events/${event.id}/plan?tab=open-items`, alert: openRisks.length > 0,
                  progress: null, barTone: null,
                },
                {
                  icon: HelpCircle, label: 'Open questions', sub: null,
                  value: String(openQuestions.length),
                  href: `/events/${event.id}/plan?tab=open-items`, alert: false,
                  progress: null, barTone: null,
                },
              ] as const).map(({ icon: Icon, label, value, sub, href, alert, progress, barTone }) => (
                <Link key={label} href={href} className="group">
                  <Card className={`h-full border shadow-[0px_1px_3px_rgba(0,0,0,0.05)] transition-colors group-hover:border-primary/30
                    ${alert ? 'border-rose-200 bg-rose-50/40' : ''}`}>
                    <CardContent className="p-4">
                      <div className={`mb-2.5 inline-flex h-8 w-8 items-center justify-center rounded-lg
                        ${alert ? 'bg-rose-100 text-rose-600' : 'bg-primary/10 text-primary'}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <p className={`text-2xl font-semibold leading-none tracking-tight ${alert ? 'text-rose-600' : ''}`}>
                        {value}
                      </p>
                      <p className="mt-1.5 text-xs leading-snug text-muted-foreground">
                        {label}{sub ? <span className="text-muted-foreground/70"> · {sub}</span> : null}
                      </p>
                      {progress !== null && (
                        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div className={`h-full rounded-full ${barTone ?? 'bg-primary'}`} style={{ width: `${Math.round(progress * 100)}%` }} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Needs your attention — the single "what needs me" column */}
              <div className="lg:col-span-2">
                <div className="rounded-xl border bg-card shadow-[0px_1px_3px_rgba(0,0,0,0.05)] p-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Needs your attention</p>
                  </div>
                  {nextBestActions.length > 0 ? (
                    <div className="space-y-1">
                      {nextBestActions.map((item) => (
                        <Link
                          key={item.id}
                          href={item.href}
                          className="group flex items-start gap-3 rounded-lg border border-transparent px-2.5 py-2.5 hover:border-border hover:bg-muted/30 transition-colors"
                        >
                          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${actionDotClasses(item.tone)}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${actionBadgeClasses(item.tone)}`}>
                                {item.badge}
                              </span>
                              <span className="text-sm font-medium leading-snug text-foreground group-hover:text-primary">
                                {item.title}
                              </span>
                            </div>
                            {item.context ? (
                              <p className="text-xs text-muted-foreground mt-1 leading-snug line-clamp-2">
                                {item.context}
                              </p>
                            ) : null}
                          </div>
                          <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/40 group-hover:text-primary" />
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 rounded-lg bg-muted/30 px-4 py-10 text-center">
                      <CheckCircle2 className="h-7 w-7 text-emerald-500/70" />
                      <p className="text-sm font-medium">You&rsquo;re on track</p>
                      <p className="text-xs text-muted-foreground">No urgent blockers. Keep the plan current as details change.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Side rail: review · run of show · recent */}
              <div className="lg:col-span-1 space-y-4">
                {readinessStatus.tone === 'review' && (
                  <button
                    type="button"
                    onClick={openReview}
                    className={`w-full text-left rounded-xl border p-4 shadow-[0px_1px_3px_rgba(0,0,0,0.05)] transition-opacity hover:opacity-90 ${statusClasses('review')}`}
                  >
                    <div className="flex items-center gap-2">
                      <StatusIcon tone="review" />
                      <p className="text-sm font-semibold leading-tight">{readinessStatus.title}</p>
                    </div>
                    <p className="mt-1 text-sm text-foreground/70">{readinessStatus.detail}</p>
                    <span className="mt-2 inline-flex items-center gap-0.5 text-xs font-medium text-foreground/70">
                      Review
                      <ChevronRight className="h-3 w-3" />
                    </span>
                  </button>
                )}

                <div className="rounded-xl border bg-card shadow-[0px_1px_3px_rgba(0,0,0,0.05)] p-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Run of show</p>
                  </div>
                  {upcomingTimeline.length > 0 ? (
                    <ol className="relative ml-1 space-y-3.5 border-l border-border pl-4">
                      {upcomingTimeline.slice(0, 5).map((item) => (
                        <li key={item.id} className="relative">
                          <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-primary/50 ring-2 ring-card" />
                          <Link
                            href={`/events/${event.id}/plan?tab=timeline&highlight=${item.id}`}
                            className="group block"
                          >
                            <p className="text-xs font-medium leading-snug text-foreground group-hover:text-primary">{item.title}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {item.starts_at ? shortDate(item.starts_at, event.timezone ?? undefined) : snippet(item.description) ?? 'Timing TBD'}
                            </p>
                          </Link>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-xs text-muted-foreground">No upcoming items yet. Add schedule notes in Ask Glenn.</p>
                  )}
                  <Link
                    href={`/events/${event.id}/plan?tab=timeline`}
                    className="text-xs text-muted-foreground hover:text-foreground mt-3 inline-block transition-colors"
                  >
                    View run of show →
                  </Link>
                </div>

                <div className="rounded-xl border bg-card shadow-[0px_1px_3px_rgba(0,0,0,0.05)] p-4">
                  <div className="flex items-center gap-1.5 mb-3">
                    <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent</p>
                  </div>
                  {recentActivity.length > 0 ? (
                    <div className="space-y-2.5">
                      {recentActivity.slice(0, 4).map((entry) => (
                        <div key={entry.id} className="flex items-start gap-2">
                          <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${activityDot(entry.action)}`} />
                          <span className="text-xs text-muted-foreground flex-1 leading-snug min-w-0">
                            {activityLabel(entry)}
                          </span>
                          <span className="text-[11px] text-muted-foreground/60 shrink-0">{timeAgo(entry.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs leading-relaxed text-muted-foreground">No recent activity yet.</p>
                  )}
                  <Link
                    href={`/events/${event.id}/activity`}
                    className="text-xs text-muted-foreground hover:text-foreground mt-3 inline-block transition-colors"
                  >
                    View all activity →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
