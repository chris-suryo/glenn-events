import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ExtractedItem } from '@/lib/ai/mock-extract'
import type { EventStateContext, UpdateType } from '@/lib/types'

const UPDATE_TYPES: UpdateType[] = [
  'task',
  'vendor',
  'budget_item',
  'timeline_item',
  'decision',
  'risk',
  'open_question',
]

interface ExpectedOperation {
  update_type: UpdateType
  operation: 'insert' | 'update' | 'archive'
  target_id?: string
}

interface Scenario {
  name: string
  text: string
  minCount: number
  requiredTypes: UpdateType[]
  maxCount?: number
  forbiddenTypes?: UpdateType[]
  context?: EventStateContext
  expectedOperations?: ExpectedOperation[]
}

type ScenarioStatus = 'PASS' | 'WARN' | 'FAIL'

const HARBOR_DJ_ID = '11111111-0000-4000-8000-000000000001'
const DJ_CITY_VENDOR_ID = '11111111-0000-4000-8000-000000000002'
const DJ_CITY_BUDGET_ID = '22222222-0000-4000-8000-000000000001'

function welcomePartyContext(overrides: Partial<EventStateContext> = {}): EventStateContext {
  return {
    event: {
      name: 'Welcome Party',
      event_type: 'party',
      event_date: '2026-07-10',
      location: 'Boston',
      description: null,
      attendee_target: 60,
      budget_target: 5000,
    },
    existing_tasks: [],
    existing_vendors: [],
    existing_budget_items: [],
    existing_timeline_items: [],
    existing_risks: [],
    existing_open_questions: [],
    pending_proposed_updates: [],
    recent_ai_run_summaries: [],
    ...overrides,
  }
}

const SCENARIOS: Scenario[] = [
  {
    name: 'Corporate dinner messy note',
    text: 'Client dinner planning notes: around 42 attendees, probably 6 people from our team. Oak & Vine is the preferred restaurant and Maya is the private dining contact. They quoted a $3,800 food and beverage minimum, deposit is due next Friday. Need to confirm vegetarian count, ask about AV for a short welcome slide, and decide who brings name tags. Dinner should start at 6:30, but our team should arrive at 5:45 to set up.',
    minCount: 7,
    requiredTypes: ['vendor', 'budget_item', 'task', 'timeline_item'],
  },
  {
    name: 'Client workshop structured-ish note',
    text: 'Workshop update from today: venue is confirmed at CIC Cambridge. Room opens at 8:00 AM, attendees arrive at 8:45, session starts at 9:00. We need to order breakfast for 30, print 35 worksheets, send parking instructions, and confirm whether the room has HDMI adapters. Budget target is $2,500. Decision: use the smaller breakout room for the afternoon exercises.',
    minCount: 9,
    requiredTypes: ['vendor', 'task', 'timeline_item', 'budget_item', 'decision'],
  },
  {
    name: 'Fundraiser email-like vendor update',
    text: 'Forward from Lena at BrightLight AV: We can provide two wireless mics, a podium mic, projector, and technician for $1,450. Load-in would be 3:00 PM and sound check at 4:15. We do not provide extension cords unless requested. Please confirm by Wednesday so we can hold the technician.',
    minCount: 6,
    requiredTypes: ['vendor', 'budget_item', 'timeline_item', 'task'],
  },
  {
    name: 'Wedding welcome party messy note',
    text: 'Welcome party notes: The patio at Harbor House is available Friday night, but they need final count by May 10. Estimate is 85 guests. Food package is $62 per person before tax and service. Need to pick between passed apps or buffet, ask if kids meals are possible, and confirm rain plan. DJ can arrive at 4:30, guests arrive around 6, speeches probably 7:15.',
    minCount: 8,
    requiredTypes: ['vendor', 'budget_item', 'task', 'timeline_item', 'open_question'],
  },
  {
    name: 'Internal offsite conflicting/correction update',
    text: 'Correction on the offsite: lunch is not at noon anymore. The caterer can only deliver at 12:45. Keep the leadership kickoff at 9:30. We also added a team photo at 3:15 and need someone to reserve the rooftop space. Budget is still capped at $6,000.',
    minCount: 5,
    requiredTypes: ['timeline_item', 'task', 'budget_item'],
  },
  {
    name: 'Product launch / demo night messy note',
    text: 'Demo night loose notes: expecting 120 RSVPs but maybe only 90 show. Need check-in table, badges, two demo stations, and a backup laptop. Morgan from PixelWorks confirmed photographer availability, $900 flat. We still need to confirm Wi-Fi credentials, ask facilities about after-hours access, and send speaker arrival instructions. Doors open at 5:30, remarks at 6:10, demos start at 6:30.',
    minCount: 10,
    requiredTypes: ['vendor', 'budget_item', 'task', 'timeline_item'],
  },
  {
    name: 'Trade show booth update',
    text: 'Booth update: shipping deadline is Aug 12. We need to send the backdrop, tablecloth, badge scanner, and 300 one-pagers. Freeman is handling booth services, and the electrical order is estimated at $675. Sarah is checking if we can get a monitor rental instead of bringing our own. Setup window is 2-6 PM the day before the show.',
    minCount: 7,
    requiredTypes: ['vendor', 'budget_item', 'task', 'timeline_item'],
  },
  {
    name: 'Vague intake ask (no concrete facts)',
    text: 'I have the Hope Lodge Dinner tonight, I have a number of things I need to note including catering, expenses, etc. Can you help me get organized with it?',
    minCount: 0,
    requiredTypes: [],
    maxCount: 0,
  },
  {
    name: 'Mixed intake with one concrete fact',
    text: 'Can you help me get organized for the team dinner? All I know so far is Chilacates is doing the food.',
    minCount: 1,
    requiredTypes: ['vendor'],
    maxCount: 3,
  },
  {
    name: 'M11B budget price correction',
    text: 'DJ City gave me a discount, price is now $300.',
    minCount: 1,
    requiredTypes: ['budget_item'],
    maxCount: 4,
    context: welcomePartyContext({
      existing_vendors: [
        { id: DJ_CITY_VENDOR_ID, name: 'DJ City', category: 'Music', status: 'contacted', estimated_cost: 700, contact_name: null, email: null, phone: null, notes: null },
      ],
      existing_budget_items: [
        { id: DJ_CITY_BUDGET_ID, category: 'Music', description: 'DJ City music service', estimated_cost: 700, actual_cost: null, status: 'estimated', vendor_id: DJ_CITY_VENDOR_ID },
      ],
    }),
    expectedOperations: [
      { update_type: 'budget_item', operation: 'update', target_id: DJ_CITY_BUDGET_ID },
    ],
  },
  {
    name: 'M11B vendor cancellation',
    text: 'Harbor Lights DJ canceled.',
    minCount: 1,
    requiredTypes: ['vendor'],
    maxCount: 6,
    context: welcomePartyContext({
      existing_vendors: [
        { id: HARBOR_DJ_ID, name: 'Harbor Lights DJ', category: 'Music', status: 'confirmed', estimated_cost: 700, contact_name: null, email: null, phone: null, notes: null },
      ],
    }),
    expectedOperations: [
      { update_type: 'vendor', operation: 'archive', target_id: HARBOR_DJ_ID },
    ],
  },
  {
    name: 'M11B vendor replacement',
    text: "Harbor Lights DJ canceled, so we're using DJ City instead. DJ City is $700 and will play from 8 to 10pm.",
    minCount: 2,
    maxCount: 6,
    requiredTypes: ['vendor'],
    context: welcomePartyContext({
      existing_vendors: [
        { id: HARBOR_DJ_ID, name: 'Harbor Lights DJ', category: 'Music', status: 'confirmed', estimated_cost: 700, contact_name: null, email: null, phone: null, notes: null },
      ],
    }),
    expectedOperations: [
      { update_type: 'vendor', operation: 'archive', target_id: HARBOR_DJ_ID },
      { update_type: 'vendor', operation: 'insert' },
    ],
  },
]

const eventStateContext: EventStateContext = {
  event: {
    name: 'Extraction Test Event',
    event_type: 'event',
    event_date: null,
    location: null,
    description: null,
    attendee_target: null,
    budget_target: null,
  },
  existing_tasks: [],
  existing_vendors: [],
  existing_budget_items: [],
  existing_timeline_items: [],
  existing_risks: [],
  existing_open_questions: [],
  pending_proposed_updates: [],
  recent_ai_run_summaries: [],
}

function loadAnthropicKeyFromEnvLocal(): boolean {
  if (process.env.ANTHROPIC_API_KEY) return false

  const envPath = join(process.cwd(), '.env.local')
  if (!existsSync(envPath)) return false

  const text = readFileSync(envPath, 'utf8')
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const match = line.match(/^(?:export\s+)?ANTHROPIC_API_KEY\s*=\s*(.*)$/)
    if (!match) continue

    const value = cleanEnvValue(match[1])
    if (value) {
      process.env.ANTHROPIC_API_KEY = value
      return true
    }
  }

  return false
}

function cleanEnvValue(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }

  return trimmed.split(/\s+#/)[0]?.trim() ?? ''
}

function countByType(items: ExtractedItem[]): Record<UpdateType, number> {
  const counts = Object.fromEntries(UPDATE_TYPES.map((type) => [type, 0])) as Record<UpdateType, number>
  for (const item of items) {
    counts[item.update_type] += 1
  }
  return counts
}

function itemLabel(item: ExtractedItem): string {
  const payload = item.payload as unknown as Record<string, unknown>
  const value =
    payload.title ??
    payload.name ??
    payload.question ??
    payload.description ??
    payload.category ??
    'Untitled suggestion'

  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : 'Untitled suggestion'
}

function summarizeResponse(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 240)
}

function formatCounts(counts: Record<UpdateType, number>): string {
  return UPDATE_TYPES
    .filter((type) => counts[type] > 0)
    .map((type) => `${type}=${counts[type]}`)
    .join(', ') || 'none'
}

function evaluateScenario(
  scenario: Scenario,
  items: ExtractedItem[],
  counts: Record<UpdateType, number>,
): { status: ScenarioStatus; reasons: string[]; warnings: string[]; missingTypes: UpdateType[] } {
  const missingTypes = scenario.requiredTypes.filter((type) => counts[type] === 0)
  const reasons: string[] = []
  const warnings: string[] = []

  // Intake-style scenarios with a maxCount expect few/zero items — skip the collapse check
  if (scenario.maxCount === undefined && items.length <= 2) {
    reasons.push('collapsed_to_1_or_2_items')
  }
  if (scenario.maxCount !== undefined && items.length > scenario.maxCount) {
    reasons.push(`above_maximum=${items.length}/${scenario.maxCount}`)
  }
  const forbiddenFound = (scenario.forbiddenTypes ?? []).filter((type) => counts[type] > 0)
  if (forbiddenFound.length > 0) {
    reasons.push(`forbidden_types=${forbiddenFound.join(',')}`)
  }
  if (missingTypes.length > 0) {
    reasons.push(`missing_required_types=${missingTypes.join(',')}`)
  }

  for (const expected of scenario.expectedOperations ?? []) {
    const found = items.some((item) =>
      item.update_type === expected.update_type &&
      (item.operation ?? 'insert') === expected.operation &&
      (expected.target_id === undefined || item.target_record_id === expected.target_id)
    )
    if (!found) {
      const target = expected.target_id ? `→${expected.target_id.slice(-4)}` : ''
      reasons.push(`missing_operation=${expected.update_type}:${expected.operation}${target}`)
    }
  }

  const belowMinimumBy = scenario.minCount - items.length
  if (belowMinimumBy > 0) {
    if (missingTypes.length === 0 && belowMinimumBy === 1 && items.length > 2) {
      warnings.push(`one_below_minimum=${scenario.minCount}`)
    } else {
      reasons.push(`below_minimum=${items.length}/${scenario.minCount}`)
    }
  }

  if (reasons.length > 0) {
    return { status: 'FAIL', reasons, warnings, missingTypes }
  }
  if (warnings.length > 0) {
    return { status: 'WARN', reasons, warnings, missingTypes }
  }
  return { status: 'PASS', reasons, warnings, missingTypes }
}

async function main() {
  const loadedFromEnvLocal = loadAnthropicKeyFromEnvLocal()
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY is not set and was not found in .env.local.')
    console.log('Run with: ANTHROPIC_API_KEY=... npm run test:extract')
    return
  }

  console.log(
    loadedFromEnvLocal
      ? 'Loaded ANTHROPIC_API_KEY from .env.local for this process.'
      : 'Using ANTHROPIC_API_KEY from the current environment.',
  )
  console.log(`Extraction model: ${process.env.ANTHROPIC_EXTRACT_MODEL ?? 'claude-haiku-4-5'}`)

  const { llmExtract } = await import('@/lib/ai/llm-extract')

  for (const scenario of SCENARIOS) {
    console.log('\n---')
    console.log(`Test: ${scenario.name}`)

    try {
      const result = await llmExtract(scenario.text, [], scenario.context ?? eventStateContext)
      const counts = countByType(result.items)
      const evaluation = evaluateScenario(scenario, result.items, counts)

      // The sanitizer must keep chat replies prose-only — a JSON-shaped reply
      // rendered verbatim in chat is a demo-breaking trust failure.
      if (/"[a-z_]+"\s*:/.test(result.responseMessage)) {
        evaluation.reasons.push('response_message_contains_json')
        evaluation.status = 'FAIL'
      }

      console.log(`Assistant: ${summarizeResponse(result.responseMessage)}`)
      console.log(`Total: ${result.items.length}`)
      console.log(`Types: ${formatCounts(counts)}`)
      console.log(
        `Result: ${evaluation.status} (min=${scenario.minCount}, missing_types=${evaluation.missingTypes.join(', ') || 'none'}, warnings=${evaluation.warnings.join(', ') || 'none'}, failures=${evaluation.reasons.join(', ') || 'none'})`,
      )
      console.log('Items:')
      for (const item of result.items) {
        const confidence = typeof item.confidence === 'number'
          ? ` (${item.confidence.toFixed(2)})`
          : ''
        const operation = item.operation && item.operation !== 'insert'
          ? ` [${item.operation}${item.target_record_id ? `→…${item.target_record_id.slice(-4)}` : ''}]`
          : ''
        console.log(`- ${item.update_type}${operation} - ${itemLabel(item)}${confidence}`)
      }
    } catch (err) {
      console.log(`ERROR: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
