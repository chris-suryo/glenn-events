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
  status: 'planning' | 'active' | 'completed' | 'archived'
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
  status: 'pending_review' | 'completed' | 'failed'
  input_text: string | null
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
  status: 'todo' | 'in_progress' | 'done' | 'blocked'
  owner_name: string | null
  archive_reason?: string | null
}

export interface VendorPayload {
  name: string
  category: string | null
  contact_name: string | null
  email: string | null
  phone: string | null
  status: 'prospect' | 'contacted' | 'confirmed' | 'declined'
  estimated_cost: number | null
  notes: string | null
  archive_reason?: string | null
}

export interface BudgetItemPayload {
  category: string
  description: string
  estimated_cost: number | null
  actual_cost: number | null
  status: 'estimated' | 'committed' | 'paid'
  vendor_name: string | null
  archive_reason?: string | null
}

export interface TimelineItemPayload {
  title: string
  description: string | null
  starts_at: string | null
  ends_at: string | null
  type: 'milestone' | 'task' | 'deadline' | 'planning'
  archive_reason?: string | null
}

export interface DecisionPayload {
  title: string
  description: string | null
  status: 'pending' | 'decided'
  decision: string | null
}

export interface RiskPayload {
  title: string
  description: string | null
  severity: 'low' | 'medium' | 'high'
  status: 'open' | 'monitoring' | 'resolved'
  mitigation: string | null
}

export interface OpenQuestionPayload {
  question: string
  status: 'open'
  owner_name: string | null
}

export type UpdatePayload =
  | TaskPayload
  | VendorPayload
  | BudgetItemPayload
  | TimelineItemPayload
  | DecisionPayload
  | RiskPayload
  | OpenQuestionPayload

export interface AiRunReviewOutput {
  understood_summary?: string[]
  recommended_summary?: string[]
  deduped_count?: number
  tasks?: TaskPayload[]
  vendors?: VendorPayload[]
  budget_items?: BudgetItemPayload[]
  timeline_items?: TimelineItemPayload[]
  decisions?: DecisionPayload[]
  risks?: RiskPayload[]
  open_questions?: OpenQuestionPayload[]
}

export interface ProposedUpdate {
  id: string
  event_id: string
  ai_run_id: string
  source_message_id: string | null
  update_type: UpdateType
  payload_json: UpdatePayload
  confidence: number | null
  status: 'pending' | 'approved' | 'rejected' | 'applied' | 'failed'
  operation: 'insert' | 'update' | 'archive'
  target_record_type: UpdateType | null
  target_record_id: string | null
  target_snapshot_json: Json | null
  supersedes_proposed_update_id: string | null
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
  status: 'todo' | 'in_progress' | 'done' | 'blocked'
  priority: 'low' | 'medium' | 'high'
  proposed_update_id: string | null
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
  status: 'prospect' | 'contacted' | 'confirmed' | 'declined'
  estimated_cost: number | null
  notes: string | null
  archived_at: string | null
  archived_reason: string | null
  proposed_update_id: string | null
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
  status: 'estimated' | 'committed' | 'paid'
  vendor_id: string | null
  archived_at: string | null
  archived_reason: string | null
  proposed_update_id: string | null
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
  type: 'milestone' | 'task' | 'deadline' | 'planning'
  archived_at: string | null
  archived_reason: string | null
  proposed_update_id: string | null
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
  status: 'pending' | 'decided'
  decision: string | null
  owner_user_id: string | null
  decided_at: string | null
  proposed_update_id: string | null
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
  status: 'open' | 'monitoring' | 'resolved'
  mitigation: string | null
  proposed_update_id: string | null
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
  answer: string | null
  owner_user_id: string | null
  status: 'open' | 'answered'
  proposed_update_id: string | null
  source_message_id: string | null
  ai_run_id: string | null
  ai_generated: boolean
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

// ─── Event State Context (injected into LLM prompt and app-side dedupe) ──────

export interface EventStateContext {
  event: {
    name: string
    event_type: string | null
    event_date: string | null
    location: string | null
    description: string | null
    attendee_target: number | null
    budget_target: number | null
  }
  existing_tasks: Array<{
    id: string
    title: string
    status: 'todo' | 'in_progress'
    priority: 'low' | 'medium' | 'high'
    description: string | null
    due_date: string | null
  }>
  existing_vendors: Array<{
    id: string
    name: string
    category: string | null
    status: 'prospect' | 'contacted' | 'confirmed' | 'declined'
    estimated_cost: number | null
    contact_name: string | null
    email: string | null
    phone: string | null
    notes: string | null
  }>
  existing_budget_items: Array<{
    id: string
    category: string
    description: string
    estimated_cost: number | null
    actual_cost: number | null
    status: 'estimated' | 'committed' | 'paid'
    vendor_id: string | null
  }>
  existing_timeline_items: Array<{
    id: string
    title: string
    description: string | null
    starts_at: string | null
    ends_at: string | null
    type: 'milestone' | 'task' | 'deadline' | 'planning'
  }>
  existing_risks: Array<{
    title: string
    severity: 'low' | 'medium' | 'high'
    description: string | null
    mitigation: string | null
  }>
  existing_open_questions: Array<{
    question: string
  }>
  pending_proposed_updates: Array<{
    update_type: UpdateType
    label: string
  }>
  recent_ai_run_summaries: Array<{
    understood_summary: string[]
    recommended_summary: string[]
  }>
}
