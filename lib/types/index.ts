export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

// ─── Database row types ───────────────────────────────────────────────────────

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  created_at: string
}

export interface Organization {
  id: string
  name: string
  created_by: string
  created_at: string
}

export interface OrganizationMember {
  id: string
  organization_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  created_at: string
}

export interface Event {
  id: string
  organization_id: string
  name: string
  description: string | null
  event_type: string | null
  event_date: string | null
  location: string | null
  attendee_target: number | null
  budget_target: number | null
  status: 'draft' | 'active' | 'completed' | 'cancelled'
  created_by: string
  created_at: string
  updated_at: string
}

export interface EventMember {
  id: string
  event_id: string
  user_id: string
  role: 'owner' | 'editor' | 'viewer'
  created_at: string
}

export interface Message {
  id: string
  event_id: string
  user_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
}

export interface AiRun {
  id: string
  event_id: string
  source_message_id: string | null
  status: 'pending' | 'completed' | 'failed'
  input_text: string
  output_json: Json | null
  created_by: string
  created_at: string
}

// ─── Proposed Update payload shapes ──────────────────────────────────────────

export type UpdateType =
  | 'task'
  | 'vendor'
  | 'budget_item'
  | 'timeline_item'
  | 'decision'
  | 'risk'
  | 'open_question'

export interface TaskPayload {
  title: string
  description: string | null
  due_date: string | null
  priority: 'low' | 'medium' | 'high'
  status: 'open'
}

export interface VendorPayload {
  name: string
  category: string | null
  contact_name: string | null
  email: string | null
  phone: string | null
  status: 'prospecting' | 'contacted' | 'confirmed' | 'cancelled'
  estimated_cost: number | null
  notes: string | null
}

export interface BudgetItemPayload {
  category: string
  description: string
  estimated_cost: number | null
  actual_cost: number | null
  status: 'estimated' | 'confirmed' | 'paid'
}

export interface TimelineItemPayload {
  title: string
  description: string | null
  starts_at: string | null
  ends_at: string | null
  type: 'milestone' | 'task' | 'deadline'
}

export interface DecisionPayload {
  title: string
  description: string | null
  status: 'open' | 'decided'
  decision: string | null
}

export interface RiskPayload {
  title: string
  description: string | null
  severity: 'low' | 'medium' | 'high'
  status: 'open' | 'mitigated' | 'closed'
  mitigation: string | null
}

export interface OpenQuestionPayload {
  question: string
  status: 'open'
}

export type UpdatePayload =
  | TaskPayload
  | VendorPayload
  | BudgetItemPayload
  | TimelineItemPayload
  | DecisionPayload
  | RiskPayload
  | OpenQuestionPayload

export interface ProposedUpdate {
  id: string
  event_id: string
  ai_run_id: string
  source_message_id: string | null
  update_type: UpdateType
  payload_json: UpdatePayload
  confidence: number
  status: 'pending' | 'approved' | 'rejected'
  rationale: string | null
  created_at: string
  reviewed_by: string | null
  reviewed_at: string | null
}

// ─── Event plan table types ───────────────────────────────────────────────────

export interface Task {
  id: string
  event_id: string
  title: string
  description: string | null
  owner_user_id: string | null
  due_date: string | null
  status: 'open' | 'in_progress' | 'done'
  priority: 'low' | 'medium' | 'high'
  source_message_id: string | null
  ai_run_id: string | null
  ai_generated: boolean
  created_at: string
  updated_at: string
}

export interface Vendor {
  id: string
  event_id: string
  name: string
  category: string | null
  contact_name: string | null
  email: string | null
  phone: string | null
  status: 'prospecting' | 'contacted' | 'confirmed' | 'cancelled'
  estimated_cost: number | null
  notes: string | null
  source_message_id: string | null
  ai_run_id: string | null
  ai_generated: boolean
  created_at: string
  updated_at: string
}

export interface BudgetItem {
  id: string
  event_id: string
  category: string
  description: string
  estimated_cost: number | null
  actual_cost: number | null
  status: 'estimated' | 'confirmed' | 'paid'
  vendor_id: string | null
  source_message_id: string | null
  ai_run_id: string | null
  ai_generated: boolean
  created_at: string
  updated_at: string
}

export interface TimelineItem {
  id: string
  event_id: string
  title: string
  description: string | null
  starts_at: string | null
  ends_at: string | null
  owner_user_id: string | null
  type: 'milestone' | 'task' | 'deadline'
  source_message_id: string | null
  ai_run_id: string | null
  ai_generated: boolean
  created_at: string
  updated_at: string
}

export interface Decision {
  id: string
  event_id: string
  title: string
  description: string | null
  status: 'open' | 'decided'
  decision: string | null
  owner_user_id: string | null
  decided_at: string | null
  source_message_id: string | null
  ai_run_id: string | null
  ai_generated: boolean
  created_at: string
  updated_at: string
}

export interface Risk {
  id: string
  event_id: string
  title: string
  description: string | null
  severity: 'low' | 'medium' | 'high'
  status: 'open' | 'mitigated' | 'closed'
  mitigation: string | null
  source_message_id: string | null
  ai_run_id: string | null
  ai_generated: boolean
  created_at: string
  updated_at: string
}

export interface OpenQuestion {
  id: string
  event_id: string
  question: string
  owner_user_id: string | null
  status: 'open' | 'answered'
  source_message_id: string | null
  ai_run_id: string | null
  created_at: string
  updated_at: string
}

export interface ActivityLog {
  id: string
  event_id: string
  actor_user_id: string | null
  action: string
  entity_type: string
  entity_id: string | null
  metadata_json: Json | null
  created_at: string
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

export interface GroupedProposedUpdates {
  tasks: ProposedUpdate[]
  vendors: ProposedUpdate[]
  budget_items: ProposedUpdate[]
  timeline_items: ProposedUpdate[]
  decisions: ProposedUpdate[]
  risks: ProposedUpdate[]
  open_questions: ProposedUpdate[]
}
