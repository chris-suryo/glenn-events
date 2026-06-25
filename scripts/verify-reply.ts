// Automated verification of Batch 2 — reply integrity (D16b / D3 / D11).
// The reply's item list is now app-composed from the emitted items[], so it
// structurally cannot describe a phantom update. Headless: tsx + LLM, no UI/DB.
//   npm run test:reply
//   ANTHROPIC_EXTRACT_MODEL=claude-sonnet-4-6 npm run test:reply

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
      name: 'Reply Test Event',
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

function bulletCount(text: string): number {
  return text.split('\n').filter((line) => /^-\s/.test(line)).length
}

const CASES: Array<{ name: string; text: string }> = [
  {
    name: 'multi-item note → reply bullets exactly match emitted items',
    text: 'Booked Harbor Hall for the venue at $4,000 for the day. Catering is Two Forks at $2,200. Someone needs to send the invites, and the photographer arrives at 3:00 PM.',
  },
  {
    name: 'D16 case (save-the-date) → reply cannot claim an unemitted task',
    text: 'Can someone send the save-the-date by Friday, August 14, 2026?',
  },
]

async function main(): Promise<void> {
  loadAnthropicKey()
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('ANTHROPIC_API_KEY not set and not found in .env.local — cannot run.')
    process.exitCode = 1
    return
  }

  const model = process.env.ANTHROPIC_EXTRACT_MODEL ?? 'claude-haiku-4-5'
  console.log(`Batch 2 reply-integrity verification — model: ${model}\n`)

  const { llmExtract } = await import('@/lib/ai/llm-extract')

  let allOk = true
  for (const testCase of CASES) {
    try {
      const { items, responseMessage } = (await llmExtract(testCase.text, [], baseContext())) as {
        items: ExtractedItem[]
        responseMessage: string
      }
      const bullets = bulletCount(responseMessage)
      const taskCount = items.filter((i) => i.update_type === 'task').length
      const checks = [
        { ok: bullets === items.length, label: `reply bullets (${bullets}) == emitted items (${items.length})  [D16b: no phantom/omitted]` },
        { ok: !responseMessage.includes('\\n'), label: 'no literal \\n in reply  [D11]' },
        { ok: !/\bsaved\b/i.test(responseMessage), label: 'no "saved" persistence verb  [D3]' },
      ]
      const ok = checks.every((c) => c.ok)
      if (!ok) allOk = false
      console.log(`${ok ? 'PASS' : 'FAIL'} ${testCase.name}`)
      for (const c of checks) console.log(`    ${c.ok ? '✓' : '✗'} ${c.label}`)
      if (/\b(added|done)\b/i.test(responseMessage)) console.log('    ⚠ contains "added/done" — review wording (D3 watch)')
      console.log(`    [items=${items.length}, task=${taskCount}]  reply:`)
      console.log('      ' + responseMessage.replace(/\n/g, '\n      '))
      console.log('')
    } catch (err) {
      allOk = false
      console.log(`ERR ${testCase.name}: ${err instanceof Error ? err.message : String(err)}\n`)
    }
  }

  console.log(allOk ? '✅ Reply-integrity checks PASSED' : '🔴 Reply-integrity checks FAILED')
  if (!allOk) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
