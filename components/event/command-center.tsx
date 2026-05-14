'use client'

import type { Event, Task, Vendor, Risk, ProposedUpdate } from '@/lib/types'
import { GlennInput } from './glenn-input'
import { EventBriefPanel } from './event-brief-panel'
import { ProposedUpdatesBadge } from './proposed-updates-badge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, CheckCircle2, DollarSign, Users } from 'lucide-react'

interface CommandCenterProps {
  event: Event
  openTasks: Task[]
  vendors: Vendor[]
  openRisks: Risk[]
  pendingUpdates: ProposedUpdate[]
  totalBudgetEstimated: number
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
  totalBudgetEstimated,
}: CommandCenterProps) {
  const confirmedVendors = vendors.filter((v) => v.status === 'confirmed')
  const vendorBlockers = vendors.filter((v) => v.status === 'prospecting' || v.status === 'contacted')

  return (
    <div className="flex flex-col h-full">
      {/* Header strip */}
      <div className="border-b px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-semibold leading-tight">{event.name}</h1>
          <div className="flex items-center gap-3 mt-1">
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
            <Badge variant="secondary" className="text-xs capitalize">
              {event.status}
            </Badge>
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">Open tasks</span>
                </div>
                <p className="text-2xl font-semibold">{openTasks.length}</p>
              </CardContent>
            </Card>

            <Card className="border">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Users className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">Vendors confirmed</span>
                </div>
                <p className="text-2xl font-semibold">
                  {confirmedVendors.length}
                  <span className="text-sm text-muted-foreground font-normal ml-1">/ {vendors.length}</span>
                </p>
              </CardContent>
            </Card>

            <Card className="border">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <DollarSign className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">Budget committed</span>
                </div>
                <p className="text-2xl font-semibold">{formatCurrency(totalBudgetEstimated)}</p>
                {event.budget_target && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    of {formatCurrency(event.budget_target)} target
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className={`border ${openRisks.length > 0 ? 'border-destructive/30' : ''}`}>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <AlertTriangle className={`h-3.5 w-3.5 ${openRisks.length > 0 ? 'text-destructive' : ''}`} />
                  <span className="text-xs font-medium">Open risks</span>
                </div>
                <p className={`text-2xl font-semibold ${openRisks.length > 0 ? 'text-destructive' : ''}`}>
                  {openRisks.length}
                </p>
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

        </div>
      </div>
    </div>
  )
}
