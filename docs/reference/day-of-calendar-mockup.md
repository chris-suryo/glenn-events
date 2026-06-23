# Reference — Visual Day-of Calendar mockup

> **Status:** design reference only. Captured from an owner-supplied prototype
> (June 2026). **Not production code** — it uses inline styles and a bespoke
> hex palette, not the app's "Operations Desk" tokens or shadcn/`@base-ui`
> primitives. A real implementation must use the design system (see
> `app/globals.css`) and the existing components
> (`components/event/day-of-grid.tsx`, `timeline-calendar.tsx`,
> `record-detail-drawer.tsx`).

This is the visual direction the owner liked for the **Run of Show → Day of**
view: a Google-Calendar-style day column with colorful, overlapping timed
blocks on the left and a context panel on the right. It also includes a
**Lead-up month** view with Gantt-style bars for multi-day work windows, and a
reusable **detail drawer** (record + linked records + AI source/confidence +
Edit / Tell Glenn). See `docs/FUTURE_STATE_PRODUCT_PLAN.md` §6.5 for the
roadmap framing, open questions, and data-model prerequisites.

What to carry over (the parts the owner valued):

- **Colorful overlapping day grid** — each segment a colored block by type,
  positioned by time, overlaps shown side-by-side (AV check vs. cocktail
  arrival; exec remarks inside dinner service).
- **Hard-constraint line** — a red dashed line across the grid ("MD departs
  8:15") marking an external constraint the schedule must respect.
- **Right-side context panel** — "Hard constraint", "Overlaps to watch",
  "Source". (Owner is unsure what the panel's ideal contents are — open question.)
- **Lead-up month bars** — multi-day work windows (vendor work, open/not-started
  work, tasks) rendered as spanning bars, plus single-day deadline/submit-by chips.
- **Reusable detail drawer** — kind badge, time, location, description, linked
  records, AI source with confidence (or "flagged — needs your answer"), and
  Edit / Tell Glenn actions.

---

## Prototype source (owner-supplied, non-production)

```tsx
import { useState } from "react";
import {
  Home, AlignLeft, Folder, Calendar, MapPin, Users, DollarSign, MessageSquare,
  CalendarDays, CalendarClock, Bookmark, X, Pencil, ChevronRight, Clock
} from "lucide-react";

const T = {
  canvas:"#FAF8F3", card:"#FFFFFF", ink:"#1A1D24", inkSoft:"#4C515C", muted:"#8B909B",
  line:"#ECE9E1", lineSoft:"#F2EFE8",
  blue:"#2B4ED6", blueInk:"#1E3AAE", blueSoft:"#E9EEFC", blueBar:"#3D62E8",
  green:"#1F9D6B", greenSoft:"#E3F4EC", amber:"#B9791A", amberSoft:"#F8EFDD",
  red:"#CB3F3F", redSoft:"#FBE9E7", violet:"#5B53C9", violetSoft:"#ECEAFB",
  teal:"#2E8F94", tealSoft:"#E1F1F1",
};
const FONT = "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const num = { fontVariantNumeric:"tabular-nums" };

/* ---------- month (lead-up) data ---------- */
const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const dl = (t,c,detail) => ({ t, c, detail });
const WEEKS = [
  [{n:12,dim:1},{n:13,dim:1},{n:14},{n:15},{n:16},{n:17},{n:18}],
  [{n:19},{n:20},{n:21},{n:22},{n:23},{n:24,dl:dl("Confirm service","red",{
    kind:"Deadline", title:"Confirm plated vs. family-style service", time:"by 5:00 PM · Fri, Jul 24",
    desc:"Service style must be locked to inform menu planning and staffing.",
    related:[{t:"Decision · Plated vs. family-style", s:"pending"},{t:"Task · Confirm with Apex", s:"due Jul 23"}],
    conf:0.88 })},{n:25}],
  [{n:26},{n:27},{n:28},{n:29},{n:30,dl:dl("Final menu approval","red",{
    kind:"Deadline", title:"Final menu approval", time:"by EOD · Thu, Jul 30",
    desc:"Final menu approved and submitted to The Meridian Room.",
    related:[{t:"Vendor · The Meridian Room", s:"contacted"}], conf:0.91 })},{n:31},{n:1,nm:"Aug"}],
  [{n:2},{n:3},{n:4},{n:5},{n:6},{n:7},{n:8}],
  [{n:9},{n:10,dl:dl("Dietary → venue","amber",{
    kind:"Submit-by date", title:"Dietary restrictions to venue", time:"by EOD · Mon, Aug 10",
    desc:"All attendee dietary restrictions submitted to the venue.",
    related:[{t:"Task · Collect dietary restrictions", s:"due Aug 9"}], conf:0.86 })},{n:11},{n:12},{n:13},{n:14},{n:15}],
  [{n:16},{n:17},{n:18},{n:19},{n:20},{n:21},{n:22,event:1}],
];
const BARS = [
  {wk:0,lane:0,from:2,to:6,start:1,label:"Meridian Room contracting",kind:"teal",detail:{
    kind:"Vendor work", title:"Meridian Room contracting", time:"Jul 14 – Jul 26",
    desc:"Contract, deposit, and run-of-show alignment with the venue.",
    related:[{t:"Vendor · The Meridian Room", s:"contacted"}], conf:0.90 }},
  {wk:1,lane:0,from:0,to:6,kind:"teal"},
  {wk:2,lane:0,from:0,to:0,end:1,kind:"teal"},
  {wk:1,lane:1,from:1,to:6,start:1,label:"Confirm final headcount (40–45)",kind:"open",detail:{
    kind:"Open work", title:"Confirm final headcount", time:"Jul 20 – Aug 1",
    desc:"Working count is 42; final headcount drives seating, catering, and budget.",
    related:[{t:"Risk · Guest count still fluid", s:"open"},{t:"Question · Locked at 42?", s:"open"}], conf:null }},
  {wk:2,lane:1,from:0,to:6,end:1,kind:"open"},
  {wk:2,lane:2,from:2,to:6,start:1,label:"Collect dietary restrictions",kind:"blue",detail:{
    kind:"Task", title:"Collect dietary restrictions", time:"Jul 28 – Aug 9 · due Aug 9",
    desc:"Gather dietary needs from all attendees ahead of the venue submission deadline.",
    related:[{t:"Deadline · Dietary to venue", s:"Aug 10"}], conf:0.84 }},
  {wk:3,lane:2,from:0,to:6,kind:"blue"},
  {wk:4,lane:2,from:0,to:0,end:1,kind:"blue"},
  {wk:4,lane:1,from:3,to:6,start:1,label:"Send revised run of show",kind:"open",detail:{
    kind:"Open task", title:"Send revised run of show to Apex", time:"Aug 12 – Aug 18",
    desc:"Send Apex the updated run of show once the schedule is finalized.", related:[], conf:null }},
  {wk:5,lane:1,from:0,to:2,end:1,kind:"open"},
];
const NUM_BAND = 40, BAR_TOP = 44, LANE_H = 22, WEEK_H = 114;

function Bar({ b, onPick }) {
  const k = {
    teal:{ background:T.teal, color:"#fff" },
    blue:{ background:T.blueBar, color:"#fff" },
    open:{ background:"#fff", color:T.blueInk, border:`1.5px dashed ${T.blue}` },
  }[b.kind];
  const radius = `${b.start?8:2}px ${b.end?8:2}px ${b.end?8:2}px ${b.start?8:2}px`;
  return (
    <div onClick={b.detail ? ()=>onPick(b.detail) : undefined} style={{
      position:"absolute", left:`calc(${(b.from/7)*100}% + 3px)`, width:`calc(${((b.to-b.from+1)/7)*100}% - 6px)`,
      top:BAR_TOP + b.lane*LANE_H, height:18, borderRadius:radius, display:"flex", alignItems:"center",
      padding:"0 8px", fontSize:11, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
      boxShadow:"0 1px 2px rgba(0,0,0,.08)", cursor:b.detail?"pointer":"default", ...k,
    }}>{b.label || ""}</div>
  );
}

function MonthView({ onPick }) {
  return (
    <div>
      <div style={{ background:T.card, border:`1px solid ${T.line}`, borderRadius:14, overflow:"hidden", boxShadow:"0 1px 3px rgba(26,29,36,.05)" }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", borderBottom:`1px solid ${T.line}`, background:T.canvas }}>
          {WEEKDAYS.map(d=>(
            <div key={d} style={{ padding:"9px 12px", fontSize:10.5, fontWeight:700, letterSpacing:".06em",
              textTransform:"uppercase", color:T.muted, borderRight:`1px solid ${T.lineSoft}` }}>{d}</div>
          ))}
        </div>
        {WEEKS.map((week,wi)=>(
          <div key={wi} style={{ position:"relative", height:WEEK_H, borderBottom: wi<5?`1px solid ${T.line}`:"none" }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", height:"100%" }}>
              {week.map((d,ci)=>(
                <div key={ci} style={{ borderRight: ci<6?`1px solid ${T.lineSoft}`:"none", padding:"7px 9px",
                  background: d.event ? T.violetSoft : "transparent" }}>
                  <div style={{ display:"flex", alignItems:"baseline", gap:5, justifyContent:"flex-end" }}>
                    {d.nm && <span style={{ fontSize:10, fontWeight:700, color:T.muted, marginRight:"auto" }}>{d.nm}</span>}
                    <span style={{ fontSize:12.5, fontWeight:d.event?700:600, color:d.dim?"#c9c4ba":d.event?T.violet:T.inkSoft, ...num }}>{d.n}</span>
                  </div>
                  {d.dl && (
                    <div onClick={()=>onPick(d.dl.detail)} style={{ marginTop:5, fontSize:10, fontWeight:600,
                      padding:"3px 6px", borderRadius:6, lineHeight:1.25, cursor:"pointer",
                      color:d.dl.c==="red"?T.red:T.amber, background:d.dl.c==="red"?T.redSoft:T.amberSoft }}>
                      {d.dl.t}<div style={{ fontSize:9, fontWeight:600, opacity:.8 }}>5:00 PM</div>
                    </div>
                  )}
                  {d.event && (
                    <div onClick={()=>onPick({ kind:"Event day", title:"Apex Capital Client Dinner", time:"6:30 PM · Sat, Aug 22",
                      loc:"The Meridian Room · Boston", desc:"The client dinner. See the Day-of view for the full run of show.",
                      related:[{t:"7 day-of segments", s:"6:30 – 8:45 PM"}], conf:0.94 })}
                      style={{ marginTop:5, fontSize:10, fontWeight:700, color:T.violet, display:"flex", alignItems:"center", gap:4, cursor:"pointer" }}>
                      <span style={{ width:6,height:6,borderRadius:"50%",background:T.violet }} />Dinner · 6:30 PM
                    </div>
                  )}
                </div>
              ))}
            </div>
            {BARS.filter(b=>b.wk===wi).map((b,bi)=><Bar key={bi} b={b} onPick={onPick} />)}
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:16, marginTop:12, fontSize:11.5, color:T.inkSoft, flexWrap:"wrap", alignItems:"center" }}>
        <Legend sw={{background:T.blueBar}} label="Active work" />
        <Legend sw={{background:"#fff",border:`1.5px dashed ${T.blue}`}} label="Open / not started" />
        <Legend sw={{background:T.teal}} label="Vendor work" />
        <Legend pill="red" label="Hard deadline" />
        <Legend pill="amber" label="Submit-by date" />
        <span style={{ marginLeft:"auto", color:T.muted }}>Click any item for its full card, source, and linked records.</span>
      </div>
    </div>
  );
}
function Legend({ sw, pill, label }) {
  return (
    <span style={{ display:"flex", alignItems:"center", gap:6 }}>
      {sw && <i style={{ width:16, height:9, borderRadius:3, display:"inline-block", ...sw }} />}
      {pill && <i style={{ width:13, height:13, borderRadius:4, display:"inline-block",
        background:pill==="red"?T.redSoft:T.amberSoft, border:`1px solid ${pill==="red"?T.red:T.amber}` }} />}
      {label}
    </span>
  );
}

/* ---------- day-of data ---------- */
const HOURS = [["5 PM",0],["6 PM",75],["7 PM",150],["8 PM",225],["9 PM",300]];
const EVENTS = [
  { t:"AV / mic check", time:"6:15 – 6:45 PM", top:94, h:37, left:"62%", w:"36%", k:"av", detail:{
    kind:"Day-of · Task", title:"AV / mic check", time:"6:15 – 6:45 PM · Sat, Aug 22", loc:"The Meridian Room",
    desc:"Sound check for executive remarks before guests arrive. Runs into cocktail arrival.",
    related:[{t:"Risk · Remarks timing vs. MD departure", s:"high"}], conf:0.78 }},
  { t:"Cocktail arrival & reception", time:"6:30 – 7:30 PM", top:112, h:74, left:"0", w:"60%", k:"cocktail", detail:{
    kind:"Day-of · Milestone", title:"Cocktail arrival & reception", time:"6:30 – 7:30 PM · Sat, Aug 22", loc:"The Meridian Room",
    desc:"Guests begin arriving for cocktails in the private dining room.",
    related:[{t:"Vendor · The Meridian Room", s:"contacted"}], conf:0.94 }},
  { t:"Dinner service", time:"7:30 – 8:30 PM", top:188, h:74, left:"0", w:"98%", k:"dinner", detail:{
    kind:"Day-of · Milestone", title:"Dinner service", time:"7:30 – 8:30 PM · Sat, Aug 22", loc:"The Meridian Room",
    desc:"Plated or family-style dinner service begins. Service style still pending a decision.",
    related:[{t:"Decision · Plated vs. family-style", s:"pending"},{t:"Deadline · Confirm service style", s:"Jul 24"}], conf:0.94 }},
  { t:"Exec remarks", time:"7:55 – 8:10 PM", top:219, h:20, left:"60%", w:"38%", k:"remarks", detail:{
    kind:"Day-of · Milestone", title:"Executive remarks", time:"7:55 – 8:10 PM · Sat, Aug 22", loc:"The Meridian Room",
    desc:"Short executive remarks during dinner. Hard stop at 8:10 — managing director departs 8:15.",
    related:[{t:"Risk · Remarks timing vs. MD departure", s:"high"}], conf:0.81 }},
  { t:"Dessert service", time:"8:25 – 8:45 PM", top:256, h:25, left:"0", w:"98%", k:"dessert", detail:{
    kind:"Day-of · Milestone", title:"Dessert service", time:"8:25 – 8:45 PM · Sat, Aug 22", loc:"The Meridian Room",
    desc:"Dessert served after remarks conclude.", related:[], conf:0.90 }},
];
const EVK = {
  cocktail:{ background:T.blueSoft, borderLeft:`3px solid ${T.blue}`, color:T.blueInk },
  dinner:{ background:T.greenSoft, borderLeft:`3px solid ${T.green}`, color:"#15694a" },
  remarks:{ background:T.violetSoft, borderLeft:`3px solid ${T.violet}`, color:"#3f3897" },
  av:{ background:T.amberSoft, borderLeft:`3px solid ${T.amber}`, color:"#8a5a12" },
  dessert:{ background:T.tealSoft, borderLeft:`3px solid ${T.teal}`, color:"#1f6f73" },
};
function DayView({ onPick }) {
  return (
    <div style={{ display:"flex", gap:16 }}>
      <div style={{ flex:1, background:T.card, border:`1px solid ${T.line}`, borderRadius:14, padding:"14px 16px 16px", boxShadow:"0 1px 3px rgba(26,29,36,.05)" }}>
        <h3 style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>
          Day of · Saturday, Aug 22 <span style={{ fontSize:11.5, color:T.muted, fontWeight:500 }}>— The Meridian Room</span>
        </h3>
        <div style={{ display:"flex" }}>
          <div style={{ width:54, flex:"0 0 54px", position:"relative", height:320 }}>
            {HOURS.map(([lbl,top])=>(
              <div key={lbl} style={{ position:"absolute", left:0, top, fontSize:11, color:T.muted, transform:"translateY(-7px)" }}>{lbl}</div>
            ))}
          </div>
          <div style={{ flex:1, position:"relative", height:320, borderLeft:`1px solid ${T.line}` }}>
            {HOURS.map(([,top])=>(
              <div key={top} style={{ position:"absolute", left:0, right:0, top, borderTop:`1px solid ${T.lineSoft}` }} />
            ))}
            {EVENTS.map((e,i)=>(
              <div key={i} onClick={()=>onPick(e.detail)} style={{ position:"absolute", top:e.top, height:e.h, left:e.left, width:e.w,
                borderRadius:8, padding:"5px 9px", overflow:"hidden", boxShadow:"0 1px 3px rgba(0,0,0,.08)", cursor:"pointer", ...EVK[e.k] }}>
                <div style={{ display:"flex", alignItems:"baseline", gap:7, flexWrap:"wrap" }}>
                  <b style={{ fontWeight:600, fontSize:11.5, lineHeight:1.2 }}>{e.t}</b>
                  <small style={{ fontSize:10, opacity:.85, fontWeight:600, ...num }}>{e.time}</small>
                </div>
              </div>
            ))}
            <div style={{ position:"absolute", left:0, right:0, top:243, borderTop:`2px dashed ${T.red}`, zIndex:5 }}>
              <b style={{ position:"absolute", right:6, top:-9, background:T.red, color:"#fff", fontSize:9.5, fontWeight:700, padding:"1px 6px", borderRadius:5 }}>MD departs 8:15</b>
            </div>
          </div>
        </div>
      </div>
      <div style={{ width:230, flex:"0 0 230px", display:"flex", flexDirection:"column", gap:11 }}>
        <SideCard title="Hard constraint">
          <Row dot={T.red}>Managing director leaves at <b>8:15 PM</b> — exec remarks must end by 8:10. Glenn flagged this as a risk.</Row>
        </SideCard>
        <SideCard title="Overlaps to watch">
          <Row dot={T.amber}>AV check runs into cocktail arrival — confirm sound is set before guests are in the room.</Row>
          <Row dot={T.violet}>Remarks sit inside dinner service — brief the kitchen to pause plating.</Row>
        </SideCard>
        <SideCard title="Source">
          <span style={{ display:"inline-flex", alignItems:"center", gap:5, fontSize:11.5, fontWeight:600, color:T.blue, cursor:"pointer" }}><Bookmark size={12} />Built from your typed note · 7 segments</span>
        </SideCard>
      </div>
    </div>
  );
}
function SideCard({ title, children }) {
  return (
    <div style={{ background:T.card, border:`1px solid ${T.line}`, borderRadius:12, padding:13, boxShadow:"0 1px 3px rgba(26,29,36,.05)" }}>
      <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase", color:T.muted, marginBottom:9 }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ dot, children }) {
  return (
    <div style={{ display:"flex", gap:8, fontSize:12, color:T.inkSoft, marginBottom:8, lineHeight:1.4 }}>
      <span style={{ width:6, height:6, borderRadius:"50%", marginTop:5, flexShrink:0, background:dot }} />
      <span>{children}</span>
    </div>
  );
}

/* ---------- detail drawer (the reusable record card) ---------- */
function Drawer({ d, onClose }) {
  if (!d) return null;
  const conf = d.conf;
  return (
    <>
      <div onClick={onClose} style={{ position:"absolute", inset:0, background:"rgba(20,22,28,.26)", zIndex:40 }} />
      <div style={{ position:"absolute", top:0, right:0, bottom:0, width:392, background:"#fff",
        borderLeft:`1px solid ${T.line}`, boxShadow:"-10px 0 34px rgba(0,0,0,.12)", zIndex:50,
        display:"flex", flexDirection:"column" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 18px 12px", borderBottom:`1px solid ${T.line}` }}>
          <span style={{ fontSize:10.5, fontWeight:700, letterSpacing:".05em", textTransform:"uppercase",
            color:T.blueInk, background:T.blueSoft, padding:"4px 9px", borderRadius:999 }}>{d.kind}</span>
          <div onClick={onClose} style={{ cursor:"pointer", color:T.muted, display:"flex" }}><X size={18} /></div>
        </div>

        <div style={{ padding:"16px 18px", overflowY:"auto" }}>
          <h2 style={{ fontSize:18, fontWeight:700, letterSpacing:"-.01em", lineHeight:1.3 }}>{d.title}</h2>
          <div style={{ display:"flex", alignItems:"center", gap:7, marginTop:9, fontSize:13, color:T.inkSoft, fontWeight:600, ...num }}>
            <Clock size={14} style={{ opacity:.55 }} />{d.time}
          </div>
          {d.loc && (
            <div style={{ display:"flex", alignItems:"center", gap:7, marginTop:6, fontSize:13, color:T.inkSoft }}>
              <MapPin size={14} style={{ opacity:.55 }} />{d.loc}
            </div>
          )}
          {d.desc && <p style={{ marginTop:14, fontSize:13.5, lineHeight:1.55, color:T.inkSoft }}>{d.desc}</p>}

          {d.related && d.related.length > 0 && (
            <div style={{ marginTop:18 }}>
              <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase", color:T.muted, marginBottom:9 }}>Linked records</div>
              {d.related.map((r,i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", marginBottom:7,
                  border:`1px solid ${T.line}`, borderRadius:10, cursor:"pointer", background:T.canvas }}>
                  <span style={{ flex:1, fontSize:12.5, fontWeight:600 }}>{r.t}</span>
                  {r.s && <span style={{ fontSize:10.5, fontWeight:600, color:T.muted }}>{r.s}</span>}
                  <ChevronRight size={15} style={{ color:T.muted }} />
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop:18, padding:13, border:`1px solid ${T.line}`, borderRadius:11, background:T.canvas }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:10.5, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase", color:T.muted, marginBottom:9 }}>
              <Bookmark size={12} />AI source
            </div>
            <div style={{ fontSize:12.5, color:T.inkSoft, lineHeight:1.5 }}>
              Built from your typed note · Glenn · {conf==null
                ? <span style={{ color:T.amber, fontWeight:600 }}>flagged — needs your answer</span>
                : <span style={{ ...num }}>confidence {conf.toFixed(2)}</span>}
            </div>
            <button style={{ marginTop:10, fontSize:12, fontWeight:600, color:T.blue, background:"#fff",
              border:`1px solid ${T.line}`, borderRadius:8, padding:"6px 11px", cursor:"pointer" }}>View source</button>
          </div>
        </div>

        <div style={{ marginTop:"auto", display:"flex", gap:9, padding:"14px 18px", borderTop:`1px solid ${T.line}` }}>
          <button style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:7, background:"#fff",
            border:`1px solid ${T.line}`, borderRadius:9, padding:"10px", fontFamily:FONT, fontSize:13, fontWeight:600, cursor:"pointer" }}><Pencil size={14} />Edit</button>
          <button style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:7, background:T.blue, color:"#fff",
            border:0, borderRadius:9, padding:"10px", fontFamily:FONT, fontSize:13, fontWeight:600, cursor:"pointer" }}><MessageSquare size={14} />Tell Glenn</button>
        </div>
      </div>
    </>
  );
}

/* ---------- shell ---------- */
const SECTIONS = [["Run of Show",7],["Vendors",1],["Budget",3],["Tasks",4],["Questions",3],["Risks",2],["Decisions",2]];

export default function GlennRunOfShow() {
  const [view, setView] = useState("month");
  const [picked, setPicked] = useState(null);
  return (
    <div style={{ fontFamily:FONT, background:"#EDEAE3", minHeight:"100vh", padding:24, display:"flex", justifyContent:"center", color:T.ink }}>
      <div style={{ position:"relative", width:1240, maxWidth:"100%", height:820, background:T.canvas, borderRadius:16,
        overflow:"hidden", boxShadow:"0 12px 40px rgba(26,29,36,.14)", display:"flex", border:"1px solid rgba(0,0,0,.05)" }}>

        <aside style={{ width:58, flex:"0 0 58px", background:"#fff", borderRight:`1px solid ${T.line}`, display:"flex",
          flexDirection:"column", alignItems:"center", padding:"16px 0", gap:6 }}>
          <div style={{ width:30, height:30, borderRadius:8, background:T.blue, color:"#fff", display:"grid", placeItems:"center", fontWeight:800, fontSize:14, marginBottom:10 }}>G</div>
          <RailIcon><Home size={19} /></RailIcon>
          <RailIcon on><AlignLeft size={19} /></RailIcon>
          <RailIcon><Folder size={19} /></RailIcon>
          <div style={{ flex:1 }} />
          <div style={{ width:28, height:28, borderRadius:"50%", background:"#14161c", color:"#fff", display:"grid", placeItems:"center", fontSize:10, fontWeight:700 }}>CS</div>
        </aside>

        <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>
          <div style={{ padding:"16px 24px 14px", borderBottom:`1px solid ${T.line}` }}>
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:16 }}>
              <div>
                <h1 style={{ fontSize:21, letterSpacing:"-.02em", display:"flex", alignItems:"center", gap:10 }}>
                  Apex Capital Client Dinner
                  <span style={{ fontSize:10.5, fontWeight:700, color:T.blueInk, background:T.blueSoft, padding:"3px 9px",
                    borderRadius:999, textTransform:"uppercase", letterSpacing:".04em", position:"relative", top:-2 }}>Planning</span>
                </h1>
                <div style={{ display:"flex", flexWrap:"wrap", gap:"6px 16px", marginTop:8, fontSize:12.5, color:T.inkSoft }}>
                  <Meta icon={<Calendar size={13} />}>Aug 22, 2026 <span style={{ color:T.red, fontWeight:600 }}>· in 65 days</span></Meta>
                  <Meta icon={<MapPin size={13} />}>The Meridian Room · Boston</Meta>
                  <Meta icon={<Users size={13} />}><span style={num}>42</span> guests</Meta>
                  <Meta icon={<DollarSign size={13} />}><span style={num}>$9,420</span> / <span style={num}>$10,000</span></Meta>
                </div>
              </div>
              <div style={{ display:"flex", gap:9 }}>
                <button style={{ display:"flex", alignItems:"center", gap:7, background:T.blue, color:"#fff", border:0,
                  fontFamily:FONT, fontSize:12.5, fontWeight:600, padding:"9px 13px", borderRadius:9, cursor:"pointer", whiteSpace:"nowrap" }}><MessageSquare size={14} />Tell Glenn what changed</button>
                <button style={{ display:"flex", alignItems:"center", gap:8, background:"#fff", border:`1px solid ${T.line}`,
                  fontFamily:FONT, fontSize:12.5, fontWeight:600, padding:"9px 12px", borderRadius:9, cursor:"pointer" }}>
                  <span style={{ width:7, height:7, borderRadius:"50%", background:T.blue }} />Review <b style={{ color:T.blueInk }}>·&nbsp;3</b>
                </button>
              </div>
            </div>
          </div>

          <div style={{ display:"flex", gap:4, padding:"10px 24px 0", borderBottom:`1px solid ${T.line}` }}>
            {SECTIONS.map(([name,n],i)=>(
              <div key={name} style={{ fontSize:12.5, fontWeight:600, color:i===0?T.ink:T.muted, padding:"8px 12px",
                borderRadius:"8px 8px 0 0", cursor:"pointer", borderBottom:`2px solid ${i===0?T.blue:"transparent"}`, display:"flex", alignItems:"center", gap:6 }}>
                {name}
                <span style={{ fontSize:11, background:i===0?T.blueSoft:T.lineSoft, color:i===0?T.blueInk:T.muted, borderRadius:6, padding:"0 6px", ...num }}>{n}</span>
              </div>
            ))}
          </div>

          <div style={{ flex:1, overflow:"auto", padding:"16px 24px 30px" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
              <h2 style={{ fontSize:15, fontWeight:700, display:"flex", alignItems:"center", gap:9 }}>
                Run of Show <span style={{ fontSize:12, color:T.muted, fontWeight:500 }}>— how the work and the night line up</span>
              </h2>
              <div style={{ display:"flex", background:"#fff", border:`1px solid ${T.line}`, borderRadius:9, padding:3, boxShadow:"0 1px 3px rgba(26,29,36,.05)" }}>
                <Toggle on={view==="month"} onClick={()=>setView("month")} icon={<CalendarDays size={14} />}>Lead-up</Toggle>
                <Toggle on={view==="day"} onClick={()=>setView("day")} icon={<CalendarClock size={14} />}>Day of</Toggle>
              </div>
            </div>
            {view==="month" ? <MonthView onPick={setPicked} /> : <DayView onPick={setPicked} />}
          </div>
        </div>

        <Drawer d={picked} onClose={()=>setPicked(null)} />
      </div>
    </div>
  );
}

function RailIcon({ on, children }) {
  return <div style={{ width:38, height:38, borderRadius:10, display:"grid", placeItems:"center", color:on?T.blueInk:T.muted, background:on?T.blueSoft:"transparent", cursor:"pointer" }}>{children}</div>;
}
function Meta({ icon, children }) {
  return <span style={{ display:"flex", alignItems:"center", gap:6 }}><span style={{ opacity:.55, display:"flex" }}>{icon}</span>{children}</span>;
}
function Toggle({ on, onClick, icon, children }) {
  return <button onClick={onClick} style={{ border:0, background:on?T.blue:"transparent", color:on?"#fff":T.inkSoft, fontFamily:FONT, fontSize:12.5, fontWeight:600, padding:"6px 14px", borderRadius:7, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>{icon}{children}</button>;
}
```
