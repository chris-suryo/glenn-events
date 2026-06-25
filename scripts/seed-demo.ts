/**
 * Dev-only seed script for Glenn Events.
 * Creates a demo user + "Q3 Client Networking Dinner" event with full fixture data.
 *
 * Idempotent: if the event already exists for this user, the script exits early.
 * To wipe and re-seed from scratch, set SEED_RESET=true:
 *
 * Usage:
 *   cp .env.example .env.local   # fill in your values
 *   npm run seed              # safe to run multiple times
 *   npm run seed:reset        # deletes existing event + data, then re-seeds
 *
 * Required env vars:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SEED_USER_EMAIL
 *   SEED_USER_PASSWORD
 *
 * Env files: unlike `next dev`, plain `tsx` does not load `.env.local`.
 * We load `.env` then `.env.local` so `npm run seed` picks up your keys.
 */

import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

loadEnv({ path: '.env' })
loadEnv({ path: '.env.local', override: true })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SEED_EMAIL = process.env.SEED_USER_EMAIL ?? 'demo@example.com'
const SEED_PASSWORD = process.env.SEED_USER_PASSWORD ?? 'change-this-password'
const SEED_RESET = process.env.SEED_RESET === 'true'

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function run() {
  console.log('🌱 Starting Glenn Events seed...')

  // ── 1. Create or find demo user ──────────────────────────────────────────
  console.log(`  Creating user: ${SEED_EMAIL}`)
  const { data: createdUser, error: createUserErr } =
    await supabase.auth.admin.createUser({
      email: SEED_EMAIL,
      password: SEED_PASSWORD,
      email_confirm: true,
    })

  let userId: string

  if (createUserErr) {
    if (createUserErr.message.includes('already been registered')) {
      const { data: list } = await supabase.auth.admin.listUsers()
      const existing = list?.users.find((u) => u.email === SEED_EMAIL)
      if (!existing) {
        console.error('Could not find or create user:', createUserErr.message)
        process.exit(1)
      }
      userId = existing.id
      console.log(`  Found existing user: ${userId}`)
    } else {
      console.error('Error creating user:', createUserErr.message)
      process.exit(1)
    }
  } else {
    userId = createdUser.user.id
    console.log(`  Created user: ${userId}`)
  }

  // ── 2. Ensure profile exists ─────────────────────────────────────────────
  await supabase.from('profiles').upsert(
    { id: userId, email: SEED_EMAIL, full_name: 'Demo User' },
    { onConflict: 'id' }
  )

  // ── 3. Find or create organization ──────────────────────────────────────
  let orgId: string

  const { data: existingMembership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .limit(1)
    .single()

  if (existingMembership) {
    orgId = existingMembership.organization_id
    console.log(`  Using existing organization: ${orgId}`)
  } else {
    console.log('  Creating organization...')
    const { data: org } = await supabase
      .from('organizations')
      .insert({ name: 'Demo Organization', created_by: userId })
      .select()
      .single()
    if (!org) { console.error('Failed to create org'); process.exit(1) }
    orgId = org.id
    await supabase.from('organization_members').upsert(
      { organization_id: orgId, user_id: userId, role: 'owner' },
      { onConflict: 'organization_id,user_id' }
    )
  }

  // ── 4. Find or create event (idempotent) ─────────────────────────────────
  const eventDate = new Date('2026-09-27T18:00:00-04:00').toISOString()

  // Check if already seeded
  const { data: existingEvent } = await supabase
    .from('events')
    .select('id')
    .eq('organization_id', orgId)
    .eq('name', 'Q3 Client Networking Dinner')
    .limit(1)
    .single()

  if (existingEvent && !SEED_RESET) {
    console.log(`\n✅ Already seeded! Event ID: ${existingEvent.id}`)
    console.log('   Run `npm run seed:reset` to wipe and re-seed from scratch.')
    console.log(`   Sign in at http://localhost:3000/login`)
    return
  }

  if (existingEvent && SEED_RESET) {
    console.log(`  Resetting: deleting existing event ${existingEvent.id} and all related data...`)
    // Cascade deletes handle all child rows (vendors, tasks, etc.)
    await supabase.from('events').delete().eq('id', existingEvent.id)
    console.log('  Reset complete.')
  }

  console.log('  Creating event: Q3 Client Networking Dinner...')
  const { data: event } = await supabase
    .from('events')
    .insert({
      organization_id: orgId,
      name: 'Q3 Client Networking Dinner',
      description:
        'Annual Q3 client appreciation dinner for top accounts. Focus on relationship-building, product previews, and celebrating the quarter.',
      event_type: 'Corporate Dinner',
      event_date: eventDate,
      timezone: 'America/New_York',
      location: 'Boston / Cambridge, MA',
      attendee_target: 85,
      budget_target: 18000,
      status: 'planning',
      ai_summary:
        'Q3 Client Networking Dinner is on track for September 27 at The Charles Hotel. Venue and photography are committed; catering, AV, and printed materials are still estimated — about $18,900 against an $18,000 target. Two open risks stand out: the unsigned SoundWave AV contract (high) and a potential catering overage if headcount tops 90. Near-term priorities — confirm the AV package this week and lock the final headcount before the September 17 deadline.',
      created_by: userId,
    })
    .select()
    .single()

  if (!event) { console.error('Failed to create event'); process.exit(1) }
  const eid = event.id
  console.log(`  Event ID: ${eid}`)

  await supabase.from('event_members').upsert(
    { event_id: eid, user_id: userId, role: 'owner' },
    { onConflict: 'event_id,user_id' }
  )

  // ── 5. Vendors ────────────────────────────────────────────────────────────
  console.log('  Seeding vendors...')
  const { data: vendors } = await supabase
    .from('vendors')
    .insert([
      {
        event_id: eid,
        name: 'The Charles Hotel',
        category: 'Venue',
        contact_name: 'Events Team',
        email: 'events@charleshotel.com',
        status: 'confirmed',
        estimated_cost: 6500,
        notes: 'Ballroom confirmed for Sep 27. Setup from 3pm.',
      },
      {
        event_id: eid,
        name: 'Harvest Catering Co.',
        category: 'Catering',
        contact_name: 'Marcus Webb',
        email: 'marcus@harvestcatering.com',
        status: 'confirmed',
        estimated_cost: 7200,
        notes: 'Quote provided at $7,200 but may increase if headcount exceeds 90.',
      },
      {
        event_id: eid,
        name: 'SoundWave AV',
        category: 'AV & Production',
        contact_name: 'Priya Nair',
        email: 'priya@soundwaveav.com',
        status: 'prospect',
        estimated_cost: 2800,
        notes: 'AV package not yet confirmed. Follow up needed this week.',
      },
      {
        event_id: eid,
        name: 'Lens & Light Photography',
        category: 'Photography',
        contact_name: 'Daniel Kim',
        email: 'daniel@lensandlight.co',
        status: 'confirmed',
        estimated_cost: 1500,
        notes: '4-hour package. Event photography only.',
      },
    ])
    .select()

  const vendorMap = Object.fromEntries(
    (vendors ?? []).map((v) => [v.category as string, v.id as string])
  )

  // ── 6. Budget items ───────────────────────────────────────────────────────
  console.log('  Seeding budget items...')
  await supabase.from('budget_items').insert([
    {
      event_id: eid,
      category: 'Venue',
      description: 'Charles Hotel ballroom rental',
      estimated_cost: 6500,
      status: 'committed',
      vendor_id: vendorMap['Venue'] ?? null,
    },
    {
      event_id: eid,
      category: 'Catering',
      description: 'Dinner for 85 guests (plated)',
      estimated_cost: 7200,
      status: 'estimated',
      vendor_id: vendorMap['Catering'] ?? null,
    },
    {
      event_id: eid,
      category: 'AV & Production',
      description: 'Microphones, screen, projector, lighting',
      estimated_cost: 2800,
      status: 'estimated',
      vendor_id: vendorMap['AV & Production'] ?? null,
    },
    {
      event_id: eid,
      category: 'Photography',
      description: 'Event photography — 4-hour package',
      estimated_cost: 1500,
      status: 'committed',
      vendor_id: vendorMap['Photography'] ?? null,
    },
    {
      event_id: eid,
      category: 'Printed Materials',
      description: 'Programs, name cards, signage',
      estimated_cost: 400,
      status: 'estimated',
    },
    {
      event_id: eid,
      category: 'Contingency',
      description: '~3% buffer for overruns',
      estimated_cost: 500,
      status: 'estimated',
    },
  ])

  // ── 7. Tasks ──────────────────────────────────────────────────────────────
  console.log('  Seeding tasks...')
  await supabase.from('tasks').insert([
    {
      event_id: eid,
      title: 'Confirm AV package with SoundWave',
      description: 'Follow up with Priya Nair — package details and contract still outstanding.',
      due_date: new Date('2026-08-01T12:00:00-04:00').toISOString(),
      status: 'todo',
      priority: 'high',
      owner_user_id: userId,
    },
    {
      event_id: eid,
      title: 'Send final headcount to caterer',
      description: 'Final number due 10 days before event. Coordinate with RSVP list.',
      due_date: new Date('2026-09-17T12:00:00-04:00').toISOString(),
      status: 'todo',
      priority: 'high',
      owner_user_id: userId,
    },
    {
      event_id: eid,
      title: 'Finalize run of show',
      description: 'Confirm event flow: arrival, drinks, dinner, remarks, closing.',
      due_date: new Date('2026-09-10T12:00:00-04:00').toISOString(),
      status: 'todo',
      priority: 'medium',
      owner_user_id: userId,
    },
    {
      event_id: eid,
      title: 'Send invitations',
      description: 'Email invitations to client list. Include parking details.',
      due_date: new Date('2026-08-15T12:00:00-04:00').toISOString(),
      status: 'todo',
      priority: 'medium',
    },
    {
      event_id: eid,
      title: 'Confirm parking arrangements with venue',
      description: 'Validate valet and self-park options at The Charles Hotel.',
      due_date: new Date('2026-09-01T12:00:00-04:00').toISOString(),
      status: 'todo',
      priority: 'low',
    },
    {
      event_id: eid,
      title: 'Order printed materials',
      description: 'Programs, name cards, table signage. Allow 2-week lead time.',
      due_date: new Date('2026-09-10T12:00:00-04:00').toISOString(),
      status: 'todo',
      priority: 'low',
    },
  ])

  // ── 8. Timeline items ─────────────────────────────────────────────────────
  console.log('  Seeding timeline items...')
  await supabase.from('timeline_items').insert([
    {
      event_id: eid,
      title: 'Invitations sent',
      type: 'milestone',
      starts_at: new Date('2026-08-15T12:00:00-04:00').toISOString(),
    },
    {
      event_id: eid,
      title: 'AV contract deadline',
      description: 'Must have signed AV contract by this date.',
      type: 'deadline',
      starts_at: new Date('2026-08-01T12:00:00-04:00').toISOString(),
    },
    {
      event_id: eid,
      title: 'Final headcount to caterer',
      description: 'No changes accepted after this date.',
      type: 'deadline',
      starts_at: new Date('2026-09-17T12:00:00-04:00').toISOString(),
    },
    {
      event_id: eid,
      title: 'Run of show finalized',
      type: 'milestone',
      starts_at: new Date('2026-09-10T12:00:00-04:00').toISOString(),
    },
    {
      event_id: eid,
      title: 'Venue setup',
      type: 'planning',
      starts_at: new Date('2026-09-27T15:00:00-04:00').toISOString(),
      ends_at: new Date('2026-09-27T17:30:00-04:00').toISOString(),
    },
    {
      event_id: eid,
      title: 'Event — Q3 Client Networking Dinner',
      type: 'milestone',
      starts_at: new Date('2026-09-27T18:00:00-04:00').toISOString(),
      ends_at: new Date('2026-09-27T21:30:00-04:00').toISOString(),
    },
  ])

  // ── 9. Decisions ──────────────────────────────────────────────────────────
  console.log('  Seeding decisions...')
  await supabase.from('decisions').insert([
    {
      event_id: eid,
      title: 'Venue selection',
      description: 'Evaluated The Charles Hotel, Marriott Cambridge, and The Sinclair.',
      status: 'decided',
      decision: 'The Charles Hotel — best fit for atmosphere and capacity.',
      decided_at: new Date('2026-07-10').toISOString(),
      owner_user_id: userId,
    },
    {
      event_id: eid,
      title: 'Catering format',
      description: 'Choice between plated dinner, buffet, or heavy appetizers.',
      status: 'decided',
      decision: 'Plated dinner — more appropriate for client-facing event.',
      decided_at: new Date('2026-07-15').toISOString(),
      owner_user_id: userId,
    },
    {
      event_id: eid,
      title: 'AV vendor selection',
      description: 'Two vendors under consideration: SoundWave AV and Boston Stage.',
      status: 'pending',
      owner_user_id: userId,
    },
    {
      event_id: eid,
      title: 'Budget increase if catering exceeds estimate',
      description: 'Caterer flagged potential overage if headcount exceeds 90.',
      status: 'pending',
      owner_user_id: userId,
    },
  ])

  // ── 10. Risks ─────────────────────────────────────────────────────────────
  console.log('  Seeding risks...')
  await supabase.from('risks').insert([
    {
      event_id: eid,
      title: 'AV package not confirmed',
      description: 'SoundWave AV contract not signed. Risk of losing availability.',
      severity: 'high',
      status: 'open',
      mitigation: 'Follow up with Priya Nair immediately. Identify backup vendor.',
    },
    {
      event_id: eid,
      title: 'Catering cost overrun',
      description: 'Caterer quote based on 85 guests. Estimate may increase if headcount rises.',
      severity: 'medium',
      status: 'open',
      mitigation: 'Lock headcount by Sep 17. Negotiate a cap with caterer.',
    },
    {
      event_id: eid,
      title: 'Low RSVP response rate',
      description: 'Invitations have not been sent yet. Late RSVPs could affect planning.',
      severity: 'medium',
      status: 'open',
      mitigation: 'Send invitations by Aug 15. Follow up with key accounts directly.',
    },
    {
      event_id: eid,
      title: 'Weather impact on parking/transit',
      description: 'Late September weather in Boston can be unpredictable.',
      severity: 'low',
      status: 'open',
      mitigation: 'Confirm covered parking. Include transit info in invitation.',
    },
  ])

  // ── 11. Open questions ────────────────────────────────────────────────────
  console.log('  Seeding open questions...')
  await supabase.from('open_questions').insert([
    {
      event_id: eid,
      question: 'Will the CEO be attending and giving remarks?',
      status: 'open',
      owner_user_id: userId,
      ai_generated: false,
    },
    {
      event_id: eid,
      question: 'Is there a dietary accommodation process for guests?',
      status: 'open',
      ai_generated: false,
    },
    {
      event_id: eid,
      question: 'Do we need a photographer contract/release for client guests?',
      status: 'open',
      ai_generated: false,
    },
    {
      event_id: eid,
      question: 'Should we include a product demo or keep it purely social?',
      status: 'open',
      owner_user_id: userId,
      ai_generated: false,
    },
  ])

  // ── 12. Activity log ──────────────────────────────────────────────────────
  console.log('  Seeding activity log...')
  await supabase.from('activity_log').insert([
    {
      event_id: eid,
      actor_user_id: userId,
      action: 'created',
      entity_type: 'event',
      entity_id: eid,
      metadata_json: { note: 'Event created via seed script' },
    },
    {
      event_id: eid,
      actor_user_id: userId,
      action: 'confirmed',
      entity_type: 'vendor',
      entity_id: vendorMap['Venue'] ?? null,
      metadata_json: { vendor_name: 'The Charles Hotel' },
    },
    {
      event_id: eid,
      actor_user_id: userId,
      action: 'confirmed',
      entity_type: 'vendor',
      entity_id: vendorMap['Catering'] ?? null,
      metadata_json: { vendor_name: 'Harvest Catering Co.' },
    },
  ])

  console.log('')
  console.log('✅ Seed complete!')
  console.log(`   Event: Q3 Client Networking Dinner (${eid})`)
  console.log(`   User:  ${SEED_EMAIL}`)
  console.log('')
  console.log('   Sign in at http://localhost:3000/login')
  console.log('   Use the password from SEED_USER_PASSWORD in your env file.')
}

run().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
