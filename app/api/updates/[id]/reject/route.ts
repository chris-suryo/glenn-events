import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ProposedUpdate, UpdatePayload } from '@/lib/types'

function recordLabel(payload: UpdatePayload): string {
  const p = payload as unknown as Record<string, unknown>
  const raw = p.title ?? p.name ?? p.question ?? p.description ?? null
  return typeof raw === 'string' && raw.trim().length > 0
    ? raw.trim().slice(0, 120)
    : 'Untitled record'
}

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
    .select('id, event_id, ai_run_id, update_type, status, payload_json')
    .eq('id', id)
    .single()

  if (!update) {
    return NextResponse.json({ error: 'Update not found or access denied' }, { status: 404 })
  }

  const typedUpdate = update as Pick<ProposedUpdate, 'id' | 'event_id' | 'ai_run_id' | 'update_type' | 'status' | 'payload_json'>

  // 3. Idempotency — prevent double-rejecting
  if (typedUpdate.status !== 'pending') {
    return NextResponse.json(
      { error: `Update is already ${typedUpdate.status}` },
      { status: 409 }
    )
  }

  // 4. Mark rejected
  const { error: updateErr } = await supabase
    .from('proposed_updates')
    .update({
      status:      'rejected',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (updateErr) {
    console.error('reject: status update error:', updateErr)
    return NextResponse.json({ error: 'Failed to reject update' }, { status: 500 })
  }

  // 5. Activity log (best-effort)
  await supabase.from('activity_log').insert({
    event_id:      typedUpdate.event_id,
    actor_user_id: user.id,
    action:        'proposed_update_rejected',
    entity_type:   'proposed_update',
    entity_id:     typedUpdate.id,
    metadata_json: {
      update_type: typedUpdate.update_type,
      label:       recordLabel(typedUpdate.payload_json),
      ai_run_id:   typedUpdate.ai_run_id,
    },
  })

  // Close out the ai_run if all its proposed_updates are now reviewed (best-effort)
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

  return NextResponse.json({ ok: true, status: 'rejected' })
}
