import { z } from 'zod'

const nullableTrimmed = z
  .string()
  .transform((value) => {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  })
  .nullable()

export const TaskEditSchema = z.object({
  title: z.string().trim().min(1),
  description: nullableTrimmed,
  due_date: nullableTrimmed,
  priority: z.enum(['low', 'medium', 'high']),
}).strict()

export const VendorEditSchema = z.object({
  name: z.string().trim().min(1),
  category: nullableTrimmed,
  contact_name: nullableTrimmed,
  email: nullableTrimmed,
  phone: nullableTrimmed,
  estimated_cost: z.number().nonnegative().nullable(),
  notes: nullableTrimmed,
}).strict()

export const BudgetItemEditSchema = z.object({
  category: z.string().trim().min(1),
  description: z.string().trim().min(1),
  estimated_cost: z.number().nonnegative().nullable(),
  actual_cost: z.number().nonnegative().nullable(),
}).strict()

export const TimelineItemEditSchema = z.object({
  title: z.string().trim().min(1),
  description: nullableTrimmed,
  starts_at: nullableTrimmed,
  ends_at: nullableTrimmed,
  type: z.enum(['milestone', 'task', 'deadline', 'planning']),
}).strict()

export const DecisionEditSchema = z.object({
  title: z.string().trim().min(1),
  description: nullableTrimmed,
  decision: nullableTrimmed,
}).strict()

export const RiskEditSchema = z.object({
  title: z.string().trim().min(1),
  description: nullableTrimmed,
  severity: z.enum(['low', 'medium', 'high']),
  mitigation: nullableTrimmed,
}).strict()

export const OpenQuestionEditSchema = z.object({
  question: z.string().trim().min(1),
}).strict()

export type EditableRecordType =
  | 'task'
  | 'vendor'
  | 'budget_item'
  | 'timeline_item'
  | 'decision'
  | 'risk'
  | 'open_question'

interface RecordEditConfig {
  table: string
  schema: z.ZodTypeAny
  labelField: string
}

export const RECORD_EDIT_CONFIG: Record<EditableRecordType, RecordEditConfig> = {
  task:          { table: 'tasks',          schema: TaskEditSchema,         labelField: 'title' },
  vendor:        { table: 'vendors',        schema: VendorEditSchema,       labelField: 'name' },
  budget_item:   { table: 'budget_items',   schema: BudgetItemEditSchema,   labelField: 'description' },
  timeline_item: { table: 'timeline_items', schema: TimelineItemEditSchema, labelField: 'title' },
  decision:      { table: 'decisions',      schema: DecisionEditSchema,     labelField: 'title' },
  risk:          { table: 'risks',          schema: RiskEditSchema,         labelField: 'title' },
  open_question: { table: 'open_questions', schema: OpenQuestionEditSchema, labelField: 'question' },
}

export function isEditableRecordType(value: string): value is EditableRecordType {
  return value in RECORD_EDIT_CONFIG
}
