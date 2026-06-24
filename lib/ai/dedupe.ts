import type { ExtractedItem } from './mock-extract'
import type {
  EventStateContext,
  UpdateType,
  TaskPayload,
  VendorPayload,
  BudgetItemPayload,
  TimelineItemPayload,
  DecisionPayload,
  RiskPayload,
  OpenQuestionPayload,
} from '@/lib/types'

export interface DropRecord {
  dropped_item: ExtractedItem
  reason: string
}

export interface DedupeResult {
  kept: ExtractedItem[]
  dropped: DropRecord[]
  deduped_count: number
}

function normalizeLabel(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter((w) => w.length > 1)
  )
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  if (a.size === 0 || b.size === 0) return 0
  let intersectionCount = 0
  for (const token of a) {
    if (b.has(token)) intersectionCount++
  }
  return intersectionCount / (a.size + b.size - intersectionCount)
}

function getKeyLabel(item: ExtractedItem): string {
  const p = item.payload
  switch (item.update_type) {
    case 'task':          return (p as TaskPayload).title
    case 'vendor':        return (p as VendorPayload).name
    case 'budget_item':   return (p as BudgetItemPayload).description
    case 'risk':          return (p as RiskPayload).title
    case 'open_question': return (p as OpenQuestionPayload).question
    case 'decision':      return (p as DecisionPayload).title
    case 'timeline_item': return (p as TimelineItemPayload).title
    case 'event_detail':  return 'Event details'
  }
}

function countNonNullFields(payload: ExtractedItem['payload']): number {
  return Object.values(payload as unknown as Record<string, unknown>).filter(
    (v) => v !== null && v !== undefined
  ).length
}

// Vendor matching uses a stricter threshold — vendor names can be similar but distinct
const JACCARD_THRESHOLD = 0.6
const VENDOR_JACCARD_THRESHOLD = 0.75
const TIMELINE_JACCARD_THRESHOLD = 0.55

function isSimilarEnough(
  candidateTokens: Set<string>,
  existingTokens: Set<string>,
  updateType: UpdateType,
): boolean {
  const threshold =
    updateType === 'vendor'
      ? VENDOR_JACCARD_THRESHOLD
      : updateType === 'timeline_item'
        ? TIMELINE_JACCARD_THRESHOLD
        : JACCARD_THRESHOLD
  return jaccardSimilarity(candidateTokens, existingTokens) > threshold
}

// ─── Pending-proposal reconciliation ──────────────────────────────────────────

export interface PendingProposalLite {
  id: string
  update_type: UpdateType
  payload_json: ExtractedItem['payload']
  confidence: number | null
  operation?: 'insert' | 'update' | 'archive'
}

const NEEDS_CHECK_CONFIDENCE = 0.75
const NEEDS_CHECK_PAYLOAD_THRESHOLD = 0.2
const NEEDS_CHECK_MIN_OVERLAP = 2

// Dates, numbers, and connective words are event-wide vocabulary — two
// unrelated items on the same event day share "july 18 30 for on" without
// being the same thing. The loose tier must match on item identity words only.
const LOOSE_TIER_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'into', 'before', 'after', 'until',
  'about', 'around', 'between', 'during', 'this', 'that', 'their', 'our',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
])

function payloadTokens(payload: ExtractedItem['payload']): Set<string> {
  const text = Object.values(payload as unknown as Record<string, unknown>)
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
  const tokens = new Set<string>()
  for (const token of normalizeLabel(text)) {
    if (/^\d+$/.test(token)) continue
    if (LOOSE_TIER_STOPWORDS.has(token)) continue
    tokens.add(token)
  }
  return tokens
}

function overlapCount(a: Set<string>, b: Set<string>): number {
  let count = 0
  for (const token of a) {
    if (b.has(token)) count++
  }
  return count
}

function pendingKeyLabel(p: PendingProposalLite): string {
  const pendingItem: ExtractedItem = {
    update_type: p.update_type,
    payload: p.payload_json,
    confidence: p.confidence ?? 0,
    rationale: '',
  }
  return String(getKeyLabel(pendingItem) ?? '')
}

/**
 * How a newly extracted item relates to one pending proposal. Same-type only,
 * two tiers:
 * - Needs-check pending rows (low/no confidence) match on whole-payload token
 *   overlap at a loose threshold — a clarified item rarely shares the
 *   placeholder's label, but does share its category/notes vocabulary.
 * - Ready pending rows match on strict key-label similarity. The new item
 *   supersedes only when it is at least as complete; a label-similar but
 *   strictly poorer item is a restatement that should be dropped instead.
 */
function classifyPendingMatch(
  item: ExtractedItem,
  p: PendingProposalLite,
): 'supersede' | 'poorer_restatement' | 'none' {
  if (p.update_type !== item.update_type) return 'none'

  const needsCheck = p.confidence === null || p.confidence < NEEDS_CHECK_CONFIDENCE
  if (needsCheck) {
    // Loose tier, but require ≥2 shared real tokens so two unrelated
    // suggestions don't match on a stray status word alone.
    const itemPayloadTokens = payloadTokens(item.payload)
    const pendingTokens = payloadTokens(p.payload_json)
    const matches =
      overlapCount(itemPayloadTokens, pendingTokens) >= NEEDS_CHECK_MIN_OVERLAP &&
      jaccardSimilarity(itemPayloadTokens, pendingTokens) > NEEDS_CHECK_PAYLOAD_THRESHOLD
    return matches ? 'supersede' : 'none'
  }

  const itemLabelTokens = normalizeLabel(String(getKeyLabel(item) ?? ''))
  const pendingLabelTokens = normalizeLabel(pendingKeyLabel(p))
  if (itemLabelTokens.size === 0 || pendingLabelTokens.size === 0) return 'none'
  if (!isSimilarEnough(itemLabelTokens, pendingLabelTokens, item.update_type)) return 'none'

  return countNonNullFields(p.payload_json) <= countNonNullFields(item.payload)
    ? 'supersede'
    : 'poorer_restatement'
}

/** Pending proposals that a newly extracted item supersedes (fuzzy tier only). */
export function findSupersededPending(item: ExtractedItem, pending: PendingProposalLite[]): string[] {
  return pending
    .filter((p) => classifyPendingMatch(item, p) === 'supersede')
    .map((p) => p.id)
}

export interface ReconcileKept<T extends ExtractedItem> {
  item: T
  claimed_pending_ids: string[]
}

export interface ReconcileResult<T extends ExtractedItem> {
  kept: Array<ReconcileKept<T>>
  dropped: DropRecord[]
  invalid_replace_ids: Array<{ item_label: string; replaces_queued_id: string; reason: string }>
}

/**
 * One reconciliation pass between a new batch and the pending proposal pool.
 * Precedence per item:
 * 1. A validated explicit replaces_queued_id claims that pending row — the
 *    model deliberately merged it; completeness rules don't apply.
 * 2. Fuzzy same-type matching (classifyPendingMatch) claims additional rows.
 * 3. An insert that only matched as a poorer restatement of a ready pending
 *    row is dropped — never retire a richer suggestion for a poorer one.
 *
 * Only pending inserts are ever claimed: queued corrections/archives carry
 * deliberate review friction and must never be auto-superseded. Corrections
 * and archives in the NEW batch can claim pending rows (a correction against
 * an applied record retires a queued duplicate) but are never dropped here.
 */
export function reconcileAgainstPending<T extends ExtractedItem>(
  items: T[],
  pendingPool: PendingProposalLite[],
): ReconcileResult<T> {
  const kept: Array<ReconcileKept<T>> = []
  const dropped: DropRecord[] = []
  const invalidReplaceIds: ReconcileResult<T>['invalid_replace_ids'] = []
  const claimed = new Set<string>()

  const claimable = (p: PendingProposalLite) =>
    (p.operation ?? 'insert') === 'insert' && !claimed.has(p.id)

  for (const item of items) {
    const isInsert = (item.operation ?? 'insert') === 'insert'
    const claims: string[] = []

    const linkId = item.replaces_queued_id ?? null
    if (linkId) {
      const target = pendingPool.find((p) => p.id === linkId)
      if (!target) {
        invalidReplaceIds.push({ item_label: String(getKeyLabel(item) ?? ''), replaces_queued_id: linkId, reason: 'not found in pending pool' })
      } else if ((target.operation ?? 'insert') !== 'insert') {
        invalidReplaceIds.push({ item_label: String(getKeyLabel(item) ?? ''), replaces_queued_id: linkId, reason: 'targets a queued correction/removal' })
      } else if (target.update_type !== item.update_type) {
        invalidReplaceIds.push({ item_label: String(getKeyLabel(item) ?? ''), replaces_queued_id: linkId, reason: `type mismatch (${item.update_type} → ${target.update_type})` })
      } else if (claimed.has(target.id)) {
        invalidReplaceIds.push({ item_label: String(getKeyLabel(item) ?? ''), replaces_queued_id: linkId, reason: 'already claimed in this batch' })
      } else {
        claims.push(target.id)
        claimed.add(target.id)
      }
    }

    let poorerOf: PendingProposalLite | null = null
    for (const p of pendingPool) {
      if (!claimable(p)) continue
      const match = classifyPendingMatch(item, p)
      if (match === 'supersede') {
        claims.push(p.id)
        claimed.add(p.id)
      } else if (match === 'poorer_restatement' && poorerOf === null) {
        poorerOf = p
      }
    }

    if (isInsert && claims.length === 0 && poorerOf) {
      dropped.push({
        dropped_item: item,
        reason: `restates pending ${item.update_type.replace(/_/g, ' ')} suggestion "${pendingKeyLabel(poorerOf)}" with less detail`,
      })
      continue
    }

    kept.push({ item, claimed_pending_ids: claims })
  }

  return { kept, dropped, invalid_replace_ids: invalidReplaceIds }
}

/**
 * Removes duplicate ExtractedItems before they become proposed_updates rows.
 * Compares against existing plan rows and the current batch (intra-batch).
 * Pending proposed_updates are handled separately by reconcileAgainstPending,
 * which prefers the newer item instead of silently dropping it.
 */
export function dedupeExtractedItems(
  items: ExtractedItem[],
  context: EventStateContext,
): DedupeResult {
  const kept: ExtractedItem[] = []
  const dropped: DropRecord[] = []

  // Pre-build normalized token sets for existing plan rows, grouped by type
  const existingByType: Record<string, Array<{ tokens: Set<string>; label: string }>> = {
    task: context.existing_tasks.map((t) => ({
      tokens: normalizeLabel(t.title),
      label: t.title,
    })),
    vendor: context.existing_vendors.map((v) => ({
      tokens: normalizeLabel(v.name),
      label: v.name,
    })),
    budget_item: context.existing_budget_items.map((b) => ({
      tokens: normalizeLabel(b.description),
      label: b.description,
    })),
    risk: context.existing_risks.map((r) => ({
      tokens: normalizeLabel(r.title),
      label: r.title,
    })),
    open_question: context.existing_open_questions.map((q) => ({
      tokens: normalizeLabel(q.question),
      label: q.question,
    })),
    decision: [],
    timeline_item: [],
  }

  for (const item of items) {
    const label = getKeyLabel(item)
    const candidateTokens = normalizeLabel(label)
    let dropReason: string | null = null

    // 1. Check against existing plan rows of the same type
    const existingRows = existingByType[item.update_type] ?? []
    for (const existing of existingRows) {
      if (isSimilarEnough(candidateTokens, existing.tokens, item.update_type)) {
        const typeLabel = item.update_type.replace(/_/g, ' ')
        dropReason = `matches existing ${typeLabel} "${existing.label}"`
        break
      }
    }

    // 2. Check against already-kept items in this batch (intra-batch)
    if (!dropReason) {
      for (let i = 0; i < kept.length; i++) {
        const keptItem = kept[i]
        if (keptItem.update_type !== item.update_type) continue
        const keptLabel = getKeyLabel(keptItem)
        const keptTokens = normalizeLabel(keptLabel)
        if (!isSimilarEnough(candidateTokens, keptTokens, item.update_type)) continue

        // Decide which to keep: prefer higher confidence, then more non-null fields
        const itemConfidence = item.confidence ?? 0
        const keptConfidence = keptItem.confidence ?? 0

        if (
          itemConfidence > keptConfidence ||
          (itemConfidence === keptConfidence &&
            countNonNullFields(item.payload) > countNonNullFields(keptItem.payload))
        ) {
          // Current item is better — evict the previously-kept item
          dropped.push({
            dropped_item: keptItem,
            reason: `duplicates another suggestion in this message "${label}"`,
          })
          kept.splice(i, 1)
          // Do not set dropReason — let this item proceed to be kept
        } else {
          dropReason = `duplicates another suggestion in this message "${keptLabel}"`
        }
        break
      }
    }

    if (dropReason) {
      dropped.push({ dropped_item: item, reason: dropReason })
    } else {
      kept.push(item)
    }
  }

  return { kept, dropped, deduped_count: dropped.length }
}
