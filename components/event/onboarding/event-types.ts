export interface EventTypeOption {
  /** Canonical value stored in `event_type` and used for preference matching. */
  value: string
  /** Singular label — shown on the per-event type step. */
  label: string
  /** Plural label — shown on the account "what kinds do you plan" step. */
  plural: string
}

// Quick-pick taxonomy for guided setup. `event_type` is a free-text column, so
// these are convenience shortcuts only — the "Other" path lets the user type
// anything. Shared by the account-preference step (plural labels), the per-event
// type step (singular labels), and preference-based ordering (keyed on `value`).
export const EVENT_TYPES: EventTypeOption[] = [
  { value: 'Conference',          label: 'Conference',          plural: 'Conferences' },
  { value: 'Client dinner',       label: 'Client dinner',       plural: 'Client dinners' },
  { value: 'Networking event',    label: 'Networking event',    plural: 'Networking events' },
  { value: 'Workshop / training', label: 'Workshop / training', plural: 'Workshops & training' },
  { value: 'Product launch',      label: 'Product launch',      plural: 'Product launches' },
  { value: 'Team offsite',        label: 'Team offsite',        plural: 'Team offsites' },
  { value: 'Fundraiser / gala',   label: 'Fundraiser / gala',   plural: 'Fundraisers & galas' },
  { value: 'Benefit / auction',   label: 'Benefit / auction',   plural: 'Benefits & auctions' },
  { value: 'Private celebration', label: 'Private celebration', plural: 'Private celebrations' },
  { value: 'Wedding',             label: 'Wedding',             plural: 'Weddings' },
]
