import type { SupabaseClient } from '@supabase/supabase-js'
import type { FileStatus } from '@/lib/types'

// Shared client-side upload for the Event Library AND the Ask Glenn composer —
// one register/extract path, never a forked pipeline. The browser uploads bytes
// directly to Storage (RLS-enforced) then registers metadata; the API route runs
// extraction and returns the deterministic reply + status.

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  txt: 'text/plain',
  md: 'text/markdown',
}

export const ALLOWED_MIME = new Set(Object.values(EXT_MIME))
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
export const UPLOAD_ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.txt,.md,application/pdf,image/png,image/jpeg,text/plain,text/markdown'
const STORAGE_BUCKET = 'event-files'

export function resolveMime(file: File): string {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (file.type && ALLOWED_MIME.has(file.type)) return file.type
  return EXT_MIME[ext] ?? file.type ?? ''
}

export interface UploadResult {
  ok: boolean
  status?: FileStatus
  proposed_count?: number
  assistant_message?: string
  ai_run_id?: string
  error?: string
}

export async function uploadEventFile(
  file: File,
  eventId: string,
  supabase: SupabaseClient,
  onPhase?: (phase: 'uploading' | 'reading') => void,
): Promise<UploadResult> {
  const mime = resolveMime(file)
  if (!ALLOWED_MIME.has(mime)) return { ok: false, error: 'Unsupported file type' }
  if (file.size > MAX_FILE_SIZE_BYTES) return { ok: false, error: 'File is larger than 10 MB' }

  const fileId = crypto.randomUUID()
  const ext = file.name.split('.').pop()?.toLowerCase()
  const path = `${eventId}/${fileId}${ext ? `.${ext}` : ''}`

  onPhase?.('uploading')
  const { error: upErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { contentType: mime, upsert: false })
  if (upErr) return { ok: false, error: upErr.message }

  onPhase?.('reading')
  const res = await fetch(`/api/events/${eventId}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_id: fileId,
      filename: file.name,
      storage_path: path,
      mime_type: mime,
      size_bytes: file.size,
    }),
  })
  const data = (await res.json().catch(() => ({}))) as UploadResult & { error?: string }
  if (!res.ok) return { ok: false, error: data.error ?? 'Upload failed' }

  return {
    ok: true,
    status: data.status,
    proposed_count: data.proposed_count,
    assistant_message: data.assistant_message,
    ai_run_id: data.ai_run_id,
  }
}
