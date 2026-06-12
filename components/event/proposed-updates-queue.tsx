'use client'

import type { Dispatch, SetStateAction } from 'react'
import { useState, useTransition } from 'react'
import Link from 'next/link'
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
import { cn, formatDistanceToNow } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
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
  onClarify?: (input: { update: ProposedUpdate; title: string; answer: string }) => Promise<{ createdCount: number }>
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

interface ReviewUpdateResponse {
  ok?: boolean
  status?: string
  entity_type?: UpdateType
  entity_id?: string | null
}

type ClarifyingState = 'answering' | 'dismissing'

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

const TYPE_PLAN_TAB: Record<UpdateType, string> = {
  task:          'tasks',
  vendor:        'vendors',
  budget_item:   'budget',
  timeline_item: 'timeline',
  decision:      'decisions',
  risk:          'risks',
  open_question: 'questions',
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

function getReadableTitle(update: ProposedUpdate, payload: UpdatePayload = update.payload_json): string {
  const name = getUpdateName(update, payload)
  const detail = getUpdateDetail(update, payload)
  return detail ? `${name} · ${detail}` : name
}

function getClarificationPrompt(update: ProposedUpdate): string {
  const rationale = update.rationale?.trim()
  if (!rationale) return 'Add what you know.'
  return rationale
}

const CORRECTION_TYPES: UpdateType[] = ['task', 'vendor', 'budget_item', 'timeline_item']

const CORRECTION_FIELD_LABELS: Partial<Record<UpdateType, Record<string, string>>> = {
  task: {
    title: 'Title',
    description: 'Description',
    due_date: 'Due date',
    priority: 'Priority',
    status: 'Status',
  },
  vendor: {
    name: 'Name',
    contact_name: 'Contact',
    email: 'Email',
    phone: 'Phone',
    status: 'Status',
    estimated_cost: 'Cost',
    notes: 'Notes',
    category: 'Category',
  },
  budget_item: {
    description: 'Description',
    category: 'Category',
    estimated_cost: 'Estimated',
    actual_cost: 'Actual',
    status: 'Status',
  },
  timeline_item: {
    title: 'Title',
    description: 'Description',
    starts_at: 'Starts',
    ends_at: 'Ends',
    type: 'Type',
  },
}

const MONEY_FIELDS = ['estimated_cost', 'actual_cost']

function isCorrection(update: ProposedUpdate): boolean {
  return update.operation === 'update' && CORRECTION_TYPES.includes(update.update_type)
}

function isArchive(update: ProposedUpdate): boolean {
  return update.operation === 'archive'
}

function getTargetSnapshot(update: ProposedUpdate): Record<string, unknown> | null {
  return isRecord(update.target_snapshot_json) ? update.target_snapshot_json : null
}

function getTargetDisplayName(update: ProposedUpdate, payload: UpdatePayload = update.payload_json): string {
  const snapshot = getTargetSnapshot(update)
  const snapshotName = snapshot?.name ?? snapshot?.description
  if (typeof snapshotName === 'string' && snapshotName.trim()) return snapshotName
  return getUpdateName(update, payload)
}

function getArchiveReason(payload: UpdatePayload): string | null {
  const p = payloadRecord(payload)
  return typeof p.archive_reason === 'string' && p.archive_reason.trim() ? p.archive_reason.trim() : null
}

function formatPreservedFacts(update: ProposedUpdate, payload: UpdatePayload = update.payload_json): string | null {
  if (!isCorrection(update) && !isArchive(update)) return null
  const snapshot = getTargetSnapshot(update)
  const p = payloadRecord(payload)
  const category =
    (typeof snapshot?.category === 'string' && snapshot.category) ||
    (typeof p.category === 'string' && p.category) ||
    null
  const cost =
    typeof snapshot?.estimated_cost === 'number'
      ? formatMoney(snapshot.estimated_cost)
      : formatMoney(p.estimated_cost)
  return [category, cost].filter(Boolean).join(' · ') || null
}

function vendorCorrectionLabels(update: ProposedUpdate, payload: UpdatePayload = update.payload_json) {
  const snapshot = getTargetSnapshot(update)
  const p = payloadRecord(payload)
  const before = typeof snapshot?.name === 'string' && snapshot.name.trim() ? snapshot.name : 'Existing vendor'
  const after = typeof p.name === 'string' && p.name.trim() ? p.name : getUpdateName(update, payload)
  return { before, after }
}

function budgetCostDiff(update: ProposedUpdate, payload: UpdatePayload = update.payload_json): string | null {
  const snapshot = getTargetSnapshot(update)
  const p = payloadRecord(payload)
  const before = typeof snapshot?.estimated_cost === 'number' ? snapshot.estimated_cost : null
  const after = typeof p.estimated_cost === 'number' ? p.estimated_cost : null
  if (before !== null && after !== null && before !== after) {
    return `${formatMoney(before)} → ${formatMoney(after)}`
  }
  return null
}

function genericCorrectionLabels(update: ProposedUpdate, payload: UpdatePayload = update.payload_json) {
  const snapshot = getTargetSnapshot(update)
  const beforeRaw = snapshot?.title ?? snapshot?.name ?? snapshot?.description
  const before = typeof beforeRaw === 'string' && beforeRaw.trim()
    ? beforeRaw
    : `Existing ${TYPE_COUNT_LABEL[update.update_type]}`
  const after = getUpdateName(update, payload)
  return { before, after }
}

function correctionChangedFields(update: ProposedUpdate, payload: UpdatePayload = update.payload_json): string[] {
  if (!isCorrection(update)) return []
  const snapshot = getTargetSnapshot(update)
  const labels = CORRECTION_FIELD_LABELS[update.update_type]
  const p = payloadRecord(payload)
  if (!snapshot || !labels) return []

  return Object.entries(labels)
    .filter(([key]) => p[key] !== null && p[key] !== undefined && p[key] !== snapshot[key])
    .map(([key, label]) => {
      const before = MONEY_FIELDS.includes(key) ? formatMoney(snapshot[key]) : snapshot[key]
      const after = MONEY_FIELDS.includes(key) ? formatMoney(p[key]) : p[key]
      return before === null || before === undefined || before === ''
        ? `${label}: ${String(after)}`
        : `${label}: ${String(before)} → ${String(after)}`
    })
}

function getActionLabel(update: ProposedUpdate): string {
  if (isArchive(update)) {
    if (update.update_type === 'budget_item') return 'Remove budget item'
    if (update.update_type === 'timeline_item') return 'Remove timing'
    return 'Remove vendor'
  }
  if (isCorrection(update)) {
    if (update.update_type === 'budget_item') return 'Update budget'
    if (update.update_type === 'timeline_item') return 'Update timing'
    if (update.update_type === 'task') return 'Update task'
    return 'Update vendor'
  }
  return TYPE_ACTION_LABEL[update.update_type]
}

function getOutputReview(aiRun: AiRun | null): Pick<AiRunReviewOutput, 'understood_summary'> {
  if (!aiRun || !isRecord(aiRun.output_json)) {
    return {}
  }

  return {
    understood_summary: stringArray(aiRun.output_json.understood_summary),
  }
}

function needsCheck(update: ProposedUpdate): boolean {
  return update.confidence == null || update.confidence < 0.75
}

function getReadyUpdates(updates: ProposedUpdate[]): ProposedUpdate[] {
  return updates.filter((update) => !needsCheck(update))
}

function getSafeReadyUpdates(updates: ProposedUpdate[]): ProposedUpdate[] {
  return updates.filter((update) => !needsCheck(update) && !isArchive(update))
}

function cleanBatchTitleText(value: string | null | undefined): string | null {
  if (!value) return null
  const withoutMarkdown = value
    .replace(/^[\s"'`*_–—-]+|[\s"'`*_–—-]+$/g, '')
    .replace(/^re:\s*/i, '')
    .replace(/^glenn (found|understood|heard|noticed)\s+/i, '')
    .replace(/^this note (has|was|is)\s+/i, '')
    .replace(/^you (shared|said|added|mentioned|told (me|glenn))[:,]?\s*/i, '')
    .replace(/^the user (shared|said|added|mentioned)[:,]?\s*/i, '')
    .trim()

  if (!withoutMarkdown || /^plan changes touching/i.test(withoutMarkdown)) return null

  const firstPhrase = withoutMarkdown
    .split(/[.!?\n]/)[0]
    .split(/\s+[–—-]\s+/)[0]
    .split(/\s+(?:and|but|with)\s+/i)[0]
    .trim()

  if (!firstPhrase || firstPhrase.length < 3) return null
  if (/\b(?:for|at|to|from|with|and|or|the|a|an)$/i.test(firstPhrase)) return null

  const words = firstPhrase.split(/\s+/)
  let title = words.length > 5 ? words.slice(0, 5).join(' ') : firstPhrase
  // A truncated title ending in a possessive dangles ("…planning Ava's") — drop it
  if (words.length > 5 && /\S['’]s$/i.test(title)) {
    title = title.replace(/\s+\S+['’]s$/i, '').trim() || title
  }
  return /\b(?:for|at|to|from|with|and|or|the|a|an)$/i.test(title) ? null : title
}

function getBatchDisplaySummary(summary: string | undefined): string | null {
  if (!summary || /^This note has plan changes touching/i.test(summary)) return null
  return summary
}

function buildBatchTitle(reviewGroup: ReviewGroup): string {
  const summaryTitle = cleanBatchTitleText(reviewGroup.understoodSummary[0])
  if (summaryTitle) return summaryTitle

  const sourceTitle = cleanBatchTitleText(reviewGroup.aiRun?.input_text)
  if (sourceTitle) return sourceTitle

  if (reviewGroup.updates.some(isCorrection)) return 'Plan correction'
  if (reviewGroup.updates.some(isArchive)) return 'Removal to review'
  if (reviewGroup.updates.some(needsCheck)) return 'Needs your answer'

  const firstUpdate = orderByType(reviewGroup.updates)[0]
  if (firstUpdate) return getUpdateName(firstUpdate)
  return 'Glenn found updates'
}

function buildBatchActionCue({
  safeReadyCount,
  removalCount,
  needsCheckCount,
}: {
  safeReadyCount: number
  removalCount: number
  needsCheckCount: number
}): string {
  if (removalCount > 0) return 'Removal requires review'
  if (needsCheckCount > 0) return 'Needs your answer'
  if (safeReadyCount > 0) return 'Ready to apply'
  return 'Review when ready'
}

function buildBatchStatusParts({
  safeReadyCount,
  removalCount,
  needsCheckCount,
}: {
  safeReadyCount: number
  removalCount: number
  needsCheckCount: number
}): string[] {
  const parts: string[] = []
  if (safeReadyCount > 0) parts.push(`${safeReadyCount} ready`)
  if (needsCheckCount > 0) parts.push(`${needsCheckCount} need${needsCheckCount === 1 ? 's' : ''} your answer`)
  if (removalCount > 0) parts.push(`${removalCount} removal${removalCount !== 1 ? 's' : ''}`)
  return parts
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

async function reviewUpdate(updateId: string, action: ReviewAction, payload?: UpdatePayload): Promise<ReviewUpdateResponse> {
  const init: RequestInit = { method: 'POST' }
  if (action === 'approve' && payload) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify({ payload_json: payload })
  }

  const res = await fetch(`/api/updates/${updateId}/${action}`, init)
  const data = await res.json().catch(() => ({})) as ReviewUpdateResponse & { error?: string }
  if (!res.ok) {
    throw new Error(data.error ?? 'Failed to update')
  }
  return data
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
    // Newest batch first — when Glenn replies, the relevant batch is at the top
    // of the panel instead of below every older pending batch.
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function getPlanHref(eventId: string, updateType: UpdateType, entityId: string | null | undefined): string | null {
  if (!entityId) return null
  return `/events/${eventId}/plan?tab=${TYPE_PLAN_TAB[updateType]}&highlight=${entityId}`
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
          <SelectField id={`${update.id}-status`} label="Status" value={p.status} options={['todo', 'in_progress', 'done', 'blocked']} onChange={(status) => onChange({ ...p, status })} />
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

export function ProposedUpdatesQueue({ updates, aiRuns, eventId, onClarify }: ProposedUpdatesQueueProps) {
  const router = useRouter()
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set())
  const [draftPayloads, setDraftPayloads] = useState<Record<string, UpdatePayload>>({})
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({})
  const [clarifyingIds, setClarifyingIds] = useState<Record<string, ClarifyingState>>({})
  const [batchExpansionOverrides, setBatchExpansionOverrides] = useState<Record<string, boolean>>({})
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

  function setBatchExpanded(aiRunId: string, expanded: boolean) {
    setBatchExpansionOverrides((current) => ({ ...current, [aiRunId]: expanded }))
  }

  async function handleSingle(update: ProposedUpdate, action: ReviewAction, payload?: UpdatePayload) {
    setProcessingIds((current) => new Set(current).add(update.id))
    const name = getUpdateName(update, payload)
    const dest = TYPE_DESTINATION[update.update_type]
    try {
      const result = await reviewUpdate(update.id, action, payload)
      if (action === 'approve') {
        // Archived records are hidden from the Plan, so a "View" link would dead-end.
        const planHref = isArchive(update) ? null : getPlanHref(eventId, update.update_type, result.entity_id)
        const singular = TYPE_COUNT_LABEL[update.update_type]
        const message = isArchive(update)
          ? `Removed ${singular}: ${getTargetDisplayName(update, payload ?? update.payload_json)}`
          : isCorrection(update)
            ? `Updated ${singular}: ${name}`
            : `Added to ${dest}: ${name}`
        toast.success(message, planHref ? {
          action: {
            label: 'View',
            onClick: () => router.push(planHref),
          },
        } : undefined)
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
      const firstAppliedHref = action === 'approve'
        ? scopedUpdates
            .map((update, index) => {
              const result = results[index]
              return result.status === 'fulfilled' && !isArchive(update)
                ? getPlanHref(eventId, update.update_type, result.value.entity_id)
                : null
            })
            .find((href): href is string => href !== null)
        : null

      if (failed.length === 0) {
        toast.success(
          action === 'approve'
            ? `Applied ${appliedCount} update${appliedCount !== 1 ? 's' : ''} to the event plan.`
            : `Dismissed ${appliedCount} update${appliedCount !== 1 ? 's' : ''}. The plan is unchanged.`,
          firstAppliedHref ? {
            action: {
              label: 'View',
              onClick: () => router.push(firstAppliedHref),
            },
          } : undefined
        )
      } else {
        const names = failed.slice(0, 2).map((update) => getUpdateName(update)).join(', ')
        const overflow = failed.length > 2 ? ` and ${failed.length - 2} more` : ''
        toast.error(`${verb} ${appliedCount} of ${scopedUpdates.length} · failed: ${names}${overflow}. The failed items are still pending.`)
      }
      router.refresh()
    })
  }

  async function handleClarifySubmit(update: ProposedUpdate) {
    const answer = answerDrafts[update.id]?.trim()
    if (!answer || !onClarify || clarifyingIds[update.id]) return

    const title = getReadableTitle(update)
    setClarifyingIds((current) => ({ ...current, [update.id]: 'answering' }))

    try {
      const result = await onClarify({ update, title, answer })
      if (result.createdCount > 0) {
        setClarifyingIds((current) => ({ ...current, [update.id]: 'dismissing' }))
        // Server-side supersession may have already retired this row — a 409
        // here means the work is done, not that the dismissal failed.
        await reviewUpdate(update.id, 'reject').catch(() => {})
        setAnswerDrafts((current) => {
          const next = { ...current }
          delete next[update.id]
          return next
        })
      } else {
        toast.info('Glenn saved the answer, but this item still needs review.')
      }
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send clarification.')
    } finally {
      setClarifyingIds((current) => {
        const next = { ...current }
        delete next[update.id]
        return next
      })
    }
  }

  function renderNeedsCheckRow(update: ProposedUpdate) {
    const isProcessing = processingIds.has(update.id)
    const isExpanded = expandedIds.has(update.id)
    const isEditing = editingIds.has(update.id)
    const clarifyingState = clarifyingIds[update.id]
    const draftPayload = draftPayloads[update.id]
    const activePayload = draftPayload ?? update.payload_json
    const title = getReadableTitle(update, activePayload)
    const prompt = getClarificationPrompt(update)
    const answer = answerDrafts[update.id] ?? ''
    const isBusy = isProcessing || !!clarifyingState
    const canClarify = !!onClarify && answer.trim().length > 0 && !isBusy

    return (
      <article
        key={update.id}
        className="border-t border-amber-200/70 first:border-t-0"
      >
        <div className="flex flex-col gap-2 py-3">
          <div className="flex min-w-0 items-start gap-2">
            <button
              type="button"
              aria-expanded={isExpanded}
              onClick={() => toggleSetValue(setExpandedIds, update.id)}
              className="mt-0.5 shrink-0 rounded-md text-amber-800/70 transition-colors hover:text-amber-950 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ChevronDown
                className={cn('size-3.5 transition-transform', isExpanded && 'rotate-180')}
                aria-hidden="true"
              />
              <span className="sr-only">{isExpanded ? 'Collapse' : 'Expand'}</span>
            </button>
            <Badge
              variant="outline"
              className={cn('mt-0.5 h-5 shrink-0 rounded-md px-1.5 text-[11px]', TYPE_PILL_CLASS[update.update_type])}
            >
              {TYPE_PILL_LABEL[update.update_type]}
            </Badge>
            <button
              type="button"
              onClick={() => toggleSetValue(setExpandedIds, update.id)}
              className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="line-clamp-1 text-sm font-medium leading-5 text-foreground">{title}</span>
              <span className="line-clamp-2 text-xs leading-4 text-amber-900/90">{prompt}</span>
            </button>
            <Button
              size="icon-xs"
              variant="ghost"
              className="shrink-0 text-muted-foreground"
              aria-label="Dismiss"
              disabled={isBusy}
              onClick={() => handleSingle(update, 'reject')}
            >
              <XCircle />
            </Button>
          </div>

          <form
            className="grid grid-cols-[1fr_auto] gap-2 pl-5"
            onSubmit={(event) => {
              event.preventDefault()
              handleClarifySubmit(update)
            }}
          >
            <Input
              value={answer}
              onChange={(event) => setAnswerDrafts((current) => ({ ...current, [update.id]: event.target.value }))}
              placeholder={update.rationale?.trim().endsWith('?') ? 'Answer in plain language...' : 'Add what you know...'}
              disabled={isBusy || !onClarify}
              className="h-8 bg-background text-sm"
              aria-label={`Answer clarification for ${title}`}
            />
            <Button
              type="submit"
              size="icon-sm"
              disabled={!canClarify}
              aria-label="Send clarification"
            >
              {clarifyingState === 'answering' ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ArrowRight />
              )}
            </Button>
          </form>
        </div>

        {isExpanded ? (
          <div className="flex flex-col gap-3 border-t border-amber-200/70 pb-3 pt-3">
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
              <div className="flex flex-wrap gap-2 pl-5">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isBusy}
                  onClick={() => startEdit(update)}
                >
                  <Pencil data-icon="inline-start" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isBusy}
                  onClick={() => handleSingle(update, 'approve')}
                >
                  {isProcessing ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <CheckCircle2 data-icon="inline-start" />}
                  {isArchive(update) ? 'Remove anyway' : isCorrection(update) ? 'Update anyway' : 'Add anyway'}
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </article>
    )
  }

  function renderUpdateRow(update: ProposedUpdate) {
    const isProcessing = processingIds.has(update.id)
    const isExpanded = expandedIds.has(update.id)
    const isEditing = editingIds.has(update.id)
    const draftPayload = draftPayloads[update.id]
    const activePayload = draftPayload ?? update.payload_json
    const archive = isArchive(update)
    const correction = isCorrection(update)

    let name: string
    let detail: string | null
    if (archive) {
      name = `Remove ${getTargetDisplayName(update, activePayload)}`
      detail = getArchiveReason(activePayload) ?? formatPreservedFacts(update, activePayload)
    } else if (correction && update.update_type === 'budget_item') {
      name = getUpdateName(update, activePayload)
      detail = budgetCostDiff(update, activePayload) ?? correctionChangedFields(update, activePayload)[0] ?? null
    } else if (correction && update.update_type === 'vendor') {
      const labels = vendorCorrectionLabels(update, activePayload)
      name = labels.before === labels.after ? labels.after : `${labels.before} → ${labels.after}`
      detail = formatPreservedFacts(update, activePayload)
    } else if (correction) {
      const labels = genericCorrectionLabels(update, activePayload)
      name = labels.before === labels.after ? labels.after : `${labels.before} → ${labels.after}`
      detail = correctionChangedFields(update, activePayload)[0] ?? null
    } else {
      name = getUpdateName(update, activePayload)
      detail = getUpdateDetail(update, activePayload)
    }
    const description = getUpdateDescription(update, activePayload)
    const changedFieldsList = correctionChangedFields(update, activePayload)
    const preservedFacts = formatPreservedFacts(update, activePayload)
    const operationLabel = archive ? 'Remove' : correction ? 'Update' : 'Add'
    const isBusy = isProcessing || isEditing

    return (
      <article
        key={update.id}
        className={cn(
          'rounded-lg border shadow-sm transition-colors',
          archive ? 'border-rose-200 bg-rose-50/40' : 'bg-card'
        )}
      >
        <div className="flex items-start gap-2 p-2.5">
          <div
            role="button"
            tabIndex={0}
            aria-expanded={isExpanded}
            onClick={() => toggleSetValue(setExpandedIds, update.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                toggleSetValue(setExpandedIds, update.id)
              }
            }}
            className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ChevronDown
              className={cn(
                'mt-1 size-3.5 shrink-0 text-muted-foreground transition-transform',
                isExpanded && 'rotate-180'
              )}
              aria-hidden="true"
            />
            <span
              className={cn(
                'mt-1.5 flex size-2 shrink-0 rounded-full',
                archive ? 'bg-rose-500' : correction ? 'bg-blue-500' : 'bg-emerald-500'
              )}
            >
              <span className="sr-only">{operationLabel}</span>
            </span>
            <Badge
              variant="outline"
              className={cn('mt-0.5 h-5 shrink-0 rounded-md px-1.5 text-[11px]', TYPE_PILL_CLASS[update.update_type])}
            >
              {TYPE_PILL_LABEL[update.update_type]}
            </Badge>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="line-clamp-2 min-w-0 text-sm font-medium leading-5">{name}</span>
              </span>
              {detail ? (
                <span className={cn('block text-[11px] leading-4', archive ? 'text-rose-700' : 'text-muted-foreground')}>{detail}</span>
              ) : null}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {archive ? (
              <Button
                size="xs"
                variant="destructive"
                disabled={isBusy}
                onClick={(event) => {
                  event.stopPropagation()
                  handleSingle(update, 'approve')
                }}
              >
                {isProcessing ? <Loader2 data-icon="inline-start" className="animate-spin" /> : null}
                {getActionLabel(update)}
              </Button>
            ) : null}
            <Button
              size="icon-xs"
              variant="ghost"
              className="shrink-0 text-muted-foreground"
              aria-label="Dismiss"
              disabled={isProcessing}
              onClick={(event) => {
                event.stopPropagation()
                handleSingle(update, 'reject')
              }}
            >
              <XCircle />
            </Button>
          </div>
        </div>

        {isExpanded ? (
          <div className="flex flex-col gap-3 border-t px-2.5 pb-2.5 pt-3">
            <div className="flex flex-col gap-2 text-xs">
              {changedFieldsList.length > 0 ? (
                <div className="rounded-lg border bg-muted/30 p-2.5">
                  <p className="font-medium text-foreground">Changed fields</p>
                  <div className="mt-1 space-y-0.5 text-muted-foreground">
                    {changedFieldsList.map((field) => (
                      <p key={field}>{field}</p>
                    ))}
                  </div>
                </div>
              ) : null}
              {archive && getArchiveReason(activePayload) ? (
                <p className="leading-relaxed text-rose-800">Reason: {getArchiveReason(activePayload)}</p>
              ) : null}
              {preservedFacts ? (
                <p className="leading-relaxed text-muted-foreground">
                  {archive ? `Removing: ${preservedFacts}` : `Preserved: ${preservedFacts}`}
                </p>
              ) : null}
              {description ? (
                <p className="leading-relaxed text-muted-foreground">{description}</p>
              ) : null}
              {update.rationale ? (
                <p className="leading-relaxed text-muted-foreground/80">{update.rationale}</p>
              ) : null}
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
                    onClick={(event) => {
                      event.stopPropagation()
                      handleSingle(update, 'approve', activePayload)
                    }}
                  >
                    {isProcessing ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <CheckCircle2 data-icon="inline-start" />}
                    Save & Apply
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    disabled={isProcessing}
                    onClick={(event) => {
                      event.stopPropagation()
                      cancelEdit(update.id)
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {!archive ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full sm:w-auto"
                    disabled={isProcessing}
                    onClick={(event) => {
                      event.stopPropagation()
                      startEdit(update)
                    }}
                  >
                    <Pencil data-icon="inline-start" />
                    Edit
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant={archive ? 'destructive' : 'outline'}
                  className="w-full sm:w-auto"
                  disabled={isProcessing}
                  onClick={(event) => {
                    event.stopPropagation()
                    handleSingle(update, 'approve')
                  }}
                >
                  {isProcessing ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <CheckCircle2 data-icon="inline-start" />}
                  {getActionLabel(update)}
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </article>
    )
  }

  if (updates.length === 0) {
    const hasHistory = aiRuns.some(r => r.status === 'completed')
    return hasHistory ? (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <CheckCircle2 className="size-7 text-emerald-500/60" />
        <p className="text-sm font-medium text-foreground">All caught up</p>
        <p className="max-w-[200px] text-xs text-muted-foreground">Everything has been reviewed. Tell Glenn what changed and new updates will appear here.</p>
        <Link
          href={`/events/${eventId}/plan`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'mt-1')}
        >
          See the plan →
        </Link>
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
      {reviewGroups.map((reviewGroup, groupIndex) => {
        const sourceSummary = getBatchDisplaySummary(reviewGroup.understoodSummary[0])
        const readyUpdates = getReadyUpdates(reviewGroup.updates)
        const safeReadyUpdates = getSafeReadyUpdates(reviewGroup.updates)
        const removalUpdates = orderByType(readyUpdates.filter(isArchive))
        const regularReadyUpdates = orderByType(safeReadyUpdates)
        const needsCheckUpdates = orderByType(reviewGroup.updates.filter(needsCheck))
        const needsCheckCount = reviewGroup.updates.length - readyUpdates.length
        const batchTitle = buildBatchTitle(reviewGroup)
        const actionCue = buildBatchActionCue({
          safeReadyCount: safeReadyUpdates.length,
          removalCount: removalUpdates.length,
          needsCheckCount,
        })
        const statusParts = buildBatchStatusParts({
          safeReadyCount: safeReadyUpdates.length,
          removalCount: removalUpdates.length,
          needsCheckCount,
        })
        const showActionCue = actionCue !== batchTitle
        const isLatest = groupIndex === 0
        const isExpanded = batchExpansionOverrides[reviewGroup.aiRunId] ?? isLatest
        return (
        <section key={reviewGroup.aiRunId} className="rounded-lg border bg-card shadow-sm">
          <button
            type="button"
            aria-expanded={isExpanded}
            onClick={() => setBatchExpanded(reviewGroup.aiRunId, !isExpanded)}
            className="flex w-full items-start gap-2 rounded-t-lg p-3 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ChevronDown
              className={cn('mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform', isExpanded && 'rotate-180')}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                <span className="min-w-0 flex-1 text-sm font-semibold leading-5 text-foreground">
                  {batchTitle}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {showActionCue ? (
                    <Badge variant={safeReadyUpdates.length > 0 && removalUpdates.length === 0 && needsCheckCount === 0 ? 'default' : 'outline'} className="h-5 rounded-md px-1.5 text-[11px]">
                      {actionCue}
                    </Badge>
                  ) : null}
                  {isLatest ? (
                    <Badge className="h-5 rounded-md px-1.5 text-[11px]">Latest</Badge>
                  ) : null}
                </span>
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                {reviewGroup.createdAt ? (
                  <span suppressHydrationWarning>{formatDistanceToNow(reviewGroup.createdAt)}</span>
                ) : null}
                {statusParts.map((part) => (
                  <span key={part}>{part}</span>
                ))}
              </span>
              {sourceSummary ? (
                <span className={cn('mt-1 block text-xs leading-relaxed text-muted-foreground', isExpanded ? 'line-clamp-2' : 'line-clamp-1')}>
                  {sourceSummary}
                </span>
              ) : null}
            </span>
          </button>

          {isExpanded ? (
            <div className="flex flex-col gap-3 border-t p-3">
              {regularReadyUpdates.length > 0 ? (
                <section className="flex flex-col gap-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold text-foreground">Ready to apply</p>
                      <p className="text-[11px] text-muted-foreground">
                        {regularReadyUpdates.length} safe change{regularReadyUpdates.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      disabled={isPendingBulk}
                      onClick={() => handleBulk('approve', regularReadyUpdates)}
                      className="w-full sm:w-auto"
                    >
                      {isPendingBulk ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <CheckCircle2 data-icon="inline-start" />}
                      Apply {regularReadyUpdates.length} safe change{regularReadyUpdates.length !== 1 ? 's' : ''}
                    </Button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {regularReadyUpdates.map(renderUpdateRow)}
                  </div>
                </section>
              ) : null}

              {removalUpdates.length > 0 ? (
                <section className="flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50/25 p-2">
                  <div>
                    <p className="text-xs font-semibold text-rose-900">Removals</p>
                    <p className="text-[11px] text-rose-700">
                      Review and remove deliberately
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {removalUpdates.map(renderUpdateRow)}
                  </div>
                </section>
              ) : null}

              {needsCheckUpdates.length > 0 ? (
                <section className="rounded-lg border border-amber-200 bg-amber-50/35 px-3">
                  <div className="border-b border-amber-200/70 py-2">
                    <p className="text-xs font-semibold text-amber-950">Needs your answer</p>
                    <p className="text-[11px] text-amber-900/80">
                      Answer these so Glenn can update the plan.
                    </p>
                  </div>
                  <div>
                    {needsCheckUpdates.map(renderNeedsCheckRow)}
                  </div>
                </section>
              ) : null}

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
          ) : null}
        </section>
        )
      })}
    </div>
  )
}
