/**
 * Pre-demo preflight for Glenn Events. Verifies the database/storage are
 * provisioned so the headline file/library loop can't fail silently.
 *
 *   npm run preflight
 *
 * Checks: required env vars, AI-run telemetry columns (migration 011),
 * files table + updated_at (009), and the private `event-files` bucket (009).
 * Exits non-zero with a clear message if anything is missing.
 *
 * Like the seed script, plain `tsx` does not load `.env.local`, so we load it here.
 */
import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

loadEnv({ path: '.env' })
loadEnv({ path: '.env.local', override: true })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const failures: string[] = []
const ok = (m: string) => console.log(`  ✓ ${m}`)
const fail = (m: string) => {
  failures.push(m)
  console.error(`  ✗ ${m}`)
}

async function main() {
  console.log('Glenn Events preflight\n')

  console.log('Environment:')
  for (const key of [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]) {
    if (process.env[key]) ok(key)
    else fail(`${key} is not set`)
  }
  if (!process.env.ANTHROPIC_API_KEY && process.env.GLENN_USE_MOCK !== 'true') {
    fail('ANTHROPIC_API_KEY is not set and GLENN_USE_MOCK!=true — extraction would have no engine')
  } else {
    ok(
      process.env.ANTHROPIC_API_KEY
        ? 'ANTHROPIC_API_KEY set (real extraction)'
        : 'GLENN_USE_MOCK=true (mock extraction)',
    )
  }

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('\nCannot reach Supabase without URL + service role key. Aborting DB checks.')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log('\nDatabase:')
  {
    const { error } = await supabase
      .from('ai_runs')
      .select('model, provider, total_tokens, estimated_cost_usd, duration_ms')
      .limit(1)
    if (error) fail(`ai_runs telemetry columns missing — apply migration 011 (${error.message})`)
    else ok('ai_runs telemetry columns (migration 011)')
  }
  {
    const { error } = await supabase
      .from('files')
      .select('id, status, updated_at, ai_run_id, source_message_id')
      .limit(1)
    if (error) fail(`files table/columns missing — apply migration 009 (${error.message})`)
    else ok('files table + columns (migration 009)')
  }

  console.log('\nStorage:')
  {
    const { data, error } = await supabase.storage.getBucket('event-files')
    if (error || !data) {
      fail(`'event-files' bucket missing/unreachable — apply migration 009 (${error?.message ?? 'not found'})`)
    } else {
      ok(`'event-files' bucket present (public=${data.public})`)
    }
  }

  console.log('')
  if (failures.length) {
    console.error(`Preflight FAILED — ${failures.length} issue(s). Fix the above before demoing.`)
    process.exit(1)
  }
  console.log('Preflight passed. Demo prerequisites look good.')
  console.log(
    "  Note: the files UPDATE policy (migration 010) can't be checked via the API; if uploads stick on \"Reading…\", confirm 010 was applied.",
  )
}

main().catch((err) => {
  console.error('Preflight crashed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
