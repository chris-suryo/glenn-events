import type {
  AiRun,
  EventFile,
  FileStatus,
  ProposedUpdate,
  UpdatePayload,
  UpdateType,
} from '@/lib/types'

// ─── Source-backed review packages ───────────────────────────────────────────
// One package = one extraction batch (one ai_run). Each package resolves a
// single source — the file Glenn read, the chat note it came from, or a generic
// fallback — so Review can lead with "Glenn read X" instead of a wall of rows.

export type ReviewSourceKind = 'file' | 'message' | 'generic'

export interface ReviewSource {
  kind: ReviewSourceKind
  label: string
  fileName: string | null
  mimeType: string | null
  storagePath: string | null
  sourceMessageId: string | null
}

export interface ReviewPackageCounts {
  ready: number
  questions: number
  removals: number
  eventDetails: number
  total: number
}

export interface ReviewPackage {
  aiRunId: string
  aiRun: AiRun | null
  source: ReviewSource
  updates: ProposedUpdate[]
  // Safe, high-confidence, non-removal updates — eligible for "Apply safe updates".
  safe: ProposedUpdate[]
  // High-confidence archive operations — applied one at a time, never in bulk.
  removals: ProposedUpdate[]
  // Low-confidence items that need a human answer before they can be applied.
  needsAnswer: ProposedUpdate[]
  // High-stakes event-level facts (date/guests/budget/location) — always reviewed
  // and approved one at a time, never swept into the bulk "Apply safe" action.
  eventDetails: ProposedUpdate[]
  summary: string | null
  counts: ReviewPackageCounts
  createdAt: string
}

// ─── Type label maps ─────────────────────────────────────────────────────────

interface UpdateGroup {
  type: UpdateType
  title: string
}

export const UPDATE_GROUPS: UpdateGroup[] = [
  { type: 'task', title: 'Tasks' },
  { type: 'vendor', title: 'Vendors' },
  { type: 'budget_item', title: 'Budget' },
  { type: 'timeline_item', title: 'Timeline' },
  { type: 'decision', title: 'Decisions' },
  { type: 'risk', title: 'Risks' },
  { type: 'open_question', title: 'Open Questions' },
  { type: 'event_detail', title: 'Event details' },
]

export const TYPE_PILL_LABEL: Record<UpdateType, string> = {
  task:          'Task',
  vendor:        'Vendor',
  budget_item:   'Budget',
  timeline_item: 'Timeline',
  decision:      'Decision',
  risk:          'Risk',
  open_question: 'Question',
  event_detail:  'Event detail',
}

export const TYPE_DESTINATION: Record<UpdateType, string> = {
  task:          'Tasks',
  vendor:        'Vendors',
  budget_item:   'Budget',
  timeline_item: 'Timeline',
  decision:      'Decisions',
  risk:          'Risks',
  open_question: 'Open Questions',
  event_detail:  'Event details',
}

export const TYPE_PLAN_TAB: Record<UpdateType, string> = {
  task:          'tasks',
  vendor:        'vendors',
  budget_item:   'budget',
  timeline_item: 'timeline',
  decision:      'decisions',
  risk:          'risks',
  open_question: 'questions',
  event_detail:  'overview',
}

export const TYPE_ACTION_LABEL: Record<UpdateType, string> = {
  task:          'Add task',
  vendor:        'Add vendor',
  budget_item:   'Add budget',
  timeline_item: 'Add timing',
  decision:      'Add decision',
  risk:          'Track risk',
  open_question: 'Add question',
  event_detail:  'Update event details',
}

export const TYPE_COUNT_LABEL: Record<UpdateType, string> = {
  task:          'task',
  vendor:        'vendor',
  budget_item:   'budget',
  timeline_item: 'timeline',
  decision:      'decision',
  risk:          'risk',
  open_question: 'question',
  event_detail:  'event detail',
}

export const TYPE_PILL_CLASS: Record<UpdateType, string> = {
  task:          'border-sky-200 bg-sky-50 text-sky-700',
  vendor:        'border-violet-200 bg-violet-50 text-violet-700',
  budget_item:   'border-emerald-200 bg-emerald-50 text-emerald-700',
  timeline_item: 'border-amber-200 bg-amber-50 text-amber-800',
  decision:      'border-yellow-200 bg-yellow-50 text-yellow-800',
  risk:          'border-rose-200 bg-rose-50 text-rose-700',
  open_question: 'border-slate-200 bg-slate-50 text-slate-700',
  event_detail:  'border-indigo-200 bg-indigo-50 text-indigo-700',
}

const CORRECTION_TYPES: UpdateType[] = ['task', 'vendor', 'budget_item', 'timeline_item']

export const CORRECTION_FIELD_LABELS: Partial<Record<UpdateType, Record<string, string>>> = {
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

// ─── Value helpers ───────────────────────────────────────────────────────────

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

export function getUpdateName(update: ProposedUpdate, payload: UpdatePayload = update.payload_json): string {
  if (update.update_type === 'event_detail') return 'Event details'
  const p = payloadRecord(payload)
  return (
    (typeof p.title === 'string' && p.title) ||
    (typeof p.question === 'string' && p.question) ||
    (typeof p.name === 'string' && p.name) ||
    (typeof p.description === 'string' && p.description) ||
    'Untitled suggestion'
  )
}

export function formatMoney(value: unknown): string | null {
  return typeof value === 'number' ? `$${value.toLocaleString()}` : null
}

export function formatDate(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null
  // A date-only string is a calendar date — build it from local components so it
  // is never rolled back a day by a non-UTC host (new Date('YYYY-MM-DD') is UTC).
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnly) {
    const [, y, m, d] = dateOnly
    return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function getUpdateDetail(update: ProposedUpdate, payload: UpdatePayload = update.payload_json): string | null {
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
    case 'event_detail': {
      const changes = getEventDetailChanges(update, payload).map((c) => `${c.label} → ${c.after}`)
      return changes.length > 0 ? changes.join(' · ') : null
    }
  }
}

export function getUpdateDescription(update: ProposedUpdate, payload: UpdatePayload = update.payload_json): string | null {
  const p = payloadRecord(payload)
  if (typeof p.description === 'string' && p.description) return p.description
  if (typeof p.notes === 'string' && p.notes) return p.notes
  if (typeof p.decision === 'string' && p.decision) return p.decision
  if (typeof p.mitigation === 'string' && p.mitigation) return p.mitigation
  if (update.update_type === 'open_question') return getUpdateName(update, payload)
  return null
}

export function getReadableTitle(update: ProposedUpdate, payload: UpdatePayload = update.payload_json): string {
  const name = getUpdateName(update, payload)
  const detail = getUpdateDetail(update, payload)
  return detail ? `${name} · ${detail}` : name
}

// Parse HH:MM straight from the stored string (no Date/timezone conversion) so
// the rendered clock is identical on the server and client — times in proposal
// rows would otherwise drift across hydration.
function parseClock(value: string): { h: number; m: number } | null {
  const match = value.match(/(?:T|\s|^)(\d{1,2}):(\d{2})/)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  return { h, m }
}

function clockTo12(h: number, m: number): { label: string; meridiem: 'AM' | 'PM' } {
  const meridiem = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return { label: `${hour}:${String(m).padStart(2, '0')}`, meridiem }
}

export function formatTime(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const clock = parseClock(value)
  if (!clock) return null
  const { label, meridiem } = clockTo12(clock.h, clock.m)
  return `${label} ${meridiem}`
}

// "6:30–8:30 PM" when the window shares a meridiem, "11:30 AM–1:00 PM" otherwise.
export function formatTimeWindow(start: unknown, end: unknown): string | null {
  if (typeof start !== 'string') return null
  const s = parseClock(start)
  if (!s) return null
  const sf = clockTo12(s.h, s.m)
  const e = typeof end === 'string' ? parseClock(end) : null
  if (e) {
    const ef = clockTo12(e.h, e.m)
    return sf.meridiem === ef.meridiem
      ? `${sf.label}–${ef.label} ${ef.meridiem}`
      : `${sf.label} ${sf.meridiem}–${ef.label} ${ef.meridiem}`
  }
  return `${sf.label} ${sf.meridiem}`
}

// Timeline rows lead with the time — the most scannable fact for a schedule —
// and keep the date as the secondary line.
export function getTimelineDisplay(
  update: ProposedUpdate,
  payload: UpdatePayload = update.payload_json,
): { name: string; detail: string | null } {
  const p = payloadRecord(payload)
  const title = getUpdateName(update, payload)
  const window = formatTimeWindow(p.starts_at, p.ends_at)
  return {
    name: window ? `${title} — ${window}` : title,
    detail: formatDate(p.starts_at),
  }
}

export interface StructuredField {
  label: string
  value: string
}

// Compact key/value fields for a row's expanded detail — replaces prose so the
// important facts (times, costs, status) are scannable at a glance.
export function getStructuredFields(
  update: ProposedUpdate,
  payload: UpdatePayload = update.payload_json,
): StructuredField[] {
  const p = payloadRecord(payload)
  const fields: StructuredField[] = []
  const push = (label: string, value: unknown) => {
    if (value === null || value === undefined) return
    const text = String(value).trim()
    if (text.length > 0) fields.push({ label, value: text })
  }

  switch (update.update_type) {
    case 'task':
      push('Due', formatDate(p.due_date))
      push('Priority', p.priority)
      push('Status', p.status)
      push('Owner', p.owner_name)
      break
    case 'vendor':
      push('Status', p.status)
      push('Category', p.category)
      push('Cost', formatMoney(p.estimated_cost))
      push('Contact', p.contact_name)
      push('Email', p.email)
      push('Phone', p.phone)
      break
    case 'budget_item':
      push('Category', p.category)
      push('Estimated', formatMoney(p.estimated_cost))
      push('Actual', formatMoney(p.actual_cost))
      push('Status', p.status)
      push('Vendor', p.vendor_name)
      break
    case 'timeline_item':
      push('Time', formatTimeWindow(p.starts_at, p.ends_at))
      push('Date', formatDate(p.starts_at))
      push('Type', p.type)
      break
    case 'decision':
      push('Status', p.status)
      push('Decision', p.decision)
      break
    case 'risk':
      push('Severity', p.severity)
      push('Status', p.status)
      push('Mitigation', p.mitigation)
      break
    case 'open_question':
      push('Owner', p.owner_name)
      break
    case 'event_detail':
      for (const change of getEventDetailChanges(update, payload)) {
        push(change.label, `${change.before} → ${change.after}`)
      }
      break
  }
  return fields
}

// ─── File source helpers (shared by Library, chat bubble, Review) ────────────

export function fileTypeLabel(mime: string | null): string {
  if (!mime) return 'File'
  if (mime === 'application/pdf') return 'PDF'
  if (mime === 'image/png') return 'PNG'
  if (mime === 'image/jpeg') return 'JPG'
  if (mime === 'text/markdown') return 'MD'
  if (mime === 'text/plain') return 'TXT'
  if (mime.startsWith('image/')) return 'Image'
  return 'File'
}

const FILE_STATUS_LABEL: Record<FileStatus, string> = {
  uploaded:    'Uploaded',
  extracting:  'Reading…',
  extracted:   'No updates',
  needs_review: 'Updates ready',
  source_only: 'Source only',
  failed:      'Failed',
}

export function fileStatusLabel(status: FileStatus): string {
  return FILE_STATUS_LABEL[status] ?? 'Uploaded'
}

export function fileToReviewSource(file: EventFile): ReviewSource {
  return {
    kind: 'file',
    label: file.display_name || file.filename || 'Uploaded file',
    fileName: file.filename,
    mimeType: file.mime_type,
    storagePath: file.storage_path,
    sourceMessageId: file.source_message_id,
  }
}

export function getClarificationPrompt(update: ProposedUpdate): string {
  const rationale = update.rationale?.trim()
  if (!rationale) return 'Add what you know.'
  return rationale
}

// ─── Operation predicates ────────────────────────────────────────────────────

export function isCorrection(update: ProposedUpdate): boolean {
  return update.operation === 'update' && CORRECTION_TYPES.includes(update.update_type)
}

export function isArchive(update: ProposedUpdate): boolean {
  return update.operation === 'archive'
}

export function isEventDetail(update: ProposedUpdate): boolean {
  return update.update_type === 'event_detail'
}

const EVENT_DETAIL_FIELD_LABELS: Record<string, string> = {
  event_date:      'Event date',
  attendee_target: 'Guest count',
  budget_target:   'Budget target',
  location:        'Location',
}

const EVENT_DETAIL_FIELDS = ['event_date', 'attendee_target', 'budget_target', 'location'] as const

function formatEventDetailValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not set'
  if (field === 'budget_target') {
    const n = typeof value === 'string' ? Number(value) : value
    return formatMoney(n) ?? String(value)
  }
  if (field === 'attendee_target') return `${value} guests`
  if (field === 'event_date') return formatDate(String(value)) ?? String(value)
  return String(value)
}

export interface EventDetailChange {
  field: string
  label: string
  before: string
  after: string
}

// The before/after diff for an event-facts proposal: snapshot (captured at
// extraction time) vs. the proposed new values, for only the changed fields.
export function getEventDetailChanges(
  update: ProposedUpdate,
  payload: UpdatePayload = update.payload_json,
): EventDetailChange[] {
  const after = payloadRecord(payload)
  const before = getTargetSnapshot(update) ?? {}
  const changes: EventDetailChange[] = []
  for (const field of EVENT_DETAIL_FIELDS) {
    const value = after[field]
    if (value === null || value === undefined) continue
    changes.push({
      field,
      label:  EVENT_DETAIL_FIELD_LABELS[field],
      before: formatEventDetailValue(field, before[field]),
      after:  formatEventDetailValue(field, value),
    })
  }
  return changes
}

export function needsCheck(update: ProposedUpdate): boolean {
  return update.confidence == null || update.confidence < 0.75
}

// ─── Correction / archive rendering helpers ──────────────────────────────────

function getTargetSnapshot(update: ProposedUpdate): Record<string, unknown> | null {
  return isRecord(update.target_snapshot_json) ? update.target_snapshot_json : null
}

export function getTargetDisplayName(update: ProposedUpdate, payload: UpdatePayload = update.payload_json): string {
  const snapshot = getTargetSnapshot(update)
  const snapshotName = snapshot?.name ?? snapshot?.description
  if (typeof snapshotName === 'string' && snapshotName.trim()) return snapshotName
  return getUpdateName(update, payload)
}

export function getArchiveReason(payload: UpdatePayload): string | null {
  const p = payloadRecord(payload)
  return typeof p.archive_reason === 'string' && p.archive_reason.trim() ? p.archive_reason.trim() : null
}

export function formatPreservedFacts(update: ProposedUpdate, payload: UpdatePayload = update.payload_json): string | null {
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

export function vendorCorrectionLabels(update: ProposedUpdate, payload: UpdatePayload = update.payload_json) {
  const snapshot = getTargetSnapshot(update)
  const p = payloadRecord(payload)
  const before = typeof snapshot?.name === 'string' && snapshot.name.trim() ? snapshot.name : 'Existing vendor'
  const after = typeof p.name === 'string' && p.name.trim() ? p.name : getUpdateName(update, payload)
  return { before, after }
}

export function budgetCostDiff(update: ProposedUpdate, payload: UpdatePayload = update.payload_json): string | null {
  const snapshot = getTargetSnapshot(update)
  const p = payloadRecord(payload)
  const before = typeof snapshot?.estimated_cost === 'number' ? snapshot.estimated_cost : null
  const after = typeof p.estimated_cost === 'number' ? p.estimated_cost : null
  if (before !== null && after !== null && before !== after) {
    return `${formatMoney(before)} → ${formatMoney(after)}`
  }
  return null
}

export function genericCorrectionLabels(update: ProposedUpdate, payload: UpdatePayload = update.payload_json) {
  const snapshot = getTargetSnapshot(update)
  const beforeRaw = snapshot?.title ?? snapshot?.name ?? snapshot?.description
  const before = typeof beforeRaw === 'string' && beforeRaw.trim()
    ? beforeRaw
    : `Existing ${TYPE_COUNT_LABEL[update.update_type]}`
  const after = getUpdateName(update, payload)
  return { before, after }
}

export function correctionChangedFields(update: ProposedUpdate, payload: UpdatePayload = update.payload_json): string[] {
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

export function getActionLabel(update: ProposedUpdate): string {
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

export function getPlanHref(eventId: string, updateType: UpdateType, entityId: string | null | undefined): string | null {
  if (!entityId) return null
  // Event-level facts surface on the Overview (countdown, KPIs), not a Plan tab.
  if (updateType === 'event_detail') return `/events/${eventId}`
  return `/events/${eventId}/plan?tab=${TYPE_PLAN_TAB[updateType]}&highlight=${entityId}`
}

function orderByType(scopedUpdates: ProposedUpdate[]): ProposedUpdate[] {
  return UPDATE_GROUPS.flatMap((group) =>
    scopedUpdates.filter((update) => update.update_type === group.type)
  )
}

// ─── Source resolution + summary ─────────────────────────────────────────────

function resolveSource(aiRun: AiRun | null, file: EventFile | null): ReviewSource {
  if (file) {
    return {
      kind: 'file',
      label: file.display_name || file.filename || 'Uploaded file',
      fileName: file.filename,
      mimeType: file.mime_type,
      storagePath: file.storage_path,
      sourceMessageId: file.source_message_id ?? aiRun?.source_message_id ?? null,
    }
  }
  if (aiRun?.source_message_id) {
    return {
      kind: 'message',
      label: 'Typed note',
      fileName: null,
      mimeType: null,
      storagePath: null,
      sourceMessageId: aiRun.source_message_id,
    }
  }
  return {
    kind: 'generic',
    label: 'Glenn update',
    fileName: null,
    mimeType: null,
    storagePath: null,
    sourceMessageId: null,
  }
}

function firstSummaryLine(output: unknown, key: 'recommended_summary' | 'understood_summary'): string | null {
  if (!isRecord(output)) return null
  const lines = stringArray(output[key])
  return lines.length > 0 ? lines[0] : null
}

function buildPackageSummary(aiRun: AiRun | null, file: EventFile | null, updates: ProposedUpdate[]): string | null {
  const recommended = firstSummaryLine(aiRun?.output_json, 'recommended_summary')
  if (recommended) return recommended

  const understood = firstSummaryLine(aiRun?.output_json, 'understood_summary')
  if (understood && !/^This note has plan changes touching/i.test(understood)) return understood

  if (file?.extraction_summary) return file.extraction_summary

  const touched = UPDATE_GROUPS
    .filter((group) => updates.some((update) => update.update_type === group.type))
    .map((group) => group.title)
  return touched.length > 0
    ? `Glenn found ${updates.length} update${updates.length !== 1 ? 's' : ''} across ${touched.join(', ')}.`
    : null
}

/**
 * Groups pending updates into one source-backed package per ai_run, resolving a
 * single source (file → message → generic) and partitioning into safe /
 * removals / needs-answer. Newest batch first.
 */
export function buildReviewPackages(
  updates: ProposedUpdate[],
  aiRuns: AiRun[],
  files: EventFile[],
): ReviewPackage[] {
  const runMap = new Map(aiRuns.map((run) => [run.id, run]))
  const fileByRun = new Map<string, EventFile>()
  for (const file of files) {
    if (file.ai_run_id) fileByRun.set(file.ai_run_id, file)
  }

  const grouped = new Map<string, ProposedUpdate[]>()
  for (const update of updates) {
    const current = grouped.get(update.ai_run_id) ?? []
    current.push(update)
    grouped.set(update.ai_run_id, current)
  }

  return Array.from(grouped.entries())
    .map(([aiRunId, runUpdates]) => {
      const aiRun = runMap.get(aiRunId) ?? null
      const file = fileByRun.get(aiRunId) ?? null
      // Event-level facts are always pulled into their own high-stakes bucket,
      // regardless of confidence, so they never land in safe/removals/needs-answer.
      const eventDetails = orderByType(runUpdates.filter(isEventDetail))
      const planUpdates = runUpdates.filter((update) => !isEventDetail(update))
      const ready = planUpdates.filter((update) => !needsCheck(update))
      const safe = orderByType(ready.filter((update) => !isArchive(update)))
      const removals = orderByType(ready.filter(isArchive))
      const needsAnswer = orderByType(planUpdates.filter(needsCheck))
      return {
        aiRunId,
        aiRun,
        source: resolveSource(aiRun, file),
        updates: runUpdates,
        safe,
        removals,
        needsAnswer,
        eventDetails,
        summary: buildPackageSummary(aiRun, file, runUpdates),
        counts: {
          ready: safe.length,
          questions: needsAnswer.length,
          removals: removals.length,
          eventDetails: eventDetails.length,
          total: runUpdates.length,
        },
        createdAt: aiRun?.created_at ?? runUpdates[0]?.created_at ?? '',
      }
    })
    // Newest batch first — when Glenn replies, the relevant batch is at the top
    // of the panel instead of below every older pending batch.
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// ─── Review request helpers (client fetch) ───────────────────────────────────

export type ReviewAction = 'approve' | 'reject'

export interface ReviewUpdateResponse {
  ok?: boolean
  status?: string
  entity_type?: UpdateType
  entity_id?: string | null
}

export class ReviewRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

// 409 means the row left 'pending' on the server (applied elsewhere or
// superseded by a newer suggestion) while the panel still showed it.
export function isStaleReviewError(err: unknown): boolean {
  return err instanceof ReviewRequestError && err.status === 409
}

export async function reviewUpdate(
  updateId: string,
  action: ReviewAction,
  payload?: UpdatePayload,
): Promise<ReviewUpdateResponse> {
  const init: RequestInit = { method: 'POST' }
  if (action === 'approve' && payload) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify({ payload_json: payload })
  }

  const res = await fetch(`/api/updates/${updateId}/${action}`, init)
  const data = await res.json().catch(() => ({})) as ReviewUpdateResponse & { error?: string }
  if (!res.ok) {
    throw new ReviewRequestError(data.error ?? 'Failed to update', res.status)
  }
  return data
}
