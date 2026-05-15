# Glenn Events — Product Soul & Build Philosophy

## 1. What Glenn Events Is

Glenn Events is an agentic event operations workspace for small event teams.

It helps teams coordinate complex, recurring business, community, nonprofit, and corporate-style events by turning messy planning information into a clean, structured, trusted event plan.

The core idea:

> People should be able to tell Glenn what changed, from wherever the information came from, and Glenn should help organize that information into the event’s plan of record.

Glenn is not just a chatbot and not just a dashboard.

Glenn is an AI event operations coordinator that helps a small team keep track of tasks, vendors, timelines, budgets, decisions, risks, and open questions.

## 2. The Product Promise

Small event teams currently plan across scattered tools:

- email threads
- group chats
- Slack messages
- Google Docs
- spreadsheets
- PDFs
- vendor quotes
- contracts
- meeting notes
- screenshots
- verbal updates
- last-minute texts

Glenn Events gives them one place to collect the chaos and turn it into an organized plan.

The MVP promise:

> Paste or enter messy planning notes. Glenn extracts proposed updates. The user reviews them. Approved updates become tasks, vendor records, budget items, timeline entries, decisions, risks, and open questions.

The long-term promise:

> Glenn can be reached through web chat, email, SMS, voice notes, and eventually phone calls. It continuously helps the event team keep the plan accurate, current, and actionable.

## 3. What Glenn Events Is Not

Glenn Events is not:

- a generic project management app
- an RSVP platform
- a ticketing platform
- a wedding-planning checklist app
- a seating-chart tool
- a vendor marketplace
- a CRM replacement
- an invoicing/payment platform
- a static dashboard product
- a simple AI plan generator

Do not build features just because event platforms usually have them.

The MVP should not include:

- ticket sales
- RSVP pages
- seating charts
- floor plans
- payment processing
- vendor marketplace
- guest-facing event websites
- complex CRM workflows
- voice/SMS/email integrations before the core event brain works

Those can come later only if they support the central product promise.

## 4. Target Customer

The initial customer is a small team planning recurring events.

Examples:

- small corporate event teams
- boutique event organizers
- coworking/community event managers
- nonprofit event coordinators
- startup/community event operators
- small business marketing teams
- teams planning client dinners, panels, offsites, launch events, fundraisers, meetups, and networking events

The ideal customer says:

> “We run events all the time, but every event still becomes a mess of emails, spreadsheets, Slack messages, and last-minute follow-ups.”

The first customer is not a casual birthday party host and not a giant enterprise conference team.

## 5. The Core Workflow

Everything in the product should support this loop:

1. A user creates or opens an event workspace.
2. The team adds messy planning information.
3. Glenn interprets the information.
4. Glenn creates proposed structured updates.
5. The user reviews the proposed updates.
6. The user approves or rejects each update.
7. Approved updates are written into the event plan.
8. The command center reflects the current state of the event.
9. Glenn can summarize what changed, what is blocked, and what needs attention.

This is the core product loop.

Do not lose it.

If a new feature does not strengthen this loop, it is probably not MVP-critical.

## 6. The Most Important Product Principle

Glenn should propose changes before applying them.

For MVP, Glenn must not silently mutate the event plan.

The approval queue is central to trust.

Bad behavior:

> User enters notes → AI silently changes tasks, budget, timeline, and vendor records.

Good behavior:

> User enters notes → Glenn says “I found 6 proposed updates” → user reviews → user approves → records are created with source traceability.

Every AI-created object should preserve traceability:

- source_message_id
- ai_run_id
- proposed_update_id
- ai_generated = true

Users should be able to understand where a task, risk, vendor update, budget item, or decision came from.

## 7. The Event Plan of Record

Glenn Events is built around a structured event plan.

The core objects are:

### Event

The overall event workspace.

Includes:

- name
- date
- location
- type
- description
- attendee target
- budget target
- status
- organization
- members

### Messages

The planning conversation and messy input history.

Messages may come from:

- web chat
- pasted notes
- future email ingestion
- future SMS
- future voice notes
- future call transcripts

### AI Runs

Each time Glenn processes messy information, create an AI run.

An AI run records:

- input text
- source message
- output JSON
- status
- creator
- timestamp

### Proposed Updates

Structured suggestions produced by Glenn.

Possible update types:

- task
- vendor
- budget_item
- timeline_item
- decision
- risk
- open_question

Statuses:

- pending
- approved
- rejected
- applied
- failed

### Tasks

Action items needed to move the event forward.

### Vendors

Venue, catering, AV, photography, staffing, rentals, entertainment, transportation, and other external parties.

### Budget Items

Estimated, committed, actual, paid/unpaid, and category-based costs.

### Timeline Items

Planning deadlines and day-of schedule items.

### Decisions

Pending and completed decisions.

Examples:

- venue selected
- catering option chosen
- sponsorship package approved
- event format finalized

### Risks

Things that could hurt execution.

Examples:

- AV package not confirmed
- budget trending over target
- final headcount deadline approaching
- vendor contract not signed
- weather risk for outdoor event

### Open Questions

Questions that need an answer before the plan is complete.

### Activity Log

A record of what happened in the workspace.

Examples:

- Glenn proposed updates
- user approved update
- task created
- risk closed
- vendor added
- budget item updated

## 8. The Command Center

The command center is the heart of the app.

It should not feel like a generic analytics dashboard.

It should feel like an event operations cockpit.

The command center should prioritize:

- current event brief
- “Tell Glenn what changed…” input
- proposed updates waiting for review
- urgent tasks
- unresolved decisions
- upcoming deadlines
- budget snapshot
- vendor blockers
- open risks
- recent activity

The most important UI action is:

> Tell Glenn what changed.

The second most important UI action is:

> Review proposed updates.

The command center should make the user feel like Glenn is actively helping keep the event organized.

## 9. Product Voice

Glenn should feel:

- calm
- organized
- operational
- trustworthy
- concise
- proactive
- practical
- helpful under pressure

Glenn should not feel:

- gimmicky
- overly chatty
- like generic AI marketing
- like a wedding chatbot
- like a dashboard template
- like a toy

Example copy:

- “Tell Glenn what changed…”
- “Glenn found 6 proposed updates.”
- “Review before applying.”
- “Current event brief.”
- “Open risks.”
- “Vendor blockers.”
- “Upcoming deadlines.”
- “What changed since the last update?”
- “This may affect the budget.”
- “This looks like a deadline.”
- “This should probably be assigned to someone.”

## 10. Design Philosophy

The design should be clean, simple, and premium.

Avoid:

- cluttered dashboards
- excessive cards
- fake AI gradients everywhere
- overdone animations
- too many charts
- consumer party-app aesthetics
- generic SaaS bloat

Prefer:

- neutral backgrounds
- compact information hierarchy
- clear operational sections
- calm accent color
- readable tables
- concise cards
- obvious review actions
- strong empty states
- practical workflows

The app should feel like a serious tool that a professional event operator would trust.

## 11. AI Behavior

For MVP, Glenn’s AI can be mocked/deterministic.

Eventually, Glenn should:

- extract tasks from messy text
- detect dates and deadlines
- identify vendor updates
- identify budget changes
- identify risks
- identify decisions
- identify open questions
- draft follow-up emails
- summarize the current event state
- explain what changed
- ask clarifying questions when information is incomplete
- suggest proactive next steps

Glenn should not hallucinate facts.

If uncertain, Glenn should create an open question instead of inventing a record.

Preferred behavior:

> “This sounds like a catering update, but I am missing whether the quote includes staffing. I created an open question.”

Bad behavior:

> “Catering staffing included” when the note did not say that.

## 12. Future Agentic Direction

The long-term product should become multi-channel.

Future input channels:

- web chat
- forwarded email
- event-specific email address
- SMS
- WhatsApp
- voice notes
- phone call summaries
- uploaded files
- meeting transcripts
- Slack/Teams integrations
- calendar integrations

Future output channels:

- stakeholder summaries
- vendor follow-up drafts
- reminders
- risk alerts
- budget variance alerts
- day-of briefs
- planning recaps
- deadline nudges

Long-term vision:

> Glenn should operate like a reachable event ops teammate. The team can text it, email it, call it, or talk to it in the app, and Glenn keeps the event plan organized.

But this long-term vision should not distract from the MVP.

The MVP must first prove that Glenn can turn messy input into structured, trusted, approved updates.

## 13. Technical Principles

Use the existing stack unless there is a strong reason to change it:

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase Auth
- Supabase Postgres
- Supabase Realtime where useful
- Supabase Storage later
- Netlify deployment
- Zod validation

Technical rules:

- Prefer Server Components by default.
- Use Client Components only for interactive UI.
- Keep server/client boundaries clean.
- Use Zod for API input validation.
- Keep database schema aligned with app types.
- Use RLS on all app tables.
- Do not expose service role keys in app routes.
- Use service role only in dev scripts or carefully controlled backend-only operations.
- Preserve source traceability for AI-generated records.
- Avoid unnecessary dependencies.
- Avoid overengineering.

## 14. Security and Trust

Event data can be sensitive.

It may include:

- budgets
- client names
- vendor quotes
- internal planning notes
- event logistics
- contracts
- contact information
- attendee details in the future

Security principles:

- Enable RLS on all app tables.
- Users should only access organizations and events where they are members.
- Event child records should only be accessible to event members.
- Avoid public read/write policies.
- Keep service role out of normal app routes.
- Treat file uploads and email ingestion as sensitive features when added later.
- Preserve activity history and source records.

Trust is central to the product.

The user must feel that Glenn helps organize the plan without secretly changing important information.

## 15. MVP Phases

### Phase 1: App Shell

Goal:

- routes
- layout
- branding
- command center UI
- placeholder pages
- basic Supabase helpers
- app can build and run

### Phase 2: Database Foundation

Goal:

- schema
- RLS
- profiles
- organizations
- events
- memberships
- event child tables
- seed demo event
- API stubs

### Phase 3: Real Data Runtime

Goal:

- dashboard reads real events
- create event works
- command center reads real seeded event
- tasks/vendors/budget/timeline/decisions/risks tabs read real data
- seed user can log in and see Q3 demo event

### Phase 4: Mock AI Extraction

Goal:

- “Tell Glenn what changed…” creates a message
- creates an ai_run
- creates proposed_updates
- proposed updates appear in the review queue
- no bare 404s
- deterministic extraction is believable

### Phase 5: Approval Flow

Goal:

- approve individual update
- reject individual update
- approve all
- reject all
- approved updates insert destination records
- rejected updates remain traceable
- activity_log records actions

### Phase 6: Demo Polish

Goal:

- clean event command center
- current event brief
- “what changed” summary
- better empty states
- compelling demo flow
- stable build

Do not skip ahead to real AI, email, SMS, or voice before the core workflow works.

## 16. Demo Scenario

The main demo event is:

> Q3 Client Networking Dinner

Context:

- 85 attendee target
- $18,000 budget
- Boston / Cambridge
- late September
- vendors: venue, catering, AV, photography
- known issue: AV package not confirmed
- known deadline: final headcount due 10 days before event
- known risk: catering may exceed estimate

Example messy input:

> The venue confirmed they need the final headcount 10 days before the dinner. Catering came back at $4,200 before staffing and gratuity, so we need to confirm the all-in number. Sarah is checking AV because the package is still unclear. Photography is tentatively held but needs a deposit by Friday.

Glenn should propose:

- task: confirm all-in catering cost
- task: Sarah to confirm AV package
- task: pay photography deposit by Friday
- timeline item: final headcount due 10 days before event
- budget item: catering estimate $4,200 before staffing/gratuity
- vendor update: photography tentatively held
- risk: catering may exceed estimate
- open question: does catering quote include staffing and gratuity?

This is the core magic moment.

## 17. How to Judge New Features

Before adding any feature, ask:

1. Does this help capture messy event information?
2. Does this help Glenn structure that information?
3. Does this improve the plan of record?
4. Does this increase trust in AI-generated updates?
5. Does this reduce coordination overhead for a small event team?
6. Does this support the command center experience?
7. Is this needed for the MVP demo?

If the answer is no, defer it.

## 18. The North Star

The north star is not “more event features.”

The north star is:

> Glenn keeps the event plan accurate as real-world chaos happens.

Everything should serve that.

## 19. One-Sentence Product Definition

Glenn Events is an agentic event operations coordinator that turns scattered planning conversations, notes, emails, and documents into an organized, reviewable event plan.

## 20. One-Sentence MVP Definition

The MVP lets a small event team enter messy planning updates, review Glenn’s proposed structured changes, and apply those changes to a live event command center.

## 21. One-Sentence Differentiation

Glenn Events is differentiated by being an agentic, multi-channel event operations brain — not a static planning dashboard or one-time AI event plan generator.
