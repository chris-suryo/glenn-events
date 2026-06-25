// Headless, deterministic verification of Batch 3a's DST-aware local→UTC
// conversion (D5 write-path core) — independent of the builder's vitest suite.
// No LLM, no DB. Run: npm run test:tz
import { zonedWallClockToUtc, eventDayKey } from '@/lib/timeline-format'

const NY = 'America/New_York'
const LA = 'America/Los_Angeles'

const cases: Array<{ name: string; got: string | null; want: string | null }> = [
  { name: 'noon EDT (Sep) → 16:00Z', got: zonedWallClockToUtc('2026-09-18T12:00:00', NY), want: '2026-09-18T16:00:00.000Z' },
  { name: 'noon EST (Jan) → 17:00Z', got: zonedWallClockToUtc('2026-01-15T12:00:00', NY), want: '2026-01-15T17:00:00.000Z' },
  { name: 'noon MST Phoenix (no DST) → 19:00Z', got: zonedWallClockToUtc('2026-07-04T12:00:00', 'America/Phoenix'), want: '2026-07-04T19:00:00.000Z' },
  { name: 'date-only passthrough (never shifted)', got: zonedWallClockToUtc('2026-09-18', NY), want: '2026-09-18' },
  { name: 'null → null', got: zonedWallClockToUtc(null, NY), want: null },
  { name: 'space-separated wall clock → 16:00Z', got: zonedWallClockToUtc('2026-09-18 12:00', NY), want: '2026-09-18T16:00:00.000Z' },
]

// Batch 3b: event-zone day-bucketing for the lead-up calendar (D15b).
const dayCases: Array<{ name: string; got: string | null; want: string | null }> = [
  { name: 'midnight-UTC keyed to prior ET day (the D15b case)', got: eventDayKey('2026-09-18T00:00:00Z', NY), want: '2026-09-17' },
  { name: 'noon-ET instant keyed to its ET day', got: eventDayKey('2026-09-18T16:00:00Z', NY), want: '2026-09-18' },
  { name: 'evening-UTC keyed to prior PT day', got: eventDayKey('2026-09-18T03:00:00Z', LA), want: '2026-09-17' },
  { name: 'date-only passthrough', got: eventDayKey('2026-09-18', NY), want: '2026-09-18' },
  { name: 'null → null', got: eventDayKey(null, NY), want: null },
]

let ok = true
console.log('— zonedWallClockToUtc (Batch 3a, write path) —')
for (const c of cases) {
  const pass = c.got === c.want
  if (!pass) ok = false
  console.log(`  ${pass ? 'PASS' : 'FAIL'} ${c.name}${pass ? '' : `   (got ${c.got}, want ${c.want})`}`)
}
console.log('— eventDayKey (Batch 3b, display day-bucketing) —')
for (const c of dayCases) {
  const pass = c.got === c.want
  if (!pass) ok = false
  console.log(`  ${pass ? 'PASS' : 'FAIL'} ${c.name}${pass ? '' : `   (got ${c.got}, want ${c.want})`}`)
}
console.log(ok ? '\n✅ Batch 3a + 3b tz logic verified (write conversion + display day-key)' : '\n🔴 tz logic FAILED')
if (!ok) process.exitCode = 1
