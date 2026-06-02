'use client'

import type { Event, Task, Vendor, Risk, ProposedUpdate, OpenQuestion, Decision, TimelineItem, ActivityLog } from '@/lib/types'
import { GlennInput } from './glenn-input'
import { EventBriefPanel } from './event-brief-panel'
import { ProposedUpdatesBadge } from './proposed-updates-badge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, Calendar, CheckCircle2, DollarSign, HelpCircle, Scale, Users, Activity } from 'lucide-react'

interface CommandCenterProps {
  event: Event
  openTasks: Task[]
  vendors: Vendor[]
  openRisks: Risk[]
  pendingUpdates: ProposedUpdate[]
  openQuestions: OpenQuestion[]
  pendingDecisions: Decision[]
  upcomingTimeline: TimelineItem[]
  totalBudgetEstimated: number
  recentActivity: ActivityLog[]
}

const ACTIVITY_LABELS: Record<string, string> = {
  proposed_updates_created: 'Glenn proposed updates',
  proposed_update_applied:  'Update applied',
  proposed_update_rejected: 'Update rejected',
}

function activityDot(action: string) {
  if (action === 'proposed_update_applied')  return 'bg-emerald-500'
  if (action === 'proposed_update_rejected') return 'bg-rose-400'
  return 'bg-indigo-400'
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

export function CommandCenter({
  event,
  openTasks,
  vendors,
  openRisks,
  pendingUpdates,
  openQuestions,
  pendingDecisions,
  upcomingTimeline,
  totalBudgetEstimated,
  recentActivity,
}: CommandCenterProps) {
  const confirmedVendors = vendors.filter((v) => v.status === 'confirmed')
  const vendorBlockers = vendors.filter((v) => v.status === 'prospect' || v.status === 'contacted')

  return (
    <div className="flex flex-col h-full">
      {/* Header strip */}
      <div className="border-b px-6 py-4 flex items-center justify-between shrink-0 bg-card/50">
        <div>
          <h1 className="text-base font-semibold leading-tight tracking-tight">{event.name}</h1>
          <div className="flex items-center gap-2.5 mt-1 flex-wrap">
            {event.event_date && (
              <span className="text-xs text-muted-foreground">
                {new Date(event.event_date).toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
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
              ${event.status === 'active' ? 'bg-emerald-50 text-emerald-700' :
                event.status === 'planning' ? 'bg-sky-50 text-sky-700' :
                event.status === 'completed' ? 'bg-slate-100 text-slate-600' :
                'bg-slate-100 text-slate-500'}`}>
              {event.status}
            </span>
          </div>
        </div>
        {pendingUpdates.length > 0 && (
          <ProposedUpdatesBadge count={pendingUpdates.length} eventId={event.id} />
        )}
      </div>

      {/* Main grid */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Glenn input — primary affordance */}
          <GlennInput eventId={event.id} />

          {/* Event brief */}
          <EventBriefPanel event={event} />

          {/* Stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Card className="border shadow-[0px_1px_3px_rgba(0,0,0,0.05)]">
              <CardContent className="pt-4 pb-3.5">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
                  <CheckCircle2 className="h-3 w-3" />
                  <span className="text-xs font-medium">Open tasks</span>
                </div>
                <p className="text-2xl font-semibold tracking-tight">{openTasks.length}</p>
              </CardContent>
            </Card>

            <Card className="border shadow-[0px_1px_3px_rgba(0,0,0,0.05)]">
              <CardContent className="pt-4 pb-3.5">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
                  <Users className="h-3 w-3" />
                  <span className="text-xs font-medium">Vendors</span>
                </div>
                <p className="text-2xl font-semibold tracking-tight">
                  {confirmedVendors.length}
                  <span className="text-sm text-muted-foreground font-normal ml-1">/ {vendors.length}</span>
                </p>
              </CardContent>
            </Card>

            <Card className="border shadow-[0px_1px_3px_rgba(0,0,0,0.05)]">
              <CardContent className="pt-4 pb-3.5">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
                  <DollarSign className="h-3 w-3" />
                  <span className="text-xs font-medium">Budget</span>
                </div>
                <p className="text-2xl font-semibold tracking-tight">{formatCurrency(totalBudgetEstimated)}</p>
                {event.budget_target && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    of {formatCurrency(event.budget_target)}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className={`border shadow-[0px_1px_3px_rgba(0,0,0,0.05)] ${openRisks.length > 0 ? 'border-rose-200 bg-rose-50/40' : ''}`}>
              <CardContent className="pt-4 pb-3.5">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
                  <AlertTriangle className={`h-3 w-3 ${openRisks.length > 0 ? 'text-rose-500' : ''}`} />
                  <span className="text-xs font-medium">Risks</span>
                </div>
                <p className={`text-2xl font-semibold tracking-tight ${openRisks.length > 0 ? 'text-rose-600' : ''}`}>
                  {openRisks.length}
                </p>
              </CardContent>
            </Card>

            <Card className="border shadow-[0px_1px_3px_rgba(0,0,0,0.05)]">
              <CardContent className="pt-4 pb-3.5">
                <div className="flex items-center gap-1.5 text-muted-foreground mb-2">
                  <HelpCircle className="h-3 w-3" />
                  <span className="text-xs font-medium">Questions</span>
                </div>
                <p className="text-2xl font-semibold tracking-tight">{openQuestions.length}</p>
              </CardContent>
            </Card>
          </div>

          {/* Urgent items */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Open tasks list */}
            <Card className="border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Urgent tasks</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {openTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No open tasks.</p>
                ) : (
                  openTasks.slice(0, 5).map((task) => (
                    <div key={task.id} className="flex items-start gap-2.5">
                      <div className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${
                        task.priority === 'high' ? 'bg-destructive' :
                        task.priority === 'medium' ? 'bg-yellow-500' : 'bg-muted-foreground'
                      }`} />
                      <div>
                        <p className="text-sm leading-snug">{task.title}</p>
                        {task.due_date && (
                          <p className="text-xs text-muted-foreground">
                            Due {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Vendor blockers */}
            <Card className="border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Vendor blockers</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {vendorBlockers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">All vendors confirmed.</p>
                ) : (
                  vendorBlockers.slice(0, 5).map((vendor) => (
                    <div key={vendor.id} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm">{vendor.name}</p>
                        {vendor.category && (
                          <p className="text-xs text-muted-foreground">{vendor.category}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs capitalize">
                        {vendor.status}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Open risks */}
          {openRisks.length > 0 && (
            <Card className="border border-destructive/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Open risks
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {openRisks.map((risk) => (
                  <div key={risk.id} className="flex items-start gap-2.5">
                    <Badge
                      variant={risk.severity === 'high' ? 'destructive' : 'secondary'}
                      className="text-xs capitalize shrink-0 mt-0.5"
                    >
                      {risk.severity}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium">{risk.title}</p>
                      {risk.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{risk.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Open questions */}
          {openQuestions.length > 0 && (
            <Card className="border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  Open questions
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {openQuestions.slice(0, 5).map((q) => (
                  <p key={q.id} className="text-sm text-muted-foreground leading-snug">
                    · {q.question}
                  </p>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Pending decisions + upcoming timeline in a 2-col grid */}
          {(pendingDecisions.length > 0 || upcomingTimeline.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {pendingDecisions.length > 0 && (
                <Card className="border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Scale className="h-4 w-4 text-muted-foreground" />
                      Unresolved decisions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    {pendingDecisions.slice(0, 4).map((d) => (
                      <div key={d.id}>
                        <p className="text-sm leading-snug">{d.title}</p>
                        {d.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{d.description}</p>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {upcomingTimeline.length > 0 && (
                <Card className="border">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      Upcoming
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    {upcomingTimeline.map((item) => (
                      <div key={item.id} className="flex items-start gap-2.5">
                        <Badge variant="outline" className="text-xs capitalize shrink-0 mt-0.5">
                          {item.type}
                        </Badge>
                        <div>
                          <p className="text-sm leading-snug">{item.title}</p>
                          {item.starts_at && (
                            <p className="text-xs text-muted-foreground">
                              {new Date(item.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Recent activity */}
          {recentActivity.length > 0 && (
            <Card className="border">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  Recent activity
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2.5">
                {recentActivity.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-2.5">
                    <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${activityDot(entry.action)}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug">
                        {ACTIVITY_LABELS[entry.action] ?? entry.action}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {timeAgo(entry.created_at)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </div>
  )
}
