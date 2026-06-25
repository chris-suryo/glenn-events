// Headless, deterministic verification of Batch 3a's DST-aware local→UTC
// conversion (D5 write-path core) — independent of the builder's vitest suite.
// No LLM, no DB. Run: npm run test:tz
import { zonedWallClockToUtc } from '@/lib/timeline-format'

const NY = 'America/New_York'

const cases: Array<{ name: string; got: string | null; want: string | null }> = [
  { name: 'noon EDT (Sep) → 16:00Z', got: zonedWallClockToUtc('2026-09-18T12:00:00', NY), want: '2026-09-18T16:00:00.000Z' },
  { name: 'noon EST (Jan) → 17:00Z', got: zonedWallClockToUtc('2026-01-15T12:00:00', NY), want: '2026-01-15T17:00:00.000Z' },
  { name: 'noon MST Phoenix (no DST) → 19:00Z', got: zonedWallClockToUtc('2026-07-04T12:00:00', 'America/Phoenix'), want: '2026-07-04T19:00:00.000Z' },
  { name: 'date-only passthrough (never shifted)', got: zonedWallClockToUtc('2026-09-18', NY), want: '2026-09-18' },
  { name: 'null → null', got: zonedWallClockToUtc(null, NY), want: null },
  { name: 'space-separated wall clock → 16:00Z', got: zonedWallClockToUtc('2026-09-18 12:00', NY), want: '2026-09-18T16:00:00.000Z' },
]

let ok = true
for (const c of cases) {
  const pass = c.got === c.want
  if (!pass) ok = false
  console.log(`${pass ? 'PASS' : 'FAIL'} ${c.name}${pass ? '' : `   (got ${c.got}, want ${c.want})`}`)
}
console.log(ok ? '\n✅ Batch 3a tz conversion verified (DST both ways + passthrough)' : '\n🔴 tz conversion FAILED')
if (!ok) process.exitCode = 1
