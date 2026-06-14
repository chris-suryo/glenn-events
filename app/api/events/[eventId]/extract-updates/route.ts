import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ExtractUpdatesSchema } from '@/lib/validators/extract'
import { mockExtract, groupExtracted, summarizeExtracted, type ExtractedItem } from '@/lib/ai/mock-extract'
import { llmExtract } from '@/lib/ai/llm-extract'
import { dedupeExtractedItems, reconcileAgainstPending, type PendingProposalLite } from '@/lib/ai/dedupe'
import { completePackages } from '@/lib/ai/complete-packages'
import type {
  BudgetItemPayload,
  EventStateContext,
  Json,
  TaskPayload,
  TimelineItemPayload,
  UpdateType,
  VendorPayload,
} from '@/lib/types'

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
  dropped: Array<{
    update_type: UpdateType
    label: string
    reason: string
  }>
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

function shouldIncludeDiagnostics(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.GLENN_EXTRACT_DEBUG === '1'
}

function countByType(items: ExtractedItem[]): CountByType {
  const counts = { ...EMPTY_COUNTS }
  for (const item of items) {
    counts[item.update_type] += 1
  }
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

  return typeof raw === 'string' && raw.trim().length > 0
    ? raw.trim().slice(0, 120)
    : 'Untitled suggestion'
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
  const haystack = normalizeText([
    candidate.name,
    candidate.category,
    candidate.notes,
    target.category,
    target.notes,
  ].filter(Boolean).join(' '))

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

    if (categoryMatch && (costMatch || serviceEvidence)) {
      return target
    }
    if (costMatch && serviceEvidence) {
      return target
    }
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

function sameTargetExists(
  items: ExtractedItemWithOperation[],
  updateType: UpdateType,
  targetId: string,
): boolean {
  return items.some((item) =>
    item.update_type === updateType &&
    item.target_record_id === targetId &&
    (item.operation === 'archive' || item.operation === 'update')
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
      const isRelated =
        budget.vendor_id === vendor.id ||
        relatedByVendorNameAndService(vendor, budgetText)
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
      const description = existingDescription
        ? `${existingDescription}\n\n${reason}`
        : reason
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
  return status === 'done' && (
    description.includes('no longer needed because') ||
    description.includes('canceled') ||
    description.includes('cancelled')
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
    return existingBudgetItems.find((budget) => {
      const normalizedDescription = normalizeText(budget.description)
      return normalizedDescription === normalizedLabel ||
        normalizedDescription.includes(normalizedLabel) ||
        normalizedLabel.includes(normalizedDescription)
    }) ?? null
  }

  if (item.update_type === 'timeline_item') {
    return existingTimelineItems.find((timeline) => {
      const normalizedTitle = normalizeText(timeline.title)
      return normalizedTitle === normalizedLabel ||
        normalizedTitle.includes(normalizedLabel) ||
        normalizedLabel.includes(normalizedTitle)
    }) ?? null
  }

  if (item.update_type === 'task') {
    return existingTasks.find((task) => normalizeText(task.title) === normalizedLabel) ?? null
  }

  return null
}

// Validates LLM-proposed correction/archive targets against real event rows.
// The snapshot is always rebuilt from the DB row — never trusted from the model.
// Updates with bad targets downgrade to inserts; archives with bad targets are
// dropped, because inserting a record that represents a cancellation is worse.
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
    const target = targetById ?? findArchiveTargetByLabel(
      item,
      existingTasks,
      existingVendors,
      existingBudgetItems,
      existingTimelineItems,
    )

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
      kept.push({
        ...item,
        operation: 'insert',
        target_record_type: null,
        target_record_id: null,
        target_snapshot_json: null,
      })
    }
  }

  return { kept, droppedCorrections }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params
  const supabase = await createClient()

  // Auth check — proxy.ts marks /api/* public, so we enforce here
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Body validation
  const body = await request.json().catch(() => null)
  const parsed = ExtractUpdatesSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { input_text } = parsed.data

  // Rate limit — max 20 AI extractions per user per hour (DB-backed, no extra dependencies)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: recentRuns } = await supabase
    .from('ai_runs')
    .select('id', { count: 'exact', head: true })
    .eq('created_by', user.id)
    .gte('created_at', oneHourAgo)

  if ((recentRuns ?? 0) >= 20) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. You can submit up to 20 updates per hour. Try again shortly.' },
      { status: 429 }
    )
  }

  // Event access — RLS-safe: only returns row if user is event member
  const { data: event } = await supabase
    .from('events')
    .select('id, name, event_type, event_date, location, description, attendee_target, budget_target')
    .eq('id', eventId)
    .single()

  if (!event) {
    return NextResponse.json({ error: 'Event not found or access denied' }, { status: 404 })
  }

  try {
    // 0. Fetch compact event state for LLM context and app-side dedupe (parallel, all RLS-safe)
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

    // Derive a display label from a pending proposed_update's payload
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

    // Compact key facts so the LLM can recognize a queued suggestion as the
    // thing a new note is talking about (cost, status, timing).
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

    // Mirrors the Review panel's needs-answer rule (confidence < 0.75).
    const NEEDS_ANSWER_CONFIDENCE = 0.75

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

    // Parse ai_run output_json for summary bullets (same pattern as page.tsx)
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
      existing_open_questions: (existingQuestionRows ?? []).map((q) => ({
        question: q.question as string,
      })),
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
        .filter(
          (s) => s.understood_summary.length > 0 || s.recommended_summary.length > 0,
        ),
    }

    // 1. Save user message
    const { data: message, error: msgErr } = await supabase
      .from('messages')
      .insert({
        event_id: eventId,
        user_id: user.id,
        role: 'user',
        content: input_text,
      })
      .select('id')
      .single()

    if (msgErr || !message) {
      console.error('message insert error:', msgErr)
      return NextResponse.json({ error: 'Failed to save message' }, { status: 500 })
    }

    // 2. Fetch recent conversation history for multi-turn context (last 10 messages = ~5 turns)
    const { data: historyRows } = await supabase
      .from('messages')
      .select('role, content')
      .eq('event_id', eventId)
      .neq('id', message.id)             // exclude the message we just saved
      .order('created_at', { ascending: false })
      .limit(10)

    const conversationHistory = (historyRows ?? [])
      .reverse()                          // chronological order for the LLM
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    // 3. Run extraction — real LLM if API key set, deterministic mock otherwise
    let rawExtracted: ReturnType<typeof mockExtract>
    let assistantContent = ''
    let understoodSummary: string[]
    let recommendedSummary: string[]

    const extractionMode: ExtractionMode = process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'mock'

    if (extractionMode === 'anthropic') {
      // LLM failures (API errors, malformed responses) get their own catch:
      // they're transient and retryable, unlike everything after this point.
      let result: Awaited<ReturnType<typeof llmExtract>>
      try {
        result = await llmExtract(input_text, conversationHistory, eventStateContext)
      } catch (err) {
        console.error('extract: llm failure:', err instanceof Error ? err.message : String(err), err)
        // Remove the just-saved user message so a retry doesn't duplicate it
        await supabase.from('messages').delete().eq('id', message.id)
        return NextResponse.json(
          { error: 'Glenn had trouble reading that note. Nothing was changed — try sending it again.' },
          { status: 502 }
        )
      }
      rawExtracted = result.items
      assistantContent = result.responseMessage
      const fallbackSummary = summarizeExtracted(input_text, rawExtracted)
      understoodSummary = result.understoodSummary.length > 0
        ? result.understoodSummary
        : fallbackSummary.understoodSummary
      recommendedSummary = result.recommendedSummary.length > 0
        ? result.recommendedSummary
        : fallbackSummary.recommendedSummary
    } else {
      rawExtracted = mockExtract(input_text)
      const summary = summarizeExtracted(input_text, rawExtracted)
      understoodSummary = summary.understoodSummary
      recommendedSummary = summary.recommendedSummary
    }

    // 3b. App-side dedupe — inserts only. Corrections/archives intentionally
    // resemble the existing rows they target, so dedupe would silently eat them.
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

    // 3b-ii. Package completion — deterministic floor for single-sentence
    // service packages the LLM extracted only partially (vendor without its
    // stated cost/time). Synthesizes only from facts in the vendor's own source
    // sentence; everything still flows through reconcile + Review.
    const packageCompletion = completePackages(resolvedWithAppCorrections, input_text, eventStateContext)
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

    // 3c. Reconcile the batch against pending proposals — one pass, one
    // precedence: a validated replaces_queued_id wins, fuzzy same-type
    // matching claims the rest, and only poorer restatements are dropped.
    const reconcileResult = reconcileAgainstPending(composed, pendingPool)
    if (reconcileResult.invalid_replace_ids.length > 0) {
      console.warn(
        'extract: stripped invalid replaces_queued_id links:',
        reconcileResult.invalid_replace_ids,
      )
    }
    const extracted = reconcileResult.kept.map((entry) => entry.item)
    const totalDroppedCount = dedupeResult.deduped_count + reconcileResult.dropped.length

    if (extractionMode === 'mock') {
      // Fallback response for mock mode (uses deduped count)
      assistantContent = extracted.length === 0
        ? "Got it — I saved your note. I didn't see anything that needs to update the event plan yet, but you can tell me about vendors, tasks, costs, deadlines, risks, or decisions anytime."
        : `Got it — I found ${extracted.length} thing${extracted.length !== 1 ? 's' : ''} to add to the plan. Review the suggestions on the right and click Apply on anything that looks right.`
    }

    // When all extracted items were deduped, override the assistant message for both paths.
    // The LLM's responseMessage references proposals that no longer exist in the queue.
    if (extracted.length === 0 && totalDroppedCount > 0) {
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
        status: 'pending_review',
        input_text,
        output_json: outputJson,
        created_by: user.id,
      })
      .select('id')
      .single()

    if (runErr || !aiRun) {
      console.error('ai_run insert error:', runErr)
      return NextResponse.json({ error: 'Failed to create AI run' }, { status: 500 })
    }

    // 4b. Supersession — retire stale pending proposals claimed during
    // reconciliation (explicit replaces_queued_id links + fuzzy matches).
    // Pending rows only; applied records are never touched.
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
          supersededLabels.set(pid, pendingRow ? pendingLabel(pendingRow.update_type, pendingRow.payload_json) : 'Untitled suggestion')
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
              actor_user_id: user.id,
              action: 'proposed_update_superseded',
              entity_type: 'proposed_update',
              entity_id: pid,
              metadata_json: {
                superseded_by_ai_run_id: aiRun.id,
                label: supersededLabels.get(pid) ?? 'Untitled suggestion',
              },
            }))
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
        return NextResponse.json({ error: 'Failed to create proposed updates' }, { status: 500 })
      }
      insertedCount = rows.length
    }

    if (diagnostics) {
      diagnostics = { ...diagnostics, inserted_count: insertedCount }
      const outputJsonWithDiagnostics = {
        ...outputJson,
        diagnostics,
      }

      await supabase
        .from('ai_runs')
        .update({ output_json: outputJsonWithDiagnostics })
        .eq('id', aiRun.id)

      if (process.env.GLENN_EXTRACT_DEBUG === '1') {
        console.info('glenn extraction diagnostics', diagnostics)
      }
    }

    // 6. Save Glenn's conversational response as an assistant message
    await supabase.from('messages').insert({
      event_id: eventId,
      user_id:  user.id,
      role:     'assistant',
      content:  assistantContent,
    })

    if (extracted.length > 0) {
      await supabase.from('activity_log').insert({
        event_id: eventId,
        actor_user_id: user.id,
        action: 'proposed_updates_created',
        entity_type: 'ai_run',
        entity_id: aiRun.id,
        metadata_json: {
          total: extracted.length,
          deduped_count: totalDroppedCount,
        },
      })
    }

    return NextResponse.json({
      message_id: message.id,
      ai_run_id: aiRun.id,
      assistant_message: assistantContent,
      understood_summary: understoodSummary,
      recommended_summary: recommendedSummary,
      grouped: {
        tasks: grouped.tasks,
        vendors: grouped.vendors,
        budget_items: grouped.budget_items,
        timeline_items: grouped.timeline_items,
        decisions: grouped.decisions,
        risks: grouped.risks,
        open_questions: grouped.open_questions,
      },
    })
  } catch (err) {
    console.error('extract: unexpected error:', err instanceof Error ? `${err.message}\n${err.stack}` : String(err))
    return NextResponse.json({ error: 'Unexpected error during extraction' }, { status: 500 })
  }
}
