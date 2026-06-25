// Automated verification of the Batch 1 date-injection fix (D4/D10).
// Runs the REAL extractor headlessly with date-shaped notes and asserts the
// resolved dates against TODAY — today is computed at run time, so the checks
// stay correct regardless of the wall clock. No UI, no DB, no auth: `tsx` + LLM.
//
//   npm run test:dates                 # 2 runs/case (default)
//   RUNS=1 npm run test:dates          # cheaper smoke
//   ANTHROPIC_EXTRACT_MODEL=claude-sonnet-4-6 npm run test:dates   # model A/B

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ExtractedItem } from '@/lib/ai/mock-extract'
import type { EventStateContext } from '@/lib/types'

function loadAnthropicKey(): void {
  if (process.env.ANTHROPIC_API_KEY) return
  const envPath = join(process.cwd(), '.env.local')
  if (!existsSync(envPath)) return
  for (const rawLine of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = rawLine.trim().match(/^(?:export\s+)?ANTHROPIC_API_KEY\s*=\s*(.*)$/)
    if (!m) continue
    const value = m[1].trim().replace(/^['"]|['"]$/g, '').split(/\s+#/)[0]?.trim() ?? ''
    if (value) {
      process.env.ANTHROPIC_API_KEY = value
      return
    }
  }
}

function baseContext(): EventStateContext {
  return {
    event: {
      name: 'Date Test Event',
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
}

const DATE_FIELDS = ['due_date', 'starts_at', 'ends_at', 'event_date', 'date'] as const

function isoDatesIn(items: ExtractedItem[]): string[] {
  const out: string[] = []
  for (const item of items) {
    const payload = item.payload as unknown as Record<string, unknown>
    for (const field of DATE_FIELDS) {
      const value = payload[field]
      if (typeof value === 'string') {
        const match = value.match(/\d{4}-\d{2}-\d{2}/)
        if (match) out.push(match[0])
      }
    }
  }
  return out
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysFromToday(iso: string, today: Date): number {
  return Math.round((Date.parse(iso) - Date.parse(ymd(today))) / 86_400_000)
}

interface DateCase {
  name: string
  text: string
  check: (dates: string[], today: Date) => { ok: boolean; detail: string }
}

const CASES: DateCase[] = [
  {
    name: 'no-year date → next future occurrence, never a past year (D4)',
    text: 'Our kickoff meeting is on Friday, September 18 at 9:00 AM.',
    check: (dates, today) => {
      const year = today.getFullYear()
      const todayMid = new Date(year, today.getMonth(), today.getDate())
      const expectYear = new Date(year, 8, 18) >= todayMid ? year : year + 1
      const sept18 = dates.filter((d) => d.slice(5) === '09-18')
      if (sept18.length === 0) return { ok: false, detail: `no Sept-18 date emitted (got ${dates.join(', ') || 'none'})` }
      const past = sept18.find((d) => Number(d.slice(0, 4)) < year)
      if (past) return { ok: false, detail: `PAST YEAR ${past} — the old D4 bug` }
      return {
        ok: sept18.some((d) => Number(d.slice(0, 4)) === expectYear),
        detail: `expected ${expectYear}-09-18, got ${sept18.join(', ')}`,
      }
    },
  },
  {
    name: 'relative "next Friday" → anchored to today, not months out (D10)',
    text: 'Can someone send the save-the-date by next Friday?',
    check: (dates, today) => {
      if (dates.length === 0) return { ok: false, detail: 'no due date emitted' }
      const offAnchor = dates.filter((d) => daysFromToday(d, today) > 21 || daysFromToday(d, today) < -1)
      const nearTerm = dates.filter((d) => daysFromToday(d, today) >= -1 && daysFromToday(d, today) <= 14)
      if (offAnchor.length > 0) return { ok: false, detail: `off-anchor date(s): ${offAnchor.join(', ')} (old bug: ~Sept-11 / 2025)` }
      if (nearTerm.length === 0) return { ok: false, detail: `no near-term date; got ${dates.join(', ')}` }
      return { ok: true, detail: `anchored at ${nearTerm.join(', ')}` }
    },
  },
  {
    name: 'explicit year respected (control / regression guard)',
    text: 'Our kickoff meeting is on September 18, 2027 at 9:00 AM.',
    check: (dates) => ({
      ok: dates.some((d) => d === '2027-09-18'),
      detail: `expected 2027-09-18, got ${dates.join(', ') || 'none'}`,
    }),
  },
]

const RUNS = Number(process.env.RUNS ?? '2')

async function main(): Promise<void> {
  loadAnthropicKey()
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY not set and not found in .env.local — cannot run live date checks.')
    process.exitCode = 1
    return
  }

  const model = process.env.ANTHROPIC_EXTRACT_MODEL ?? 'claude-haiku-4-5'
  console.log(`Batch 1 date verification — model: ${model}, runs/case: ${RUNS}\n`)

  const { llmExtract } = await import('@/lib/ai/llm-extract')

  let allOk = true
  for (const testCase of CASES) {
    const lines: string[] = []
    let hits = 0
    for (let i = 0; i < RUNS; i++) {
      const today = new Date()
      try {
        const { items } = await llmExtract(testCase.text, [], baseContext())
        const result = testCase.check(isoDatesIn(items), today)
        if (result.ok) hits++
        lines.push(result.ok ? '✓' : `✗ ${result.detail}`)
      } catch (err) {
        lines.push(`ERR ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    const ok = hits === RUNS
    if (!ok) allOk = false
    console.log(`${ok ? 'PASS' : 'FAIL'} [${hits}/${RUNS}] ${testCase.name}`)
    for (const line of lines) console.log(`    ${line}`)
  }

  console.log(allOk ? '\n✅ All date checks PASSED' : '\n🔴 Some date checks FAILED')
  if (!allOk) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
