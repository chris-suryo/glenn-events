import { z } from 'zod'

export const ExtractUpdatesSchema = z.object({
  input_text: z.string().min(1, 'Input text is required').max(10000),
})

export type ExtractUpdatesInput = z.infer<typeof ExtractUpdatesSchema>
