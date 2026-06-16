import { z } from 'zod'

// Event Library MVP file types. Kept small on purpose — PDFs and images are the
// vendor-quote/contract/screenshot core; text is an easy early win. Images are
// stored source-only in Branch 1 (no vision extraction yet).
export const ALLOWED_FILE_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/plain',
  'text/markdown',
] as const

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

export const ALLOWED_FILE_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'txt', 'md'] as const

export const RegisterFileSchema = z.object({
  file_id: z.string().uuid(),
  filename: z.string().min(1).max(255),
  display_name: z.string().max(255).optional(),
  storage_path: z.string().min(1).max(512),
  mime_type: z.enum(ALLOWED_FILE_MIME_TYPES),
  size_bytes: z.number().int().nonnegative().max(MAX_FILE_SIZE_BYTES),
})

export type RegisterFileInput = z.infer<typeof RegisterFileSchema>
