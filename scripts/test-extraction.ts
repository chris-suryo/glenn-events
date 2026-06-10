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

interface Scenario {
  name: string
  text: string
  minCount: number
  requiredTypes: UpdateType[]
}

type ScenarioStatus = 'PASS' | 'WARN' | 'FAIL'

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
]

const eventStateContext: EventStateContext = {
  event: {
    name: 'Extraction Test Event',
    event_type: 'event',
    event_date: null,
    location: null,
    attendee_target: null,
    budget_target: null,
  },
  existing_tasks: [],
  existing_vendors: [],
  existing_budget_items: [],
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

  if (items.length <= 2) {
    reasons.push('collapsed_to_1_or_2_items')
  }
  if (missingTypes.length > 0) {
    reasons.push(`missing_required_types=${missingTypes.join(',')}`)
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
      const result = await llmExtract(scenario.text, [], eventStateContext)
      const counts = countByType(result.items)
      const evaluation = evaluateScenario(scenario, result.items, counts)

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
        console.log(`- ${item.update_type} - ${itemLabel(item)}${confidence}`)
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
