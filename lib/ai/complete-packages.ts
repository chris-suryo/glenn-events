import type { ExtractedItem } from './mock-extract'
import type {
  BudgetItemPayload,
  EventStateContext,
  TimelineItemPayload,
  VendorPayload,
} from '@/lib/types'

// ─── Conservative app-side package completion ────────────────────────────────
//
// The LLM sometimes extracts only part of a single-sentence service package
// (e.g. "Petal & Stem can do flowers for $650 and deliver at 5:15 PM" → vendor
// only). This layer is a deterministic floor: when a vendor proposal's own
// source sentence clearly states a price and/or a delivery/setup time, and the
// batch has no matching budget/timeline proposal, synthesize the missing
// member. It never invents facts, only re-expresses ones already in the note,
// and everything still flows through Review with provenance on the same message.

export interface PackageCompletionResult {
  added: ExtractedItem[]
  notes: string[]
}

const SYNTH_CONFIDENCE = 0.8

function normalize(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/[^\w\s$:.&-]/g, ' ').replace(/\s+/g, ' ').trim()
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .flatMap((s) => s.split(/\n+/))
    .map((s) => s.trim())
    .filter(Boolean)
}

// All distinct $ amounts in a scope, in order of appearance.
function extractCosts(text: string): number[] {
  const out: number[] = []
  const re = /\$\s*([\d,]+(?:\.\d{1,2})?)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const value = parseFloat(m[1].replace(/,/g, ''))
    if (Number.isFinite(value) && !out.includes(value)) out.push(value)
  }
  return out
}

interface ClockTime {
  hour: number
  minute: number
}

interface TimeRange {
  start: ClockTime
  end: ClockTime | null
  label: string
}

// Matches "5:15 PM", "6:30", "6 PM" — requires either a colon or an am/pm
// marker so bare numbers ("30 guests", "$650") never match.
const TIME_TOKEN = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\b/gi

function toClock(hourRaw: number, minuteRaw: number, meridian: string | null): ClockTime | null {
  let hour = hourRaw
  if (meridian) {
    const pm = /p/i.test(meridian)
    if (hour === 12) hour = pm ? 12 : 0
    else if (pm) hour += 12
  }
  if (hour < 0 || hour > 23 || minuteRaw < 0 || minuteRaw > 59) return null
  return { hour, minute: minuteRaw }
}

// Finds the first delivery/setup-relevant time (and trailing range end) in scope.
// A token only counts as a time if it has a colon or an am/pm marker.
function findTimeRange(text: string): TimeRange | null {
  const matches: Array<{ index: number; raw: string; hour: number; minute: number; meridian: string | null }> = []
  let m: RegExpExecArray | null
  TIME_TOKEN.lastIndex = 0
  while ((m = TIME_TOKEN.exec(text)) !== null) {
    const hasColon = m[2] !== undefined
    const hasMeridian = m[3] !== undefined
    if (!hasColon && !hasMeridian) continue
    matches.push({
      index: m.index,
      raw: m[0].trim(),
      hour: Number(m[1]),
      minute: m[2] ? Number(m[2]) : 0,
      meridian: m[3] ?? null,
    })
  }
  if (matches.length === 0) return null

  // Apply a later meridian back to an earlier bare time in the same range
  // ("6:30 to 8:30 PM" → both PM).
  const sharedMeridian = matches.find((t) => t.meridian)?.meridian ?? null
  const first = matches[0]
  const start = toClock(first.hour, first.minute, first.meridian ?? sharedMeridian)
  if (!start) return null

  let end: ClockTime | null = null
  let label = first.raw
  const second = matches[1]
  if (second) {
    const between = text.slice(first.index + first.raw.length, second.index)
    if (/^\s*(?:[-–—]|to|until|till|through|and)\s*$/i.test(between.trim()) || /[-–—]|to|until|through/i.test(between)) {
      const endClock = toClock(second.hour, second.minute, second.meridian ?? sharedMeridian)
      if (endClock) {
        end = endClock
        label = `${first.raw}–${second.raw}`
      }
    }
  }
  return { start, end, label }
}

function clockToIso(eventDate: string, t: ClockTime): string {
  const day = eventDate.slice(0, 10)
  const hh = String(t.hour).padStart(2, '0')
  const mm = String(t.minute).padStart(2, '0')
  return `${day}T${hh}:${mm}:00`
}

const DELIVERY_TRIGGERS: Array<{ word: RegExp; action: string }> = [
  { word: /\bdeliver(?:y|ies|ed|ing|s)?\b/, action: 'delivery' },
  { word: /\bdrop[\s-]?off\b/, action: 'drop-off' },
  { word: /\bset[\s-]?up\b|\bsetup\b/, action: 'setup' },
  { word: /\bload[\s-]?in\b/, action: 'load-in' },
  { word: /\barriv(?:e|es|al|ing)\b/, action: 'arrival' },
  { word: /\bcoverage\b|\bcover(?:s|ing)?\b/, action: 'coverage' },
  { word: /\bservice\b|\bserving\b/, action: 'service' },
]

function deliveryAction(text: string): string | null {
  for (const { word, action } of DELIVERY_TRIGGERS) {
    if (word.test(text)) return action
  }
  return null
}

const SERVICE_CATEGORIES: Array<{ category: string; words: string[] }> = [
  { category: 'Florals', words: ['floral', 'florist', 'flower', 'flowers', 'bloom', 'blooms', 'petal', 'stem', 'candle', 'candles', 'centerpiece', 'centerpieces', 'decor'] },
  { category: 'Photography', words: ['photo', 'photos', 'photography', 'photographer'] },
  { category: 'Catering', words: ['catering', 'caterer', 'food', 'dinner', 'lunch', 'meal', 'buffet', 'appetizer', 'beverage'] },
  { category: 'Bakery', words: ['cake', 'dessert', 'pastry', 'bakery'] },
  { category: 'Venue', words: ['venue', 'room', 'restaurant', 'hall', 'patio', 'space'] },
  { category: 'AV', words: ['audio', 'sound', 'microphone', 'projector', 'speaker'] },
  { category: 'Music', words: ['dj', 'band', 'music', 'entertainment'] },
]

function deriveCategory(scopeText: string, vendor: VendorPayload): string {
  if (vendor.category && vendor.category.trim()) return vendor.category
  const n = normalize(scopeText)
  for (const { category, words } of SERVICE_CATEGORIES) {
    if (words.some((w) => new RegExp(`\\b${w}\\b`).test(n))) return category
  }
  return 'Vendor'
}

// A short noun phrase for descriptions/titles, e.g. "flowers and candles".
function serviceLabel(scopeText: string, fallback: string): string {
  const n = normalize(scopeText)
  const found: string[] = []
  for (const { words } of SERVICE_CATEGORIES) {
    for (const w of words) {
      if (new RegExp(`\\b${w}\\b`).test(n) && !found.includes(w)) found.push(w)
    }
  }
  if (found.length === 0) return fallback
  const top = found.slice(0, 2)
  return top.length === 2 ? `${top[0]} and ${top[1]}` : top[0]
}

function realVendorName(name: string | null | undefined): boolean {
  const n = normalize(name)
  return n.length > 1 && n !== 'unknown'
}

function vendorScope(
  sentences: string[],
  vendorName: string,
  otherVendorNames: string[],
): string | null {
  const target = normalize(vendorName)
  if (target.length < 2) return null
  const idx = sentences.findIndex((s) => normalize(s).includes(target))
  if (idx < 0) return null

  const scope = [sentences[idx]]
  const next = sentences[idx + 1]
  if (next) {
    const nNorm = normalize(next)
    const startsWithBackref = /^(they|it|he|she|we|the)\b/.test(nNorm)
    const namesOtherVendor = otherVendorNames.some((n) => normalize(n).length > 1 && nNorm.includes(normalize(n)))
    if (startsWithBackref && !namesOtherVendor) scope.push(next)
  }
  return scope.join(' ')
}

function vendorCovered(
  vendorName: string,
  batch: ExtractedItem[],
  context: EventStateContext,
): boolean {
  const vn = normalize(vendorName)
  const batchHit = batch.some(
    (it) => it.update_type === 'vendor' && normalize((it.payload as VendorPayload).name) === vn,
  )
  if (batchHit) return true
  return context.existing_vendors.some((v) => normalize(v.name) === vn)
}

function budgetCovered(
  amount: number,
  vendorName: string,
  batch: ExtractedItem[],
  context: EventStateContext,
): boolean {
  const vn = normalize(vendorName)
  const batchHit = batch.some((it) => {
    if (it.update_type !== 'budget_item') return false
    const p = it.payload as BudgetItemPayload
    if (typeof p.estimated_cost === 'number' && p.estimated_cost === amount) return true
    return normalize(p.description).includes(vn) || normalize(p.vendor_name).includes(vn)
  })
  if (batchHit) return true
  return context.existing_budget_items.some((b) => {
    if (typeof b.estimated_cost === 'number' && b.estimated_cost === amount) return true
    return normalize(b.description).includes(vn)
  })
}

function timelineCovered(
  start: ClockTime,
  vendorName: string,
  batch: ExtractedItem[],
  context: EventStateContext,
): boolean {
  const vn = normalize(vendorName)
  const sameClock = (iso: string | null) => {
    if (!iso) return false
    const m = iso.match(/T(\d{2}):(\d{2})/)
    return !!m && Number(m[1]) === start.hour && Number(m[2]) === start.minute
  }
  const batchHit = batch.some((it) => {
    if (it.update_type !== 'timeline_item') return false
    const p = it.payload as TimelineItemPayload
    if (sameClock(p.starts_at)) return true
    return normalize(p.title).includes(vn) || normalize(p.description).includes(vn)
  })
  if (batchHit) return true
  return context.existing_timeline_items.some((t) => sameClock(t.starts_at) || normalize(t.title).includes(vn))
}

/**
 * Synthesize the obvious missing budget/timeline members of a single-vendor
 * package, only from facts already present in the vendor's source sentence.
 */
export function completePackages(
  llmInserts: ExtractedItem[],
  inputText: string,
  context: EventStateContext,
): PackageCompletionResult {
  const added: ExtractedItem[] = []
  const notes: string[] = []
  const sentences = splitSentences(inputText)

  // A package is keyed by a vendor name that the LLM already committed to —
  // either as a vendor proposal or as a budget item's vendor_name. This makes
  // completion symmetric: whichever member(s) the model dropped get filled in.
  const candidateNames: string[] = []
  for (const it of llmInserts) {
    if ((it.operation ?? 'insert') !== 'insert') continue
    const name =
      it.update_type === 'vendor'
        ? (it.payload as VendorPayload).name
        : it.update_type === 'budget_item'
          ? (it.payload as BudgetItemPayload).vendor_name
          : null
    if (realVendorName(name) && !candidateNames.some((n) => normalize(n) === normalize(name!))) {
      candidateNames.push(name!)
    }
  }

  for (const vendorName of candidateNames) {
    const others = candidateNames.filter((n) => normalize(n) !== normalize(vendorName))
    const scope = vendorScope(sentences, vendorName, others)
    if (!scope) continue

    const existingVendorItem = llmInserts.find(
      (it) => it.update_type === 'vendor' && normalize((it.payload as VendorPayload).name) === normalize(vendorName),
    )
    const vendorPayload = existingVendorItem?.payload as VendorPayload | undefined
    const amounts = extractCosts(scope)

    // ── Vendor completion: the LLM committed to this vendor name (via a budget
    // item) but didn't create the vendor record itself ──
    if (!vendorCovered(vendorName, [...llmInserts, ...added], context)) {
      const category = deriveCategory(scope, { category: null } as VendorPayload)
      const payload: VendorPayload = {
        name: vendorName,
        category,
        contact_name: null,
        email: null,
        phone: null,
        status: 'contacted',
        estimated_cost: amounts.length === 1 ? amounts[0] : null,
        notes: null,
      }
      added.push({
        update_type: 'vendor',
        payload,
        confidence: SYNTH_CONFIDENCE,
        rationale: `${vendorName} is named in the note alongside its cost/schedule; added so the package has a vendor record.`,
        operation: 'insert',
      })
      notes.push(`completed vendor for ${vendorName}`)
    }

    // ── Budget completion: exactly one money amount, not already covered ──
    if (amounts.length === 1 && !budgetCovered(amounts[0], vendorName, [...llmInserts, ...added], context)) {
      const category = deriveCategory(scope, (vendorPayload ?? { category: null }) as VendorPayload)
      const label = serviceLabel(scope, category.toLowerCase())
      const payload: BudgetItemPayload = {
        category,
        description: `${vendorName} — ${label}`,
        estimated_cost: amounts[0],
        actual_cost: null,
        status: 'estimated',
        vendor_name: vendorName,
      }
      added.push({
        update_type: 'budget_item',
        payload,
        confidence: SYNTH_CONFIDENCE,
        rationale: `$${amounts[0].toLocaleString()} for ${vendorName} is stated in the same note; added so the package is complete.`,
        operation: 'insert',
      })
      notes.push(`completed budget for ${vendorName} ($${amounts[0]})`)
    }

    // ── Timeline completion ──
    // Fire on an explicit delivery/setup/arrival/service/coverage time, OR on a
    // clear time RANGE tied to the vendor (a coverage window like "6:30–8:30").
    // A bare single time with no action word is too ambiguous (could be a
    // meeting) and is skipped.
    const action = deliveryAction(normalize(scope))
    const range = findTimeRange(scope)
    const triggered = !!range && (action !== null || range.end !== null)
    if (range && triggered && !timelineCovered(range.start, vendorName, [...llmInserts, ...added], context)) {
      const actionLabel = action ?? 'coverage'
      const eventDate = context.event.event_date
      const starts_at = eventDate ? clockToIso(eventDate, range.start) : null
      const ends_at = eventDate && range.end ? clockToIso(eventDate, range.end) : null
      const payload: TimelineItemPayload = {
        title: `${vendorName} ${actionLabel}`,
        description: starts_at ? null : `${actionLabel} at ${range.label}`,
        starts_at,
        ends_at,
        type: 'milestone',
      }
      added.push({
        update_type: 'timeline_item',
        payload,
        confidence: SYNTH_CONFIDENCE,
        rationale: `${vendorName} ${actionLabel} time (${range.label}) is stated in the same note; added so the package is complete.`,
        operation: 'insert',
      })
      notes.push(`completed timeline for ${vendorName} (${range.label})`)
    }
  }

  return { added, notes }
}
