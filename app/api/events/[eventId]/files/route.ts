import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { RegisterFileSchema } from '@/lib/validators/file-upload'
import { runExtraction, type RunExtractionResult } from '@/lib/ai/run-extraction'
import type { FileStatus } from '@/lib/types'

// File extraction runs a synchronous LLM call (Haiku, + vision for PDF/image)
// inside this handler. Give it headroom so a slow read can't be killed mid-flight
// at the platform's default function timeout.
export const maxDuration = 60

const STORAGE_BUCKET = 'event-files'

type ServerClient = Awaited<ReturnType<typeof createClient>>

// Every files UPDATE goes through here so a 0-row update (e.g. a missing RLS
// UPDATE policy — the M20b bug) can never fail silently again.
async function updateFile(supabase: ServerClient, fileId: string, patch: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('files')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', fileId)
    .select('id')
  if (error) {
    console.error('files: update error:', error)
  } else if (!data || data.length === 0) {
    console.error(`files: update affected 0 rows for ${fileId} — check the files UPDATE RLS policy (migration 010)`)
  }
}

async function logFileUploaded(
  supabase: ServerClient,
  eventId: string,
  userId: string,
  meta: {
    fileId: string
    filename: string
    displayName: string
    aiRunId: string | null
    proposedCount: number
    outcome: string
  },
) {
  await supabase.from('activity_log').insert({
    event_id: eventId,
    actor_user_id: userId,
    action: 'file_uploaded',
    entity_type: 'file',
    entity_id: meta.fileId,
    metadata_json: {
      filename: meta.filename,
      display_name: meta.displayName,
      ai_run_id: meta.aiRunId,
      proposed_count: meta.proposedCount,
      outcome: meta.outcome,
      channel: 'file',
    },
  })
}

// The browser uploads the bytes directly to Storage (RLS-enforced, avoids
// routing large binaries through serverless functions). This route registers
// the file as a managed library item and kicks off extraction through the
// shared runExtraction pipeline. The file row is created regardless of whether
// extraction succeeds — a failed read still leaves the file visible.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const { eventId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = RegisterFileSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { file_id, filename, display_name, storage_path, mime_type, size_bytes } = parsed.data

  // Defense in depth: the object path must live under this event's folder
  // (RLS already enforces membership, but never trust a client-supplied path).
  if (!storage_path.startsWith(`${eventId}/`)) {
    return NextResponse.json({ error: 'Invalid storage path' }, { status: 400 })
  }

  const displayName = (display_name?.trim() || filename).slice(0, 255)
  const isText = mime_type === 'text/plain' || mime_type === 'text/markdown'
  const isPdf = mime_type === 'application/pdf'
  const isImage = mime_type === 'image/png' || mime_type === 'image/jpeg'

  // Insert the managed library item. Images (PNG/JPG screenshots) extract
  // through the same pipeline as PDFs via Claude vision (M22).
  const initialStatus: FileStatus = 'extracting'
  const { data: fileRow, error: insertErr } = await supabase
    .from('files')
    .insert({
      id: file_id,
      event_id: eventId,
      uploaded_by: user.id,
      filename,
      display_name: displayName,
      storage_path,
      mime_type,
      size_bytes,
      status: initialStatus,
    })
    .select('id')
    .single()

  if (insertErr || !fileRow) {
    console.error('files insert error:', insertErr)
    return NextResponse.json({ error: 'Failed to register file' }, { status: 500 })
  }

  // Pull the bytes/text back from Storage for extraction.
  const { data: blob, error: downloadErr } = await supabase.storage.from(STORAGE_BUCKET).download(storage_path)
  if (downloadErr || !blob) {
    console.error('files download error:', downloadErr)
    await updateFile(supabase, file_id, {
      status: 'failed',
      processing_error: 'Could not read the uploaded file from storage.',
    })
    await logFileUploaded(supabase, eventId, user.id, {
      fileId: file_id,
      filename,
      displayName,
      aiRunId: null,
      proposedCount: 0,
      outcome: 'failed',
    })
    return NextResponse.json({ file_id, status: 'failed' satisfies FileStatus })
  }

  let result: RunExtractionResult
  try {
    if (isText) {
      const text = (await blob.text()).slice(0, 10000)
      result = await runExtraction({
        supabase,
        eventId,
        userId: user.id,
        inputText: text,
        channel: 'file',
        fileDisplayName: displayName,
        fileName: filename,
      })
    } else if (isPdf) {
      const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64')
      result = await runExtraction({
        supabase,
        eventId,
        userId: user.id,
        inputText: '',
        attachment: { kind: 'pdf', mediaType: 'application/pdf', base64 },
        channel: 'file',
        fileDisplayName: displayName,
        fileName: filename,
      })
    } else if (isImage) {
      const base64 = Buffer.from(await blob.arrayBuffer()).toString('base64')
      result = await runExtraction({
        supabase,
        eventId,
        userId: user.id,
        inputText: '',
        attachment: { kind: 'image', mediaType: mime_type, base64 },
        channel: 'file',
        fileDisplayName: displayName,
        fileName: filename,
      })
    } else {
      // Should be unreachable given the MIME allowlist.
      result = { ok: false as const, status: 400, error: 'Unsupported file type' }
    }
  } catch (err) {
    console.error('files: extraction threw:', err instanceof Error ? err.message : String(err))
    result = { ok: false as const, status: 500, error: 'Extraction failed unexpectedly' }
  }

  if (!result.ok) {
    await updateFile(supabase, file_id, { status: 'failed', processing_error: result.error })
    await logFileUploaded(supabase, eventId, user.id, {
      fileId: file_id,
      filename,
      displayName,
      aiRunId: null,
      proposedCount: 0,
      outcome: 'failed',
    })
    return NextResponse.json({ file_id, status: 'failed' satisfies FileStatus, error: result.error })
  }

  const outcomeToStatus: Record<typeof result.data.outcome, FileStatus> = {
    updates: 'needs_review',
    no_updates: 'extracted',
    low_confidence: 'source_only',
    failed: 'failed',
  }
  const status = outcomeToStatus[result.data.outcome]
  const meta = result.data.file_meta

  await updateFile(supabase, file_id, {
    status,
    source_message_id: result.data.message_id,
    ai_run_id: result.data.ai_run_id,
    ai_suggested_name: meta?.title ?? null,
    ai_category: meta?.category ?? null,
    ai_labels: meta?.labels ?? null,
    extraction_summary: meta?.summary ?? null,
    processing_error: result.data.outcome === 'failed' ? 'Glenn could not read this file confidently.' : null,
  })

  await logFileUploaded(supabase, eventId, user.id, {
    fileId: file_id,
    filename,
    displayName,
    aiRunId: result.data.ai_run_id,
    proposedCount: result.data.proposed_count,
    outcome: result.data.outcome,
  })

  return NextResponse.json({
    file_id,
    status,
    proposed_count: result.data.proposed_count,
    assistant_message: result.data.assistant_message,
    ai_run_id: result.data.ai_run_id,
  })
}
