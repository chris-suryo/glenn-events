import React, { useState } from "react";
import {
  FileText,
  ArrowRight,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Send,
  Sparkles,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 * Glenn Events — Review panel · CONVERGED
 * Tinted-header group cards · colored outline icon actions (green ✓ /
 * rose ×), vertically centered per row · expand by clicking row content
 * (faint chevron hints on hover only). Warm-bone + ink-indigo theme.
 * ------------------------------------------------------------------ */

const t = {
  bg: "#FAF8F3", fg: "#29251F", card: "#FFFEFB",
  primary: "#3B37A6", primaryFg: "#FFFEFB", indigoWash: "#E3E1F5",
  border: "#E6E2DB", borderSoft: "#EEEAE3", muted: "#F0EDE7", mutedFg: "#7A746B",
  success: "#3E8F5E", successSurface: "#E6F4EA", successBorder: "#C7E6D2",
  warning: "#B0863C", warningSurface: "#F8EFD9",
  danger: "#C23B30", dangerSurface: "#F8E3E0", dangerBorder: "#F0C9C4",
};

const TYPE = {
  Task: { bg: "#F0F9FF", fg: "#0369A1", bd: "#BAE6FD" },
  Vendor: { bg: "#F5F3FF", fg: "#6D28D9", bd: "#DDD6FE" },
  Budget: { bg: "#ECFDF5", fg: "#047857", bd: "#A7F3D0" },
  Timeline: { bg: "#FFFBEB", fg: "#B45309", bd: "#FDE68A" },
  Decision: { bg: "#FEFCE8", fg: "#A16207", bd: "#FEF08A" },
  Risk: { bg: "#FFF1F2", fg: "#BE123C", bd: "#FECDD3" },
  Question: { bg: "#F8FAFC", fg: "#334155", bd: "#E2E8F0" },
  "Event detail": { bg: "#EEF2FF", fg: "#3B37A6", bd: "#C7C4EC" },
};

/* ----------------------------- data ------------------------------- */
const SOURCE_NOTE =
  "ok for ava and sam — we locked gold and white. florist is Petal & Stem, they quoted 2400 for ceremony + reception arrangements. still deciding on cake — Sweet Layers can do it for like 1100 but we're waiting on another baker. leaning DJ over a band. ceremony's at 4 and first toast is 7 sharp because grandma leaves by 730. oh and we need a shuttle for guests from the hotel.";

const EVENT_DETAILS = [
  { id: "ev-date", label: "Event date", before: "Not set", after: "Sun, Dec 14, 2026", why: "The note states the ceremony is on Dec 14 at 4:00 PM. No date was previously set on the plan." },
  { id: "ev-guests", label: "Guest count", before: "90", after: "110", why: "Updated headcount referenced when sizing florals and the hotel shuttle." },
];

const GROUPS = [
  { id: "petal", name: "Petal & Stem", rows: [
    { id: "p1", type: "Vendor", title: "Petal & Stem", detail: "Florals · confirmed · $2,000", fields: { Status: "Confirmed", Category: "Florals", Cost: "$2,000", Owner: "Ava" }, why: "Note names Petal & Stem as the florist with a quote for ceremony + reception arrangements." },
    { id: "p2", type: "Budget", title: "Ceremony and reception floral arrangements + arch install", detail: "$2,000", fields: { Category: "Florals", Cost: "$2,000", Status: "Quoted", Owner: "Petal & Stem" }, why: "Quoted line item tied to the Petal & Stem vendor." },
    { id: "p3", type: "Timeline", title: "Petal & Stem delivery and setup", detail: "Time TBD · Dec 14", fields: { Date: "Dec 14, 2026", Status: "Pending time", Owner: "Petal & Stem" }, why: "Delivery is implied by the floral order; exact setup time isn't stated yet." },
    { id: "p4", type: "Task", title: "Confirm florist delivery time", detail: "Owner: Ava", fields: { Status: "Todo", Priority: "Medium", Owner: "Ava" }, why: "Setup time is unstated; confirming it de-risks the ceremony timeline." },
  ]},
  { id: "cake", name: "Cake", rows: [
    { id: "c1", type: "Task", title: "Get second cake quote", detail: "Compare vs. Sweet Layers ~$1,100", fields: { Status: "Todo", Priority: "Medium", Owner: "Sam" }, why: "Note mentions waiting on a second baker before deciding on cake." },
  ]},
  { id: "ent", name: "Entertainment", rows: [
    { id: "e1", type: "Task", title: "Research and quote DJ or band", detail: "Leaning DJ", fields: { Status: "Todo", Priority: "Medium", Owner: "Sam" }, why: "Note leans DJ over a live band but nothing is booked yet." },
  ]},
  { id: "shuttle", name: "Shuttle", rows: [
    { id: "s1", type: "Task", title: "Book and confirm shuttle for hotel guests", detail: "Hotel pickup", fields: { Status: "Todo", Priority: "High", Owner: "Ava" }, why: "Note requests a guest shuttle from the hotel; pickup details are open." },
  ]},
  { id: "general", name: "General", rows: [
    { id: "g1", type: "Timeline", title: "Ceremony start — 4:00 PM", detail: "Dec 14", fields: { Date: "Dec 14, 2026", Time: "4:00 PM", Status: "Confirmed" }, why: "Note states the ceremony is at 4." },
    { id: "g2", type: "Timeline", title: "First toast — 7:00 PM", detail: "Dec 14", fields: { Date: "Dec 14, 2026", Time: "7:00 PM", Status: "Confirmed" }, why: "First toast is at 7 sharp because grandma leaves by 7:30." },
    { id: "g3", type: "Risk", title: "December weather and lighting impact", detail: "High risk", fields: { Severity: "High", Category: "Weather", Status: "Open" }, why: "A mid-December evening event raises weather and low-light concerns worth flagging." },
  ]},
];

const NEEDS_ANSWER = [
  { id: "n1", type: "Decision", title: "Cake provider · pending", detail: "Sweet Layers ~$1,100 vs. second baker pending; leaning Sweet Layers", placeholder: "e.g. Go with Sweet Layers" },
  { id: "n2", type: "Decision", title: "DJ vs. Band · pending", detail: "Leaning toward DJ over live band", placeholder: "e.g. Book a DJ" },
  { id: "n3", type: "Question", title: "What hotel will guests be shuttled from, and one-way or round trip?", detail: "Needed to scope the shuttle booking", placeholder: "e.g. Marriott downtown, round trip" },
  { id: "n4", type: "Timeline", title: "Petal & Stem delivery and setup", detail: "Florist confirmed but delivery/setup time not stated", placeholder: "e.g. Setup by 1:00 PM" },
];

const READY_COUNT = GROUPS.reduce((n, g) => n + g.rows.length, 0);

/* ----------------------------- styles ----------------------------- */
const CSS = `
.gln-row { transition: background .12s ease; }
.gln-row:hover { background: rgba(240,237,231,0.5); }
.gln-hint { opacity: 0; transition: opacity .12s ease; color: ${t.mutedFg}; }
.gln-row:hover .gln-hint { opacity: .5; }
.gln-row.open .gln-hint { opacity: .5; }

/* colored outline icon buttons — semantic at rest, tinted fill on hover */
.gln-ico { width:30px;height:30px;border-radius:8px;border:1px solid ${t.border};
  background:${t.card};display:flex;align-items:center;justify-content:center;
  cursor:pointer;transition:.12s ease; }
.gln-ico.approve { color:${t.success}; }
.gln-ico.approve:hover { background:${t.successSurface};border-color:${t.successBorder}; }
.gln-ico.dismiss { color:${t.danger}; }
.gln-ico.dismiss:hover { background:${t.dangerSurface};border-color:${t.dangerBorder}; }
`;

/* --------------------------- primitives --------------------------- */
function TypeBadge({ type }) {
  const c = TYPE[type] || TYPE.Question;
  return (
    <span className="inline-flex items-center font-medium rounded-full whitespace-nowrap"
      style={{ background: c.bg, color: c.fg, border: `1px solid ${c.bd}`, padding: "1px 7px", fontSize: 11, letterSpacing: 0.1 }}>
      {type}
    </span>
  );
}

function CountChip({ children, tone = "neutral" }) {
  const map = {
    neutral: { bg: t.muted, fg: t.mutedFg, bd: t.border },
    ready: { bg: t.successSurface, fg: t.success, bd: t.successBorder },
    question: { bg: t.warningSurface, fg: t.warning, bd: "#ECDCB4" },
    indigo: { bg: t.indigoWash, fg: t.primary, bd: "#C7C4EC" },
  };
  const c = map[tone];
  return (
    <span className="inline-flex items-center gap-1 rounded-full font-medium"
      style={{ background: c.bg, color: c.fg, border: `1px solid ${c.bd}`, padding: "2px 10px", fontSize: 12 }}>
      {children}
    </span>
  );
}

function ApplyButton({ onClick, count }) {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      className="inline-flex items-center gap-1.5 font-semibold rounded-lg transition-colors"
      style={{ color: t.primary, fontSize: 13, padding: "5px 11px", cursor: "pointer", background: h ? "#D5D2F0" : t.indigoWash }}>
      <Check size={14} /> Apply {count}
    </button>
  );
}

function AppliedTag() {
  return <span className="inline-flex items-center gap-1 font-medium" style={{ color: t.success, fontSize: 13 }}><Check size={14} /> Applied</span>;
}

function RowActions({ done, onApprove, onDismiss }) {
  if (done) {
    return <span className="inline-flex items-center gap-1 font-medium whitespace-nowrap" style={{ color: t.success, fontSize: 13 }}><Check size={15} /> Approved</span>;
  }
  return (
    <div className="flex items-center gap-1.5">
      <button className="gln-ico approve" onClick={onApprove} title="Approve"><Check size={16} /></button>
      <button className="gln-ico dismiss" onClick={onDismiss} title="Dismiss"><X size={16} /></button>
    </div>
  );
}

function RowDetails({ row }) {
  return (
    <div className="pt-1" style={{ fontSize: 13 }}>
      <div className="grid gap-x-4 gap-y-1.5" style={{ gridTemplateColumns: "auto 1fr", maxWidth: 360 }}>
        {Object.entries(row.fields).map(([k, v]) => (
          <React.Fragment key={k}>
            <span style={{ color: t.mutedFg }}>{k}</span>
            <span style={{ color: t.fg, fontVariantNumeric: "tabular-nums" }} className="font-medium">{v}</span>
          </React.Fragment>
        ))}
      </div>
      <div className="mt-3 flex gap-2 items-start rounded-lg" style={{ background: t.bg, border: `1px solid ${t.borderSoft}`, padding: "8px 10px" }}>
        <Sparkles size={13} style={{ color: t.primary, marginTop: 2 }} className="shrink-0" />
        <div>
          <div style={{ color: t.mutedFg, fontSize: 11, fontWeight: 600, letterSpacing: 0.3 }}>WHY GLENN SUGGESTED THIS</div>
          <div style={{ color: t.fg, fontSize: 12.5, lineHeight: 1.5, marginTop: 2 }}>{row.why}</div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- state ------------------------------ */
function useReviewState() {
  const [expanded, setExpanded] = useState({});
  const [applied, setApplied] = useState({});
  const [dismissed, setDismissed] = useState({});
  const [answers, setAnswers] = useState({});
  const [sent, setSent] = useState({});
  return {
    expanded, applied, dismissed, answers, sent,
    toggle: (id) => setExpanded((s) => ({ ...s, [id]: !s[id] })),
    apply: (id) => setApplied((s) => ({ ...s, [id]: true })),
    applyMany: (ids) => setApplied((s) => ({ ...s, ...Object.fromEntries(ids.map((i) => [i, true])) })),
    dismiss: (id) => setDismissed((s) => ({ ...s, [id]: true })),
    setAnswer: (id, v) => setAnswers((s) => ({ ...s, [id]: v })),
    send: (id) => setSent((s) => ({ ...s, [id]: true })),
  };
}

/* --------------------------- constants ---------------------------- */
function Header() {
  return (
    <div className="px-5 pt-5 pb-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center gap-1.5 rounded-full font-medium" style={{ background: t.card, color: t.mutedFg, border: `1px solid ${t.border}`, padding: "3px 10px", fontSize: 12 }}>
          <FileText size={13} /> Typed note
        </span>
        <span className="inline-flex items-center rounded-full font-semibold" style={{ background: t.primary, color: t.primaryFg, padding: "3px 10px", fontSize: 11, letterSpacing: 0.3 }}>Latest</span>
        <span style={{ color: t.mutedFg, fontSize: 12 }} className="ml-auto">1m ago</span>
      </div>
      <p style={{ color: t.fg, fontSize: 14, lineHeight: 1.55 }} className="mb-3">{SOURCE_NOTE.slice(0, 220).trim() + "…"}</p>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <CountChip tone="indigo">2 event details</CountChip>
        <CountChip tone="ready">{READY_COUNT} ready</CountChip>
        <CountChip tone="question">{NEEDS_ANSWER.length} questions</CountChip>
      </div>
      <div className="flex items-center gap-2" style={{ fontSize: 12.5, color: t.mutedFg }}>
        <span>Glenn did the reading. The source stays attached.</span>
        <button className="inline-flex items-center gap-1 font-medium" style={{ color: t.primary, background: "transparent", cursor: "pointer" }}>View source <ChevronRight size={13} /></button>
      </div>
    </div>
  );
}

function EventDetailsBlock({ state }) {
  return (
    <div className="mx-5 mb-6 rounded-2xl overflow-hidden" style={{ background: t.indigoWash, border: `1px solid #C7C4EC` }}>
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-2">
        <div style={{ width: 6, height: 6, borderRadius: 99, background: t.primary }} />
        <span style={{ color: t.primary, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.5 }}>EVENT DETAILS · APPROVE ONE AT A TIME</span>
      </div>
      <div className="px-4 pb-3.5 flex flex-col gap-2.5">
        {EVENT_DETAILS.map((d) => {
          const done = state.applied[d.id];
          return (
            <div key={d.id} className="rounded-lg flex items-center gap-3 px-3.5 py-3" style={{ background: t.card, border: `1px solid #D4D1EC` }}>
              <TypeBadge type="Event detail" />
              <div className="min-w-0 flex-1">
                <div style={{ color: t.fg, fontSize: 13.5 }} className="font-semibold mb-0.5">{d.label}</div>
                <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 13 }}>
                  <span style={{ color: t.mutedFg, textDecoration: "line-through", fontVariantNumeric: "tabular-nums" }}>{d.before}</span>
                  <ArrowRight size={13} style={{ color: t.primary }} />
                  <span style={{ color: t.fg, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{d.after}</span>
                </div>
              </div>
              {done ? (
                <span className="inline-flex items-center gap-1 font-medium" style={{ color: t.success, fontSize: 13 }}><Check size={15} /> Approved</span>
              ) : (
                <button onClick={() => state.apply(d.id)} className="inline-flex items-center gap-1.5 rounded-lg font-semibold transition-opacity"
                  style={{ background: t.primary, color: t.primaryFg, fontSize: 13, padding: "7px 14px", cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")} onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}>
                  <Check size={14} /> Approve
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NeedsAnswerBlock({ state }) {
  return (
    <div className="px-5 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <div style={{ width: 6, height: 6, borderRadius: 99, background: t.warning }} />
        <span style={{ color: t.fg, fontSize: 13.5, fontWeight: 700 }}>Needs your answer</span>
        <span style={{ color: t.mutedFg, fontSize: 13 }}>{NEEDS_ANSWER.length}</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {NEEDS_ANSWER.map((q) => {
          const sent = state.sent[q.id];
          const val = state.answers[q.id] || "";
          return (
            <div key={q.id} className="rounded-xl px-3.5 py-3" style={{ background: t.card, border: `1px solid ${t.border}`, borderLeft: `3px solid ${t.warning}` }}>
              <div className="flex items-start gap-2.5">
                <TypeBadge type={q.type} />
                <div className="min-w-0 flex-1">
                  <div style={{ color: t.fg, fontSize: 13.5, lineHeight: 1.4 }} className="font-medium">{q.title}</div>
                  <div style={{ color: t.mutedFg, fontSize: 12.5, marginTop: 2, lineHeight: 1.45 }}>{q.detail}</div>
                </div>
              </div>
              {sent ? (
                <div className="flex items-center gap-1.5 mt-2.5" style={{ color: t.success, fontSize: 13 }}><Check size={14} /> Sent to Glenn — “{val}”</div>
              ) : (
                <div className="flex items-center gap-2 mt-2.5">
                  <input value={val} onChange={(e) => state.setAnswer(q.id, e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && val.trim()) state.send(q.id); }}
                    placeholder={q.placeholder} className="flex-1 rounded-lg outline-none"
                    style={{ background: t.bg, border: `1px solid ${t.border}`, color: t.fg, fontSize: 13, padding: "8px 11px" }} />
                  <button onClick={() => val.trim() && state.send(q.id)} className="inline-flex items-center justify-center rounded-lg shrink-0 transition-opacity"
                    style={{ background: val.trim() ? t.primary : t.muted, color: val.trim() ? t.primaryFg : t.mutedFg, width: 36, height: 36, cursor: val.trim() ? "pointer" : "default" }}>
                    <Send size={15} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DismissAll() {
  return (
    <div className="px-5 pb-6 pt-1">
      <button className="w-full rounded-lg font-medium transition-colors"
        style={{ color: t.mutedFg, fontSize: 13, padding: "9px", background: "transparent", border: `1px dashed ${t.border}`, cursor: "pointer" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = t.muted)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
        Dismiss all remaining
      </button>
    </div>
  );
}

/* ----------------- ready: tinted header + rows -------------------- */
function GroupCard({ group, state }) {
  const ids = group.rows.map((r) => r.id);
  const allDone = ids.every((id) => state.applied[id] || state.dismissed[id]);
  const visible = group.rows.filter((r) => !state.dismissed[r.id]);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: "0 1px 2px rgba(41,37,31,0.04)" }}>
      <div className="flex items-center justify-between px-4 pt-3 pb-2.5" style={{ background: t.muted, borderBottom: `1px solid ${t.border}` }}>
        <div className="flex items-baseline gap-2">
          <span style={{ color: t.fg, fontSize: 14, fontWeight: 700 }}>{group.name}</span>
          <span style={{ color: t.mutedFg, fontSize: 12.5 }}>{group.rows.length}</span>
        </div>
        {allDone ? <AppliedTag /> : <ApplyButton count={group.rows.length} onClick={() => state.applyMany(ids)} />}
      </div>

      <div>
        {visible.map((r) => {
          const done = state.applied[r.id];
          const open = state.expanded[r.id];
          return (
            <div key={r.id} className={`gln-row ${open ? "open" : ""}`} style={{ borderTop: `1px solid ${t.borderSoft}`, opacity: done ? 0.55 : 1 }}>
              {/* items-stretch so the action cluster can center vertically across a tall row */}
              <div className="flex items-stretch gap-2.5 px-4 py-2.5">
                <button onClick={() => state.toggle(r.id)} className="flex items-start gap-2.5 min-w-0 flex-1 text-left" style={{ background: "transparent", cursor: "pointer" }}>
                  <span className="shrink-0 mt-0.5"><TypeBadge type={r.type} /></span>
                  <span className="min-w-0 flex-1">
                    <span style={{ color: t.fg, fontSize: 13.5, lineHeight: 1.4, display: "block" }} className="font-medium">{r.title}</span>
                    {r.detail && <span style={{ color: t.mutedFg, fontSize: 12.5, marginTop: 1, display: "block", fontVariantNumeric: "tabular-nums" }}>{r.detail}</span>}
                  </span>
                  <span className="gln-hint shrink-0 mt-0.5">{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
                </button>
                {/* vertically centered actions */}
                <div className="flex items-center shrink-0">
                  <RowActions done={done} onApprove={() => state.apply(r.id)} onDismiss={() => state.dismiss(r.id)} />
                </div>
              </div>
              {open && <div className="px-4 pb-3"><RowDetails row={r} /></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------ shell ----------------------------- */
export default function GlennReviewPanel() {
  const state = useReviewState();
  return (
    <div style={{ background: t.bg, color: t.fg, fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', minHeight: "100vh" }}>
      <style>{CSS}</style>
      <div className="sticky top-0 z-10 flex items-center gap-2 px-5 py-3" style={{ background: "rgba(250,248,243,0.85)", backdropFilter: "blur(8px)", borderBottom: `1px solid ${t.border}` }}>
        <span className="inline-flex items-center justify-center rounded-lg font-bold" style={{ background: t.primary, color: t.primaryFg, width: 26, height: 26, fontSize: 14 }}>G</span>
        <span style={{ fontSize: 15, fontWeight: 700 }}>Review</span>
        <span className="inline-flex items-center justify-center rounded-full font-semibold" style={{ background: t.primary, color: t.primaryFg, minWidth: 22, height: 22, fontSize: 12, padding: "0 6px" }}>
          {READY_COUNT + NEEDS_ANSWER.length + EVENT_DETAILS.length}
        </span>
      </div>

      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <Header />
        <EventDetailsBlock state={state} />
        <div className="px-5 flex items-center gap-2 mb-3">
          <div style={{ width: 6, height: 6, borderRadius: 99, background: t.success }} />
          <span style={{ color: t.fg, fontSize: 13.5, fontWeight: 700 }}>Ready to apply</span>
          <span style={{ color: t.mutedFg, fontSize: 13 }}>{READY_COUNT}</span>
        </div>
        <div className="px-5 flex flex-col gap-3 mb-6">
          {GROUPS.map((g) => <GroupCard key={g.id} group={g} state={state} />)}
        </div>
        <NeedsAnswerBlock state={state} />
        <DismissAll />
      </div>
    </div>
  );
}
