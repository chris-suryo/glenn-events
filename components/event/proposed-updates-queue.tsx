'use client'

import type { Dispatch, SetStateAction } from 'react'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type {
  AiRun,
  AiRunReviewOutput,
  BudgetItemPayload,
  DecisionPayload,
  OpenQuestionPayload,
  ProposedUpdate,
  RiskPayload,
  TaskPayload,
  TimelineItemPayload,
  UpdatePayload,
  UpdateType,
  VendorPayload,
} from '@/lib/types'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  CheckCircle2,
  Loader2,
  Pencil,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

interface ProposedUpdatesQueueProps {
  updates: ProposedUpdate[]
  aiRuns: AiRun[]
  eventId: string
}

type ReviewAction = 'approve' | 'reject'

interface UpdateGroup {
  type: UpdateType
  title: string
}

interface ReviewGroup {
  aiRunId: string
  aiRun: AiRun | null
  updates: ProposedUpdate[]
  understoodSummary: string[]
  createdAt: string
}

const UPDATE_GROUPS: UpdateGroup[] = [
  { type: 'task', title: 'Tasks' },
  { type: 'vendor', title: 'Vendors' },
  { type: 'budget_item', title: 'Budget' },
  { type: 'timeline_item', title: 'Timeline' },
  { type: 'decision', title: 'Decisions' },
  { type: 'risk', title: 'Risks' },
  { type: 'open_question', title: 'Open Questions' },
]

const TYPE_PILL_LABEL: Record<UpdateType, string> = {
  task:          'Task',
  vendor:        'Vendor',
  budget_item:   'Budget',
  timeline_item: 'Timeline',
  decision:      'Decision',
  risk:          'Risk',
  open_question: 'Question',
}

const TYPE_DESTINATION: Record<UpdateType, string> = {
  task:          'Tasks',
  vendor:        'Vendors',
  budget_item:   'Budget',
  timeline_item: 'Timeline',
  decision:      'Decisions',
  risk:          'Risks',
  open_question: 'Open Questions',
}

const TYPE_ACTION_LABEL: Record<UpdateType, string> = {
  task:          'Add task',
  vendor:        'Add vendor',
  budget_item:   'Add budget',
  timeline_item: 'Add timing',
  decision:      'Add decision',
  risk:          'Track risk',
  open_question: 'Track question',
}

const TYPE_COUNT_LABEL: Record<UpdateType, string> = {
  task:          'task',
  vendor:        'vendor',
  budget_item:   'budget',
  timeline_item: 'timeline',
  decision:      'decision',
  risk:          'risk',
  open_question: 'question',
}

const TYPE_PILL_CLASS: Record<UpdateType, string> = {
  task:          'border-sky-200 bg-sky-50 text-sky-700',
  vendor:        'border-violet-200 bg-violet-50 text-violet-700',
  budget_item:   'border-emerald-200 bg-emerald-50 text-emerald-700',
  timeline_item: 'border-amber-200 bg-amber-50 text-amber-800',
  decision:      'border-yellow-200 bg-yellow-50 text-yellow-800',
  risk:          'border-rose-200 bg-rose-50 text-rose-700',
  open_question: 'border-slate-200 bg-slate-50 text-slate-700',
}

function payloadRecord(payload: UpdatePayload): Record<string, unknown> {
  return payload as unknown as Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

function getUpdateName(update: ProposedUpdate, payload: UpdatePayload = update.payload_json): string {
  const p = payloadRecord(payload)
  return (
    (typeof p.title === 'string' && p.title) ||
    (typeof p.question === 'string' && p.question) ||
    (typeof p.name === 'string' && p.name) ||
    (typeof p.description === 'string' && p.description) ||
    'Untitled suggestion'
  )
}

function formatMoney(value: unknown): string | null {
  return typeof value === 'number' ? `$${value.toLocaleString()}` : null
}

function formatDate(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getUpdateDetail(update: ProposedUpdate, payload: UpdatePayload = update.payload_json): string | null {
  const p = payloadRecord(payload)
  switch (update.update_type) {
    case 'task':
      return p.due_date ? `Due ${formatDate(p.due_date) ?? String(p.due_date)}` : null
    case 'vendor': {
      const cost = formatMoney(p.estimated_cost)
      const status = typeof p.status === 'string' ? p.status : null
      return [status, cost].filter(Boolean).join(' · ') || null
    }
    case 'budget_item':
      return formatMoney(p.estimated_cost)
    case 'timeline_item':
      return p.starts_at ? formatDate(p.starts_at) ?? String(p.starts_at) : null
    case 'decision':
      return typeof p.status === 'string' ? p.status : null
    case 'risk':
      return typeof p.severity === 'string' ? `${p.severity} risk` : null
    case 'open_question':
      return typeof p.owner_name === 'string' && p.owner_name ? `For ${p.owner_name}` : null
  }
}

function getUpdateDescription(update: ProposedUpdate, payload: UpdatePayload = update.payload_json): string | null {
  const p = payloadRecord(payload)
  if (typeof p.description === 'string' && p.description) return p.description
  if (typeof p.notes === 'string' && p.notes) return p.notes
  if (typeof p.decision === 'string' && p.decision) return p.decision
  if (typeof p.mitigation === 'string' && p.mitigation) return p.mitigation
  if (update.update_type === 'open_question') return getUpdateName(update, payload)
  return null
}

function getOutputReview(aiRun: AiRun | null): Pick<AiRunReviewOutput, 'understood_summary'> {
  if (!aiRun || !isRecord(aiRun.output_json)) {
    return {}
  }

  return {
    understood_summary: stringArray(aiRun.output_json.understood_summary),
  }
}

function buildFallbackReview(updates: ProposedUpdate[]): { understoodSummary: string[] } {
  const touched = UPDATE_GROUPS
    .filter((group) => updates.some((update) => update.update_type === group.type))
    .map((group) => group.title)

  return {
    understoodSummary: touched.length > 0
      ? [`This note has plan changes touching ${touched.join(', ')}.`]
      : ['This note was reviewed for plan changes.'],
  }
}

function textValue(value: string | null): string {
  return value ?? ''
}

function nullableText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function nullableNumber(value: string): number | null {
  if (value.trim().length === 0) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

async function reviewUpdate(updateId: string, action: ReviewAction, payload?: UpdatePayload) {
  const init: RequestInit = { method: 'POST' }
  if (action === 'approve' && payload) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify({ payload_json: payload })
  }

  const res = await fetch(`/api/updates/${updateId}/${action}`, init)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? 'Failed to update')
  }
}

function orderByType(scopedUpdates: ProposedUpdate[]): ProposedUpdate[] {
  return UPDATE_GROUPS.flatMap((group) =>
    scopedUpdates.filter((update) => update.update_type === group.type)
  )
}

function buildReviewGroups(updates: ProposedUpdate[], aiRuns: AiRun[]): ReviewGroup[] {
  const aiRunMap = new Map(aiRuns.map((run) => [run.id, run]))
  const grouped = new Map<string, ProposedUpdate[]>()

  for (const update of updates) {
    const current = grouped.get(update.ai_run_id) ?? []
    current.push(update)
    grouped.set(update.ai_run_id, current)
  }

  return Array.from(grouped.entries())
    .map(([aiRunId, runUpdates]) => {
      const aiRun = aiRunMap.get(aiRunId) ?? null
      const outputReview = getOutputReview(aiRun)
      const fallbackReview = buildFallbackReview(runUpdates)
      return {
        aiRunId,
        aiRun,
        updates: runUpdates,
        understoodSummary: outputReview.understood_summary && outputReview.understood_summary.length > 0
          ? outputReview.understood_summary
          : fallbackReview.understoodSummary,
        createdAt: aiRun?.created_at ?? runUpdates[0]?.created_at ?? '',
      }
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

function buildCategorySummary(updates: ProposedUpdate[]): string {
  return UPDATE_GROUPS
    .map((group) => {
      const count = updates.filter((update) => update.update_type === group.type).length
      if (count === 0) return null
      const label = TYPE_COUNT_LABEL[group.type]
      return `${count} ${label}${count === 1 ? '' : 's'}`
    })
    .filter((part): part is string => part !== null)
    .join(' · ')
}

function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string
  label: string
  value: T
  options: T[]
  onChange: (value: T) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  )
}

function TextField({
  id,
  label,
  value,
  onChange,
  type = 'text',
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}

function NotesField({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      <Textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} className="min-h-20" />
    </div>
  )
}

function EditFields({
  update,
  payload,
  onChange,
}: {
  update: ProposedUpdate
  payload: UpdatePayload
  onChange: (payload: UpdatePayload) => void
}) {
  switch (update.update_type) {
    case 'task': {
      const p = payload as TaskPayload
      return (
        <div className="flex flex-col gap-3">
          <TextField id={`${update.id}-title`} label="Task title" value={p.title} onChange={(title) => onChange({ ...p, title })} />
          <NotesField id={`${update.id}-description`} label="Notes" value={textValue(p.description)} onChange={(description) => onChange({ ...p, description: nullableText(description) })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField id={`${update.id}-due`} label="Due date" type="date" value={textValue(p.due_date)} onChange={(due_date) => onChange({ ...p, due_date: nullableText(due_date) })} />
            <SelectField id={`${update.id}-priority`} label="Priority" value={p.priority} options={['low', 'medium', 'high']} onChange={(priority) => onChange({ ...p, priority })} />
          </div>
        </div>
      )
    }
    case 'vendor': {
      const p = payload as VendorPayload
      return (
        <div className="flex flex-col gap-3">
          <TextField id={`${update.id}-name`} label="Vendor name" value={p.name} onChange={(name) => onChange({ ...p, name })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField id={`${update.id}-category`} label="Category" value={textValue(p.category)} onChange={(category) => onChange({ ...p, category: nullableText(category) })} />
            <SelectField id={`${update.id}-status`} label="Status" value={p.status} options={['prospect', 'contacted', 'confirmed', 'declined']} onChange={(status) => onChange({ ...p, status })} />
          </div>
          <TextField id={`${update.id}-cost`} label="Estimated cost" type="number" value={p.estimated_cost?.toString() ?? ''} onChange={(estimated_cost) => onChange({ ...p, estimated_cost: nullableNumber(estimated_cost) })} />
          <NotesField id={`${update.id}-notes`} label="Notes" value={textValue(p.notes)} onChange={(notes) => onChange({ ...p, notes: nullableText(notes) })} />
        </div>
      )
    }
    case 'budget_item': {
      const p = payload as BudgetItemPayload
      return (
        <div className="flex flex-col gap-3">
          <TextField id={`${update.id}-category`} label="Budget category" value={p.category} onChange={(category) => onChange({ ...p, category })} />
          <NotesField id={`${update.id}-description`} label="Description" value={p.description} onChange={(description) => onChange({ ...p, description })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField id={`${update.id}-estimated`} label="Estimated cost" type="number" value={p.estimated_cost?.toString() ?? ''} onChange={(estimated_cost) => onChange({ ...p, estimated_cost: nullableNumber(estimated_cost) })} />
            <TextField id={`${update.id}-actual`} label="Actual cost" type="number" value={p.actual_cost?.toString() ?? ''} onChange={(actual_cost) => onChange({ ...p, actual_cost: nullableNumber(actual_cost) })} />
          </div>
          <SelectField id={`${update.id}-status`} label="Status" value={p.status} options={['estimated', 'committed', 'paid']} onChange={(status) => onChange({ ...p, status })} />
        </div>
      )
    }
    case 'timeline_item': {
      const p = payload as TimelineItemPayload
      return (
        <div className="flex flex-col gap-3">
          <TextField id={`${update.id}-title`} label="Timeline title" value={p.title} onChange={(title) => onChange({ ...p, title })} />
          <NotesField id={`${update.id}-description`} label="Description" value={textValue(p.description)} onChange={(description) => onChange({ ...p, description: nullableText(description) })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField id={`${update.id}-starts`} label="Starts" value={textValue(p.starts_at)} onChange={(starts_at) => onChange({ ...p, starts_at: nullableText(starts_at) })} />
            <TextField id={`${update.id}-ends`} label="Ends" value={textValue(p.ends_at)} onChange={(ends_at) => onChange({ ...p, ends_at: nullableText(ends_at) })} />
          </div>
          <SelectField id={`${update.id}-type`} label="Type" value={p.type} options={['milestone', 'task', 'deadline', 'planning']} onChange={(type) => onChange({ ...p, type })} />
        </div>
      )
    }
    case 'decision': {
      const p = payload as DecisionPayload
      return (
        <div className="flex flex-col gap-3">
          <TextField id={`${update.id}-title`} label="Decision title" value={p.title} onChange={(title) => onChange({ ...p, title })} />
          <NotesField id={`${update.id}-description`} label="Context" value={textValue(p.description)} onChange={(description) => onChange({ ...p, description: nullableText(description) })} />
          <SelectField id={`${update.id}-status`} label="Status" value={p.status} options={['pending', 'decided']} onChange={(status) => onChange({ ...p, status })} />
          <NotesField id={`${update.id}-decision`} label="Decision" value={textValue(p.decision)} onChange={(decision) => onChange({ ...p, decision: nullableText(decision) })} />
        </div>
      )
    }
    case 'risk': {
      const p = payload as RiskPayload
      return (
        <div className="flex flex-col gap-3">
          <TextField id={`${update.id}-title`} label="Risk title" value={p.title} onChange={(title) => onChange({ ...p, title })} />
          <NotesField id={`${update.id}-description`} label="Description" value={textValue(p.description)} onChange={(description) => onChange({ ...p, description: nullableText(description) })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField id={`${update.id}-severity`} label="Severity" value={p.severity} options={['low', 'medium', 'high']} onChange={(severity) => onChange({ ...p, severity })} />
            <SelectField id={`${update.id}-status`} label="Status" value={p.status} options={['open', 'monitoring', 'resolved']} onChange={(status) => onChange({ ...p, status })} />
          </div>
          <NotesField id={`${update.id}-mitigation`} label="Mitigation" value={textValue(p.mitigation)} onChange={(mitigation) => onChange({ ...p, mitigation: nullableText(mitigation) })} />
        </div>
      )
    }
    case 'open_question': {
      const p = payload as OpenQuestionPayload
      return (
        <div className="flex flex-col gap-3">
          <NotesField id={`${update.id}-question`} label="Question" value={p.question} onChange={(question) => onChange({ ...p, question })} />
          <TextField id={`${update.id}-owner`} label="Owner" value={textValue(p.owner_name)} onChange={(owner_name) => onChange({ ...p, owner_name: nullableText(owner_name) })} />
        </div>
      )
    }
  }
}

export function ProposedUpdatesQueue({ updates, aiRuns }: ProposedUpdatesQueueProps) {
  const router = useRouter()
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set())
  const [draftPayloads, setDraftPayloads] = useState<Record<string, UpdatePayload>>({})
  const [isPendingBulk, startBulkTransition] = useTransition()
  const reviewGroups = buildReviewGroups(updates, aiRuns)

  function toggleSetValue<T>(setter: Dispatch<SetStateAction<Set<T>>>, value: T) {
    setter((current) => {
      const next = new Set(current)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  function startEdit(update: ProposedUpdate) {
    setExpandedIds((current) => new Set(current).add(update.id))
    setEditingIds((current) => new Set(current).add(update.id))
    setDraftPayloads((current) => ({
      ...current,
      [update.id]: structuredClone(update.payload_json),
    }))
  }

  function cancelEdit(updateId: string) {
    setEditingIds((current) => {
      const next = new Set(current)
      next.delete(updateId)
      return next
    })
    setDraftPayloads((current) => {
      const next = { ...current }
      delete next[updateId]
      return next
    })
  }

  async function handleSingle(update: ProposedUpdate, action: ReviewAction, payload?: UpdatePayload) {
    setProcessingIds((current) => new Set(current).add(update.id))
    const name = getUpdateName(update, payload)
    const dest = TYPE_DESTINATION[update.update_type]
    try {
      await reviewUpdate(update.id, action, payload)
      if (action === 'approve') {
        toast.success(`Added to ${dest}: ${name}`)
      } else {
        toast.success('Dismissed. The plan is unchanged.')
      }
      cancelEdit(update.id)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setProcessingIds((current) => {
        const next = new Set(current)
        next.delete(update.id)
        return next
      })
    }
  }

  async function handleBulk(action: ReviewAction, scopedUpdates: ProposedUpdate[]) {
    startBulkTransition(async () => {
      const results = await Promise.allSettled(
        scopedUpdates.map((update) => reviewUpdate(update.id, action))
      )
      const failed = scopedUpdates.filter((_, index) => results[index].status === 'rejected')
      const appliedCount = scopedUpdates.length - failed.length
      const verb = action === 'approve' ? 'Applied' : 'Dismissed'

      if (failed.length === 0) {
        toast.success(
          action === 'approve'
            ? `Applied ${appliedCount} update${appliedCount !== 1 ? 's' : ''} to the event plan.`
            : `Dismissed ${appliedCount} update${appliedCount !== 1 ? 's' : ''}. The plan is unchanged.`
        )
      } else {
        const names = failed.slice(0, 2).map((update) => getUpdateName(update)).join(', ')
        const overflow = failed.length > 2 ? ` and ${failed.length - 2} more` : ''
        toast.error(`${verb} ${appliedCount} of ${scopedUpdates.length} · failed: ${names}${overflow}. The failed items are still pending.`)
      }
      router.refresh()
    })
  }

  if (updates.length === 0) {
    const hasHistory = aiRuns.some(r => r.status === 'completed')
    return hasHistory ? (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <CheckCircle2 className="size-7 text-emerald-500/60" />
        <p className="text-sm font-medium text-foreground">All caught up</p>
        <p className="max-w-[200px] text-xs text-muted-foreground">Everything has been reviewed. Tell Glenn what changed and new updates will appear here.</p>
      </div>
    ) : (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <Sparkles className="size-7 text-muted-foreground/25" />
        <p className="text-sm font-medium text-muted-foreground">Nothing to review yet</p>
        <p className="max-w-[200px] text-xs text-muted-foreground">Tell Glenn what changed and proposed updates will appear here for your review.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      {reviewGroups.map((reviewGroup) => {
        const questionsOnly = reviewGroup.updates.every((update) => update.update_type === 'open_question')
        const sourceSummary = reviewGroup.understoodSummary[0]
        const categorySummary = buildCategorySummary(reviewGroup.updates)
        return (
        <section key={reviewGroup.aiRunId} className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm">
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-5">
              {reviewGroup.updates.length} suggested update{reviewGroup.updates.length !== 1 ? 's' : ''}
            </p>
            {categorySummary ? (
              <p className="mt-0.5 text-xs font-medium text-muted-foreground">{categorySummary}</p>
            ) : null}
            {sourceSummary ? (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">
                {sourceSummary}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            {orderByType(reviewGroup.updates).map((update) => {
              const isProcessing = processingIds.has(update.id)
              const isExpanded = expandedIds.has(update.id)
              const isEditing = editingIds.has(update.id)
              const draftPayload = draftPayloads[update.id]
              const activePayload = draftPayload ?? update.payload_json
              const name = getUpdateName(update, activePayload)
              const detail = getUpdateDetail(update, activePayload)
              const description = getUpdateDescription(update, activePayload)
              const dest = TYPE_DESTINATION[update.update_type]

              return (
                <article key={update.id} className="rounded-lg border bg-card shadow-sm">
                  <div className="flex items-start gap-2 p-2">
                    <div className="flex min-w-0 flex-1 items-start gap-2">
                      <Badge
                        variant="outline"
                        className={cn('mt-0.5 h-5 shrink-0 rounded-md px-1.5 text-[11px]', TYPE_PILL_CLASS[update.update_type])}
                      >
                        {TYPE_PILL_LABEL[update.update_type]}
                      </Badge>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium leading-5">{name}</span>
                        {detail ? (
                          <span className="block text-[11px] leading-4 text-muted-foreground">{detail}</span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => toggleSetValue(setExpandedIds, update.id)}
                          aria-expanded={isExpanded}
                          className="mt-1 text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          {isExpanded ? 'Hide details' : 'Details/Edit'}
                        </button>
                      </span>
                    </div>
                    <Button
                      size="sm"
                      className="shrink-0"
                      disabled={isProcessing || isEditing}
                      onClick={() => handleSingle(update, 'approve')}
                    >
                      {isProcessing ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
                      {TYPE_ACTION_LABEL[update.update_type]}
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      className="shrink-0 text-muted-foreground"
                      aria-label="Dismiss"
                      disabled={isProcessing}
                      onClick={() => handleSingle(update, 'reject')}
                    >
                      <XCircle />
                    </Button>
                  </div>

                  {isExpanded ? (
                    <div className="flex flex-col gap-3 border-t px-2.5 pb-2.5 pt-3">
                      <div className="flex flex-col gap-2 text-xs">
                        {description ? (
                          <div className="flex flex-col gap-1">
                            <p className="font-medium text-foreground">Details</p>
                            <p className="leading-relaxed text-muted-foreground">{description}</p>
                          </div>
                        ) : null}
                        {update.rationale ? (
                          <div className="flex flex-col gap-1">
                            <p className="font-medium text-foreground">Why this was suggested</p>
                            <p className="leading-relaxed text-muted-foreground">{update.rationale}</p>
                          </div>
                        ) : null}
                        <p className="text-muted-foreground">This will go to {dest} when applied.</p>
                      </div>

                      {isEditing ? (
                        <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
                          <EditFields
                            update={update}
                            payload={activePayload}
                            onChange={(payload) => setDraftPayloads((current) => ({ ...current, [update.id]: payload }))}
                          />
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <Button
                              size="sm"
                              className="w-full"
                              disabled={isProcessing}
                              onClick={() => handleSingle(update, 'approve', activePayload)}
                            >
                              {isProcessing ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <CheckCircle2 data-icon="inline-start" />}
                              Save & Apply
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full"
                              disabled={isProcessing}
                              onClick={() => cancelEdit(update.id)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-fit"
                          disabled={isProcessing}
                          onClick={() => startEdit(update)}
                        >
                          <Pencil data-icon="inline-start" />
                          Edit
                        </Button>
                      )}
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>

          <div className="grid grid-cols-2 gap-2 border-t pt-3">
            <Button
              size="sm"
              variant="default"
              disabled={isPendingBulk}
              onClick={() => handleBulk('approve', reviewGroup.updates)}
              className="w-full"
            >
              {isPendingBulk ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <CheckCircle2 data-icon="inline-start" />}
              {questionsOnly ? `Track all (${reviewGroup.updates.length})` : `Apply all (${reviewGroup.updates.length})`}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPendingBulk}
              onClick={() => handleBulk('reject', reviewGroup.updates)}
              className="w-full"
            >
              <XCircle data-icon="inline-start" />
              Dismiss all
            </Button>
          </div>
        </section>
        )
      })}
    </div>
  )
}
