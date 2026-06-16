'use client'

import type { Dispatch, SetStateAction } from 'react'
import { Fragment, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type {
  BudgetItemPayload,
  DecisionPayload,
  OpenQuestionPayload,
  ProposedUpdate,
  RiskPayload,
  TaskPayload,
  TimelineItemPayload,
  UpdatePayload,
  VendorPayload,
} from '@/lib/types'
import {
  budgetCostDiff,
  correctionChangedFields,
  formatPreservedFacts,
  genericCorrectionLabels,
  getActionLabel,
  getArchiveReason,
  getClarificationPrompt,
  getPlanHref,
  getReadableTitle,
  getStructuredFields,
  getTargetDisplayName,
  getTimelineDisplay,
  getUpdateDescription,
  getUpdateDetail,
  getUpdateName,
  isArchive,
  isCorrection,
  isStaleReviewError,
  reviewUpdate,
  TYPE_COUNT_LABEL,
  TYPE_DESTINATION,
  TYPE_PILL_CLASS,
  TYPE_PILL_LABEL,
  vendorCorrectionLabels,
  type ReviewAction,
  type ReviewPackage,
} from '@/lib/review'
import { cn, formatDistanceToNow } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SourcePreviewDrawer } from './source-preview-drawer'
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageSquareText,
  Pencil,
  Trash2,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

type ClarifyingState = 'answering' | 'dismissing'

export interface ReviewPackageCardProps {
  pkg: ReviewPackage
  eventId: string
  isLatest: boolean
  defaultExpanded: boolean
  onClarify?: (input: { update: ProposedUpdate; title: string; answer: string }) => Promise<{ createdCount: number }>
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

function SourceBadge({ source }: { source: ReviewPackage['source'] }) {
  const Icon = source.kind === 'message'
    ? MessageSquareText
    : source.mimeType?.startsWith('image/')
      ? ImageIcon
      : FileText
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{source.label}</span>
    </span>
  )
}

function CountChips({ counts }: { counts: ReviewPackage['counts'] }) {
  const chips: { key: string; label: string; className: string }[] = []
  if (counts.ready > 0) chips.push({ key: 'ready', label: `${counts.ready} ready`, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' })
  if (counts.questions > 0) chips.push({ key: 'questions', label: `${counts.questions} question${counts.questions !== 1 ? 's' : ''}`, className: 'bg-amber-50 text-amber-800 border-amber-200' })
  if (counts.removals > 0) chips.push({ key: 'removals', label: `${counts.removals} removal${counts.removals !== 1 ? 's' : ''}`, className: 'bg-rose-50 text-rose-700 border-rose-200' })
  if (chips.length === 0) return null
  return (
    <span className="flex flex-wrap items-center gap-1">
      {chips.map((chip) => (
        <span key={chip.key} className={cn('inline-flex h-5 items-center rounded-md border px-1.5 text-[11px] font-medium', chip.className)}>
          {chip.label}
        </span>
      ))}
    </span>
  )
}

export function ReviewPackageCard({ pkg, eventId, isLatest, defaultExpanded, onClarify }: ReviewPackageCardProps) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set())
  const [draftPayloads, setDraftPayloads] = useState<Record<string, UpdatePayload>>({})
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({})
  const [clarifyingIds, setClarifyingIds] = useState<Record<string, ClarifyingState>>({})
  const [confirmingRemovalId, setConfirmingRemovalId] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [isPendingBulk, startBulkTransition] = useTransition()

  const { source, safe, removals, needsAnswer, summary, counts } = pkg

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
      if (isStaleReviewError(err)) {
        toast.info('This suggestion was replaced by a newer one — refreshing the list.')
        cancelEdit(update.id)
        router.refresh()
      } else {
        toast.error(err instanceof Error ? err.message : 'Something went wrong.')
      }
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
      const stale = scopedUpdates.filter((_, index) => {
        const result = results[index]
        return result.status === 'rejected' && isStaleReviewError(result.reason)
      })
      const hardFailed = failed.filter((update) => !stale.includes(update))
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
      } else if (hardFailed.length === 0) {
        const summaryText = appliedCount > 0
          ? `${verb} ${appliedCount} update${appliedCount !== 1 ? 's' : ''}. `
          : ''
        toast.info(`${summaryText}${stale.length} suggestion${stale.length !== 1 ? 's were' : ' was'} already replaced by newer ones — refreshing the list.`)
      } else {
        const names = hardFailed.slice(0, 2).map((update) => getUpdateName(update)).join(', ')
        const overflow = hardFailed.length > 2 ? ` and ${hardFailed.length - 2} more` : ''
        toast.error(`${verb} ${appliedCount} of ${scopedUpdates.length} · failed: ${names}${overflow}. Refresh and try again.`)
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
    const isConfirmingRemoval = confirmingRemovalId === update.id

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
    } else if (update.update_type === 'timeline_item') {
      const display = getTimelineDisplay(update, activePayload)
      name = display.name
      detail = display.detail
    } else {
      name = getUpdateName(update, activePayload)
      detail = getUpdateDetail(update, activePayload)
    }
    const description = getUpdateDescription(update, activePayload)
    const changedFieldsList = correctionChangedFields(update, activePayload)
    const preservedFacts = formatPreservedFacts(update, activePayload)
    const structuredFields = correction || archive ? [] : getStructuredFields(update, activePayload)
    const structuredValues = new Set(structuredFields.map((field) => field.value))
    const showNote = !!description && description !== name && !structuredValues.has(description)
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
            {archive && !isConfirmingRemoval ? (
              <Button
                size="xs"
                variant="destructive"
                disabled={isBusy}
                onClick={(event) => {
                  event.stopPropagation()
                  setConfirmingRemovalId(update.id)
                }}
              >
                <Trash2 data-icon="inline-start" />
                {getActionLabel(update)}
              </Button>
            ) : null}
            {!archive ? (
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
            ) : null}
          </div>
        </div>

        {archive && isConfirmingRemoval ? (
          <div className="flex flex-col gap-2 border-t border-rose-200 bg-rose-50/60 px-2.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-medium text-rose-900">Remove this from the plan? This can&rsquo;t be undone in bulk.</p>
            <div className="flex shrink-0 gap-2">
              <Button
                size="xs"
                variant="outline"
                disabled={isProcessing}
                onClick={(event) => {
                  event.stopPropagation()
                  setConfirmingRemovalId(null)
                }}
              >
                Cancel
              </Button>
              <Button
                size="xs"
                variant="destructive"
                disabled={isProcessing}
                onClick={(event) => {
                  event.stopPropagation()
                  setConfirmingRemovalId(null)
                  handleSingle(update, 'approve')
                }}
              >
                {isProcessing ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <Trash2 data-icon="inline-start" />}
                Confirm remove
              </Button>
            </div>
          </div>
        ) : null}

        {isExpanded ? (
          <div className="flex flex-col gap-3 border-t px-2.5 pb-2.5 pt-3">
            <div className="flex flex-col gap-2 text-xs">
              {changedFieldsList.length > 0 ? (
                <div className="rounded-lg border bg-muted/30 p-2.5">
                  <p className="font-medium text-foreground">Changed</p>
                  <div className="mt-1 space-y-0.5 text-muted-foreground">
                    {changedFieldsList.map((field) => (
                      <p key={field}>{field}</p>
                    ))}
                  </div>
                </div>
              ) : null}
              {structuredFields.length > 0 ? (
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                  {structuredFields.map((field) => (
                    <Fragment key={field.label}>
                      <dt className="text-muted-foreground">{field.label}</dt>
                      <dd className="min-w-0 font-medium text-foreground">{field.value}</dd>
                    </Fragment>
                  ))}
                </dl>
              ) : null}
              {archive && getArchiveReason(activePayload) ? (
                <p className="leading-relaxed text-rose-800">
                  <span className="text-rose-700/70">Reason</span> · {getArchiveReason(activePayload)}
                </p>
              ) : null}
              {preservedFacts ? (
                <p className="text-muted-foreground">
                  <span className="text-muted-foreground/70">{archive ? 'Removing' : 'Preserved'}</span> · {preservedFacts}
                </p>
              ) : null}
              {showNote ? (
                <p className="line-clamp-2 leading-relaxed text-muted-foreground">{description}</p>
              ) : null}
              {update.rationale ? (
                <details className="group/why">
                  <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
                    <ChevronDown className="size-3 transition-transform group-open/why:rotate-180" aria-hidden="true" />
                    Why Glenn suggested this
                  </summary>
                  <p className="mt-1 leading-relaxed text-muted-foreground/80">{update.rationale}</p>
                </details>
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
              <div className="flex flex-wrap justify-end gap-2">
                {!archive ? (
                  <Button
                    size="xs"
                    variant="ghost"
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
                  size="xs"
                  variant={archive ? 'destructive' : 'outline'}
                  disabled={isProcessing}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (archive) {
                      setConfirmingRemovalId(update.id)
                    } else {
                      handleSingle(update, 'approve')
                    }
                  }}
                >
                  {isProcessing ? <Loader2 data-icon="inline-start" className="animate-spin" /> : archive ? <Trash2 data-icon="inline-start" /> : <CheckCircle2 data-icon="inline-start" />}
                  {getActionLabel(update)}
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </article>
    )
  }

  const canPreviewFile = source.kind === 'file' && !!source.storagePath
  const messageSourceHref = source.sourceMessageId
    ? `/events/${eventId}/chat?source=${source.sourceMessageId}`
    : null

  return (
    <section className="rounded-lg border bg-card shadow-sm">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-start gap-2 rounded-t-lg p-3 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronDown
          className={cn('mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <SourceBadge source={source} />
            {isLatest ? (
              <Badge className="h-5 shrink-0 rounded-md px-1.5 text-[11px]">Latest</Badge>
            ) : null}
          </span>
          {summary ? (
            <span className={cn('mt-1.5 block text-sm font-medium leading-5 text-foreground', expanded ? 'line-clamp-3' : 'line-clamp-2')}>
              {summary}
            </span>
          ) : null}
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <CountChips counts={counts} />
            {pkg.createdAt ? (
              <span className="text-[11px] text-muted-foreground" suppressHydrationWarning>{formatDistanceToNow(pkg.createdAt)}</span>
            ) : null}
          </span>
        </span>
      </button>

      {expanded ? (
        <div className="flex flex-col gap-3 border-t p-3">
          {(canPreviewFile || messageSourceHref) ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">Glenn did the reading. The source stays attached.</p>
              {canPreviewFile ? (
                <Button size="xs" variant="outline" onClick={() => setPreviewOpen(true)}>
                  <FileText data-icon="inline-start" />
                  View source
                </Button>
              ) : messageSourceHref ? (
                <Link href={messageSourceHref} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  <MessageSquareText className="h-3 w-3" />
                  View source
                </Link>
              ) : null}
            </div>
          ) : null}

          {safe.length > 0 ? (
            <section className="flex flex-col gap-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold text-foreground">Ready to apply</p>
                  <p className="text-[11px] text-muted-foreground">
                    {safe.length} safe change{safe.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={isPendingBulk}
                  onClick={() => handleBulk('approve', safe)}
                  className="w-full sm:w-auto"
                >
                  {isPendingBulk ? <Loader2 data-icon="inline-start" className="animate-spin" /> : <CheckCircle2 data-icon="inline-start" />}
                  Apply {safe.length} safe update{safe.length !== 1 ? 's' : ''}
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                {safe.map(renderUpdateRow)}
              </div>
            </section>
          ) : null}

          {needsAnswer.length > 0 ? (
            <section className="rounded-lg border border-amber-200 bg-amber-50/35 px-3">
              <div className="border-b border-amber-200/70 py-2">
                <p className="text-xs font-semibold text-amber-950">Needs your answer</p>
                <p className="text-[11px] text-amber-900/80">
                  Answer these so Glenn can update the plan.
                </p>
              </div>
              <div>
                {needsAnswer.map(renderNeedsCheckRow)}
              </div>
            </section>
          ) : null}

          {removals.length > 0 ? (
            <section className="flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50/25 p-2">
              <div>
                <p className="text-xs font-semibold text-rose-900">Removals</p>
                <p className="text-[11px] text-rose-700">
                  Confirm each removal individually — these are never applied in bulk.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {removals.map(renderUpdateRow)}
              </div>
            </section>
          ) : null}

          <Button
            size="sm"
            variant="outline"
            disabled={isPendingBulk}
            onClick={() => handleBulk('reject', pkg.updates)}
            className="w-full"
          >
            <XCircle data-icon="inline-start" />
            Dismiss all
          </Button>
        </div>
      ) : null}

      {previewOpen ? (
        <SourcePreviewDrawer source={source} onClose={() => setPreviewOpen(false)} />
      ) : null}
    </section>
  )
}
