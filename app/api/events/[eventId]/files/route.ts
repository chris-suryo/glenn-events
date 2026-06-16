import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { RegisterFileSchema } from '@/lib/validators/file-upload'
import { runExtraction, type RunExtractionResult } from '@/lib/ai/run-extraction'
import type { FileStatus } from '@/lib/types'

const STORAGE_BUCKET = 'event-files'

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

  // Insert the managed library item. Images are source-only in Branch 1.
  const initialStatus: FileStatus = isImage ? 'source_only' : 'extracting'
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

  // Images: store as source only (no extraction in this branch).
  if (isImage) {
    return NextResponse.json({ file_id, status: 'source_only' satisfies FileStatus })
  }

  // Pull the bytes/text back from Storage for extraction.
  const { data: blob, error: downloadErr } = await supabase.storage.from(STORAGE_BUCKET).download(storage_path)
  if (downloadErr || !blob) {
    console.error('files download error:', downloadErr)
    await supabase
      .from('files')
      .update({ status: 'failed', processing_error: 'Could not read the uploaded file from storage.', updated_at: new Date().toISOString() })
      .eq('id', file_id)
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
    } else {
      // Should be unreachable given the MIME allowlist.
      result = { ok: false as const, status: 400, error: 'Unsupported file type' }
    }
  } catch (err) {
    console.error('files: extraction threw:', err instanceof Error ? err.message : String(err))
    result = { ok: false as const, status: 500, error: 'Extraction failed unexpectedly' }
  }

  if (!result.ok) {
    await supabase
      .from('files')
      .update({ status: 'failed', processing_error: result.error, updated_at: new Date().toISOString() })
      .eq('id', file_id)
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

  await supabase
    .from('files')
    .update({
      status,
      source_message_id: result.data.message_id,
      ai_run_id: result.data.ai_run_id,
      ai_suggested_name: meta?.title ?? null,
      ai_category: meta?.category ?? null,
      ai_labels: meta?.labels ?? null,
      extraction_summary: meta?.summary ?? null,
      processing_error: result.data.outcome === 'failed' ? 'Glenn could not read this file confidently.' : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', file_id)

  return NextResponse.json({
    file_id,
    status,
    proposed_count: result.data.proposed_count,
    assistant_message: result.data.assistant_message,
    ai_run_id: result.data.ai_run_id,
  })
}
