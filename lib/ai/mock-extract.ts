import type {
  UpdateType,
  TaskPayload,
  VendorPayload,
  BudgetItemPayload,
  TimelineItemPayload,
  DecisionPayload,
  RiskPayload,
  OpenQuestionPayload,
} from '@/lib/types'

export interface ExtractedItem {
  update_type: UpdateType
  payload:
    | TaskPayload
    | VendorPayload
    | BudgetItemPayload
    | TimelineItemPayload
    | DecisionPayload
    | RiskPayload
    | OpenQuestionPayload
  confidence: number
  rationale: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function has(text: string, ...terms: string[]): boolean {
  const lower = text.toLowerCase()
  return terms.some((t) => lower.includes(t.toLowerCase()))
}

function extractCost(text: string): number | null {
  const match = text.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/)?.[1]
  if (match) return parseFloat(match.replace(/,/g, ''))
  return null
}

function extractPersonName(sentence: string): string | null {
  const match = sentence.match(/\b([A-Z][a-z]{1,14})\s+(?:is|will|should|can|needs? to|to)\b/)
  return match?.[1] ?? null
}

function nextWeekday(name: string): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const idx = days.indexOf(name.toLowerCase())
  if (idx < 0) return ''
  const today = new Date()
  const diff = ((idx - today.getDay() + 7) % 7) || 7
  const d = new Date(today)
  d.setDate(today.getDate() + diff)
  return d.toISOString().split('T')[0]
}

function extractDueDate(text: string): string | null {
  const lower = text.toLowerCase()
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  for (const day of days) {
    if (lower.includes(`by ${day}`) || lower.includes(`by next ${day}`)) {
      return nextWeekday(day)
    }
  }
  if (/by end of week/i.test(text)) return nextWeekday('friday')
  return null
}

function extractedHas(items: ExtractedItem[], type: UpdateType): boolean {
  return items.some((i) => i.update_type === type)
}

// ─── Sentence-level matchers ─────────────────────────────────────────────────

function matchVenueHeadcount(sentence: string, items: ExtractedItem[]): void {
  const isHeadcount = has(sentence, 'headcount', 'guest count', 'final count', 'attendee count')
  const isVenueTrigger = has(sentence, 'venue', 'dinner', 'event') && isHeadcount
  const hasDeadline = has(sentence, 'days before', 'before the', 'by ', 'due', 'deadline', 'need')

  if ((isHeadcount || isVenueTrigger) && hasDeadline && !extractedHas(items, 'timeline_item')) {
    items.push({
      update_type: 'timeline_item',
      payload: {
        title: 'Final headcount due to venue',
        description: sentence.trim(),
        starts_at: extractDueDate(sentence),
        ends_at: null,
        type: 'deadline',
      } satisfies TimelineItemPayload,
      confidence: 0.88,
      rationale: 'Venue requires final headcount by a deadline',
    })
  }

  if (isHeadcount && !items.some((i) => i.update_type === 'task' && (i.payload as TaskPayload).title.toLowerCase().includes('headcount'))) {
    items.push({
      update_type: 'task',
      payload: {
        title: 'Confirm final headcount',
        description: 'Collect and confirm attendee count for venue submission',
        status: 'todo',
        priority: 'high',
        due_date: extractDueDate(sentence),
        owner_name: extractPersonName(sentence),
      } satisfies TaskPayload,
      confidence: 0.8,
      rationale: 'Final headcount needed for venue',
    })
  }
}

function matchCatering(sentence: string, items: ExtractedItem[]): void {
  if (!has(sentence, 'catering', 'caterer', 'food', 'meal', 'dinner service')) return

  const cost = extractCost(sentence)
  const hasGratuity = has(sentence, 'gratuity', 'tip', 'service charge')
  const hasStaffing = has(sentence, 'staffing', 'staff', 'service staff')
  const hasConfirm = has(sentence, 'confirm', 'all-in', 'all in', 'total', 'final number', 'need to')

  if (cost) {
    items.push({
      update_type: 'budget_item',
      payload: {
        category: 'Catering',
        description: `Catering quote: $${cost.toLocaleString()}${hasStaffing || hasGratuity ? ' (before staffing/gratuity)' : ''}`,
        estimated_cost: cost,
        actual_cost: null,
        status: 'estimated',
        vendor_name: null,
      } satisfies BudgetItemPayload,
      confidence: 0.9,
      rationale: `Catering cost of $${cost.toLocaleString()} extracted from notes`,
    })
  }

  if (hasConfirm || hasStaffing || hasGratuity) {
    items.push({
      update_type: 'task',
      payload: {
        title: 'Confirm all-in catering cost',
        description: 'Get final catering quote including staffing and gratuity',
        status: 'todo',
        priority: 'medium',
        due_date: extractDueDate(sentence),
        owner_name: extractPersonName(sentence),
      } satisfies TaskPayload,
      confidence: 0.82,
      rationale: 'Catering total needs confirmation before committing',
    })
  }

  if (hasStaffing || hasGratuity) {
    items.push({
      update_type: 'open_question',
      payload: {
        question: 'Does the catering quote include staffing and gratuity?',
        status: 'open',
        owner_name: null,
      } satisfies OpenQuestionPayload,
      confidence: 0.85,
      rationale: 'Catering quote explicitly noted as excluding staffing/gratuity',
    })

    items.push({
      update_type: 'risk',
      payload: {
        title: 'Catering cost may exceed estimate',
        description: cost
          ? `Quote of $${cost.toLocaleString()} does not include staffing or gratuity — actual cost likely higher`
          : 'Catering quote does not include staffing or gratuity',
        severity: 'medium',
        status: 'open',
        mitigation: 'Obtain all-in catering quote before finalising budget',
      } satisfies RiskPayload,
      confidence: 0.78,
      rationale: 'Catering quote excludes staffing/gratuity — true cost unknown',
    })
  }
}

function matchAV(sentence: string, items: ExtractedItem[]): void {
  const hasAV = /\bav\b/i.test(sentence) || has(sentence, 'a/v', 'audio', 'speaker', 'microphone', 'sound system', 'av package')
  if (!hasAV) return

  const ownerName = extractPersonName(sentence)
  const isUnclear = has(sentence, 'unclear', 'unknown', 'still', 'checking', 'not confirmed', 'pending')

  items.push({
    update_type: 'task',
    payload: {
      title: ownerName ? `${ownerName} to confirm AV package` : 'Confirm AV package',
      description: 'Clarify AV package details, pricing, and confirm booking',
      status: 'todo',
      priority: isUnclear ? 'high' : 'medium',
      due_date: extractDueDate(sentence),
      owner_name: ownerName,
    } satisfies TaskPayload,
    confidence: 0.84,
    rationale: 'AV package status unclear — confirmation required',
  })
}

function matchPhotography(sentence: string, items: ExtractedItem[]): void {
  if (!has(sentence, 'photography', 'photographer', 'photo')) return

  const isHeld = has(sentence, 'held', 'tentative', 'tentatively', 'hold')
  const isConfirmed = has(sentence, 'confirmed', 'booked', 'signed')
  const hasDeposit = has(sentence, 'deposit')
  const dueDate = extractDueDate(sentence)

  const vendorStatus: VendorPayload['status'] = isConfirmed
    ? 'confirmed'
    : isHeld
    ? 'contacted'
    : 'prospect'

  items.push({
    update_type: 'vendor',
    payload: {
      name: 'Photography',
      category: 'Photography',
      contact_name: null,
      email: null,
      phone: null,
      status: vendorStatus,
      estimated_cost: extractCost(sentence),
      notes: isHeld ? 'Tentatively held — deposit required to confirm' : sentence.trim(),
    } satisfies VendorPayload,
    confidence: 0.86,
    rationale: `Photography vendor detected as ${vendorStatus}`,
  })

  if (hasDeposit) {
    items.push({
      update_type: 'task',
      payload: {
        title: 'Pay photography deposit',
        description: 'Photography is tentatively held — deposit needed to secure booking',
        status: 'todo',
        priority: 'high',
        due_date: dueDate,
        owner_name: extractPersonName(sentence),
      } satisfies TaskPayload,
      confidence: 0.92,
      rationale: 'Photography deposit deadline detected',
    })
  }
}

function matchDeposit(sentence: string, items: ExtractedItem[]): void {
  if (!has(sentence, 'deposit')) return
  // Photography deposits handled by matchPhotography
  if (has(sentence, 'photography', 'photographer', 'photo')) return

  const cost = extractCost(sentence)
  const dueDate = extractDueDate(sentence)

  items.push({
    update_type: 'task',
    payload: {
      title: 'Pay deposit',
      description: sentence.trim(),
      status: 'todo',
      priority: 'high',
      due_date: dueDate,
      owner_name: extractPersonName(sentence),
    } satisfies TaskPayload,
    confidence: 0.8,
    rationale: 'Deposit requirement detected',
  })

  if (cost) {
    items.push({
      update_type: 'budget_item',
      payload: {
        category: 'Deposit',
        description: 'Deposit payment',
        estimated_cost: cost,
        actual_cost: null,
        status: 'committed',
        vendor_name: null,
      } satisfies BudgetItemPayload,
      confidence: 0.78,
      rationale: `Deposit of $${cost.toLocaleString()} detected`,
    })
  }
}

function matchBudgetOverrun(sentence: string, items: ExtractedItem[]): void {
  const hasBudget = has(sentence, 'budget', 'quote', 'cost', 'price', 'estimate')
  const hasOverrun = has(sentence, 'over budget', 'exceed', 'overrun', 'more than', 'higher than', 'above')
  if (!hasBudget || !hasOverrun) return

  const cost = extractCost(sentence)
  items.push({
    update_type: 'risk',
    payload: {
      title: 'Cost may exceed budget',
      description: cost
        ? `Quoted $${cost.toLocaleString()} — may exceed planned budget`
        : sentence.trim(),
      severity: 'high',
      status: 'open',
      mitigation: 'Review budget allocation and identify cuts or reallocation options',
    } satisfies RiskPayload,
    confidence: 0.8,
    rationale: 'Budget overrun risk detected',
  })
}

function matchContract(sentence: string, items: ExtractedItem[]): void {
  const hasContract = has(sentence, 'contract', 'agreement', 'sign', 'countersign')
  const hasApproval = has(sentence, 'approval', 'approve', 'sign off', 'sign-off')
  if (!hasContract && !hasApproval) return

  items.push({
    update_type: 'decision',
    payload: {
      title: hasApproval ? 'Pending approval decision' : 'Contract sign-off required',
      description: sentence.trim(),
      status: 'pending',
      decision: null,
    } satisfies DecisionPayload,
    confidence: 0.75,
    rationale: hasApproval ? 'Approval pending detected' : 'Contract sign-off required',
  })
}

function matchParking(sentence: string, items: ExtractedItem[]): void {
  if (!has(sentence, 'parking', 'valet', 'garage')) return

  const ownerName = extractPersonName(sentence)
  items.push({
    update_type: 'task',
    payload: {
      title: 'Confirm parking arrangements',
      description: sentence.trim(),
      status: 'todo',
      priority: 'medium',
      due_date: extractDueDate(sentence),
      owner_name: ownerName,
    } satisfies TaskPayload,
    confidence: 0.76,
    rationale: 'Parking arrangements require confirmation',
  })
}

function matchSponsor(sentence: string, items: ExtractedItem[]): void {
  if (!has(sentence, 'sponsor', 'sponsorship')) return

  items.push({
    update_type: 'decision',
    payload: {
      title: 'Sponsorship decision needed',
      description: sentence.trim(),
      status: 'pending',
      decision: null,
    } satisfies DecisionPayload,
    confidence: 0.72,
    rationale: 'Sponsorship mentioned — decision likely required',
  })
}

function matchVenueGeneral(sentence: string, items: ExtractedItem[]): void {
  if (!has(sentence, 'venue', 'location', 'space')) return
  // Only fire if no timeline item already added (headcount handler covers most venue cases)
  if (extractedHas(items, 'timeline_item')) return

  const isConfirmed = has(sentence, 'confirmed', 'booked', 'secured')
  const hasAction = has(sentence, 'need', 'require', 'check', 'confirm', 'follow up')

  if (isConfirmed && !hasAction) {
    items.push({
      update_type: 'vendor',
      payload: {
        name: 'Venue',
        category: 'Venue',
        contact_name: null,
        email: null,
        phone: null,
        status: 'confirmed',
        estimated_cost: extractCost(sentence),
        notes: sentence.trim(),
      } satisfies VendorPayload,
      confidence: 0.8,
      rationale: 'Venue confirmed',
    })
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function mockExtract(inputText: string): ExtractedItem[] {
  const items: ExtractedItem[] = []
  const sentences = splitSentences(inputText)

  for (const sentence of sentences) {
    matchVenueHeadcount(sentence, items)
    matchCatering(sentence, items)
    matchAV(sentence, items)
    matchPhotography(sentence, items)
    matchDeposit(sentence, items)
    matchBudgetOverrun(sentence, items)
    matchContract(sentence, items)
    matchParking(sentence, items)
    matchSponsor(sentence, items)
    matchVenueGeneral(sentence, items)
  }

  return items
}

export function groupExtracted(items: ExtractedItem[]) {
  return {
    tasks: items.filter((i) => i.update_type === 'task'),
    vendors: items.filter((i) => i.update_type === 'vendor'),
    budget_items: items.filter((i) => i.update_type === 'budget_item'),
    timeline_items: items.filter((i) => i.update_type === 'timeline_item'),
    decisions: items.filter((i) => i.update_type === 'decision'),
    risks: items.filter((i) => i.update_type === 'risk'),
    open_questions: items.filter((i) => i.update_type === 'open_question'),
  }
}
