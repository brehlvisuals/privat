"use client";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Flame, Dumbbell, Utensils, BarChart3, Plus, X, ChevronLeft, ChevronRight,
  Sparkles, MapPin, Search, Trophy, Watch, Activity, Scale, CheckCircle2,
  AlertTriangle, Zap, Clock, Settings, ClipboardList, Send, MessageCircle
} from "lucide-react";

const H = {
  bg: "#0D0D10", bg2: "#141418", card: "#1A1A21", cardHi: "#23232C", line: "#2A2A33",
  text: "#F3F3F6", sub: "#9A9AA6", faint: "#5A5A66", blue: "#2E6BFF", blueSoft: "rgba(46,107,255,0.14)",
  up: "#27C28B", down: "#FF5A52", amber: "#F2B84B", violet: "#A78BFA",
};

/* ---------- helpers ---------- */
const e1rm = (w, r) => Math.round(w * (1 + r / 30));
const bestSet = (s) => s.reduce((b, x) => (e1rm(x.w, x.r) > e1rm(b.w, b.r) ? x : b), s[0]);
const dstr = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const today = dstr(0);
const fmtShort = (s) => new Date(s).toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
const dayLabel = (s) => s === today ? "Heute" : s === dstr(1) ? "Gestern" : s === dstr(-1) ? "Morgen" : new Date(s).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
const shiftDate = (s, d) => { const x = new Date(s); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
const todayIdx = (new Date().getDay() + 6) % 7;

function trend(vals) {
  if (vals.length < 2) return { label: "—", color: H.sub, arrow: "→", dir: "flat" };
  const recent = vals.slice(-2).reduce((a, b) => a + b, 0) / 2, prior = vals.slice(-4, -2);
  const base = prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : vals[0];
  const pct = ((recent - base) / base) * 100;
  if (pct > 2) return { label: "Steigerung", color: H.up, arrow: "↗", dir: "up" };
  if (pct < -2) return { label: "Schwächer", color: H.down, arrow: "↘", dir: "down" };
  return { label: "Plateau", color: H.amber, arrow: "→", dir: "flat" };
}
function buildInsight(sess, ctx) {
  const rows = sess.map((s) => ({ v: e1rm(bestSet(s.sets).w, bestSet(s.sets).r), c: ctx[s.date] })).filter((r) => r.c);
  if (rows.length < 4) return null;
  const sorted = [...rows].sort((a, b) => a.v - b.v), half = Math.floor(sorted.length / 2);
  const weak = sorted.slice(0, half), strong = sorted.slice(-half), avg = (a, k) => a.reduce((s, r) => s + r.c[k], 0) / a.length, parts = [];
  if (avg(strong, "sleep") - avg(weak, "sleep") >= 0.4) parts.push("Schlaf (Ø " + avg(strong, "sleep").toFixed(1) + " h vs. " + avg(weak, "sleep").toFixed(1) + " h)");
  if (avg(strong, "protein") - avg(weak, "protein") >= 12) parts.push("Protein (Ø " + Math.round(avg(strong, "protein")) + " g vs. " + Math.round(avg(weak, "protein")) + " g)");
  if (weak.filter((r) => r.c.stress === "hoch").length >= 2) parts.push("hoher Stress");
  return parts.length ? parts : null;
}

const MEALS = [["breakfast", "Frühstück"], ["lunch", "Mittag"], ["dinner", "Abend"], ["snack", "Snacks"]];
const emptyDay = () => ({ breakfast: [], lunch: [], dinner: [], snack: [] });
const FAVS = [
  { n: "Skyr 250 g", p: 25, f: 0, c: 9, k: 140 }, { n: "Haferflocken 80 g", p: 11, f: 6, c: 49, k: 300 },
  { n: "Lachsfilet 150 g", p: 34, f: 22, c: 0, k: 340 }, { n: "Reis 200 g", p: 5, f: 0, c: 56, k: 260 },
  { n: "Eier (2)", p: 13, f: 11, c: 1, k: 155 }, { n: "Banane", p: 1, f: 0, c: 27, k: 110 },
  { n: "Whey 30 g", p: 24, f: 2, c: 3, k: 120 }, { n: "Linsen 200 g", p: 18, f: 1, c: 40, k: 240 },
];
const PDISC = {
  swim: { l: "Schwimmen", c: "#38BDF8" }, bike: { l: "Rad", c: H.amber }, run: { l: "Laufen", c: H.up },
  strength: { l: "Kraft", c: H.blue }, mobility: { l: "Mobility", c: H.violet }, rest: { l: "Ruhe", c: H.faint },
};
const DKEYS = Object.keys(PDISC);

/* ---------- seed + storage ---------- */
const seed = () => {
  const sq = (a, b, c) => [{ w: a, r: 5 }, { w: b, r: 4 }, { w: c, r: 4 }];
  return {
    settings: { bmr: 1950, protein: 180, fat: 70, carbs: 460 },
    exercises: [
      { id: "squat", name: "Kniebeuge", group: "Quads", gym: "McFit Köln-Süd" },
      { id: "bench", name: "Bankdrücken", group: "Brust", gym: "McFit Köln-Süd" },
      { id: "legpress", name: "Beinpresse", group: "Quads", gym: "McFit Köln-Süd" },
      { id: "dead", name: "Kreuzheben", group: "Rücken", gym: "McFit Köln-Süd" },
      { id: "pistol", name: "Pistol Squat", group: "Beine", gym: "Aachener Weiher (Calisthenics)", custom: true },
    ],
    workouts: [
      { id: "w1", date: dstr(42), name: "Quads / Core", durationMin: 58, exercises: [{ exId: "squat", name: "Kniebeuge", gym: "McFit Köln-Süd", note: "lief leicht", sets: sq(90, 92.5, 92.5) }] },
      { id: "w2", date: dstr(35), name: "Quads / Core", durationMin: 61, exercises: [{ exId: "squat", name: "Kniebeuge", gym: "McFit Köln-Süd", note: "", sets: sq(92.5, 95, 95) }] },
      { id: "w3", date: dstr(28), name: "Quads / Core", durationMin: 64, exercises: [{ exId: "squat", name: "Kniebeuge", gym: "McFit Köln-Süd", note: "stark", sets: sq(95, 95, 97.5) }, { exId: "legpress", name: "Beinpresse", gym: "McFit Köln-Süd", note: "", sets: [{ w: 180, r: 10 }, { w: 180, r: 10 }] }] },
      { id: "w4", date: dstr(21), name: "Quads / Core", durationMin: 52, exercises: [{ exId: "squat", name: "Kniebeuge", gym: "McFit Köln-Süd", note: "müde, schwer", sets: sq(90, 92.5, 90) }] },
      { id: "w5", date: dstr(14), name: "Quads / Core", durationMin: 49, exercises: [{ exId: "squat", name: "Kniebeuge", gym: "McFit Köln-Süd", note: "kraftlos", sets: sq(90, 90, 87.5) }] },
      { id: "w6", date: dstr(7), name: "Quads / Core", durationMin: 60, exercises: [{ exId: "squat", name: "Kniebeuge", gym: "McFit Köln-Süd", note: "wieder besser", sets: sq(92.5, 95, 95) }] },
    ],
    context: {
      [dstr(42)]: { sleep: 7.6, protein: 182, stress: "niedrig", activity: 900 }, [dstr(35)]: { sleep: 7.2, protein: 180, stress: "niedrig", activity: 820 },
      [dstr(28)]: { sleep: 7.8, protein: 188, stress: "niedrig", activity: 950 }, [dstr(21)]: { sleep: 6.0, protein: 158, stress: "hoch", activity: 700 },
      [dstr(14)]: { sleep: 6.2, protein: 152, stress: "hoch", activity: 680 }, [dstr(7)]: { sleep: 7.4, protein: 178, stress: "mittel", activity: 880 },
      [dstr(1)]: { sleep: 7.1, protein: 176, stress: "mittel", activity: 1120 }, [today]: { sleep: 7.3, protein: 176, stress: "mittel", activity: 850 },
    },
    nutrition: {
      [today]: { breakfast: [{ n: "Haferflocken 80 g + Banane + Whey", p: 36, f: 8, c: 79, k: 530 }], lunch: [{ n: "Lachsfilet 150 g + Reis 200 g", p: 39, f: 22, c: 56, k: 600 }], dinner: [], snack: [] },
      [dstr(1)]: { breakfast: [{ n: "Skyr 250 g + Beeren", p: 27, f: 1, c: 22, k: 200 }], lunch: [], dinner: [{ n: "Döner mit allem", p: 38, f: 26, c: 52, k: 640, ai: true }], snack: [] },
    },
    plan: {
      0: [{ disc: "strength", detail: "Quads / Core" }, { disc: "run", detail: "Easy 8 km" }],
      1: [{ disc: "bike", detail: "Intervalle 2×20 min" }, { disc: "swim", detail: "Technik 2,0 km" }],
      2: [{ disc: "strength", detail: "Hams / Back" }, { disc: "mobility", detail: "20 min" }],
      3: [{ disc: "swim", detail: "Schwelle 2,5 km" }],
      4: [{ disc: "strength", detail: "Arms / Side Delts" }, { disc: "run", detail: "Tempo 6×1 km" }],
      5: [{ disc: "bike", detail: "Long 90 km" }],
      6: [{ disc: "run", detail: "Long 18 km" }, { disc: "mobility", detail: "20 min" }],
    },
  };
};
let MEM = null;
const supabase = createClient();
function migrate(d) { const s = seed(); return { ...s, ...d, settings: { ...s.settings, ...(d.settings || {}) }, plan: d.plan || s.plan, context: { ...s.context, ...(d.context || {}) } }; }

// Merge der Apple-Health-Daten (daily_context) in den App-Zustand.
function mergeContext(d, ctxRows) {
  for (const r of ctxRows || []) {
    const prev = d.context[r.date] || {};
    d.context[r.date] = {
      ...prev,
      ...(r.sleep_hours != null ? { sleep: Number(r.sleep_hours) } : {}),
      ...(r.activity_kcal != null ? { activity: r.activity_kcal } : {}),
      ...(r.stress ? { stress: r.stress } : {}),
      ...(r.hrv != null ? { hrv: r.hrv } : {}),
      ...(r.resting_hr != null ? { rhf: r.resting_hr } : {}),
      ...(r.weight_kg != null ? { weight: Number(r.weight_kg) } : {}),
    };
  }
  return d;
}

async function load() {
  const s = seed();
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return s;
    const { data: row } = await supabase.from("app_state").select("data").eq("user_id", user.id).maybeSingle();
    let d;
    if (row && row.data && Object.keys(row.data).length) {
      d = migrate(row.data);
    } else {
      d = s;
      await supabase.from("app_state").upsert({ user_id: user.id, data: d });
    }
    const { data: ctxRows } = await supabase.from("daily_context").select("*").eq("user_id", user.id);
    d = mergeContext(d, ctxRows);
    MEM = d;
    return d;
  } catch (e) { return MEM || s; }
}

let saveTimer = null;
async function persist(d) {
  MEM = d;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      supabase.from("app_state").upsert({ user_id: user.id, data: d, updated_at: new Date().toISOString() });
    }, 600);
  } catch (e) {}
}

/* ---------- AI ---------- */
async function callClaude(messages, system) {
  const res = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages, system }) });
  if (!res.ok) throw new Error("AI request failed");
  const data = await res.json();
  return data.text || "";
}
async function estimateFood(text) {
  const out = await callClaude([{ role: "user", content: 'Schätze realistische Nährwerte für eine typische Portion von: "' + text + '". Antworte AUSSCHLIESSLICH mit JSON, ohne Erklärung, ohne Backticks. Format: {"n": kurzer Name, "k": kcal, "p": Protein g, "f": Fett g, "c": Kohlenhydrate g}' }], "Du bist ein präziser Ernährungsrechner.");
  const o = JSON.parse(out.replace(/```json|```/g, "").trim());
  return { n: o.n, p: Math.round(o.p), f: Math.round(o.f), c: Math.round(o.c), k: Math.round(o.k), ai: true };
}
const COACH_SYS = "Du bist der KI-Coach in Felix' privatem Performance OS. Felix ist pescetarischer Ironman-Triathlet, 26, 186 cm, 83 kg, Grundumsatz ~1950 kcal, Protein-Ziel ~180 g/Tag. Er trainiert Schwimmen, Rad, Laufen, Kraft, Calisthenics. Antworte kurz, konkret und auf Deutsch in der Du-Form. Bei Essen kannst du Kalorien und Makros schätzen. Du bist kein Ersatz für Arzt oder Coach bei medizinischen Fragen.";

/* ================= APP ================= */
export default function App() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("food");
  const [active, setActive] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [msgs, setMsgs] = useState([{ role: "assistant", content: "Moin Felix! Frag mich was zu Training, Ernährung oder Recovery — oder schick mir, was du isst (z.B. Döner mit allem) für eine schnelle Schätzung." }]);
  useEffect(() => { load().then(setData); }, []);
  if (!data) return <div style={{ background: H.bg, minHeight: "100dvh" }} />;
  const commit = (d) => { setData(d); persist(d); };

  return (
    <div style={{ background: H.bg, minHeight: "100dvh", fontFamily: "ui-sans-serif,-apple-system,Segoe UI,Roboto,sans-serif", color: H.text }}>
      <Style />
      <div style={{ maxWidth: 460, margin: "0 auto", minHeight: "100dvh", position: "relative", display: "flex", flexDirection: "column" }}>
        <div className="scroll" style={{ flex: 1, overflowY: "auto", padding: "env(safe-area-inset-top) 0 90px" }}>
          {tab === "home" && <Home data={data} />}
          {tab === "train" && <Training data={data} commit={commit} active={active} setActive={setActive} />}
          {tab === "food" && <Food data={data} commit={commit} />}
          {tab === "analyse" && <Analyse />}
        </div>

        {!chatOpen && (
          <button onClick={() => setChatOpen(true)} aria-label="KI-Coach"
            style={{ position: "absolute", bottom: 80, right: 16, width: 54, height: 54, borderRadius: 27, border: "none", cursor: "pointer", zIndex: 40,
              background: "linear-gradient(135deg, #4D86FF, #2E6BFF)", boxShadow: "0 8px 22px -6px rgba(46,107,255,.6)", display: "grid", placeItems: "center" }}>
            <Sparkles size={24} color="#fff" />
          </button>
        )}
        {chatOpen && <Coach msgs={msgs} setMsgs={setMsgs} close={() => setChatOpen(false)} />}

        <Nav tab={tab} setTab={setTab} active={!!active} />
      </div>
    </div>
  );
}

/* ================= COACH CHAT ================= */
function Coach({ msgs, setMsgs, close }) {
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  useEffect(() => { endRef.current && endRef.current.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);
  const send = async () => {
    const t = text.trim(); if (!t || busy) return;
    const next = [...msgs, { role: "user", content: t }]; setMsgs(next); setText(""); setBusy(true);
    try { const reply = await callClaude(next.map((m) => ({ role: m.role, content: m.content })), COACH_SYS); setMsgs([...next, { role: "assistant", content: reply }]); }
    catch (e) { setMsgs([...next, { role: "assistant", content: "Hm, da ging was schief. Probier's nochmal." }]); }
    setBusy(false);
  };
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", background: H.bg }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "calc(16px + env(safe-area-inset-top)) 18px 16px", borderBottom: "1px solid " + H.line }}>
        <span style={{ width: 34, height: 34, borderRadius: 17, background: "linear-gradient(135deg,#4D86FF,#2E6BFF)", display: "grid", placeItems: "center" }}><Sparkles size={18} color="#fff" /></span>
        <div style={{ flex: 1 }}><div style={{ fontSize: 15.5, fontWeight: 750 }}>KI-Coach</div><div style={{ fontSize: 11.5, color: H.sub }}>kennt deinen Kontext</div></div>
        <button onClick={close} style={{ all: "unset", cursor: "pointer", color: H.sub }}><X size={22} /></button>
      </div>
      <div className="scroll" style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 10 }}>
            <div style={{ maxWidth: "82%", padding: "11px 14px", borderRadius: 16, fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap",
              background: m.role === "user" ? H.blue : H.card, color: m.role === "user" ? "#fff" : H.text, border: m.role === "user" ? "none" : "1px solid " + H.line,
              borderBottomRightRadius: m.role === "user" ? 4 : 16, borderBottomLeftRadius: m.role === "user" ? 16 : 4 }}>{m.content}</div>
          </div>
        ))}
        {busy && <div style={{ fontSize: 13, color: H.sub, padding: "2px 4px" }}>Coach tippt …</div>}
        <div ref={endRef} />
      </div>
      <div style={{ display: "flex", gap: 8, padding: 14, borderTop: "1px solid " + H.line }}>
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} placeholder="Frag den Coach …" className="fld"
          style={{ flex: 1, padding: "13px 14px", borderRadius: 13, border: "1px solid transparent", background: H.bg2, color: H.text, fontSize: 15, outline: "none" }} />
        <button onClick={send} disabled={busy || !text.trim()} style={{ width: 48, borderRadius: 13, border: "none", background: busy || !text.trim() ? H.card : H.blue, color: "#fff", cursor: "pointer", display: "grid", placeItems: "center" }}><Send size={18} /></button>
      </div>
    </div>
  );
}

/* ================= TRAINING ================= */
function Training({ data, commit, active, setActive }) {
  const [mode, setMode] = useState("workout");
  const [detailEx, setDetailEx] = useState(null);
  const [picker, setPicker] = useState(false);
  const sessForEx = (id) => data.workouts.flatMap((w) => w.exercises.filter((e) => e.exId === id).map((e) => ({ date: w.date, sets: e.sets, note: e.note }))).sort((a, b) => a.date.localeCompare(b.date));

  if (mode === "detail" && detailEx) return <Detail ex={detailEx} sess={sessForEx(detailEx.id)} context={data.context} back={() => setMode("library")} />;
  if (mode === "plan") return <PlanView data={data} commit={commit} back={() => setMode("workout")} />;

  const startWorkout = () => setActive({ name: "Workout", startedAt: Date.now(), exercises: [] });
  const addEx = (ex) => { setActive((a) => ({ ...a, exercises: [...a.exercises, { exId: ex.id, name: ex.name, gym: ex.gym, note: "", sets: [] }] })); setPicker(false); };
  const createEx = (ex) => { const id = "c" + Date.now(); commit({ ...data, exercises: [...data.exercises, { ...ex, id, custom: true }] }); return { ...ex, id }; };
  const finish = () => {
    const exs = active.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => s.w && s.r).map((s) => ({ w: Number(s.w), r: Number(s.r) })) })).filter((e) => e.sets.length);
    if (exs.length) { const dur = Math.max(1, Math.round((Date.now() - active.startedAt) / 60000)); commit({ ...data, workouts: [...data.workouts, { id: "w" + Date.now(), date: today, name: active.name, durationMin: dur, exercises: exs }] }); }
    setActive(null);
  };

  const tpIcon = !active ? <button onClick={() => setMode("plan")} style={iconBtn} title="Trainingsplan"><ClipboardList size={20} color={H.sub} /></button> : null;

  return (
    <Page title={active ? "Aktives Workout" : "Training"} action={tpIcon}>
      {!active && (
        <div style={{ display: "flex", gap: 4, marginBottom: 16, background: H.bg2, padding: 4, borderRadius: 12, width: "fit-content" }}>
          {[["workout", "Workouts"], ["library", "Übungen"]].map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} style={{ border: "none", cursor: "pointer", padding: "7px 16px", borderRadius: 9, fontSize: 13.5, fontWeight: 700, background: mode === k ? H.card : "transparent", color: mode === k ? H.text : H.sub }}>{l}</button>
          ))}
        </div>
      )}
      {active ? <ActiveWorkout active={active} setActive={setActive} openPicker={() => setPicker(true)} finish={finish} />
        : mode === "workout" ? (
          <>
            <button onClick={startWorkout} style={{ width: "100%", padding: 16, borderRadius: 14, border: "none", background: H.blue, color: "#fff", fontSize: 15, fontWeight: 750, cursor: "pointer", marginBottom: 18 }}>+ Neues Workout starten</button>
            <Label style={{ margin: "0 4px 8px" }}>Verlauf</Label>
            {[...data.workouts].reverse().map((w) => { const sets = w.exercises.reduce((a, e) => a + e.sets.length, 0); const vol = w.exercises.reduce((a, e) => a + e.sets.reduce((s, x) => s + x.w * x.r, 0), 0); return (
              <Card key={w.id} style={{ marginBottom: 9 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontSize: 15, fontWeight: 720 }}>{w.name}</span><span style={{ fontSize: 12, color: H.sub }}>{dayLabel(w.date) === "Heute" ? "Heute" : fmtShort(w.date)}</span></div>
                <div style={{ fontSize: 12.5, color: H.sub, marginTop: 4, display: "flex", gap: 12 }}><span><Clock size={11} style={{ verticalAlign: "-1px" }} /> {w.durationMin} min</span><span>{w.exercises.length} Üb · {sets} Sätze</span><span>{(vol / 1000).toFixed(1)} t</span></div>
                <div style={{ fontSize: 12.5, color: H.faint, marginTop: 6 }}>{w.exercises.map((e) => e.name).join(" · ")}</div>
              </Card>); })}
          </>
        ) : <Library data={data} open={(ex) => { setDetailEx(ex); setMode("detail"); }} createEx={createEx} />}
      {picker && <ExercisePicker data={data} onPick={addEx} onCreate={(ex) => addEx(createEx(ex))} close={() => setPicker(false)} />}
    </Page>
  );
}

function ActiveWorkout({ active, setActive, openPicker, finish }) {
  const updEx = (i, fn) => setActive((a) => ({ ...a, exercises: a.exercises.map((e, j) => (j === i ? fn(e) : e)) }));
  const rmEx = (i) => setActive((a) => ({ ...a, exercises: a.exercises.filter((_, j) => j !== i) }));
  const [el, setEl] = useState(0);
  useEffect(() => { const t = setInterval(() => setEl(Math.round((Date.now() - active.startedAt) / 1000)), 1000); return () => clearInterval(t); }, [active.startedAt]);
  const mm = String(Math.floor(el / 60)).padStart(2, "0"), ss = String(el % 60).padStart(2, "0");
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <span style={{ fontSize: 14, color: H.sub, fontVariantNumeric: "tabular-nums" }}><Clock size={13} style={{ verticalAlign: "-2px" }} /> {mm}:{ss}</span>
        <button onClick={finish} style={{ border: "none", background: H.up, color: "#06281C", padding: "8px 16px", borderRadius: 10, fontWeight: 750, fontSize: 13, cursor: "pointer" }}>Beenden & speichern</button>
      </div>
      {active.exercises.length === 0 && <div style={{ color: H.faint, fontSize: 14, textAlign: "center", padding: "30px 0" }}>Noch keine Übung. Füg unten welche hinzu.</div>}
      {active.exercises.map((ex, i) => (
        <Card key={i} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div><div style={{ fontSize: 17, fontWeight: 720, color: H.blue }}>{ex.name}</div>{ex.gym && <div style={{ fontSize: 11.5, color: H.faint, marginTop: 1 }}><MapPin size={10} style={{ verticalAlign: "-1px" }} /> {ex.gym}</div>}</div>
            <button onClick={() => rmEx(i)} style={{ all: "unset", cursor: "pointer", color: H.faint, fontSize: 18 }}>×</button>
          </div>
          <SetTable sets={ex.sets} onChange={(sets) => updEx(i, (e) => ({ ...e, sets }))} />
          <input value={ex.note} onChange={(e) => updEx(i, (x) => ({ ...x, note: e.target.value }))} placeholder="Notiz …" className="fld" style={{ width: "100%", marginTop: 9, padding: "10px 12px", borderRadius: 11, border: "1px solid transparent", background: H.bg2, color: H.text, fontSize: 13, boxSizing: "border-box", outline: "none" }} />
        </Card>
      ))}
      <button onClick={openPicker} style={{ width: "100%", padding: 14, borderRadius: 14, border: "1px solid " + H.blue, background: H.blueSoft, color: H.blue, fontSize: 14, fontWeight: 750, cursor: "pointer" }}>+ Übung hinzufügen</button>
    </>
  );
}
function SetTable({ sets, onChange }) {
  const add = () => onChange([...sets, { w: "", r: "" }]); const upd = (i, k, v) => onChange(sets.map((s, j) => (j === i ? { ...s, [k]: v } : s))); const del = (i) => onChange(sets.filter((_, j) => j !== i));
  return (<>
    <div style={{ display: "grid", gridTemplateColumns: "26px 1fr 1fr 30px", gap: 8, margin: "12px 0 2px" }}>{["SATZ", "KG", "WDH", ""].map((h, i) => <span key={i} style={{ fontSize: 10, letterSpacing: 1, color: H.faint, fontWeight: 700, textAlign: i ? "left" : "center" }}>{h}</span>)}</div>
    {sets.map((s, i) => { const done = s.w && s.r; return (
      <div key={i} style={{ display: "grid", gridTemplateColumns: "26px 1fr 1fr 30px", gap: 8, alignItems: "center", padding: "5px 0", background: done ? H.blueSoft : "transparent", borderRadius: 8 }}>
        <span style={{ width: 24, height: 24, borderRadius: 7, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 750, margin: "0 auto", background: done ? H.blue : H.bg2, color: done ? "#fff" : H.sub }}>{i + 1}</span>
        <input value={s.w} onChange={(e) => upd(i, "w", e.target.value)} inputMode="decimal" placeholder="kg" className="fld" style={numStyle} />
        <input value={s.r} onChange={(e) => upd(i, "r", e.target.value)} inputMode="numeric" placeholder="Wdh" className="fld" style={numStyle} />
        <button onClick={() => del(i)} style={{ all: "unset", cursor: "pointer", textAlign: "center", color: H.faint, fontSize: 17 }}>×</button>
      </div>); })}
    <button onClick={add} className="addset" style={{ width: "100%", marginTop: 9, padding: 10, borderRadius: 11, border: "1px solid " + H.line, background: "transparent", cursor: "pointer", color: H.blue, fontSize: 13, fontWeight: 700 }}>+ Satz</button>
  </>);
}
const numStyle = { width: "100%", padding: "10px", borderRadius: 10, border: "1px solid transparent", background: H.bg2, color: H.text, fontSize: 16, fontWeight: 700, textAlign: "center", outline: "none", boxSizing: "border-box", fontVariantNumeric: "tabular-nums" };

function Library({ data, open, createEx }) {
  const [q, setQ] = useState(""); const [creating, setCreating] = useState(false);
  const list = data.exercises.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()));
  return (<>
    <div style={{ position: "relative", marginBottom: 12 }}><Search size={15} color={H.faint} style={{ position: "absolute", left: 12, top: 12 }} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Übung suchen" className="fld" style={{ width: "100%", padding: "10px 12px 10px 34px", borderRadius: 12, border: "1px solid transparent", background: H.bg2, color: H.text, fontSize: 14, boxSizing: "border-box", outline: "none" }} /></div>
    <button onClick={() => setCreating(true)} style={{ width: "100%", padding: 13, borderRadius: 12, border: "1px solid " + H.blue, background: H.blueSoft, color: H.blue, fontWeight: 750, fontSize: 14, cursor: "pointer", marginBottom: 14 }}>+ Neue Übung erstellen</button>
    {list.map((ex) => (
      <button key={ex.id} onClick={() => open(ex)} style={{ all: "unset", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", boxSizing: "border-box", background: H.card, border: "1px solid " + H.line, borderRadius: 14, padding: "14px 16px", marginBottom: 9 }}>
        <div><div style={{ fontSize: 15.5, fontWeight: 700 }}>{ex.name} {ex.custom && <span style={{ fontSize: 10, color: H.blue, border: "1px solid " + H.blue, borderRadius: 5, padding: "1px 5px", marginLeft: 4 }}>eigen</span>}</div>
          <div style={{ fontSize: 12, color: H.faint, marginTop: 2 }}>{ex.group}{ex.gym && " · "}{ex.gym && <span><MapPin size={10} style={{ verticalAlign: "-1px" }} /> {ex.gym}</span>}</div></div>
        <ChevronRight size={16} color={H.faint} />
      </button>))}
    {creating && <CreateExercise onSave={(ex) => { createEx(ex); setCreating(false); }} close={() => setCreating(false)} />}
  </>);
}
function CreateExercise({ onSave, close }) {
  const [name, setName] = useState(""); const [group, setGroup] = useState(""); const [gym, setGym] = useState("");
  return (<Sheet close={close} title="Neue Übung">
    <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Bulgarian Split Squat" className="fld" style={sheetInput} /></Field>
    <Field label="Muskelgruppe"><input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="z.B. Beine" className="fld" style={sheetInput} /></Field>
    <Field label="Gym / Ort"><input value={gym} onChange={(e) => setGym(e.target.value)} placeholder="z.B. McFit Köln-Süd" className="fld" style={sheetInput} /></Field>
    <button disabled={!name} onClick={() => onSave({ name, group: group || "—", gym })} style={{ width: "100%", marginTop: 6, padding: 14, borderRadius: 13, border: "none", background: name ? H.blue : H.card, color: name ? "#fff" : H.faint, fontWeight: 750, fontSize: 15, cursor: name ? "pointer" : "default" }}>Übung speichern</button>
  </Sheet>);
}
function ExercisePicker({ data, onPick, onCreate, close }) {
  const [q, setQ] = useState(""); const [creating, setCreating] = useState(false);
  const list = data.exercises.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()));
  return (<Sheet close={close} title="Übung hinzufügen">
    <div style={{ position: "relative", marginBottom: 12 }}><Search size={15} color={H.faint} style={{ position: "absolute", left: 12, top: 12 }} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen" className="fld" style={{ ...sheetInput, paddingLeft: 34 }} /></div>
    <button onClick={() => setCreating(true)} style={{ width: "100%", padding: 11, borderRadius: 11, border: "1px solid " + H.blue, background: H.blueSoft, color: H.blue, fontWeight: 700, fontSize: 13.5, cursor: "pointer", marginBottom: 12 }}>+ Neue Übung erstellen</button>
    <div style={{ maxHeight: 280, overflowY: "auto" }} className="scroll">{list.map((ex) => (
      <button key={ex.id} onClick={() => onPick(ex)} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", boxSizing: "border-box", background: H.bg2, borderRadius: 11, padding: "12px 14px", marginBottom: 7 }}>
        <div style={{ fontSize: 14.5, fontWeight: 650 }}>{ex.name}</div><div style={{ fontSize: 11.5, color: H.faint, marginTop: 1 }}>{ex.group}{ex.gym && " · " + ex.gym}</div></button>))}</div>
    {creating && <CreateExercise onSave={(ex) => { onCreate(ex); setCreating(false); }} close={() => setCreating(false)} />}
  </Sheet>);
}

/* ---------- TRAININGSPLAN ---------- */
function PlanView({ data, commit, back }) {
  const plan = data.plan; const days = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
  const [tip, setTip] = useState(""); const [busy, setBusy] = useState(false);
  const setPlan = (np) => commit({ ...data, plan: np });
  const updSession = (di, si, fn) => setPlan({ ...plan, [di]: plan[di].map((s, j) => (j === si ? fn(s) : s)) });
  const addSession = (di) => setPlan({ ...plan, [di]: [...(plan[di] || []), { disc: "strength", detail: "" }] });
  const rmSession = (di, si) => setPlan({ ...plan, [di]: plan[di].filter((_, j) => j !== si) });
  const cycleDisc = (cur) => DKEYS[(DKEYS.indexOf(cur) + 1) % DKEYS.length];

  const askAI = async () => {
    setBusy(true); setTip("");
    const summary = days.map((d, i) => d + ": " + ((plan[i] || []).map((s) => PDISC[s.disc].l + " " + s.detail).join(", ") || "Ruhe")).join("\n");
    try { const r = await callClaude([{ role: "user", content: "Hier ist mein aktueller Ironman-Wochenplan (Wettkampf in ~11 Wochen, Schwäche: lange Läufe):\n" + summary + "\n\nGib mir 3 kurze, konkrete Verbesserungsvorschläge. Nur die 3 Punkte, je 1 Satz, keine Einleitung." }], COACH_SYS); setTip(r); }
    catch (e) { setTip("KI-Vorschlag gerade nicht verfügbar — nochmal versuchen."); }
    setBusy(false);
  };

  return (
    <Page title="Trainingsplan" backFn={back}>
      <button onClick={askAI} disabled={busy} style={{ width: "100%", padding: 13, borderRadius: 13, border: "none", background: busy ? H.card : "linear-gradient(135deg,#4D86FF,#2E6BFF)", color: busy ? H.faint : "#fff", fontWeight: 750, fontSize: 14, cursor: busy ? "default" : "pointer", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <Sparkles size={16} /> {busy ? "Coach denkt nach …" : "KI-Vorschlag zum Plan"}
      </button>
      {tip && <div style={{ background: H.blueSoft, border: "1px solid " + H.blue + "44", borderRadius: 14, padding: 14, marginBottom: 16, fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{tip}</div>}

      {days.map((d, di) => (
        <Card key={di} style={{ marginBottom: 10, padding: 14, border: di === todayIdx ? "1px solid " + H.blue : "1px solid " + H.line }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: (plan[di] || []).length ? 10 : 0 }}>
            <span style={{ fontSize: 14.5, fontWeight: 720 }}>{d} {di === todayIdx && <span style={{ fontSize: 10, color: H.blue, marginLeft: 4 }}>heute</span>}</span>
            <button onClick={() => addSession(di)} style={{ all: "unset", cursor: "pointer", color: H.blue, fontSize: 13, fontWeight: 700 }}>+ Einheit</button>
          </div>
          {(plan[di] || []).map((s, si) => { const d2 = PDISC[s.disc]; return (
            <div key={si} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <button onClick={() => updSession(di, si, (x) => ({ ...x, disc: cycleDisc(x.disc) }))} title="Disziplin wechseln"
                style={{ flexShrink: 0, border: "none", cursor: "pointer", background: d2.c + "22", color: d2.c, fontSize: 11.5, fontWeight: 750, padding: "7px 10px", borderRadius: 9, minWidth: 78 }}>{d2.l}</button>
              <input value={s.detail} onChange={(e) => updSession(di, si, (x) => ({ ...x, detail: e.target.value }))} placeholder="Details (z.B. 8 km Easy)" className="fld"
                style={{ flex: 1, padding: "9px 11px", borderRadius: 10, border: "1px solid transparent", background: H.bg2, color: H.text, fontSize: 13.5, outline: "none", boxSizing: "border-box" }} />
              <button onClick={() => rmSession(di, si)} style={{ all: "unset", cursor: "pointer", color: H.faint, fontSize: 17 }}>×</button>
            </div>); })}
          {!(plan[di] || []).length && <div style={{ fontSize: 13, color: H.faint, marginTop: 8 }}>Ruhetag</div>}
        </Card>
      ))}
      <div style={{ fontSize: 11, color: H.faint, textAlign: "center", marginTop: 6 }}>Tippe auf die Disziplin zum Wechseln · alles editierbar, speichert automatisch</div>
    </Page>
  );
}

function Detail({ ex, sess, context, back }) {
  const points = sess.map((s) => ({ date: s.date, val: e1rm(bestSet(s.sets).w, bestSet(s.sets).r) }));
  const tr = trend(points.map((p) => p.val)); const pr = sess.length ? Math.max(...sess.flatMap((s) => s.sets.map((x) => x.w))) : 0;
  const cur = points.length ? points[points.length - 1].val : 0; const insight = buildInsight(sess, context); const recent = [...sess].reverse().slice(0, 6);
  return (
    <Page title={ex.name} backFn={back} subEl={ex.gym && <span style={{ fontSize: 13, color: H.sub }}><MapPin size={12} style={{ verticalAlign: "-2px" }} /> {ex.gym}</span>}>
      {sess.length < 1 ? <div style={{ color: H.faint, padding: 20, fontSize: 14 }}>Noch keine Sessions geloggt.</div> : <>
        <div style={{ display: "flex", gap: 9, marginBottom: 14 }}><Stat label="e1RM" value={cur + " kg"} /><Stat label="Bestes" value={pr + " kg"} accent /><Stat label="Trend" value={tr.arrow + " " + tr.label} color={tr.color} /></div>
        <Card style={{ marginBottom: 14, padding: "16px 10px 6px" }}><Label style={{ padding: "0 6px 4px" }}>Verlauf · geschätztes 1RM</Label><Chart points={points} /></Card>
        {insight && <div style={{ background: H.blueSoft, border: "1px solid " + H.blue + "44", borderRadius: 16, padding: 16, marginBottom: 14 }}><Label style={{ color: H.blue }}>Kontext-Analyse</Label><div style={{ fontSize: 14, lineHeight: 1.55 }}>Deine starken Sessions hängen zusammen mit <b>{insight.join(", ")}</b>.{tr.dir === "down" && " Der aktuelle Einbruch passt ins selbe Muster — zuerst auf Schlaf & Protein schauen."}</div></div>}
        <Label style={{ margin: "0 4px 8px" }}>Letzte Sessions</Label>
        {recent.map((s, i) => { const c = context[s.date]; return (
          <Card key={i} style={{ marginBottom: 9 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontSize: 12.5, color: H.sub, fontWeight: 600 }}>{fmtShort(s.date)}</span><span style={{ fontSize: 15, fontWeight: 750, fontVariantNumeric: "tabular-nums" }}>{s.sets.map((x) => x.w + "×" + x.r).join("  ")}</span></div>
            {s.note && <div style={{ fontSize: 13, color: H.sub, marginTop: 5, fontStyle: "italic" }}>„{s.note}“</div>}
            {c && <div style={{ display: "flex", gap: 14, marginTop: 9, paddingTop: 9, borderTop: "1px solid " + H.line }}><Mini label="Schlaf" v={c.sleep + " h"} good={c.sleep >= 7} /><Mini label="Protein" v={c.protein + " g"} good={c.protein >= 175} /><Mini label="Stress" v={c.stress} good={c.stress !== "hoch"} /></div>}
          </Card>); })}
      </>}
    </Page>
  );
}

/* ================= FOOD ================= */
function Food({ data, commit }) {
  const [date, setDate] = useState(today); const [addTo, setAddTo] = useState(null); const [showSet, setShowSet] = useState(false);
  const touch = useRef(null); const set = data.settings;
  const day = (data.nutrition && data.nutrition[date]) || emptyDay();
  const all = [].concat(...MEALS.map(([k]) => day[k] || []));
  const sum = all.reduce((a, m) => ({ p: a.p + m.p, f: a.f + m.f, c: a.c + m.c, k: a.k + m.k }), { p: 0, f: 0, c: 0, k: 0 });
  const act = (data.context[date] && data.context[date].activity);
  const verbrauch = set.bmr + (act || 0); const bilanz = sum.k - verbrauch;

  const setDay = (next) => commit({ ...data, nutrition: { ...data.nutrition, [date]: next } });
  const addItem = (meal, item) => setDay({ ...day, [meal]: [...(day[meal] || []), item] });
  const delItem = (meal, idx) => setDay({ ...day, [meal]: day[meal].filter((_, j) => j !== idx) });
  const onTS = (e) => { touch.current = e.touches[0].clientX; };
  const onTE = (e) => { if (touch.current == null) return; const dx = e.changedTouches[0].clientX - touch.current; if (Math.abs(dx) > 55) setDate((d) => shiftDate(d, dx < 0 ? 1 : -1)); touch.current = null; };

  return (
    <Page title="Ernährung" action={<button onClick={() => setShowSet(true)} style={iconBtn} title="Ziele einstellen"><Settings size={19} color={H.sub} /></button>}>
      <div onTouchStart={onTS} onTouchEnd={onTE}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, background: H.card, border: "1px solid " + H.line, borderRadius: 12, padding: "8px 6px" }}>
          <button onClick={() => setDate((d) => shiftDate(d, -1))} style={navBtn}><ChevronLeft size={20} color={H.sub} /></button>
          <span style={{ fontSize: 14.5, fontWeight: 700 }}>{dayLabel(date)}</span>
          <button onClick={() => setDate((d) => shiftDate(d, 1))} style={navBtn}><ChevronRight size={20} color={H.sub} /></button>
        </div>

        {/* energy balance */}
        <Card style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: H.faint, fontWeight: 700 }}>Energiebilanz</div>
              <div style={{ fontSize: 30, fontWeight: 820, letterSpacing: -0.5, fontVariantNumeric: "tabular-nums", color: bilanz >= 0 ? H.amber : H.blue, marginTop: 2 }}>{bilanz >= 0 ? "+" : "−"}{Math.abs(bilanz)}<span style={{ fontSize: 14, color: H.sub, fontWeight: 600 }}> kcal {bilanz >= 0 ? "Überschuss" : "Defizit"}</span></div>
            </div>
            <Donut eaten={sum.k} total={verbrauch} />
          </div>
          <div style={{ display: "flex", gap: 0, marginTop: 14, paddingTop: 12, borderTop: "1px solid " + H.line }}>
            <Bal label="Gegessen" v={sum.k} />
            <Bal label="Grundumsatz" v={set.bmr} sub="fix" />
            <Bal label="Aktivität" v={act != null ? act : "—"} sub="Coros" />
            <Bal label="Verbrauch" v={verbrauch} strong />
          </div>
        </Card>

        {/* macros */}
        <Card style={{ marginBottom: 14 }}>
          <Macro label="Protein" v={sum.p} t={set.protein} color={H.blue} />
          <Macro label="Fett (min.)" v={sum.f} t={set.fat} color={H.amber} />
          <Macro label="Kohlenhydrate" v={sum.c} t={set.carbs} color={H.up} />
        </Card>

        {MEALS.map(([k, label]) => { const items = day[k] || []; const mk = items.reduce((a, m) => a + m.k, 0); return (
          <Card key={k} style={{ marginBottom: 11 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: items.length ? 8 : 0 }}><span style={{ fontSize: 15, fontWeight: 720 }}>{label}</span><span style={{ fontSize: 12, color: H.faint, fontVariantNumeric: "tabular-nums" }}>{mk} kcal</span></div>
            {items.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: "1px solid " + H.line }}>
                <div style={{ flex: 1 }}><span style={{ fontSize: 13.5 }}>{m.n}{m.ai && <Sparkles size={11} color={H.blue} style={{ marginLeft: 5 }} />}</span><div style={{ fontSize: 11, color: H.faint, fontVariantNumeric: "tabular-nums", marginTop: 1 }}>{m.p}P · {m.f}F · {m.c}K · {m.k} kcal</div></div>
                <button onClick={() => delItem(k, i)} style={{ all: "unset", cursor: "pointer", color: H.faint, fontSize: 16, paddingLeft: 8 }}>×</button>
              </div>))}
            <button onClick={() => setAddTo(k)} style={{ width: "100%", marginTop: 9, padding: 9, borderRadius: 10, border: "1px dashed " + H.line, background: "transparent", color: H.sub, fontSize: 13, fontWeight: 650, cursor: "pointer" }}>+ Hinzufügen</button>
          </Card>); })}
        <div style={{ fontSize: 11, color: H.faint, textAlign: "center", marginTop: 6 }}>Wischen für anderen Tag · Aktivität live aus Coros</div>
      </div>

      {addTo && <AddFood mealLabel={MEALS.find((m) => m[0] === addTo)[1]} onAdd={(item) => { addItem(addTo, item); setAddTo(null); }} close={() => setAddTo(null)} />}
      {showSet && <NutSettings set={set} onSave={(s) => { commit({ ...data, settings: s }); setShowSet(false); }} close={() => setShowSet(false)} />}
    </Page>
  );
}
const Bal = ({ label, v, sub, strong }) => (
  <div style={{ flex: 1 }}>
    <div style={{ fontSize: 10, color: H.faint, textTransform: "uppercase", letterSpacing: 0.3, fontWeight: 700 }}>{label}</div>
    <div style={{ fontSize: 15, fontWeight: 800, marginTop: 3, fontVariantNumeric: "tabular-nums", color: strong ? H.text : H.sub }}>{v}</div>
    {sub && <div style={{ fontSize: 9.5, color: H.faint }}>{sub}</div>}
  </div>
);
function Donut({ eaten, total }) {
  const r = 26, c = 2 * Math.PI * r, pct = Math.min(1.2, eaten / total), off = c * (1 - Math.min(1, pct)); const col = eaten > total ? H.amber : H.blue;
  return (<svg width="68" height="68" viewBox="0 0 68 68"><circle cx="34" cy="34" r={r} fill="none" stroke={H.bg2} strokeWidth="7" /><circle cx="34" cy="34" r={r} fill="none" stroke={col} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 34 34)" style={{ transition: "stroke-dashoffset .7s ease" }} /><text x="34" y="34" textAnchor="middle" dominantBaseline="central" fill={H.text} fontSize="13" fontWeight="800">{Math.round((eaten / total) * 100)}%</text></svg>);
}
function NutSettings({ set, onSave, close }) {
  const [s, setS] = useState(set); const f = (k, v) => setS((x) => ({ ...x, [k]: Number(v) || 0 }));
  return (<Sheet close={close} title="Ziele einstellen">
    <Field label="Grundumsatz (fix, kcal)"><input value={s.bmr} onChange={(e) => f("bmr", e.target.value)} inputMode="numeric" className="fld" style={sheetInput} /></Field>
    <div style={{ fontSize: 11.5, color: H.faint, margin: "-6px 0 14px" }}>Aktivitätsenergie kommt automatisch aus Coros und wird oben addiert.</div>
    <Field label="Protein-Ziel (g)"><input value={s.protein} onChange={(e) => f("protein", e.target.value)} inputMode="numeric" className="fld" style={sheetInput} /></Field>
    <Field label="Fett-Ziel / Minimum (g)"><input value={s.fat} onChange={(e) => f("fat", e.target.value)} inputMode="numeric" className="fld" style={sheetInput} /></Field>
    <Field label="Kohlenhydrate-Ziel (g)"><input value={s.carbs} onChange={(e) => f("carbs", e.target.value)} inputMode="numeric" className="fld" style={sheetInput} /></Field>
    <button onClick={() => onSave(s)} style={{ width: "100%", marginTop: 6, padding: 14, borderRadius: 13, border: "none", background: H.blue, color: "#fff", fontWeight: 750, fontSize: 15, cursor: "pointer" }}>Speichern</button>
    <form action="/auth/signout" method="post" style={{ marginTop: 10 }}>
      <button type="submit" style={{ width: "100%", padding: 12, borderRadius: 13, border: "1px solid " + H.line, background: "transparent", color: H.sub, fontWeight: 650, fontSize: 13.5, cursor: "pointer" }}>Abmelden</button>
    </form>
  </Sheet>);
}
function AddFood({ mealLabel, onAdd, close }) {
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const est = async () => { if (!text.trim()) return; setBusy(true); setErr(""); try { onAdd(await estimateFood(text.trim())); } catch (e) { setErr("Schätzung fehlgeschlagen — nochmal versuchen oder Favorit wählen."); setBusy(false); } };
  return (<Sheet close={close} title={"Hinzufügen · " + mealLabel}>
    <Label style={{ color: H.blue, marginBottom: 8 }}><Sparkles size={12} style={{ verticalAlign: "-2px" }} /> Mit KI schätzen</Label>
    <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder='z.B. „Döner mit allem"' className="fld" style={{ ...sheetInput, flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter") est(); }} />
      <button onClick={est} disabled={busy || !text.trim()} style={{ flexShrink: 0, padding: "0 16px", borderRadius: 11, border: "none", background: busy || !text.trim() ? H.card : H.blue, color: busy || !text.trim() ? H.faint : "#fff", fontWeight: 750, fontSize: 14, cursor: busy ? "default" : "pointer" }}>{busy ? "…" : "Schätzen"}</button>
    </div>
    {busy && <div style={{ fontSize: 12.5, color: H.sub, marginBottom: 8 }}>Schätze Nährwerte …</div>}
    {err && <div style={{ fontSize: 12.5, color: H.down, marginBottom: 8 }}>{err}</div>}
    <Label style={{ margin: "14px 0 8px" }}>Favoriten</Label>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxHeight: 240, overflowY: "auto" }} className="scroll">
      {FAVS.map((f) => <button key={f.n} onClick={() => onAdd(f)} style={{ background: H.bg2, border: "1px solid " + H.line, borderRadius: 11, padding: "10px 12px", cursor: "pointer", textAlign: "left" }}><div style={{ fontSize: 13, fontWeight: 600 }}>{f.n}</div><div style={{ fontSize: 11, color: H.sub, fontVariantNumeric: "tabular-nums" }}>{f.p}P · {f.f}F · {f.c}K · {f.k}kcal</div></button>)}
    </div>
  </Sheet>);
}
function Macro({ label, v, t, color }) { const pct = Math.min(100, (v / t) * 100); return (<div style={{ marginBottom: 11 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span><span style={{ fontSize: 12, color: H.sub, fontVariantNumeric: "tabular-nums" }}>{v}<span style={{ color: H.faint }}> / {t} g</span></span></div><Bar pct={pct} color={color} /></div>); }

/* ================= HOME ================= */
function Home({ data }) {
  const set = data.settings; const nut = data.nutrition[today] || emptyDay();
  const eaten = [].concat(...MEALS.map(([k]) => nut[k] || [])).reduce((a, m) => ({ p: a.p + m.p, k: a.k + m.k }), { p: 0, k: 0 });
  const act = (data.context[today] && data.context[today].activity) || 0; const verbrauch = set.bmr + act;
  const pLeft = Math.max(0, set.protein - eaten.p); const kLeft = verbrauch - eaten.k;
  const sq = data.workouts.filter((w) => w.exercises.some((e) => e.exId === "squat")).slice(-1)[0];
  const sqTop = sq ? bestSet(sq.exercises.find((e) => e.exId === "squat").sets) : null;
  const todayPlan = (data.plan[todayIdx] || []).map((s) => PDISC[s.disc].l + " " + s.detail).join(" · ") || "Ruhetag";

  const train = [
    { Icon: Dumbbell, c: H.blue, t: sqTop ? "Kniebeuge: letzte Top-Session " + sqTop.w + "×" + sqTop.r + " — heute " + sqTop.w + "×" + (sqTop.r + 1) + " anpeilen, dann nächste Woche +2,5 kg." : "Kniebeuge: heute auf sauberen Tiefgang achten." },
    { Icon: Zap, c: H.up, t: "Readiness 78 — Körper verträgt heute Intensität. Plan: " + todayPlan + "." },
    { Icon: Activity, c: H.amber, t: "Lauf-Load +22 % zur Vorwoche — Tempo-Einheit ja, aber den Easy-Run wirklich locker (Zone 2)." },
    { Icon: AlertTriangle, c: H.violet, t: "Schwimmen diese Woche erst 1×/2 erledigt — Donnerstag fix einplanen, sonst kippt das Wochenvolumen." },
  ];
  const food = [
    { Icon: Utensils, c: H.blue, t: pLeft > 0 ? "Noch " + pLeft + " g Protein bis zum Ziel — z.B. Lachs + 2× Skyr deckt das locker ab." : "Protein-Ziel heute erreicht — sauber." },
    { Icon: Flame, c: kLeft >= 0 ? H.up : H.amber, t: kLeft >= 0 ? "Noch " + kLeft + " kcal bis zum Verbrauch (" + verbrauch + "). Bei Long-Day morgen ruhig leichten Überschuss fahren." : "Bereits " + Math.abs(kLeft) + " kcal über Verbrauch — passt an einem harten Tag, sonst Abendsnack klein halten." },
    { Icon: Zap, c: H.up, t: "Carbs vor der harten Einheit hochfahren: Reis/Banane 1–2 h vorher, danach Whey + Carbs zum Auffüllen." },
    { Icon: Scale, c: H.violet, t: "Gewicht stabil bei 83 kg (−0,4 kg/Woche) — im Zielkorridor, kein Eingreifen nötig." },
  ];
  return (
    <Page title="Heute" sub={new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}>
      <Card style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 14 }}>
        <Ring score={78} /><div><div style={{ fontSize: 13, color: H.sub }}>Readiness</div><div style={{ fontSize: 22, fontWeight: 800 }}>Bereit</div><div style={{ fontSize: 12, color: H.sub, marginTop: 2 }}>HRV 68 ms · RHF 47 · Schlaf 7:12</div></div>
      </Card>
      <Label style={{ margin: "2px 4px 8px", color: H.blue }}><Dumbbell size={12} style={{ verticalAlign: "-2px" }} /> Training</Label>
      {train.map((r, i) => <RecCard key={i} {...r} />)}
      <Label style={{ margin: "14px 4px 8px", color: H.up }}><Utensils size={12} style={{ verticalAlign: "-2px" }} /> Ernährung</Label>
      {food.map((r, i) => <RecCard key={i} {...r} />)}
    </Page>
  );
}
const RecCard = ({ Icon, c, t }) => <div style={{ display: "flex", gap: 11, alignItems: "flex-start", background: H.card, borderRadius: 14, border: "1px solid " + H.line, borderLeft: "3px solid " + c, padding: "13px 14px", marginBottom: 8 }}><Icon size={16} color={c} style={{ marginTop: 1, flexShrink: 0 }} /><span style={{ fontSize: 13.5, lineHeight: 1.45 }}>{t}</span></div>;

/* ================= ANALYSE ================= */
function Analyse() {
  const areas = [{ Icon: Activity, c: H.blue, l: "Training", v: "9 / 11", n: "Lauf-Longrun fehlte" }, { Icon: Watch, c: H.violet, l: "Erholung", v: "HRV ↑", n: "Schlaf Ø 7:04 h" }, { Icon: Utensils, c: H.up, l: "Ernährung", v: "Ø 168 g P", n: "12 g unter Ziel" }, { Icon: Scale, c: "#38BDF8", l: "Gewicht", v: "83,0 kg", n: "−0,4 · Korridor" }];
  const checks = [{ l: "Schwimmen", c: "#38BDF8", ok: true, t: "Pace 1:38/100 m — über Ziel." }, { l: "Rad", c: H.amber, ok: true, t: "Volumen im Aufbau-Soll." }, { l: "Laufen", c: H.up, ok: false, t: "Longrun max 18 km — zu kurz. Priorität." }];
  return (
    <Page title="Wochenauswertung" sub="KW 27 · 23.–29. Juni">
      <Label style={{ margin: "0 4px 8px" }}>Alle Bereiche</Label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 16 }}>{areas.map((a) => <Card key={a.l} style={{ padding: 13 }}><div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}><a.Icon size={14} color={a.c} /><span style={{ fontSize: 12, color: H.sub, fontWeight: 600 }}>{a.l}</span></div><div style={{ fontSize: 16, fontWeight: 750 }}>{a.v}</div><div style={{ fontSize: 11.5, color: H.faint, marginTop: 2 }}>{a.n}</div></Card>)}</div>
      <Label style={{ margin: "0 4px 8px" }}>Wettkampf-Realismus</Label>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><Trophy size={20} color={H.amber} /><div><div style={{ fontSize: 15, fontWeight: 750 }}>Langdistanz</div><div style={{ fontSize: 12, color: H.sub }}>13.09.2026 · noch 11 Wochen</div></div></div><div style={{ textAlign: "right" }}><div style={{ fontSize: 10, color: H.faint, textTransform: "uppercase", letterSpacing: 0.5 }}>Prognose</div><div style={{ fontSize: 16, fontWeight: 800, color: H.up, fontVariantNumeric: "tabular-nums" }}>10:45–11:15</div></div></div>
        {checks.map((c) => <div key={c.l} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 0", borderTop: "1px solid " + H.line }}>{c.ok ? <CheckCircle2 size={16} color={H.up} style={{ marginTop: 1, flexShrink: 0 }} /> : <AlertTriangle size={16} color={H.amber} style={{ marginTop: 1, flexShrink: 0 }} />}<div><span style={{ fontSize: 13.5, fontWeight: 650, color: c.c }}>{c.l}: </span><span style={{ fontSize: 13.5 }}>{c.t}</span></div></div>)}
        <div style={{ marginTop: 12, padding: 12, background: H.bg2, borderRadius: 11, fontSize: 13, lineHeight: 1.5 }}><b style={{ color: H.amber }}>Urteil: machbar</b> — wackelt am Run. Nächste 6 Wochen 2 lange Läufe (25 km+), dann kippt Run auf grün.</div>
      </Card>
      <div style={{ fontSize: 11, color: H.faint, textAlign: "center", marginTop: 12 }}>Konzept-Vorschau · Beispieldaten · kein Ersatz für Coaching-Urteil</div>
    </Page>
  );
}

/* ================= shared ================= */
const Page = ({ title, sub, subEl, backFn, action, children }) => (
  <div style={{ padding: "22px 18px 8px" }}>
    {backFn && <button onClick={backFn} style={{ all: "unset", cursor: "pointer", color: H.sub, fontSize: 14, fontWeight: 600, marginBottom: 10, display: "inline-block" }}>‹ Zurück</button>}
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><h1 style={{ fontSize: 27, fontWeight: 820, letterSpacing: -0.7, margin: 0 }}>{title}</h1>{action}</div>
    {sub && <div style={{ fontSize: 13.5, color: H.sub, margin: "3px 0 16px" }}>{sub}</div>}
    {subEl && <div style={{ margin: "4px 0 16px" }}>{subEl}</div>}
    {!sub && !subEl && <div style={{ height: 16 }} />}
    {children}
  </div>
);
const Card = ({ children, style }) => <div style={{ background: H.card, border: "1px solid " + H.line, borderRadius: 16, padding: 16, ...style }}>{children}</div>;
const Label = ({ children, style }) => <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: H.faint, fontWeight: 700, marginBottom: 8, ...style }}>{children}</div>;
const Bar = ({ pct, color }) => <div style={{ height: 7, borderRadius: 4, background: H.bg2, overflow: "hidden" }}><div className="b" style={{ width: pct + "%", height: "100%", background: color, borderRadius: 4 }} /></div>;
const Stat = ({ label, value, accent, color }) => (<div style={{ flex: 1, background: accent ? H.blue : H.card, border: accent ? "none" : "1px solid " + H.line, borderRadius: 14, padding: "12px" }}><div style={{ fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase", color: accent ? "rgba(255,255,255,.7)" : H.faint, fontWeight: 700 }}>{label}</div><div style={{ fontSize: 17, fontWeight: 800, marginTop: 3, color: color || (accent ? "#fff" : H.text), fontVariantNumeric: "tabular-nums" }}>{value}</div></div>);
const Mini = ({ label, v, good }) => <div style={{ flex: 1 }}><div style={{ fontSize: 10, color: H.faint, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>{label}</div><div style={{ fontSize: 13, fontWeight: 700, marginTop: 2, color: good ? H.up : H.down }}>{v}</div></div>;
function Ring({ score }) { const r = 36, c = 2 * Math.PI * r, off = c * (1 - score / 100), col = score >= 70 ? H.up : score >= 50 ? H.amber : H.down; return (<svg width="88" height="88" viewBox="0 0 100 100" style={{ flexShrink: 0 }}><circle cx="50" cy="50" r={r} fill="none" stroke={H.bg2} strokeWidth="8" /><circle cx="50" cy="50" r={r} fill="none" stroke={col} strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 50 50)" style={{ transition: "stroke-dashoffset .9s ease" }} /><text x="50" y="50" textAnchor="middle" dominantBaseline="central" fill={H.text} fontSize="27" fontWeight="800">{score}</text></svg>); }
function Chart({ points }) {
  const W = 400, Ht = 150, pad = { l: 8, r: 8, t: 14, b: 22 };
  if (points.length < 2) return <div style={{ color: H.faint, fontSize: 13, padding: 16 }}>Mehr Sessions nötig.</div>;
  const vals = points.map((p) => p.val), min = Math.min(...vals) - 3, max = Math.max(...vals) + 3, rng = max - min || 1;
  const x = (i) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r), y = (v) => pad.t + (1 - (v - min) / rng) * (Ht - pad.t - pad.b);
  const line = points.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.val).toFixed(1)).join(" ");
  const area = line + " L" + x(points.length - 1) + " " + (Ht - pad.b) + " L" + x(0) + " " + (Ht - pad.b) + " Z";
  return (<svg viewBox={"0 0 " + W + " " + Ht} style={{ width: "100%", display: "block" }}><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={H.blue} stopOpacity="0.25" /><stop offset="100%" stopColor={H.blue} stopOpacity="0" /></linearGradient></defs><path d={area} fill="url(#cg)" /><path d={line} fill="none" stroke={H.blue} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />{points.map((p, i) => { const L = i === points.length - 1; return <circle key={i} cx={x(i)} cy={y(p.val)} r={L ? 5 : 3} fill={L ? H.blue : H.card} stroke={H.blue} strokeWidth="2" />; })}<text x={x(0)} y={Ht - 6} fontSize="10" fill={H.faint}>{fmtShort(points[0].date)}</text><text x={x(points.length - 1)} y={Ht - 6} fontSize="10" fill={H.faint} textAnchor="end">{fmtShort(points[points.length - 1].date)}</text></svg>);
}
function Sheet({ title, close, children }) {
  return (<div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 70 }}>
    <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, background: H.card, borderRadius: "20px 20px 0 0", border: "1px solid " + H.line, borderBottom: "none", padding: 18, maxHeight: "82%", overflowY: "auto", boxSizing: "border-box" }} className="scroll">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><span style={{ fontSize: 17, fontWeight: 780 }}>{title}</span><button onClick={close} style={{ all: "unset", cursor: "pointer", color: H.sub }}><X size={20} /></button></div>
      {children}
    </div></div>);
}
const Field = ({ label, children }) => <div style={{ marginBottom: 12 }}><div style={{ fontSize: 12, color: H.sub, marginBottom: 6 }}>{label}</div>{children}</div>;
const sheetInput = { width: "100%", padding: "12px 14px", borderRadius: 11, border: "1px solid transparent", background: H.bg2, color: H.text, fontSize: 15, boxSizing: "border-box", outline: "none" };
const navBtn = { all: "unset", cursor: "pointer", padding: "4px 10px", display: "grid", placeItems: "center" };
const iconBtn = { all: "unset", cursor: "pointer", width: 38, height: 38, borderRadius: 11, background: H.card, border: "1px solid " + H.line, display: "grid", placeItems: "center" };
function Nav({ tab, setTab, active }) {
  const items = [{ k: "home", l: "Heute", I: Flame }, { k: "train", l: "Training", I: Dumbbell }, { k: "food", l: "Ernährung", I: Utensils }, { k: "analyse", l: "Analyse", I: BarChart3 }];
  return (<div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", background: "rgba(13,13,16,.92)", backdropFilter: "blur(10px)", borderTop: "1px solid " + H.line, padding: "8px 0 calc(11px + env(safe-area-inset-bottom))" }}>
    {items.map(({ k, l, I }) => { const on = tab === k; const dot = active && k === "train"; return (
      <button key={k} onClick={() => setTab(k)} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: on ? H.blue : H.faint, position: "relative" }}>
        <I size={21} color={on ? H.blue : H.faint} />
        {dot && <span style={{ position: "absolute", top: -2, right: "32%", width: 7, height: 7, borderRadius: 7, background: H.up }} />}
        <span style={{ fontSize: 10, fontWeight: 650 }}>{l}</span>
      </button>); })}
  </div>);
}
const Style = () => (<style>{`
  .scroll::-webkit-scrollbar{width:0}
  .fld:focus{border-color:` + H.blue + `;background:#101015}
  .addset:hover{border-color:` + H.blue + `}
  .b{transition:width .6s cubic-bezier(.2,.8,.2,1)}
  button,input{font-family:inherit}
  @media (prefers-reduced-motion: reduce){.b,circle{transition:none}}
`}</style>);
