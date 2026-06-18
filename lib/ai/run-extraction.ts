import type { SupabaseClient } from '@supabase/supabase-js'
import { mockExtract, groupExtracted, summarizeExtracted, type ExtractedItem } from '@/lib/ai/mock-extract'
import { llmExtract, type ExtractAttachment, type LLMUsage } from '@/lib/ai/llm-extract'
import { estimateCostUsd } from '@/lib/ai/pricing'
import { dedupeExtractedItems, reconcileAgainstPending, type PendingProposalLite } from '@/lib/ai/dedupe'
import { completePackages } from '@/lib/ai/complete-packages'
import { composeFileReply, type FileReplyScenario, type ReplyItem } from '@/lib/ai/compose-reply'
import type {
  BudgetItemPayload,
  EventStateContext,
  Json,
  TaskPayload,
  TimelineItemPayload,
  UpdateType,
  VendorPayload,
} from '@/lib/types'

// Shared extraction pipeline. Both the Ask Glenn text route and the Event
// Library file route call this so document extraction reuses the exact same
// proposal/review/provenance path — never a forked pipeline. Callers handle
// auth + request parsing; this owns rate limiting, event access, message +
// ai_run + proposed_updates writes, supersession, and the assistant reply.

type CountByType = Record<UpdateType, number>
type ExtractionMode = 'anthropic' | 'mock'

interface ExtractionDiagnostics {
  mode: ExtractionMode
  raw_count: number
  raw_count_by_type: CountByType
  kept_count: number
  kept_count_by_type: CountByType
  deduped_count: number
  package_completed: number
  dropped: Array<{ update_type: UpdateType; label: string; reason: string }>
  inserted_count: number
}

type ProposedOperation = 'insert' | 'update' | 'archive'

interface VendorCorrectionTarget {
  id: string
  name: string
  category: string | null
  status: 'prospect' | 'contacted' | 'confirmed' | 'declined'
  estimated_cost: number | null
  contact_name: string | null
  email: string | null
  phone: string | null
  notes: string | null
}

interface TaskCorrectionTarget {
  id: string
  title: string
  status: 'todo' | 'in_progress'
  priority: 'low' | 'medium' | 'high'
  description: string | null
  due_date: string | null
}

interface BudgetCorrectionTarget {
  id: string
  category: string
  description: string
  estimated_cost: number | null
  actual_cost: number | null
  status: 'estimated' | 'committed' | 'paid'
  vendor_id: string | null
}

interface TimelineCorrectionTarget {
  id: string
  title: string
  description: string | null
  starts_at: string | null
  ends_at: string | null
  type: 'milestone' | 'task' | 'deadline' | 'planning'
}

type ExtractedItemWithOperation = ExtractedItem & {
  operation?: ProposedOperation
  target_record_type?: UpdateType | null
  target_record_id?: string | null
  target_snapshot_json?: Json | null
}

const EMPTY_COUNTS: CountByType = {
  task: 0,
  vendor: 0,
  budget_item: 0,
  timeline_item: 0,
  decision: 0,
  risk: 0,
  open_question: 0,
}

// Mirrors the Review panel's needs-answer rule.
const NEEDS_ANSWER_CONFIDENCE = 0.75

function shouldIncludeDiagnostics(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.GLENN_EXTRACT_DEBUG === '1'
}

function countByType(items: ExtractedItem[]): CountByType {
  const counts = { ...EMPTY_COUNTS }
  for (const item of items) counts[item.update_type] += 1
  return counts
}

function itemLabel(item: ExtractedItem): string {
  const payload = item.payload as unknown as Record<string, unknown>
  const raw =
    payload.title ??
    payload.name ??
    payload.question ??
    payload.description ??
    payload.category ??
    'Untitled suggestion'
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim().slice(0, 120) : 'Untitled suggestion'
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function isPlaceholderVendorName(name: string | null | undefined): boolean {
  const normalized = normalizeText(name)
  return normalized.length === 0 || normalized === 'unknown'
}

function hasRealVendorName(name: string | null | undefined): boolean {
  const normalized = normalizeText(name)
  return normalized.length > 1 && !isPlaceholderVendorName(name)
}

function includesNormalized(haystack: string | null | undefined, needle: string | null | undefined): boolean {
  const normalizedHaystack = normalizeText(haystack)
  const normalizedNeedle = normalizeText(needle)
  return normalizedNeedle.length > 1 && normalizedHaystack.includes(normalizedNeedle)
}

function serviceWords(value: string | null | undefined): Set<string> {
  const normalized = normalizeText(value)
  const groups: Array<[string, string[]]> = [
    ['floral', ['floral', 'florist', 'flower', 'flowers', 'blooms', 'petal', 'stem', 'candles', 'decor']],
    ['photo', ['photo', 'photography', 'photographer']],
    ['venue', ['venue', 'room', 'restaurant', 'space']],
    ['catering', ['catering', 'caterer', 'food', 'beverage', 'dinner', 'appetizer']],
    ['audio', ['audio', 'speaker', 'microphone', 'av', 'sound']],
    ['music', ['music', 'dj', 'band']],
  ]
  const found = new Set<string>()
  for (const [key, terms] of groups) {
    if (terms.some((term) => normalized.includes(term))) found.add(key)
  }
  return found
}

function hasServiceOverlap(vendor: VendorCorrectionTarget, text: string): boolean {
  const vendorWords = serviceWords([vendor.name, vendor.category, vendor.notes].filter(Boolean).join(' '))
  const recordWords = serviceWords(text)
  if (vendorWords.size === 0 || recordWords.size === 0) return false
  for (const word of vendorWords) {
    if (recordWords.has(word)) return true
  }
  return false
}

function relatedByVendorNameAndService(vendor: VendorCorrectionTarget, text: string): boolean {
  return includesNormalized(text, vendor.name) && hasServiceOverlap(vendor, text)
}

function sharedVendorServiceEvidence(candidate: VendorPayload, target: VendorCorrectionTarget): boolean {
  const haystack = normalizeText(
    [candidate.name, candidate.category, candidate.notes, target.category, target.notes].filter(Boolean).join(' '),
  )
  const serviceTerms = ['floral', 'florist', 'flower', 'flowers', 'delivery', 'dropoff', 'drop off']
  return serviceTerms.some((term) => haystack.includes(term))
}

function findVendorCorrectionTarget(
  item: ExtractedItem,
  existingVendors: VendorCorrectionTarget[],
): VendorCorrectionTarget | null {
  if (item.update_type !== 'vendor') return null
  const candidate = item.payload as VendorPayload
  if (!hasRealVendorName(candidate.name)) return null

  for (const target of existingVendors) {
    if (!isPlaceholderVendorName(target.name)) continue
    const categoryMatch =
      candidate.category !== null &&
      target.category !== null &&
      normalizeText(candidate.category) === normalizeText(target.category)
    const costMatch =
      candidate.estimated_cost !== null &&
      target.estimated_cost !== null &&
      Number(candidate.estimated_cost) === Number(target.estimated_cost)
    const serviceEvidence = sharedVendorServiceEvidence(candidate, target)
    if (categoryMatch && (costMatch || serviceEvidence)) return target
    if (costMatch && serviceEvidence) return target
  }
  return null
}

function applyVendorCorrectionOperations(
  items: ExtractedItem[],
  existingVendors: VendorCorrectionTarget[],
): ExtractedItemWithOperation[] {
  return items.map((item) => {
    const target = findVendorCorrectionTarget(item, existingVendors)
    if (!target) return { ...item, operation: 'insert' }
    return {
      ...item,
      operation: 'update',
      target_record_type: 'vendor',
      target_record_id: target.id,
      target_snapshot_json: target as unknown as Json,
    }
  })
}

function sameTargetExists(items: ExtractedItemWithOperation[], updateType: UpdateType, targetId: string): boolean {
  return items.some(
    (item) =>
      item.update_type === updateType &&
      item.target_record_id === targetId &&
      (item.operation === 'archive' || item.operation === 'update'),
  )
}

function vendorArchiveTargets(items: ExtractedItemWithOperation[]): VendorCorrectionTarget[] {
  const targets: VendorCorrectionTarget[] = []
  for (const item of items) {
    if (item.update_type !== 'vendor' || item.operation !== 'archive') continue
    const snapshot = item.target_snapshot_json
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) continue
    const value = snapshot as unknown as Partial<VendorCorrectionTarget>
    if (typeof value.id === 'string' && typeof value.name === 'string') {
      targets.push(value as VendorCorrectionTarget)
    }
  }
  return targets
}

function buildRelatedCleanupProposals(
  vendorArchives: VendorCorrectionTarget[],
  existingBudgetItems: BudgetCorrectionTarget[],
  existingTimelineItems: TimelineCorrectionTarget[],
  existingTasks: TaskCorrectionTarget[],
  alreadyKept: ExtractedItemWithOperation[],
): ExtractedItemWithOperation[] {
  const cleanup: ExtractedItemWithOperation[] = []

  for (const vendor of vendorArchives) {
    const vendorName = vendor.name
    const reason = `No longer needed because ${vendorName} canceled.`

    for (const budget of existingBudgetItems) {
      if (sameTargetExists([...alreadyKept, ...cleanup], 'budget_item', budget.id)) continue
      const budgetText = [budget.description, budget.category].filter(Boolean).join(' ')
      const isRelated = budget.vendor_id === vendor.id || relatedByVendorNameAndService(vendor, budgetText)
      if (!isRelated) continue
      const payload: BudgetItemPayload = {
        category: budget.category,
        description: budget.description,
        estimated_cost: budget.estimated_cost,
        actual_cost: budget.actual_cost,
        status: budget.status,
        vendor_name: vendorName,
        archive_reason: reason,
      }
      cleanup.push({
        update_type: 'budget_item',
        payload,
        confidence: 0.95,
        rationale: `Related budget item references ${vendorName} and should be removed deliberately.`,
        operation: 'archive',
        target_record_type: 'budget_item',
        target_record_id: budget.id,
        target_snapshot_json: budget as unknown as Json,
      })
    }

    for (const timeline of existingTimelineItems) {
      if (sameTargetExists([...alreadyKept, ...cleanup], 'timeline_item', timeline.id)) continue
      const timelineText = [timeline.title, timeline.description].filter(Boolean).join(' ')
      if (!relatedByVendorNameAndService(vendor, timelineText)) continue
      const payload: TimelineItemPayload = {
        title: timeline.title,
        description: timeline.description,
        starts_at: timeline.starts_at,
        ends_at: timeline.ends_at,
        type: timeline.type,
        archive_reason: reason,
      }
      cleanup.push({
        update_type: 'timeline_item',
        payload,
        confidence: 0.95,
        rationale: `Related timeline item references ${vendorName} and should be removed deliberately.`,
        operation: 'archive',
        target_record_type: 'timeline_item',
        target_record_id: timeline.id,
        target_snapshot_json: timeline as unknown as Json,
      })
    }

    for (const task of existingTasks) {
      if (sameTargetExists([...alreadyKept, ...cleanup], 'task', task.id)) continue
      const taskText = [task.title, task.description].filter(Boolean).join(' ')
      if (!relatedByVendorNameAndService(vendor, taskText)) continue
      const existingDescription = task.description?.trim()
      const description = existingDescription ? `${existingDescription}\n\n${reason}` : reason
      const payload: TaskPayload = {
        title: task.title,
        description,
        due_date: task.due_date,
        priority: task.priority,
        status: 'done',
        owner_name: null,
        archive_reason: reason,
      }
      cleanup.push({
        update_type: 'task',
        payload,
        confidence: 0.95,
        rationale: reason,
        operation: 'update',
        target_record_type: 'task',
        target_record_id: task.id,
        target_snapshot_json: task as unknown as Json,
      })
    }
  }

  return cleanup
}

function payloadArchiveLabel(item: ExtractedItem): string {
  const payload = item.payload as unknown as Record<string, unknown>
  const raw = payload.name ?? payload.description ?? payload.title ?? ''
  return typeof raw === 'string' ? raw : ''
}

function isCancellationTaskCleanup(item: ExtractedItem): boolean {
  if (item.update_type !== 'task' || item.operation !== 'update') return false
  const payload = item.payload as unknown as Record<string, unknown>
  const status = typeof payload.status === 'string' ? payload.status : ''
  const description = typeof payload.description === 'string' ? payload.description.toLowerCase() : ''
  return (
    status === 'done' &&
    (description.includes('no longer needed because') ||
      description.includes('canceled') ||
      description.includes('cancelled'))
  )
}

function findArchiveTargetByLabel(
  item: ExtractedItem,
  existingTasks: TaskCorrectionTarget[],
  existingVendors: VendorCorrectionTarget[],
  existingBudgetItems: BudgetCorrectionTarget[],
  existingTimelineItems: TimelineCorrectionTarget[],
): TaskCorrectionTarget | VendorCorrectionTarget | BudgetCorrectionTarget | TimelineCorrectionTarget | null {
  if (item.operation !== 'archive') return null
  const label = payloadArchiveLabel(item)
  if (!label.trim()) return null
  const normalizedLabel = normalizeText(label)

  if (item.update_type === 'vendor') {
    return existingVendors.find((vendor) => normalizeText(vendor.name) === normalizedLabel) ?? null
  }
  if (item.update_type === 'budget_item') {
    return (
      existingBudgetItems.find((budget) => {
        const normalizedDescription = normalizeText(budget.description)
        return (
          normalizedDescription === normalizedLabel ||
          normalizedDescription.includes(normalizedLabel) ||
          normalizedLabel.includes(normalizedDescription)
        )
      }) ?? null
    )
  }
  if (item.update_type === 'timeline_item') {
    return (
      existingTimelineItems.find((timeline) => {
        const normalizedTitle = normalizeText(timeline.title)
        return (
          normalizedTitle === normalizedLabel ||
          normalizedTitle.includes(normalizedLabel) ||
          normalizedLabel.includes(normalizedTitle)
        )
      }) ?? null
    )
  }
  if (item.update_type === 'task') {
    return existingTasks.find((task) => normalizeText(task.title) === normalizedLabel) ?? null
  }
  return null
}

// Validates LLM-proposed correction/archive targets against real event rows.
// The snapshot is always rebuilt from the DB row — never trusted from the model.
function resolveCorrectionTargets(
  items: ExtractedItem[],
  existingTasks: TaskCorrectionTarget[],
  existingVendors: VendorCorrectionTarget[],
  existingBudgetItems: BudgetCorrectionTarget[],
  existingTimelineItems: TimelineCorrectionTarget[],
): { kept: ExtractedItemWithOperation[]; droppedCorrections: ExtractedItem[] } {
  const kept: ExtractedItemWithOperation[] = []
  const droppedCorrections: ExtractedItem[] = []

  for (const item of items) {
    if (item.update_type === 'task' && item.operation === 'archive') {
      droppedCorrections.push(item)
      continue
    }

    const targetId = item.target_record_id ?? null
    const targetById =
      item.update_type === 'task'
        ? existingTasks.find((t) => t.id === targetId) ?? null
        : item.update_type === 'vendor'
        ? existingVendors.find((v) => v.id === targetId) ?? null
        : item.update_type === 'budget_item'
        ? existingBudgetItems.find((b) => b.id === targetId) ?? null
        : item.update_type === 'timeline_item'
        ? existingTimelineItems.find((t) => t.id === targetId) ?? null
        : null
    const target =
      targetById ??
      findArchiveTargetByLabel(item, existingTasks, existingVendors, existingBudgetItems, existingTimelineItems)

    if (target) {
      kept.push({
        ...item,
        operation: item.operation as ProposedOperation,
        target_record_type: item.update_type,
        target_record_id: target.id,
        target_snapshot_json: target as unknown as Json,
      })
    } else if (item.operation === 'archive' || isCancellationTaskCleanup(item)) {
      droppedCorrections.push(item)
    } else {
      kept.push({ ...item, operation: 'insert', target_record_type: null, target_record_id: null, target_snapshot_json: null })
    }
  }

  return { kept, droppedCorrections }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface RunExtractionParams {
  supabase: SupabaseClient
  eventId: string
  userId: string
  // For typed chat: the user's note. For files: ignored as LLM input (the
  // attachment/file text drives extraction) but used to derive the source label.
  inputText: string
  attachment?: ExtractAttachment | null
  channel?: string | null
  fileDisplayName?: string | null
  fileName?: string | null
}

export interface RunExtractionFileMeta {
  title: string | null
  category: string | null
  labels: string[] | null
  summary: string | null
}

export interface RunExtractionData {
  message_id: string
  ai_run_id: string
  assistant_message: string
  understood_summary: string[]
  recommended_summary: string[]
  grouped: ReturnType<typeof groupExtracted>
  proposed_count: number
  outcome: 'updates' | 'no_updates' | 'low_confidence' | 'failed'
  file_meta: RunExtractionFileMeta | null
}

export type RunExtractionResult =
  | { ok: true; data: RunExtractionData }
  | { ok: false; status: number; error: string }

interface AiRunTelemetry {
  model: string
  provider: string
  source_type: 'text' | 'pdf' | 'image'
  input_tokens: number | null
  output_tokens: number | null
  total_tokens: number | null
  estimated_cost_usd: number | null
  duration_ms: number
}

function buildTelemetry(
  model: string | undefined,
  usage: LLMUsage | null | undefined,
  attachment: ExtractAttachment | null,
  durationMs: number,
): AiRunTelemetry {
  const sourceType: AiRunTelemetry['source_type'] = attachment ? attachment.kind : 'text'
  const inputTokens = usage?.input_tokens ?? null
  const outputTokens = usage?.output_tokens ?? null
  const totalTokens = inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null
  return {
    model: model ?? 'unknown',
    provider: 'anthropic',
    source_type: sourceType,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    estimated_cost_usd: model ? estimateCostUsd(model, usage) : null,
    duration_ms: durationMs,
  }
}

function fileInstruction(displayName: string, kind: ExtractAttachment['kind'] | null): string {
  const base =
    `This is an uploaded file named "${displayName}". Read it carefully. ` +
    `Transcribe its key content into source_text, suggest a concise file_title, a file_category, and up to 4 file_labels, ` +
    `then extract any event updates it states — vendors, costs, quotes, deposits, timing, tasks, decisions, risks, or open questions. ` +
    `Only extract facts actually stated in the file. If you cannot read it confidently, leave the item arrays empty and say so.`
  if (kind !== 'image') return base
  return (
    base +
    ` This file is a screenshot — likely of a text message, email, vendor quote, menu, or itinerary. ` +
    `Extract only facts explicitly visible in the image. Do not infer dates, prices, names, or quantities that are not clearly shown. ` +
    `If a value is ambiguous or cut off, raise it as an open_question rather than guessing. ` +
    `Ignore UI chrome, app names, timestamps, status bars, and signatures.`
  )
}

export async function runExtraction(params: RunExtractionParams): Promise<RunExtractionResult> {
  const { supabase, eventId, userId, inputText } = params
  const attachment = params.attachment ?? null
  const isFile = !!attachment || params.channel === 'file'
  const channel = params.channel ?? (isFile ? 'file' : null)
  const displayName = params.fileDisplayName ?? params.fileName ?? 'the file'
  const fileName = params.fileName ?? displayName

  // Rate limit — max 20 AI extractions per user per hour (DB-backed)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: recentRuns } = await supabase
    .from('ai_runs')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', userId)
    .gte('created_at', oneHourAgo)
  if ((recentRuns ?? 0) >= 20) {
    return {
      ok: false,
      status: 429,
      error: 'Rate limit exceeded. You can submit up to 20 updates per hour. Try again shortly.',
    }
  }

  // Event access — RLS-safe: only returns the row if the user is an event member
  const { data: event } = await supabase
    .from('events')
    .select('id, name, event_type, event_date, location, description, attendee_target, budget_target')
    .eq('id', eventId)
    .single()
  if (!event) {
    return { ok: false, status: 404, error: 'Event not found or access denied' }
  }

  // 0. Fetch compact event state for LLM context and app-side dedupe (parallel, RLS-safe)
  const [
    { data: existingTaskRows },
    { data: existingVendorRows },
    { data: existingBudgetRows },
    { data: existingTimelineRows },
    { data: existingRiskRows },
    { data: existingQuestionRows },
    { data: pendingUpdateRows },
    { data: recentAiRunRows },
  ] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, title, status, priority, description, due_date')
      .eq('event_id', eventId)
      .in('status', ['todo', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(15),
    supabase
      .from('vendors')
      .select('id, name, category, status, estimated_cost, contact_name, email, phone, notes')
      .eq('event_id', eventId)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('budget_items')
      .select('id, category, description, estimated_cost, actual_cost, status, vendor_id')
      .eq('event_id', eventId)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('timeline_items')
      .select('id, title, description, starts_at, ends_at, type')
      .eq('event_id', eventId)
      .is('archived_at', null)
      .order('starts_at', { ascending: false })
      .limit(20),
    supabase
      .from('risks')
      .select('title, severity, description, mitigation')
      .eq('event_id', eventId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('open_questions')
      .select('question')
      .eq('event_id', eventId)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('proposed_updates')
      .select('id, update_type, payload_json, confidence, rationale, operation')
      .eq('event_id', eventId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('ai_runs')
      .select('output_json')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(3),
  ])

  function pendingLabel(updateType: string, payloadJson: unknown): string {
    if (typeof payloadJson !== 'object' || payloadJson === null) return '(unknown)'
    const p = payloadJson as Record<string, unknown>
    let field: unknown
    switch (updateType) {
      case 'task':          field = p['title']; break
      case 'vendor':        field = p['name']; break
      case 'budget_item':   field = p['description']; break
      case 'risk':          field = p['title']; break
      case 'open_question': field = p['question']; break
      case 'decision':      field = p['title']; break
      case 'timeline_item': field = p['title']; break
      default:              field = null
    }
    return typeof field === 'string' && field.trim().length > 0 ? field : '(unknown)'
  }

  function pendingDetail(updateType: string, payloadJson: unknown): string | null {
    if (typeof payloadJson !== 'object' || payloadJson === null) return null
    const p = payloadJson as Record<string, unknown>
    const money = (v: unknown) => (typeof v === 'number' ? `$${v.toLocaleString()}` : null)
    const text = (v: unknown) => (typeof v === 'string' && v.trim().length > 0 ? v : null)
    switch (updateType) {
      case 'vendor':
        return [text(p['category']), text(p['status']), money(p['estimated_cost'])].filter(Boolean).join(', ') || null
      case 'budget_item':
        return [text(p['category']), money(p['estimated_cost'])].filter(Boolean).join(', ') || null
      case 'timeline_item': {
        const starts = text(p['starts_at'])
        const ends = text(p['ends_at'])
        return starts ? (ends ? `${starts} to ${ends}` : starts) : null
      }
      case 'task':
        return text(p['due_date']) ? `due ${p['due_date']}` : null
      default:
        return null
    }
  }

  const pendingPool: PendingProposalLite[] = (pendingUpdateRows ?? []).map((u) => ({
    id: u.id as string,
    update_type: u.update_type as UpdateType,
    payload_json: u.payload_json as PendingProposalLite['payload_json'],
    confidence: (u.confidence as number | null) ?? null,
    operation: (u.operation as 'insert' | 'update' | 'archive' | null) ?? 'insert',
  }))
  const pendingRationales = new Map<string, string | null>(
    (pendingUpdateRows ?? []).map((u) => [u.id as string, (u.rationale as string | null) ?? null]),
  )

  function stringArray(val: unknown): string[] {
    if (!Array.isArray(val)) return []
    return val.filter((s): s is string => typeof s === 'string').slice(0, 4)
  }

  const eventStateContext: EventStateContext = {
    event: {
      name: (event.name as string) ?? '',
      event_type: (event.event_type as string | null) ?? null,
      event_date: (event.event_date as string | null) ?? null,
      location: (event.location as string | null) ?? null,
      description: (event.description as string | null) ?? null,
      attendee_target: (event.attendee_target as number | null) ?? null,
      budget_target: (event.budget_target as number | null) ?? null,
    },
    existing_tasks: (existingTaskRows ?? []).map((t) => ({
      id: t.id as string,
      title: t.title as string,
      status: t.status as 'todo' | 'in_progress',
      priority: t.priority as 'low' | 'medium' | 'high',
      description: (t.description as string | null) ?? null,
      due_date: (t.due_date as string | null) ?? null,
    })),
    existing_vendors: (existingVendorRows ?? []).map((v) => ({
      id: v.id as string,
      name: v.name as string,
      category: (v.category as string | null) ?? null,
      status: v.status as 'prospect' | 'contacted' | 'confirmed' | 'declined',
      estimated_cost: (v.estimated_cost as number | null) ?? null,
      contact_name: (v.contact_name as string | null) ?? null,
      email: (v.email as string | null) ?? null,
      phone: (v.phone as string | null) ?? null,
      notes: (v.notes as string | null) ?? null,
    })),
    existing_budget_items: (existingBudgetRows ?? []).map((b) => ({
      id: b.id as string,
      category: b.category as string,
      description: b.description as string,
      estimated_cost: (b.estimated_cost as number | null) ?? null,
      actual_cost: (b.actual_cost as number | null) ?? null,
      status: b.status as 'estimated' | 'committed' | 'paid',
      vendor_id: (b.vendor_id as string | null) ?? null,
    })),
    existing_timeline_items: (existingTimelineRows ?? []).map((t) => ({
      id: t.id as string,
      title: t.title as string,
      description: (t.description as string | null) ?? null,
      starts_at: (t.starts_at as string | null) ?? null,
      ends_at: (t.ends_at as string | null) ?? null,
      type: t.type as 'milestone' | 'task' | 'deadline' | 'planning',
    })),
    existing_risks: (existingRiskRows ?? []).map((r) => ({
      title: r.title as string,
      severity: r.severity as 'low' | 'medium' | 'high',
      description: (r.description as string | null) ?? null,
      mitigation: (r.mitigation as string | null) ?? null,
    })),
    existing_open_questions: (existingQuestionRows ?? []).map((q) => ({ question: q.question as string })),
    pending_proposed_updates: pendingPool.slice(0, 15).map((u) => {
      const needsAnswer = u.confidence === null || u.confidence < NEEDS_ANSWER_CONFIDENCE
      return {
        id: u.id,
        update_type: u.update_type,
        label: pendingLabel(u.update_type, u.payload_json),
        detail: pendingDetail(u.update_type, u.payload_json),
        needs_answer: needsAnswer,
        question: needsAnswer ? pendingRationales.get(u.id) ?? null : null,
        operation: u.operation ?? 'insert',
      }
    }),
    recent_ai_run_summaries: (recentAiRunRows ?? [])
      .map((run) => {
        const o =
          typeof run.output_json === 'object' && run.output_json !== null
            ? (run.output_json as Record<string, unknown>)
            : {}
        return {
          understood_summary: stringArray(o['understood_summary']),
          recommended_summary: stringArray(o['recommended_summary']),
        }
      })
      .filter((s) => s.understood_summary.length > 0 || s.recommended_summary.length > 0),
  }

  try {
    // 1. Save the source message. For files, the body is a concise label that
    // gets enriched with a summary after extraction (no document-text wall).
    const initialContent = isFile ? `Uploaded "${displayName}"` : inputText
    const { data: message, error: msgErr } = await supabase
      .from('messages')
      .insert({ event_id: eventId, user_id: userId, role: 'user', content: initialContent, channel })
      .select('id')
      .single()
    if (msgErr || !message) {
      console.error('message insert error:', msgErr)
      return { ok: false, status: 500, error: 'Failed to save message' }
    }

    // 2. Conversation history — typed chat only. A file is a standalone source.
    let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
    if (!isFile) {
      const { data: historyRows } = await supabase
        .from('messages')
        .select('role, content')
        .eq('event_id', eventId)
        .neq('id', message.id)
        .order('created_at', { ascending: false })
        .limit(10)
      conversationHistory = (historyRows ?? [])
        .reverse()
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
    }

    // 3. Run extraction — real LLM if API key set, deterministic mock otherwise
    let rawExtracted: ExtractedItem[] = []
    let assistantContent = ''
    let understoodSummary: string[] = []
    let recommendedSummary: string[] = []
    let fileMeta: RunExtractionFileMeta | null = null
    let extractionFailed = false
    let documentReadable = !attachment // typed-text & TXT sources are always "read"

    const useMock = process.env.GLENN_USE_MOCK === 'true'
    const hasApiKey = !!process.env.ANTHROPIC_API_KEY
    const extractionMode: ExtractionMode = hasApiKey && !useMock ? 'anthropic' : 'mock'

    // Trust guard: never silently fabricate. Mock extraction is opt-in only
    // (GLENN_USE_MOCK=true). Without an API key and without explicit mock, refuse a
    // typed note rather than invent keyword-matched suggestions. (A file with no
    // engine is kept as source-only below — no fabrication risk there.)
    if (extractionMode === 'mock' && !useMock && !isFile) {
      await supabase.from('messages').delete().eq('id', message.id)
      return {
        ok: false,
        status: 503,
        error: "Glenn isn't set up to read notes right now. Add ANTHROPIC_API_KEY, or set GLENN_USE_MOCK=true for offline demo mode.",
      }
    }
    const llmInput = attachment ? fileInstruction(displayName, attachment.kind) : inputText
    const summarySource = isFile ? displayName : inputText

    // Telemetry — populated only for real LLM runs; mock mode leaves it null.
    let telemetry: AiRunTelemetry | null = null

    if (extractionMode === 'anthropic') {
      const startedAt = Date.now()
      try {
        const result = await llmExtract(
          llmInput,
          conversationHistory,
          eventStateContext,
          attachment ? { attachment } : undefined,
        )
        telemetry = buildTelemetry(result.model, result.usage, attachment, Date.now() - startedAt)
        rawExtracted = result.items
        assistantContent = result.responseMessage
        if (result.fileMeta) {
          documentReadable = !!result.fileMeta.sourceText
          fileMeta = {
            title: result.fileMeta.title,
            category: result.fileMeta.category,
            labels: result.fileMeta.labels,
            summary: null,
          }
        }
        const fallbackSummary = summarizeExtracted(summarySource, rawExtracted)
        understoodSummary = result.understoodSummary.length > 0 ? result.understoodSummary : fallbackSummary.understoodSummary
        recommendedSummary = result.recommendedSummary.length > 0 ? result.recommendedSummary : fallbackSummary.recommendedSummary
      } catch (err) {
        console.error('extract: llm failure:', err instanceof Error ? err.message : String(err), err)
        if (isFile) {
          // A file must stay visible even when reading it fails — record the
          // failure rather than discarding the upload.
          extractionFailed = true
        } else {
          await supabase.from('messages').delete().eq('id', message.id)
          return {
            ok: false,
            status: 502,
            error: 'Glenn had trouble reading that note. Nothing was changed — try sending it again.',
          }
        }
      }
    } else if (!attachment) {
      // Mock mode has no vision — it only runs on real text (typed notes, TXT).
      // Reaching here without explicit GLENN_USE_MOCK means a TXT file with no
      // engine: keep it as source-only rather than fabricating from keywords.
      if (!useMock) {
        documentReadable = false
      } else {
        rawExtracted = mockExtract(inputText)
        const summary = summarizeExtracted(summarySource, rawExtracted)
        understoodSummary = summary.understoodSummary
        recommendedSummary = summary.recommendedSummary
      }
    } else {
      // Image/PDF with no LLM available — keep as a source, nothing extracted.
      documentReadable = false
    }

    // 3b. App-side dedupe — inserts only. Corrections/archives target existing rows.
    const correctionCandidates = rawExtracted.filter((item) => (item.operation ?? 'insert') !== 'insert')
    const insertCandidates = rawExtracted.filter((item) => (item.operation ?? 'insert') === 'insert')

    const dedupeResult = dedupeExtractedItems(insertCandidates, eventStateContext)
    const { kept: resolvedCorrections, droppedCorrections } = resolveCorrectionTargets(
      correctionCandidates,
      eventStateContext.existing_tasks,
      eventStateContext.existing_vendors,
      eventStateContext.existing_budget_items,
      eventStateContext.existing_timeline_items,
    )
    if (droppedCorrections.length > 0) {
      console.warn(
        'extract: dropped correction proposals with unresolvable targets:',
        droppedCorrections.map((item) => itemLabel(item)),
      )
    }
    const resolvedWithAppCorrections = [
      ...resolvedCorrections,
      ...applyVendorCorrectionOperations(dedupeResult.kept, eventStateContext.existing_vendors),
    ]

    const packageCompletion = completePackages(resolvedWithAppCorrections, isFile ? '' : inputText, eventStateContext)
    if (packageCompletion.notes.length > 0) {
      console.info('extract: package completion:', packageCompletion.notes)
    }

    const composed: ExtractedItemWithOperation[] = [
      ...resolvedWithAppCorrections,
      ...packageCompletion.added,
      ...buildRelatedCleanupProposals(
        vendorArchiveTargets(resolvedWithAppCorrections),
        eventStateContext.existing_budget_items,
        eventStateContext.existing_timeline_items,
        eventStateContext.existing_tasks,
        resolvedWithAppCorrections,
      ),
    ]

    // 3c. Reconcile against pending proposals.
    const reconcileResult = reconcileAgainstPending(composed, pendingPool)
    if (reconcileResult.invalid_replace_ids.length > 0) {
      console.warn('extract: stripped invalid replaces_queued_id links:', reconcileResult.invalid_replace_ids)
    }
    const extracted = reconcileResult.kept.map((entry) => entry.item)
    const totalDroppedCount = dedupeResult.deduped_count + reconcileResult.dropped.length

    if (extractionMode === 'mock' && !isFile) {
      const offlineNotice =
        '⚠️ Offline demo mode (GLENN_USE_MOCK) — these suggestions are generated locally, not from a live AI read of your notes.\n\n'
      assistantContent =
        offlineNotice +
        (extracted.length === 0
          ? "Got it — I saved your note. I didn't see anything that needs to update the event plan yet, but you can tell me about vendors, tasks, costs, deadlines, risks, or decisions anytime."
          : `Got it — I found ${extracted.length} thing${extracted.length !== 1 ? 's' : ''} to add to the plan. Review the suggestions on the right and click Apply on anything that looks right.`)
    }

    if (!isFile && extracted.length === 0 && totalDroppedCount > 0) {
      assistantContent =
        "I reviewed this and didn't add new suggestions — these items already appear to be tracked in the plan or queued for review."
    }

    const grouped = groupExtracted(extracted)
    const includeDiagnostics = shouldIncludeDiagnostics()
    let diagnostics: ExtractionDiagnostics | null = includeDiagnostics
      ? {
          mode: extractionMode,
          raw_count: rawExtracted.length,
          raw_count_by_type: countByType(rawExtracted),
          kept_count: extracted.length,
          kept_count_by_type: countByType(extracted),
          deduped_count: totalDroppedCount,
          package_completed: packageCompletion.added.length,
          dropped: [
            ...dedupeResult.dropped.map((drop) => ({
              update_type: drop.dropped_item.update_type,
              label: itemLabel(drop.dropped_item),
              reason: drop.reason,
            })),
            ...reconcileResult.dropped.map((drop) => ({
              update_type: drop.dropped_item.update_type,
              label: itemLabel(drop.dropped_item),
              reason: drop.reason,
            })),
            ...droppedCorrections.map((item) => ({
              update_type: item.update_type,
              label: itemLabel(item),
              reason: 'correction target not found in event state',
            })),
          ],
          inserted_count: 0,
        }
      : null

    const outputJson = {
      understood_summary: understoodSummary,
      recommended_summary: recommendedSummary,
      deduped_count: totalDroppedCount,
      ...(diagnostics ? { diagnostics } : {}),
      tasks: grouped.tasks.map((i) => i.payload),
      vendors: grouped.vendors.map((i) => i.payload),
      budget_items: grouped.budget_items.map((i) => i.payload),
      timeline_items: grouped.timeline_items.map((i) => i.payload),
      decisions: grouped.decisions.map((i) => i.payload),
      risks: grouped.risks.map((i) => i.payload),
      open_questions: grouped.open_questions.map((i) => i.payload),
    }

    // 4. Save ai_run
    const { data: aiRun, error: runErr } = await supabase
      .from('ai_runs')
      .insert({
        event_id: eventId,
        source_message_id: message.id,
        status: extractionFailed ? 'failed' : 'pending_review',
        input_text: isFile ? llmInput : inputText,
        output_json: outputJson,
        created_by: userId,
        ...(telemetry ?? {}),
      })
      .select('id')
      .single()
    if (runErr || !aiRun) {
      console.error('ai_run insert error:', runErr)
      return { ok: false, status: 500, error: 'Failed to create AI run' }
    }

    // 4b. Supersession — retire stale pending proposals claimed during reconciliation.
    const supersededByIndex = new Map<number, string>()
    if (extracted.length > 0) {
      const claimed = new Set<string>()
      const supersededLabels = new Map<string, string>()
      reconcileResult.kept.forEach((entry, index) => {
        if (entry.claimed_pending_ids.length === 0) return
        supersededByIndex.set(index, entry.claimed_pending_ids[0])
        for (const pid of entry.claimed_pending_ids) {
          claimed.add(pid)
          const pendingRow = pendingPool.find((p) => p.id === pid)
          supersededLabels.set(
            pid,
            pendingRow ? pendingLabel(pendingRow.update_type, pendingRow.payload_json) : 'Untitled suggestion',
          )
        }
      })
      if (claimed.size > 0) {
        const { error: supersedeErr } = await supabase
          .from('proposed_updates')
          .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
          .in('id', Array.from(claimed))
          .eq('status', 'pending')
        if (supersedeErr) {
          console.error('extract: supersession update error:', supersedeErr)
        } else {
          await supabase.from('activity_log').insert(
            Array.from(claimed).map((pid) => ({
              event_id: eventId,
              actor_user_id: userId,
              action: 'proposed_update_superseded',
              entity_type: 'proposed_update',
              entity_id: pid,
              metadata_json: {
                superseded_by_ai_run_id: aiRun.id,
                label: supersededLabels.get(pid) ?? 'Untitled suggestion',
              },
            })),
          )
        }
      }
    }

    // 5. Insert proposed_updates
    let insertedCount = 0
    if (extracted.length > 0) {
      const rows = extracted.map((item, index) => ({
        event_id: eventId,
        ai_run_id: aiRun.id,
        source_message_id: message.id,
        update_type: item.update_type,
        payload_json: item.payload,
        confidence: item.confidence,
        operation: item.operation ?? 'insert',
        target_record_type: item.target_record_type ?? null,
        target_record_id: item.target_record_id ?? null,
        target_snapshot_json: item.target_snapshot_json ?? null,
        supersedes_proposed_update_id: supersededByIndex.get(index) ?? null,
        status: 'pending',
        rationale: item.rationale,
      }))
      const { error: updatesErr } = await supabase.from('proposed_updates').insert(rows)
      if (updatesErr) {
        console.error('proposed_updates insert error:', updatesErr)
        return { ok: false, status: 500, error: 'Failed to create proposed updates' }
      }
      insertedCount = rows.length
    }

    if (diagnostics) {
      diagnostics = { ...diagnostics, inserted_count: insertedCount }
      await supabase.from('ai_runs').update({ output_json: { ...outputJson, diagnostics } }).eq('id', aiRun.id)
      if (process.env.GLENN_EXTRACT_DEBUG === '1') console.info('glenn extraction diagnostics', diagnostics)
    }

    // 5b. Determine the file outcome + compose a deterministic, scannable reply.
    const outcome: RunExtractionData['outcome'] = extractionFailed
      ? 'failed'
      : extracted.length > 0
      ? 'updates'
      : documentReadable
      ? 'no_updates'
      : 'low_confidence'

    if (isFile) {
      const ready: ReplyItem[] = extracted
        .filter((i) => (i.operation ?? 'insert') !== 'archive' && (i.confidence ?? 0) >= NEEDS_ANSWER_CONFIDENCE)
        .map((i) => ({ type: i.update_type, label: itemLabel(i) }))
      const needsConfirmation = extracted
        .filter((i) => (i.confidence ?? 0) < NEEDS_ANSWER_CONFIDENCE)
        .map((i) => i.rationale?.trim() || itemLabel(i))
      const removals: ReplyItem[] = extracted
        .filter((i) => (i.operation ?? 'insert') === 'archive')
        .map((i) => ({ type: i.update_type, label: itemLabel(i) }))
      const scenario: FileReplyScenario =
        outcome === 'failed' ? 'failed' : outcome === 'updates' ? 'updates' : outcome === 'low_confidence' ? 'low_confidence' : 'no_updates'
      assistantContent = composeFileReply({ scenario, displayName, fileName, ready, needsConfirmation, removals })

      // Enrich the source message with a short summary (kept compact — never the
      // full document text).
      const summaryLine =
        understoodSummary[0] ?? (fileMeta?.title ? fileMeta.title : null) ?? recommendedSummary[0] ?? null
      const newContent = summaryLine ? `Uploaded "${displayName}"\n\n${summaryLine}` : `Uploaded "${displayName}"`
      await supabase.from('messages').update({ content: newContent }).eq('id', message.id)
      const summary = understoodSummary.length > 0 ? understoodSummary.slice(0, 2).join(' • ') : summaryLine
      fileMeta = {
        title: fileMeta?.title ?? null,
        category: fileMeta?.category ?? null,
        labels: fileMeta?.labels ?? null,
        summary: summary ?? null,
      }
    }

    // 6. Save Glenn's conversational reply as an assistant message
    await supabase.from('messages').insert({
      event_id: eventId,
      user_id: userId,
      role: 'assistant',
      content: assistantContent,
      channel: null,
    })

    if (extracted.length > 0) {
      await supabase.from('activity_log').insert({
        event_id: eventId,
        actor_user_id: userId,
        action: 'proposed_updates_created',
        entity_type: 'ai_run',
        entity_id: aiRun.id,
        metadata_json: { total: extracted.length, deduped_count: totalDroppedCount, channel },
      })
    }

    return {
      ok: true,
      data: {
        message_id: message.id,
        ai_run_id: aiRun.id,
        assistant_message: assistantContent,
        understood_summary: understoodSummary,
        recommended_summary: recommendedSummary,
        grouped,
        proposed_count: insertedCount,
        outcome,
        file_meta: fileMeta,
      },
    }
  } catch (err) {
    console.error('extract: unexpected error:', err instanceof Error ? `${err.message}\n${err.stack}` : String(err))
    return { ok: false, status: 500, error: 'Unexpected error during extraction' }
  }
}
