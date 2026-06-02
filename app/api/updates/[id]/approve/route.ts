import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildDestinationRow } from '@/lib/ai/apply-proposed-update'
import type { ProposedUpdate } from '@/lib/types'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  // 1. Auth — proxy.ts marks /api/* public; enforce here
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Fetch the proposed_update — RLS policy `is_event_member(event_id)` ensures
  //    only members can read it; non-members and missing rows both return null
  const { data: update } = await supabase
    .from('proposed_updates')
    .select('*')
    .eq('id', id)
    .single()

  if (!update) {
    return NextResponse.json({ error: 'Update not found or access denied' }, { status: 404 })
  }

  const typedUpdate = update as ProposedUpdate

  // 3. Idempotency — prevent double-applying
  if (typedUpdate.status !== 'pending') {
    return NextResponse.json(
      { error: `Update is already ${typedUpdate.status}` },
      { status: 409 }
    )
  }

  // 4. Build destination row
  let applyResult: ReturnType<typeof buildDestinationRow>
  try {
    applyResult = buildDestinationRow(typedUpdate)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unsupported update type' },
      { status: 400 }
    )
  }

  // 5. Insert into destination table — only update proposed_update if this succeeds
  const { data: inserted, error: insertErr } = await supabase
    .from(applyResult.table)
    .insert(applyResult.row)
    .select('id')
    .single()

  if (insertErr || !inserted) {
    console.error('approve: destination insert error:', insertErr)
    return NextResponse.json({ error: 'Failed to apply update' }, { status: 500 })
  }

  const insertedId = (inserted as { id: string }).id

  // 6. Atomically mark applied — only succeeds if still 'pending'.
  //    If 0 rows are returned, a concurrent request already applied it;
  //    the destination row above is a duplicate. Log but don't fail.
  const { data: claimed, error: updateErr } = await supabase
    .from('proposed_updates')
    .update({
      status:      'applied',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'pending')   // optimistic lock — only applies if still pending
    .select('id')

  if (updateErr) {
    console.error('approve: status update error:', updateErr)
  } else if (!claimed || claimed.length === 0) {
    // Concurrent approve won the race — destination row inserted above is a duplicate.
    // This should be very rare in practice; log for observability.
    console.warn('approve: concurrent approve detected for update', id, '— duplicate destination row possible')
  }

  // 7. Activity log (best-effort)
  await supabase.from('activity_log').insert({
    event_id:      typedUpdate.event_id,
    actor_user_id: user.id,
    action:        'proposed_update_applied',
    entity_type:   typedUpdate.update_type,
    entity_id:     insertedId,
    metadata_json: {
      proposed_update_id: id,
      update_type:        typedUpdate.update_type,
    },
  })

  // 8. Close out the ai_run if all its proposed_updates are now reviewed (best-effort)
  const { count: pendingCount } = await supabase
    .from('proposed_updates')
    .select('id', { count: 'exact', head: true })
    .eq('ai_run_id', typedUpdate.ai_run_id)
    .eq('status', 'pending')

  if (pendingCount === 0) {
    await supabase
      .from('ai_runs')
      .update({ status: 'completed' })
      .eq('id', typedUpdate.ai_run_id)
  }

  return NextResponse.json({
    ok:          true,
    status:      'applied',
    entity_type: typedUpdate.update_type,
    entity_id:   insertedId,
  })
}
