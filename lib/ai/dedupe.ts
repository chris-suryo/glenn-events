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

function isSimilarEnough(
  candidateTokens: Set<string>,
  existingTokens: Set<string>,
  updateType: UpdateType,
): boolean {
  const threshold =
    updateType === 'vendor' ? VENDOR_JACCARD_THRESHOLD : JACCARD_THRESHOLD
  return jaccardSimilarity(candidateTokens, existingTokens) > threshold
}

/**
 * Removes duplicate ExtractedItems before they become proposed_updates rows.
 * Compares against existing plan rows, pending proposed_updates, and the
 * current batch (intra-batch). Uses normalized Jaccard token overlap.
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

  // Pre-build normalized token sets for pending proposed_updates
  const pendingByType: Record<string, Array<{ tokens: Set<string>; label: string }>> = {
    task: [],
    vendor: [],
    budget_item: [],
    risk: [],
    open_question: [],
    decision: [],
    timeline_item: [],
  }
  for (const pending of context.pending_proposed_updates) {
    const bucket = pendingByType[pending.update_type]
    if (bucket !== undefined) {
      bucket.push({ tokens: normalizeLabel(pending.label), label: pending.label })
    }
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

    // 2. Check against pending proposed_updates of the same type
    if (!dropReason) {
      const pendingRows = pendingByType[item.update_type] ?? []
      for (const pending of pendingRows) {
        if (isSimilarEnough(candidateTokens, pending.tokens, item.update_type)) {
          const typeLabel = item.update_type.replace(/_/g, ' ')
          dropReason = `matches pending ${typeLabel} suggestion "${pending.label}"`
          break
        }
      }
    }

    // 3. Check against already-kept items in this batch (intra-batch)
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
