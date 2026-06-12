import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { Task, Vendor, BudgetItem, TimelineItem, Decision, Risk, OpenQuestion, Event } from '@/lib/types'
import { CheckCircle2, Users, DollarSign, Calendar, Scale, AlertTriangle, HelpCircle } from 'lucide-react'
import { TaskRowActions } from '@/components/event/task-row-actions'
import { TaskAssignButton, type EventMember } from '@/components/event/task-assign-button'
import { VendorStatusButton } from '@/components/event/vendor-status-button'
import { BudgetStatusButton } from '@/components/event/budget-status-button'
import { RiskStatusButton } from '@/components/event/risk-status-button'
import { DecisionResolveButton } from '@/components/event/decision-resolve-button'
import { OpenQuestionResolveButton } from '@/components/event/open-question-resolve-button'
import { AiSourceBadge } from '@/components/event/ai-source-badge'
import { RecordEditButton } from '@/components/event/record-edit-button'
import { ScrollToHighlight } from '@/components/event/scroll-to-highlight'
import { TimelineCalendar } from '@/components/event/timeline-calendar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatTimelineDateTime } from '@/lib/timeline-format'

interface PageProps {
  params: Promise<{ eventId: string }>
  searchParams: Promise<{ tab?: string; filter?: string; highlight?: string }>
}

const TABS = [
  { key: 'tasks',          label: 'Tasks',     icon: CheckCircle2 },
  { key: 'vendors',        label: 'Vendors',   icon: Users },
  { key: 'budget',         label: 'Budget',    icon: DollarSign },
  { key: 'timeline',       label: 'Timeline',  icon: Calendar },
  { key: 'decisions',      label: 'Decisions', icon: Scale },
  { key: 'risks',          label: 'Risks',     icon: AlertTriangle },
  { key: 'open-questions', label: 'Questions', icon: HelpCircle },
]

function fmt(n: number | null) {
  if (n === null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

const TYPE_COLORS: Record<TimelineItem['type'], string> = {
  deadline:  'bg-rose-100 text-rose-700',
  milestone: 'bg-indigo-100 text-indigo-700',
  planning:  'bg-amber-100 text-amber-700',
  task:      'bg-emerald-100 text-emerald-700',
}

export default async function PlanPage({ params, searchParams }: PageProps) {
  const { eventId } = await params
  const { tab: rawTab, filter, highlight } = await searchParams
  const normalizedTab = rawTab === 'questions' ? 'open-questions' : rawTab
  const tab = TABS.some((t) => t.key === normalizedTab) ? normalizedTab! : 'tasks'

  const highlightClasses = (id: string) =>
    highlight === id
      ? 'scroll-mt-24 ring-4 ring-primary/70 bg-amber-50 shadow-[0_0_0_6px_rgba(245,158,11,0.20),0_10px_24px_rgba(15,23,42,0.10)]'
      : ''

  const supabase = await createClient()
  const { data: event } = await supabase.from('events').select('*').eq('id', eventId).single()
  if (!event) notFound()
  const ev = event as Event

  // ── Fetch only the active tab's data ────────────────────────────────────────

  let tasks: Task[] = []
  let eventMembers: EventMember[] = []
  let vendors: Vendor[] = []
  let budgetItems: BudgetItem[] = []
  let timelineItems: TimelineItem[] = []
  let decisions: Decision[] = []
  let risks: Risk[] = []
  let openQuestions: OpenQuestion[] = []

  if (tab === 'tasks') {
    const statusFilter = filter === 'done' ? 'done' : filter === 'all' ? undefined : 'todo'
    const [{ data: t }, { data: m }] = await Promise.all([
      (() => {
        const q = supabase.from('tasks').select('*').eq('event_id', eventId).order('created_at')
        return statusFilter ? q.eq('status', statusFilter) : q
      })(),
      supabase.from('event_members').select('user_id, profiles(full_name, avatar_url)').eq('event_id', eventId),
    ])
    tasks = (t ?? []) as Task[]
    eventMembers = (m ?? []).map((mem) => {
      const profile = Array.isArray(mem.profiles) ? mem.profiles[0] : mem.profiles
      return {
        user_id: mem.user_id,
        full_name: (profile as { full_name?: string | null } | null)?.full_name ?? null,
        avatar_url: (profile as { avatar_url?: string | null } | null)?.avatar_url ?? null,
      }
    })
  } else if (tab === 'vendors') {
    const { data: v } = await supabase.from('vendors').select('*').eq('event_id', eventId).is('archived_at', null).order('created_at')
    vendors = (v ?? []) as Vendor[]
  } else if (tab === 'budget') {
    const { data: b } = await supabase.from('budget_items').select('*').eq('event_id', eventId).is('archived_at', null).order('created_at')
    budgetItems = (b ?? []) as BudgetItem[]
  } else if (tab === 'timeline') {
    const { data: tl } = await supabase.from('timeline_items').select('*').eq('event_id', eventId).is('archived_at', null).order('starts_at', { ascending: true })
    timelineItems = (tl ?? []) as TimelineItem[]
  } else if (tab === 'decisions') {
    const { data: d } = await supabase.from('decisions').select('*').eq('event_id', eventId).order('created_at')
    decisions = (d ?? []) as Decision[]
  } else if (tab === 'risks') {
    const { data: r } = await supabase.from('risks').select('*').eq('event_id', eventId).order('created_at')
    risks = (r ?? []) as Risk[]
  } else if (tab === 'open-questions') {
    const { data: q } = await supabase.from('open_questions').select('*').eq('event_id', eventId).order('created_at')
    openQuestions = (q ?? []) as OpenQuestion[]
  }

  const activeFilter = filter === 'done' ? 'done' : filter === 'all' ? 'all' : 'open'

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="border-b px-6 py-4 shrink-0">
        <h2 className="text-sm font-semibold">{ev.name}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Event plan</p>
      </div>

      {/* Tab bar */}
      <div className="border-b shrink-0 px-6">
        <div className="flex gap-0 overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon
            const isActive = tab === t.key
            return (
              <Link
                key={t.key}
                href={`?tab=${t.key}`}
                className={`flex items-center gap-1.5 px-3 py-3 text-sm border-b-2 whitespace-nowrap transition-colors ${
                  isActive
                    ? 'border-primary text-primary font-medium'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {t.label}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        <ScrollToHighlight targetId={highlight ? `record-${highlight}` : null} />
        <div className="p-6 max-w-3xl mx-auto space-y-5">

          {/* ── Tasks ─────────────────────────────────────────────────── */}
          {tab === 'tasks' && (
            <>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-1 rounded-lg border bg-muted/40 p-1 text-xs">
                  {(['open', 'done', 'all'] as const).map((f) => (
                    <Link
                      key={f}
                      href={f === 'open' ? `?tab=tasks` : `?tab=tasks&filter=${f}`}
                      className={`px-2.5 py-1 rounded-md capitalize transition-colors ${
                        activeFilter === f
                          ? 'bg-background shadow-sm font-medium'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {f}
                    </Link>
                  ))}
                </div>
              </div>
              {tasks.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed py-14 flex flex-col items-center gap-3 text-center">
                  <CheckCircle2 className="h-8 w-8 text-muted-foreground/25" />
                  <p className="text-sm text-muted-foreground">
                    {activeFilter === 'done' ? 'No completed tasks yet.' : 'No tasks yet. Tell Glenn what needs to get done.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {tasks.map((task) => (
                    <div key={task.id} id={`record-${task.id}`} className={`flex items-start gap-3 rounded-lg border bg-card p-3.5 shadow-[0px_1px_2px_rgba(0,0,0,0.04)] ${highlightClasses(task.id)}`}>
                      <TaskRowActions taskId={task.id} eventId={eventId} currentStatus={task.status} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`text-sm font-medium tracking-tight ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                            {task.title}
                          </p>
                          <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium capitalize
                            ${task.priority === 'high' ? 'bg-rose-50 text-rose-700' :
                              task.priority === 'medium' ? 'bg-amber-50 text-amber-700' :
                              'bg-slate-100 text-slate-500'}`}>
                            {task.priority}
                          </span>
                          {task.ai_generated && (
                            <AiSourceBadge eventId={eventId} recordType="task" recordId={task.id} />
                          )}
                        </div>
                        {task.description && <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>}
                        {task.due_date && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Due {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        )}
                      </div>
                      <RecordEditButton
                        eventId={eventId}
                        recordType="task"
                        recordId={task.id}
                        initial={{ title: task.title, description: task.description, due_date: task.due_date, priority: task.priority }}
                      />
                      <TaskAssignButton
                        taskId={task.id}
                        eventId={eventId}
                        currentOwnerId={task.owner_user_id}
                        members={eventMembers}
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Vendors ───────────────────────────────────────────────── */}
          {tab === 'vendors' && (
            <>
              <p className="text-sm text-muted-foreground">{vendors.length} vendor{vendors.length !== 1 ? 's' : ''}</p>
              {vendors.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed py-14 flex flex-col items-center gap-3 text-center">
                  <Users className="h-8 w-8 text-muted-foreground/25" />
                  <p className="text-sm text-muted-foreground">No vendors yet. Tell Glenn about your vendors.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {vendors.map((vendor) => (
                    <Card key={vendor.id} id={`record-${vendor.id}`} className={`border shadow-[0px_1px_3px_rgba(0,0,0,0.05)] ${highlightClasses(vendor.id)}`}>
                      <CardContent className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold tracking-tight">{vendor.name}</p>
                            {vendor.category && <p className="text-xs text-muted-foreground">{vendor.category}</p>}
                          </div>
                          <div className="flex items-center gap-1">
                            <RecordEditButton
                              eventId={eventId}
                              recordType="vendor"
                              recordId={vendor.id}
                              initial={{ name: vendor.name, category: vendor.category, contact_name: vendor.contact_name, email: vendor.email, phone: vendor.phone, estimated_cost: vendor.estimated_cost, notes: vendor.notes }}
                            />
                            <VendorStatusButton vendorId={vendor.id} eventId={eventId} currentStatus={vendor.status} />
                          </div>
                        </div>
                        {vendor.estimated_cost && (
                          <p className="text-xs text-muted-foreground">Est. {fmt(vendor.estimated_cost)}</p>
                        )}
                        {vendor.notes && <p className="text-xs text-muted-foreground line-clamp-2">{vendor.notes}</p>}
                        {vendor.ai_generated && (
                          <AiSourceBadge eventId={eventId} recordType="vendor" recordId={vendor.id} />
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Budget ────────────────────────────────────────────────── */}
          {tab === 'budget' && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{budgetItems.length} line item{budgetItems.length !== 1 ? 's' : ''}</p>
                {ev.budget_target && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Target</p>
                    <p className="text-base font-semibold tracking-tight">{fmt(ev.budget_target)}</p>
                  </div>
                )}
              </div>
              {budgetItems.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed py-14 text-center">
                  <p className="text-sm text-muted-foreground">No budget items yet. Tell Glenn about your costs.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border bg-card p-4 shadow-[0px_1px_3px_rgba(0,0,0,0.05)]">
                      <p className="text-xs text-muted-foreground">Total estimated</p>
                      <p className="text-xl font-semibold mt-1 tracking-tight">
                        {fmt(budgetItems.reduce((s, i) => s + (i.estimated_cost ?? 0), 0))}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-card p-4 shadow-[0px_1px_3px_rgba(0,0,0,0.05)]">
                      <p className="text-xs text-muted-foreground">Total actual</p>
                      <p className="text-xl font-semibold mt-1 tracking-tight">
                        {fmt(budgetItems.reduce((s, i) => s + (i.actual_cost ?? 0), 0))}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg border overflow-x-auto shadow-[0px_1px_3px_rgba(0,0,0,0.05)]">
                    <table className="w-full min-w-[540px] text-sm">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Item</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category</th>
                          <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Estimated</th>
                          <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actual</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {budgetItems.map((item) => (
                          <tr key={item.id} id={`record-${item.id}`} className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${highlightClasses(item.id)}`}>
                            <td className="px-4 py-3">
                              <p className="font-medium tracking-tight">{item.description.replace(/\s*\(Vendor reference:[^)]+\)/, '')}</p>
                              {item.ai_generated && (
                                <div className="mt-0.5">
                                  <AiSourceBadge eventId={eventId} recordType="budget_item" recordId={item.id} />
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-xs">{item.category}</td>
                            <td className="px-4 py-3 text-right font-medium">{fmt(item.estimated_cost)}</td>
                            <td className="px-4 py-3 text-right text-muted-foreground">{fmt(item.actual_cost)}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <BudgetStatusButton itemId={item.id} eventId={eventId} currentStatus={item.status} />
                                <RecordEditButton
                                  eventId={eventId}
                                  recordType="budget_item"
                                  recordId={item.id}
                                  initial={{ description: item.description, category: item.category, estimated_cost: item.estimated_cost, actual_cost: item.actual_cost }}
                                />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── Timeline ──────────────────────────────────────────────── */}
          {tab === 'timeline' && (
            <>
              <p className="text-sm text-muted-foreground">{timelineItems.length} item{timelineItems.length !== 1 ? 's' : ''}</p>
              {timelineItems.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed py-14 flex flex-col items-center gap-3 text-center">
                  <Calendar className="h-8 w-8 text-muted-foreground/25" />
                  <p className="text-sm text-muted-foreground">No timeline items yet. Tell Glenn about key dates and milestones.</p>
                </div>
              ) : (
                <>
                  <TimelineCalendar items={timelineItems} eventId={eventId} />
                  <div className="relative space-y-2.5 pl-6">
                  <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
                  {timelineItems.map((item) => {
                    const timelineWhen = formatTimelineDateTime(item.starts_at, item.ends_at, ev.location)
                    return (
                      <div key={item.id} id={`record-${item.id}`} className="relative">
                        <div className="absolute -left-4 mt-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
                        <div className={`rounded-lg border bg-card p-3.5 shadow-[0px_1px_2px_rgba(0,0,0,0.04)] ${highlightClasses(item.id)}`}>
                          <div className="flex items-start gap-2">
                            <div className="flex-1">
                              <p className="text-sm font-medium tracking-tight">{item.title}</p>
                              {timelineWhen && (
                                <div className="flex items-center gap-1.5 mt-1 text-xs font-medium text-muted-foreground">
                                  <Calendar className="h-3 w-3" />
                                  {timelineWhen}
                                </div>
                              )}
                              {item.description && <p className="text-xs text-muted-foreground mt-1">{item.description}</p>}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${TYPE_COLORS[item.type]}`}>
                                {item.type}
                              </span>
                              <RecordEditButton
                                eventId={eventId}
                                recordType="timeline_item"
                                recordId={item.id}
                                initial={{ title: item.title, description: item.description, starts_at: item.starts_at, ends_at: item.ends_at, type: item.type }}
                              />
                            </div>
                          </div>
                          {item.ai_generated && (
                            <div className="mt-1.5">
                              <AiSourceBadge eventId={eventId} recordType="timeline_item" recordId={item.id} />
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  </div>
                </>
              )}
            </>
          )}

          {/* ── Decisions ─────────────────────────────────────────────── */}
          {tab === 'decisions' && (
            <>
              <p className="text-sm text-muted-foreground">
                {decisions.filter((d) => d.status === 'pending').length} pending ·{' '}
                {decisions.filter((d) => d.status === 'decided').length} decided
              </p>
              {decisions.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed py-14 text-center">
                  <p className="text-sm text-muted-foreground">No decisions tracked yet. Tell Glenn about things that need a decision.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {decisions.map((dec) => (
                    <div key={dec.id} id={`record-${dec.id}`} className={`rounded-lg border bg-card p-3.5 space-y-1.5 shadow-[0px_1px_2px_rgba(0,0,0,0.04)] ${highlightClasses(dec.id)}`}>
                      <div className="flex items-start gap-2">
                        <p className="text-sm font-medium flex-1 tracking-tight">{dec.title}</p>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize
                            ${dec.status === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                            {dec.status}
                          </span>
                          <RecordEditButton
                            eventId={eventId}
                            recordType="decision"
                            recordId={dec.id}
                            initial={{ title: dec.title, description: dec.description, decision: dec.decision }}
                          />
                        </div>
                      </div>
                      {dec.description && <p className="text-xs text-muted-foreground">{dec.description}</p>}
                      {dec.decision && (
                        <div className="rounded-md bg-primary/[0.05] border border-primary/10 px-3 py-2">
                          <p className="text-xs font-medium text-primary">Decision: {dec.decision}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-2 flex-wrap">
                        {dec.ai_generated && (
                          <AiSourceBadge eventId={eventId} recordType="decision" recordId={dec.id} />
                        )}
                        {dec.status === 'pending' && (
                          <DecisionResolveButton decisionId={dec.id} eventId={eventId} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Risks ─────────────────────────────────────────────────── */}
          {tab === 'risks' && (
            <>
              <p className="text-sm text-muted-foreground">
                {risks.filter((r) => r.status === 'open').length} open risk{risks.filter((r) => r.status === 'open').length !== 1 ? 's' : ''}
              </p>
              {risks.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed py-14 flex flex-col items-center gap-3 text-center">
                  <AlertTriangle className="h-8 w-8 text-muted-foreground/25" />
                  <p className="text-sm text-muted-foreground">No risks tracked. Tell Glenn about anything that could go wrong.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {risks.map((risk) => (
                    <div key={risk.id} id={`record-${risk.id}`} className={`rounded-lg border bg-card p-3.5 space-y-1.5 shadow-[0px_1px_2px_rgba(0,0,0,0.04)]
                      ${risk.severity === 'high' && risk.status === 'open' ? 'border-l-[3px] border-l-rose-400' : ''} ${highlightClasses(risk.id)}`}>
                      <div className="flex items-start gap-2">
                        <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${risk.severity === 'high' ? 'text-rose-500' : 'text-muted-foreground/50'}`} />
                        <p className="text-sm font-medium flex-1 tracking-tight">{risk.title}</p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge
                            variant="outline"
                            className={`text-xs capitalize
                              ${risk.severity === 'high' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                risk.severity === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                'bg-slate-100 text-slate-600 border-slate-200'}`}
                          >
                            {risk.severity}
                          </Badge>
                          <RecordEditButton
                            eventId={eventId}
                            recordType="risk"
                            recordId={risk.id}
                            initial={{ title: risk.title, description: risk.description, severity: risk.severity, mitigation: risk.mitigation }}
                          />
                          <RiskStatusButton riskId={risk.id} eventId={eventId} currentStatus={risk.status} />
                        </div>
                      </div>
                      {risk.description && <p className="text-xs text-muted-foreground pl-6">{risk.description}</p>}
                      {risk.mitigation && (
                        <p className="text-xs text-muted-foreground pl-6">
                          <span className="font-medium text-foreground/70">Mitigation:</span> {risk.mitigation}
                        </p>
                      )}
                      {risk.ai_generated && (
                        <div className="pl-6">
                          <AiSourceBadge eventId={eventId} recordType="risk" recordId={risk.id} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Open Questions ────────────────────────────────────────── */}
          {tab === 'open-questions' && (
            <>
              <p className="text-sm text-muted-foreground">
                {openQuestions.filter((q) => q.status === 'open').length} open ·{' '}
                {openQuestions.filter((q) => q.status === 'answered').length} answered
              </p>
              {openQuestions.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed py-14 flex flex-col items-center gap-3 text-center">
                  <HelpCircle className="h-8 w-8 text-muted-foreground/25" />
                  <p className="text-sm text-muted-foreground">No open questions. Tell Glenn about things the team still needs to figure out.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {openQuestions.map((question) => (
                    <div
                      key={question.id}
                      id={`record-${question.id}`}
                      className={`rounded-lg border bg-card p-3.5 shadow-[0px_1px_2px_rgba(0,0,0,0.04)] space-y-2
                        ${question.status === 'answered' ? 'opacity-60' : ''} ${highlightClasses(question.id)}`}
                    >
                      <div className="flex items-start gap-2">
                        <HelpCircle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/50" />
                        <p className="text-sm flex-1 tracking-tight">{question.question}</p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {question.ai_generated && (
                            <AiSourceBadge eventId={eventId} recordType="open_question" recordId={question.id} />
                          )}
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize
                            ${question.status === 'open' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                            {question.status}
                          </span>
                          <RecordEditButton
                            eventId={eventId}
                            recordType="open_question"
                            recordId={question.id}
                            initial={{ question: question.question }}
                          />
                        </div>
                      </div>
                      {question.status === 'open' && (
                        <div className="pl-6">
                          <OpenQuestionResolveButton questionId={question.id} eventId={eventId} />
                        </div>
                      )}
                      {question.status === 'answered' && question.answer && (
                        <div className="pl-6">
                          <p className="text-xs text-muted-foreground italic">&ldquo;{question.answer}&rdquo;</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  )
}
