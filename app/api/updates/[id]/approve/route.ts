import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildDestinationRow } from '@/lib/ai/apply-proposed-update'
import type { ProposedUpdate, UpdatePayload, UpdateType } from '@/lib/types'
import { z } from 'zod'

const ApproveRequestSchema = z.object({
  payload_json: z.unknown().optional(),
}).strict()

const TaskPayloadSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().nullable(),
  due_date: z.string().trim().nullable(),
  priority: z.enum(['low', 'medium', 'high']),
  status: z.literal('todo'),
  owner_name: z.string().trim().nullable(),
})

const VendorPayloadSchema = z.object({
  name: z.string().trim().min(1),
  category: z.string().trim().nullable(),
  contact_name: z.string().trim().nullable(),
  email: z.string().trim().nullable(),
  phone: z.string().trim().nullable(),
  status: z.enum(['prospect', 'contacted', 'confirmed', 'declined']),
  estimated_cost: z.number().nonnegative().nullable(),
  notes: z.string().trim().nullable(),
})

const BudgetItemPayloadSchema = z.object({
  category: z.string().trim().min(1),
  description: z.string().trim().min(1),
  estimated_cost: z.number().nonnegative().nullable(),
  actual_cost: z.number().nonnegative().nullable(),
  status: z.enum(['estimated', 'committed', 'paid']),
  vendor_name: z.string().trim().nullable(),
})

const TimelineItemPayloadSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().nullable(),
  starts_at: z.string().trim().nullable(),
  ends_at: z.string().trim().nullable(),
  type: z.enum(['milestone', 'task', 'deadline', 'planning']),
})

const DecisionPayloadSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().nullable(),
  status: z.enum(['pending', 'decided']),
  decision: z.string().trim().nullable(),
})

const RiskPayloadSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().nullable(),
  severity: z.enum(['low', 'medium', 'high']),
  status: z.enum(['open', 'monitoring', 'resolved']),
  mitigation: z.string().trim().nullable(),
})

const OpenQuestionPayloadSchema = z.object({
  question: z.string().trim().min(1),
  status: z.literal('open'),
  owner_name: z.string().trim().nullable(),
})

function recordLabel(payload: UpdatePayload): string {
  const p = payload as unknown as Record<string, unknown>
  const raw = p.title ?? p.name ?? p.question ?? p.description ?? null
  return typeof raw === 'string' && raw.trim().length > 0
    ? raw.trim().slice(0, 120)
    : 'Untitled record'
}

function nonNullVendorUpdate(payload: UpdatePayload, trace: Record<string, unknown>): Record<string, unknown> {
  const p = payload as unknown as Record<string, unknown>
  const updateData: Record<string, unknown> = { ...trace }
  for (const key of ['name', 'category', 'contact_name', 'email', 'phone', 'status', 'estimated_cost', 'notes']) {
    if (p[key] !== null && p[key] !== undefined) {
      updateData[key] = p[key]
    }
  }
  return updateData
}

function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return Object.keys(after).filter((key) => {
    if (['proposed_update_id', 'source_message_id', 'ai_run_id', 'ai_generated'].includes(key)) return false
    return before[key] !== after[key]
  })
}

function validatePayloadForType(updateType: UpdateType, payload: unknown): UpdatePayload | null {
  switch (updateType) {
    case 'task': {
      const parsed = TaskPayloadSchema.safeParse(payload)
      return parsed.success ? parsed.data : null
    }
    case 'vendor': {
      const parsed = VendorPayloadSchema.safeParse(payload)
      return parsed.success ? parsed.data : null
    }
    case 'budget_item': {
      const parsed = BudgetItemPayloadSchema.safeParse(payload)
      return parsed.success ? parsed.data : null
    }
    case 'timeline_item': {
      const parsed = TimelineItemPayloadSchema.safeParse(payload)
      return parsed.success ? parsed.data : null
    }
    case 'decision': {
      const parsed = DecisionPayloadSchema.safeParse(payload)
      return parsed.success ? parsed.data : null
    }
    case 'risk': {
      const parsed = RiskPayloadSchema.safeParse(payload)
      return parsed.success ? parsed.data : null
    }
    case 'open_question': {
      const parsed = OpenQuestionPayloadSchema.safeParse(payload)
      return parsed.success ? parsed.data : null
    }
  }
}

export async function POST(
  request: NextRequest,
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

  const requestBody = await request.json().catch(() => null)
  const parsedRequest = ApproveRequestSchema.safeParse(requestBody ?? {})
  if (!parsedRequest.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const editedPayload =
    parsedRequest.data.payload_json === undefined
      ? null
      : validatePayloadForType(typedUpdate.update_type, parsedRequest.data.payload_json)

  if (parsedRequest.data.payload_json !== undefined && !editedPayload) {
    return NextResponse.json({ error: 'Invalid edited suggestion' }, { status: 400 })
  }

  const updateForApply: ProposedUpdate = editedPayload
    ? { ...typedUpdate, payload_json: editedPayload }
    : typedUpdate

  if (updateForApply.operation === 'update') {
    if (updateForApply.update_type !== 'vendor' || updateForApply.target_record_type !== 'vendor' || !updateForApply.target_record_id) {
      return NextResponse.json({ error: 'Unsupported correction proposal' }, { status: 400 })
    }

    const { data: targetVendor, error: targetErr } = await supabase
      .from('vendors')
      .select('*')
      .eq('id', updateForApply.target_record_id)
      .eq('event_id', updateForApply.event_id)
      .single()

    if (targetErr || !targetVendor) {
      if (targetErr) console.error('approve correction: target vendor fetch error:', targetErr)
      return NextResponse.json({ error: 'Target vendor not found or access denied' }, { status: 404 })
    }

    const trace = {
      proposed_update_id: updateForApply.id,
      source_message_id:  updateForApply.source_message_id,
      ai_run_id:          updateForApply.ai_run_id,
      ai_generated:       true,
    }
    const updateData = nonNullVendorUpdate(updateForApply.payload_json, trace)
    const beforeVendor = targetVendor as Record<string, unknown>
    const fieldsChanged = changedFields(beforeVendor, updateData)
    const beforeLabel = typeof beforeVendor.name === 'string' ? beforeVendor.name : 'Untitled vendor'
    const afterLabel = typeof updateData.name === 'string' ? updateData.name : beforeLabel

    const { data: updatedVendor, error: vendorUpdateErr } = await supabase
      .from('vendors')
      .update(updateData)
      .eq('id', updateForApply.target_record_id)
      .eq('event_id', updateForApply.event_id)
      .select('id')
      .single()

    if (vendorUpdateErr || !updatedVendor) {
      if (vendorUpdateErr) console.error('approve correction: vendor update error:', vendorUpdateErr)
      return NextResponse.json({ error: 'Failed to update vendor' }, { status: 500 })
    }

    const proposalUpdate: Record<string, unknown> = {
      status:      'applied',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    }
    if (editedPayload) {
      proposalUpdate.payload_json = editedPayload
    }

    const { error: updateErr } = await supabase
      .from('proposed_updates')
      .update(proposalUpdate)
      .eq('id', id)
      .eq('status', 'pending')

    if (updateErr) {
      console.error('approve correction: status update error:', updateErr)
    }

    await supabase.from('activity_log').insert({
      event_id:      typedUpdate.event_id,
      actor_user_id: user.id,
      action:        'proposed_update_corrected',
      entity_type:   'vendor',
      entity_id:     updateForApply.target_record_id,
      metadata_json: {
        proposed_update_id: id,
        update_type:        updateForApply.update_type,
        target_record_id:   updateForApply.target_record_id,
        before_label:       beforeLabel,
        after_label:        afterLabel,
        changed_fields:     fieldsChanged,
      },
    })

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
      entity_type: 'vendor',
      entity_id:   updateForApply.target_record_id,
    })
  }

  // 4. Build destination row
  let applyResult: ReturnType<typeof buildDestinationRow>
  try {
    applyResult = buildDestinationRow(updateForApply)
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
  const proposalUpdate: Record<string, unknown> = {
    status:      'applied',
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  }
  if (editedPayload) {
    proposalUpdate.payload_json = editedPayload
  }

  const { data: claimed, error: updateErr } = await supabase
    .from('proposed_updates')
    .update(proposalUpdate)
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
      label:              recordLabel(updateForApply.payload_json),
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
