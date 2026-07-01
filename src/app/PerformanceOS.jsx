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
const seed = () => ({
  settings: { bmr: 1950, protein: 180, fat: 70, carbs: 460 },
  exercises: [],
  workouts: [],
  context: {},
  nutrition: {},
  plan: {},
});
let MEM = null;
let userId = null;
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
    userId = user.id;
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
function writeState() {
  if (!userId || !MEM) return;
  try { supabase.from("app_state").upsert({ user_id: userId, data: MEM, updated_at: new Date().toISOString() }); } catch (e) {}
}
async function persist(d) {
  MEM = d;
  if (!userId) { try { const { data: { user } } = await supabase.auth.getUser(); userId = user ? user.id : null; } catch (e) {} }
  if (!userId) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(writeState, 400);
}
// Beim Verlassen/Backgrounden der App sofort speichern (sonst geht der Debounce-Write verloren).
function flushSave() { clearTimeout(saveTimer); writeState(); }
if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushSave(); });
  window.addEventListener("pagehide", flushSave);
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
const COACH_SYS = "Du bist der KI-Coach in Felix' privatem Performance OS. Felix ist pescetarischer Ironman-Triathlet, 26, 186 cm, 83 kg. Er trainiert Schwimmen, Rad, Laufen, Kraft, Calisthenics. Du hast Zugriff auf seine aktuellen App-Daten (siehe Abschnitt AKTUELLE DATEN) — nutze sie und antworte konkret und datenbasiert. Erfinde keine Werte; wenn etwas fehlt (z.B. Aktivität noch nicht von Coros synchronisiert), sag das ehrlich. Sag NIEMALS, dass du kein Tracking-System hast oder eine andere App nötig wäre — die geloggten Mahlzeiten, Trainings und Health-Werte stehen dir unten zur Verfügung. Wenn Felix eine zusammengesetzte Mahlzeit nennt (z.B. 'Brötchen mit Frischkäse und 5 Eiern'), logge JEDE Zutat als EIGENEN log_meal-Aufruf (ein Aufruf pro Lebensmittel, je mit Menge/Einheit + eigenen Nährwerten) — fasse sie NICHT zu einem Eintrag zusammen. Antworte kurz, konkret und auf Deutsch in der Du-Form. Kein Ersatz für Arzt/Coach bei medizinischen Fragen.";

// Baut aus dem echten App-Zustand einen kompakten Live-Kontext für den Coach.
function buildCoachContext(data) {
  const s = data.settings; const ctx = data.context[today] || {}; const nut = data.nutrition[today] || emptyDay();
  const eaten = [].concat(...MEALS.map(([k]) => nut[k] || [])).reduce((a, m) => ({ p: a.p + m.p, f: a.f + m.f, c: a.c + m.c, k: a.k + m.k }), { p: 0, f: 0, c: 0, k: 0 });
  const meals = MEALS.map(([k, label]) => { const it = nut[k] || []; return it.length ? label + ": " + it.map((m) => m.n + " (" + m.k + " kcal, " + m.p + "g P)").join(", ") : null; }).filter(Boolean);
  const act = typeof ctx.activity === "number" ? ctx.activity : null;
  const verbrauch = s.bmr + (act || 0);
  const plan = (data.plan[todayIdx] || []).map((x) => PDISC[x.disc].l + " " + x.detail).join(", ") || "Ruhetag";
  const recentW = [...(data.workouts || [])].slice(-3).reverse().map((w) => fmtShort(w.date) + " " + w.name).join("; ") || "keine geloggt";
  const days7 = Array.from({ length: 7 }, (_, i) => dstr(i));
  const acts7 = days7.map((d) => (data.context[d] || {}).activity).filter((v) => typeof v === "number");
  const w7 = (data.workouts || []).filter((w) => days7.includes(w.date)).length;
  const L = [];
  L.push("Datum: " + new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" }));
  L.push("Ziele: Grundumsatz " + s.bmr + " kcal, Protein " + s.protein + " g, Fett " + s.fat + " g, Kohlenhydrate " + s.carbs + " g.");
  L.push("Heute gegessen: " + eaten.k + " kcal (" + eaten.p + "g Protein, " + eaten.f + "g Fett, " + eaten.c + "g KH).");
  L.push("Mahlzeiten heute: " + (meals.length ? meals.join(" | ") : "noch nichts geloggt"));
  L.push("Aktivitätsenergie heute (Coros): " + (act == null ? "noch nicht synchronisiert" : act + " kcal") + ". Gesamtverbrauch: " + verbrauch + " kcal. Bilanz: " + (eaten.k - verbrauch) + " kcal.");
  L.push("Noch offen: " + Math.max(0, s.protein - eaten.p) + " g Protein, " + (verbrauch - eaten.k) + " kcal bis zum Verbrauch.");
  if (ctx.sleep != null) L.push("Schlaf letzte Nacht: " + ctx.sleep + " h.");
  if (ctx.rhf != null) L.push("Ruhepuls: " + ctx.rhf + " bpm.");
  if (ctx.weight != null) L.push("Gewicht: " + ctx.weight + " kg.");
  L.push("Plan heute: " + plan + ".");
  L.push("Letzte Workouts: " + recentW + ". Letzte 7 Tage: " + w7 + " Workouts, Aktiv-Energie-Summe " + (acts7.reduce((a, b) => a + b, 0) || 0) + " kcal.");
  return L.join("\n");
}

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
        <div className="scroll" style={{ flex: 1, padding: "env(safe-area-inset-top) 0 calc(96px + env(safe-area-inset-bottom))" }}>
          {tab === "home" && <Home data={data} />}
          {tab === "train" && <Training data={data} commit={commit} active={active} setActive={setActive} />}
          {tab === "food" && <Food data={data} commit={commit} />}
          {tab === "analyse" && <Analyse data={data} />}
        </div>

        {!chatOpen && (
          <button onClick={() => setChatOpen(true)} aria-label="KI-Coach"
            style={{ position: "fixed", bottom: "calc(84px + env(safe-area-inset-bottom))", right: "max(16px, calc(50% - 214px))", width: 54, height: 54, borderRadius: 27, border: "none", cursor: "pointer", zIndex: 45,
              background: "linear-gradient(135deg, #4D86FF, #2E6BFF)", boxShadow: "0 8px 22px -6px rgba(46,107,255,.6)", display: "grid", placeItems: "center" }}>
            <Sparkles size={24} color="#fff" />
          </button>
        )}
        {chatOpen && <Coach msgs={msgs} setMsgs={setMsgs} close={() => setChatOpen(false)} data={data} commit={commit} />}

        <Nav tab={tab} setTab={setTab} active={!!active} />
      </div>
    </div>
  );
}

/* ================= COACH CHAT ================= */
const COACH_MEALS = { breakfast: "Frühstück", lunch: "Mittag", dinner: "Abend", snack: "Snack" };
function displayOf(m) {
  if (typeof m.content === "string") return m.content;
  if (Array.isArray(m.content)) {
    if (m.role === "user" && m.content.every((b) => b.type === "tool_result")) return null;
    const txt = m.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    if (txt) return txt;
    const tools = m.content.filter((b) => b.type === "tool_use");
    if (tools.length) return "📝 Eingetragen: " + tools.map((b) => (b.input && b.input.name) || "Mahlzeit").join(", ");
    return null;
  }
  return null;
}

function Coach({ msgs, setMsgs, close, data, commit }) {
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  useEffect(() => { endRef.current && endRef.current.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  const applyLogs = (logs) => {
    if (!logs.length) return;
    let nutri = { ...data.nutrition };
    for (const b of logs) {
      const meal = COACH_MEALS[b.input.meal] ? b.input.meal : "snack";
      const amt = Number(b.input.amount) || 1;
      const unit = b.input.unit || "Portion";
      const base = { k: Math.round(Number(b.input.kcal) || 0), p: Math.round(Number(b.input.protein) || 0), f: Math.round(Number(b.input.fat) || 0), c: Math.round(Number(b.input.carbs) || 0) };
      const label = String(b.input.name || "Mahlzeit") + (b.input.amount ? " · " + amt + " " + (UNIT_LABEL[unit] || unit) : "");
      const e = { n: label, k: base.k, p: base.p, f: base.f, c: base.c, ai: true, amount: amt, unit, per: amt, base };
      const day = nutri[today] || emptyDay();
      nutri = { ...nutri, [today]: { ...day, [meal]: [...(day[meal] || []), e] } };
    }
    commit({ ...data, nutrition: nutri });
  };

  const send = async () => {
    const t = text.trim(); if (!t || busy) return;
    let convo = [...msgs, { role: "user", content: t }]; setMsgs(convo); setText(""); setBusy(true);
    const sys = COACH_SYS + "\n\n## AKTUELLE DATEN\n" + buildCoachContext(data);
    try {
      for (let iter = 0; iter < 4; iter++) {
        const res = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: convo.map((m) => ({ role: m.role, content: m.content })), system: sys, tools: true }) }).then((r) => r.json());
        if (!res || !res.content) throw new Error("bad response");
        convo = [...convo, { role: "assistant", content: res.content }]; setMsgs(convo);
        if (res.stop_reason === "tool_use") {
          applyLogs(res.content.filter((b) => b.type === "tool_use" && b.name === "log_meal"));
          const results = res.content.filter((b) => b.type === "tool_use").map((b) => ({ type: "tool_result", tool_use_id: b.id, content: "Erfolgreich eingetragen." }));
          convo = [...convo, { role: "user", content: results }]; setMsgs(convo);
          continue;
        }
        break;
      }
    } catch (e) { setMsgs([...convo, { role: "assistant", content: "Hm, da ging was schief. Probier's nochmal." }]); }
    setBusy(false);
  };
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", background: H.bg }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "calc(16px + env(safe-area-inset-top)) 18px 16px", borderBottom: "1px solid " + H.line }}>
        <span style={{ width: 34, height: 34, borderRadius: 17, background: "linear-gradient(135deg,#4D86FF,#2E6BFF)", display: "grid", placeItems: "center" }}><Sparkles size={18} color="#fff" /></span>
        <div style={{ flex: 1 }}><div style={{ fontSize: 15.5, fontWeight: 750 }}>KI-Coach</div><div style={{ fontSize: 11.5, color: H.sub }}>kennt deinen Kontext</div></div>
        <button onClick={close} style={{ all: "unset", cursor: "pointer", color: H.sub }}><X size={22} /></button>
      </div>
      <div className="scroll" style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        {msgs.map((m, i) => { const disp = displayOf(m); if (disp == null) return null; return (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 10 }}>
            <div style={{ maxWidth: "82%", padding: "11px 14px", borderRadius: 16, fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap",
              background: m.role === "user" ? H.blue : H.card, color: m.role === "user" ? "#fff" : H.text, border: m.role === "user" ? "none" : "1px solid " + H.line,
              borderBottomRightRadius: m.role === "user" ? 4 : 16, borderBottomLeftRadius: m.role === "user" ? 16 : 4 }}>{disp}</div>
          </div>
        ); })}
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
  const [date, setDate] = useState(today); const [addTo, setAddTo] = useState(null); const [showSet, setShowSet] = useState(false); const [edit, setEdit] = useState(null);
  const touch = useRef(null); const set = data.settings;
  const day = (data.nutrition && data.nutrition[date]) || emptyDay();
  const all = [].concat(...MEALS.map(([k]) => day[k] || []));
  const sum = all.reduce((a, m) => ({ p: a.p + m.p, f: a.f + m.f, c: a.c + m.c, k: a.k + m.k }), { p: 0, f: 0, c: 0, k: 0 });
  const act = (data.context[date] && data.context[date].activity);
  const verbrauch = set.bmr + (act || 0); const bilanz = sum.k - verbrauch;

  const setDay = (next) => commit({ ...data, nutrition: { ...data.nutrition, [date]: next } });
  const addItem = (meal, item) => setDay({ ...day, [meal]: [...(day[meal] || []), item] });
  const delItem = (meal, idx) => setDay({ ...day, [meal]: day[meal].filter((_, j) => j !== idx) });
  const updItem = (meal, idx, ne) => setDay({ ...day, [meal]: day[meal].map((x, j) => (j === idx ? ne : x)) });
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
                <div onClick={() => setEdit({ meal: k, idx: i })} style={{ flex: 1, cursor: "pointer" }}><span style={{ fontSize: 13.5 }}>{m.n}{m.ai && <Sparkles size={11} color={H.blue} style={{ marginLeft: 5 }} />}</span><div style={{ fontSize: 11, color: H.faint, fontVariantNumeric: "tabular-nums", marginTop: 1 }}>{m.p}P · {m.f}F · {m.c}K · {m.k} kcal</div></div>
                <button onClick={() => delItem(k, i)} style={{ all: "unset", cursor: "pointer", color: H.faint, fontSize: 16, paddingLeft: 8 }}>×</button>
              </div>))}
            <button onClick={() => setAddTo(k)} style={{ width: "100%", marginTop: 9, padding: 9, borderRadius: 10, border: "1px dashed " + H.line, background: "transparent", color: H.sub, fontSize: 13, fontWeight: 650, cursor: "pointer" }}>+ Hinzufügen</button>
          </Card>); })}
        <div style={{ fontSize: 11, color: H.faint, textAlign: "center", marginTop: 6 }}>Wischen für anderen Tag · Aktivität live aus Coros</div>
      </div>

      {addTo && <AddFood mealLabel={MEALS.find((m) => m[0] === addTo)[1]} onAdd={(item) => { addItem(addTo, item); setAddTo(null); }} close={() => setAddTo(null)} />}
      {edit && day[edit.meal] && day[edit.meal][edit.idx] && <EditFood entry={day[edit.meal][edit.idx]} onSave={(ne) => { updItem(edit.meal, edit.idx, ne); setEdit(null); }} onDelete={() => { delItem(edit.meal, edit.idx); setEdit(null); }} close={() => setEdit(null)} />}
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
const UNIT_LABEL = { g: "g", ml: "ml", piece: "Stück", Portion: "Portion" };
const favAsFood = (f) => ({ name: f.n, brand: "", base_unit: "Portion", per: 1, kcal: f.k, protein: f.p, fat: f.f, carbs: f.c });
const blankForm = { name: "", brand: "", barcode: "", base_unit: "g", per: 100, kcal: "", protein: "", fat: "", carbs: "" };

function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let controls = null; let active = true;
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } } },
          videoRef.current,
          (result) => { if (result && active) { active = false; try { controls && controls.stop(); } catch (e) {} onDetected(result.getText()); } },
        );
      } catch (e) { setErr("Kamera nicht verfügbar — erlaube den Zugriff, oder gib den Barcode manuell ein."); }
    })();
    return () => { active = false; try { controls && controls.stop(); } catch (e) {} };
  }, []);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ position: "relative", borderRadius: 14, overflow: "hidden", background: "#000", aspectRatio: "4/3" }}>
        <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        <div style={{ position: "absolute", left: "10%", right: "10%", top: "44%", height: 2, background: H.down, boxShadow: "0 0 12px " + H.down }} />
      </div>
      {err && <div style={{ fontSize: 12.5, color: H.down, marginTop: 8 }}>{err}</div>}
      <div style={{ fontSize: 12, color: H.sub, textAlign: "center", marginTop: 8 }}>Barcode ins Bild halten …</div>
      <button onClick={onClose} style={{ width: "100%", marginTop: 10, padding: 12, borderRadius: 12, border: "1px solid " + H.line, background: "transparent", color: H.sub, fontWeight: 650, fontSize: 13.5, cursor: "pointer" }}>Abbrechen</button>
    </div>
  );
}

function EditFood({ entry, onSave, onDelete, close }) {
  const baseName = (entry.n || "").split(" · ")[0];
  const base = entry.base || { k: entry.k, p: entry.p, f: entry.f, c: entry.c };
  const per = Number(entry.per) || Number(entry.amount) || 1;
  const unit = entry.unit || "Portion";
  const [amount, setAmount] = useState(String(entry.amount != null ? entry.amount : per));
  const factor = (Number(amount) || 0) / (per || 1);
  const sc = (v) => Math.round((Number(v) || 0) * factor);
  const save = () => onSave({ ...entry, n: baseName + " · " + amount + " " + (UNIT_LABEL[unit] || unit), amount: Number(amount) || 0, unit, per, base, k: sc(base.k), p: sc(base.p), f: sc(base.f), c: sc(base.c) });
  return (<Sheet close={close} title="Bearbeiten">
    <div style={{ fontSize: 16, fontWeight: 720, marginBottom: 12 }}>{baseName}</div>
    <Field label={"Menge in " + (UNIT_LABEL[unit] || unit)}>
      <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoFocus className="fld" style={{ ...sheetInput, fontSize: 20, fontWeight: 750, textAlign: "center" }} />
    </Field>
    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      <Stat label="kcal" value={sc(base.k)} accent />
      <Stat label="Protein" value={sc(base.p) + " g"} />
      <Stat label="Fett" value={sc(base.f) + " g"} />
      <Stat label="KH" value={sc(base.c) + " g"} />
    </div>
    <button onClick={save} style={{ width: "100%", padding: 14, borderRadius: 13, border: "none", background: H.blue, color: "#fff", fontWeight: 750, fontSize: 15, cursor: "pointer" }}>Speichern</button>
    <button onClick={onDelete} style={{ width: "100%", marginTop: 8, padding: 12, borderRadius: 12, border: "1px solid " + H.line, background: "transparent", color: H.down, fontWeight: 650, fontSize: 13.5, cursor: "pointer" }}>Löschen</button>
  </Sheet>);
}

function AddFood({ mealLabel, onAdd, close }) {
  const [mode, setMode] = useState("search"); // search | portion | create | scan
  const [q, setQ] = useState("");
  const [library, setLibrary] = useState([]);
  const [selected, setSelected] = useState(null);
  const [amount, setAmount] = useState("");
  const [form, setForm] = useState(blankForm);
  const [text, setText] = useState(""); const [aiBusy, setAiBusy] = useState(false); const [err, setErr] = useState("");
  const [scanBusy, setScanBusy] = useState(false);

  useEffect(() => { (async () => {
    try { const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
      const { data } = await supabase.from("foods").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(300);
      setLibrary(data || []);
    } catch (e) {}
  })(); }, []);

  const results = (() => {
    const all = [...library, ...FAVS.map(favAsFood)];
    const s = q.trim().toLowerCase();
    return (s ? all.filter((f) => (f.name + " " + (f.brand || "")).toLowerCase().includes(s)) : all).slice(0, 60);
  })();

  const pick = (food) => { setSelected(food); setAmount(String(food.per || (food.base_unit === "g" || food.base_unit === "ml" ? 100 : 1))); setMode("portion"); };

  const factor = selected ? (Number(amount) || 0) / (Number(selected.per) || 1) : 0;
  const sc = (v) => Math.round((Number(v) || 0) * factor);

  const addPortion = () => {
    if (!selected) return;
    onAdd({
      n: selected.name + " · " + amount + " " + (UNIT_LABEL[selected.base_unit] || selected.base_unit),
      p: sc(selected.protein), f: sc(selected.fat), c: sc(selected.carbs), k: sc(selected.kcal),
      amount: Number(amount) || 0, unit: selected.base_unit, per: Number(selected.per) || 1,
      base: { k: Number(selected.kcal) || 0, p: Number(selected.protein) || 0, f: Number(selected.fat) || 0, c: Number(selected.carbs) || 0 },
    });
    close();
  };

  const saveAndPick = async () => {
    const f = { name: form.name.trim(), brand: form.brand.trim() || null, barcode: form.barcode || null, base_unit: form.base_unit, per: Number(form.per) || 100, kcal: Number(form.kcal) || 0, protein: Number(form.protein) || 0, fat: Number(form.fat) || 0, carbs: Number(form.carbs) || 0 };
    if (!f.name) return;
    try { const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase.from("foods").insert({ ...f, user_id: user.id }).select().single();
      const saved = data || f; setLibrary((l) => [saved, ...l]); pick(saved);
    } catch (e) { pick(f); }
  };

  const onDetected = async (code) => {
    setMode("create"); setScanBusy(true); setErr("");
    try {
      const r = await fetch("/api/food-lookup?barcode=" + encodeURIComponent(code)).then((x) => x.json());
      if (r.found) setForm({ name: r.name || "", brand: r.brand || "", barcode: code, base_unit: "g", per: 100, kcal: r.kcal ?? "", protein: r.protein ?? "", fat: r.fat ?? "", carbs: r.carbs ?? "" });
      else { setForm({ ...blankForm, barcode: code }); setErr("Produkt nicht in der Datenbank — bitte Werte manuell eintragen."); }
    } catch (e) { setForm({ ...blankForm, barcode: code }); setErr("Lookup fehlgeschlagen — Werte manuell eintragen."); }
    setScanBusy(false);
  };

  const est = async () => { if (!text.trim()) return; setAiBusy(true); setErr(""); try { const r = await estimateFood(text.trim()); onAdd({ ...r, amount: 1, unit: "Portion", per: 1, base: { k: r.k, p: r.p, f: r.f, c: r.c } }); close(); } catch (e) { setErr("KI-Schätzung fehlgeschlagen."); setAiBusy(false); } };

  const uf = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const title = mode === "portion" ? "Menge wählen" : mode === "create" ? "Lebensmittel anlegen" : mode === "scan" ? "Barcode scannen" : "Hinzufügen · " + mealLabel;

  return (<Sheet close={close} title={title}>
    {mode === "search" && <>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <button onClick={() => setMode("scan")} style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid " + H.blue, background: H.blueSoft, color: H.blue, fontWeight: 750, fontSize: 13.5, cursor: "pointer" }}>📷 Barcode scannen</button>
        <button onClick={() => { setForm(blankForm); setMode("create"); }} style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid " + H.line, background: H.bg2, color: H.text, fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>+ Neues Lebensmittel</button>
      </div>
      <div style={{ position: "relative", marginBottom: 10 }}><Search size={15} color={H.faint} style={{ position: "absolute", left: 12, top: 12 }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Lebensmittel suchen" className="fld" style={{ ...sheetInput, paddingLeft: 34 }} /></div>
      <div style={{ maxHeight: 300, overflowY: "auto" }} className="scroll">
        {results.map((f, i) => (
          <button key={(f.id || f.name) + i} onClick={() => pick(f)} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", boxSizing: "border-box", background: H.bg2, borderRadius: 11, padding: "11px 13px", marginBottom: 7 }}>
            <div style={{ fontSize: 14, fontWeight: 650 }}>{f.name}{f.brand ? <span style={{ color: H.faint, fontWeight: 400 }}> · {f.brand}</span> : null}</div>
            <div style={{ fontSize: 11.5, color: H.sub, fontVariantNumeric: "tabular-nums", marginTop: 1 }}>{f.kcal} kcal · {f.protein}P · {f.fat}F · {f.carbs}K <span style={{ color: H.faint }}>/ {f.per} {UNIT_LABEL[f.base_unit] || f.base_unit}</span></div>
          </button>
        ))}
        {results.length === 0 && <div style={{ fontSize: 13, color: H.faint, textAlign: "center", padding: "16px 0" }}>Nichts gefunden — leg es als neues Lebensmittel an oder scanne den Barcode.</div>}
      </div>
      <Label style={{ margin: "16px 0 8px", color: H.blue }}><Sparkles size={12} style={{ verticalAlign: "-2px" }} /> Oder mit KI schätzen</Label>
      <div style={{ display: "flex", gap: 8 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder='z.B. „Döner mit allem"' className="fld" style={{ ...sheetInput, flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter") est(); }} />
        <button onClick={est} disabled={aiBusy || !text.trim()} style={{ flexShrink: 0, padding: "0 16px", borderRadius: 11, border: "none", background: aiBusy || !text.trim() ? H.card : H.blue, color: aiBusy || !text.trim() ? H.faint : "#fff", fontWeight: 750, fontSize: 14, cursor: aiBusy ? "default" : "pointer" }}>{aiBusy ? "…" : "Schätzen"}</button>
      </div>
      {err && <div style={{ fontSize: 12.5, color: H.down, marginTop: 8 }}>{err}</div>}
    </>}

    {mode === "scan" && <>
      <BarcodeScanner onDetected={onDetected} onClose={() => setMode("search")} />
      <Field label="Barcode manuell eingeben"><input value={form.barcode} onChange={(e) => uf("barcode", e.target.value)} inputMode="numeric" placeholder="z.B. 4008400202037" className="fld" style={sheetInput} /></Field>
      <button disabled={!form.barcode} onClick={() => onDetected(form.barcode)} style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: form.barcode ? H.blue : H.card, color: form.barcode ? "#fff" : H.faint, fontWeight: 750, fontSize: 14.5, cursor: form.barcode ? "pointer" : "default" }}>Nachschlagen</button>
    </>}

    {mode === "create" && <>
      {scanBusy && <div style={{ fontSize: 13, color: H.blue, marginBottom: 10 }}>Schlage Barcode nach …</div>}
      <Field label="Name"><input value={form.name} onChange={(e) => uf("name", e.target.value)} placeholder="z.B. Magerquark" className="fld" style={sheetInput} /></Field>
      <Field label="Marke (optional)"><input value={form.brand} onChange={(e) => uf("brand", e.target.value)} className="fld" style={sheetInput} /></Field>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}><Field label="Werte pro"><input value={form.per} onChange={(e) => uf("per", e.target.value)} inputMode="numeric" className="fld" style={sheetInput} /></Field></div>
        <div style={{ flex: 1 }}><Field label="Einheit">
          <div style={{ display: "flex", gap: 4, background: H.bg2, padding: 4, borderRadius: 11 }}>
            {["g", "ml", "piece"].map((u) => <button key={u} onClick={() => uf("base_unit", u)} style={{ flex: 1, border: "none", cursor: "pointer", padding: "8px 0", borderRadius: 8, fontSize: 13, fontWeight: 700, background: form.base_unit === u ? H.card : "transparent", color: form.base_unit === u ? H.text : H.sub }}>{UNIT_LABEL[u]}</button>)}
          </div>
        </Field></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Field label="Kalorien (kcal)"><input value={form.kcal} onChange={(e) => uf("kcal", e.target.value)} inputMode="decimal" className="fld" style={sheetInput} /></Field>
        <Field label="Protein (g)"><input value={form.protein} onChange={(e) => uf("protein", e.target.value)} inputMode="decimal" className="fld" style={sheetInput} /></Field>
        <Field label="Fett (g)"><input value={form.fat} onChange={(e) => uf("fat", e.target.value)} inputMode="decimal" className="fld" style={sheetInput} /></Field>
        <Field label="Kohlenhydrate (g)"><input value={form.carbs} onChange={(e) => uf("carbs", e.target.value)} inputMode="decimal" className="fld" style={sheetInput} /></Field>
      </div>
      {err && <div style={{ fontSize: 12.5, color: H.amber, margin: "2px 0 8px" }}>{err}</div>}
      <button disabled={!form.name.trim()} onClick={saveAndPick} style={{ width: "100%", marginTop: 6, padding: 14, borderRadius: 13, border: "none", background: form.name.trim() ? H.blue : H.card, color: form.name.trim() ? "#fff" : H.faint, fontWeight: 750, fontSize: 15, cursor: form.name.trim() ? "pointer" : "default" }}>Speichern & Menge wählen</button>
      <button onClick={() => setMode("search")} style={{ width: "100%", marginTop: 8, padding: 10, borderRadius: 12, border: "none", background: "transparent", color: H.sub, fontSize: 13, cursor: "pointer" }}>‹ Zurück</button>
    </>}

    {mode === "portion" && selected && <>
      <div style={{ fontSize: 16, fontWeight: 720, marginBottom: 2 }}>{selected.name}</div>
      {selected.brand && <div style={{ fontSize: 12.5, color: H.faint, marginBottom: 12 }}>{selected.brand}</div>}
      <Field label={"Menge in " + (UNIT_LABEL[selected.base_unit] || selected.base_unit)}>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" autoFocus className="fld" style={{ ...sheetInput, fontSize: 20, fontWeight: 750, textAlign: "center" }} />
      </Field>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <Stat label="kcal" value={sc(selected.kcal)} accent />
        <Stat label="Protein" value={sc(selected.protein) + " g"} />
        <Stat label="Fett" value={sc(selected.fat) + " g"} />
        <Stat label="KH" value={sc(selected.carbs) + " g"} />
      </div>
      <button onClick={addPortion} style={{ width: "100%", padding: 14, borderRadius: 13, border: "none", background: H.blue, color: "#fff", fontWeight: 750, fontSize: 15, cursor: "pointer" }}>Zu {mealLabel} hinzufügen</button>
      <button onClick={() => setMode("search")} style={{ width: "100%", marginTop: 8, padding: 10, borderRadius: 12, border: "none", background: "transparent", color: H.sub, fontSize: 13, cursor: "pointer" }}>‹ Zurück</button>
    </>}
  </Sheet>);
}
function Macro({ label, v, t, color }) { const pct = Math.min(100, (v / t) * 100); return (<div style={{ marginBottom: 11 }}><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span><span style={{ fontSize: 12, color: H.sub, fontVariantNumeric: "tabular-nums" }}>{v}<span style={{ color: H.faint }}> / {t} g</span></span></div><Bar pct={pct} color={color} /></div>); }

/* ================= HOME ================= */
function Home({ data }) {
  const set = data.settings; const ctx = data.context[today] || {}; const nut = data.nutrition[today] || emptyDay();
  const eaten = [].concat(...MEALS.map(([k]) => nut[k] || [])).reduce((a, m) => ({ p: a.p + m.p, k: a.k + m.k }), { p: 0, k: 0 });
  const act = typeof ctx.activity === "number" ? ctx.activity : null;
  const verbrauch = set.bmr + (act || 0);
  const pLeft = Math.max(0, set.protein - eaten.p); const kLeft = verbrauch - eaten.k;
  const todayPlan = (data.plan[todayIdx] || []).map((s) => PDISC[s.disc].l + " " + s.detail).join(" · ") || "Ruhetag";
  const dash = (v, suf = "") => (v == null || v === "" ? "—" : v + suf);

  return (
    <Page title="Heute" sub={new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" })}>
      <Label style={{ margin: "0 4px 8px" }}>Heute · aus Apple Health</Label>
      <div style={{ display: "flex", gap: 9, marginBottom: 14 }}>
        <Stat label="Aktiv-kcal" value={dash(act)} accent />
        <Stat label="Schlaf" value={ctx.sleep != null ? ctx.sleep + " h" : "—"} />
        <Stat label="Ruhepuls" value={dash(ctx.rhf)} />
        <Stat label="Gewicht" value={ctx.weight != null ? ctx.weight + " kg" : "—"} />
      </div>

      <Card style={{ marginBottom: 14 }}>
        <Label style={{ marginBottom: 10 }}>Energiebilanz heute</Label>
        <div style={{ display: "flex" }}>
          <Bal label="Gegessen" v={eaten.k} />
          <Bal label="Verbrauch" v={verbrauch} sub={act == null ? "nur Grundumsatz" : "inkl. Coros"} />
          <Bal label={kLeft >= 0 ? "Übrig" : "Über"} v={Math.abs(kLeft)} strong />
        </div>
      </Card>

      <Label style={{ margin: "2px 4px 8px", color: H.blue }}><Dumbbell size={12} style={{ verticalAlign: "-2px" }} /> Plan heute</Label>
      <RecCard Icon={Dumbbell} c={H.blue} t={todayPlan} />

      <Label style={{ margin: "14px 4px 8px", color: H.up }}><Utensils size={12} style={{ verticalAlign: "-2px" }} /> Ernährung</Label>
      <RecCard Icon={Utensils} c={H.blue} t={pLeft > 0 ? "Noch " + pLeft + " g Protein bis zu deinem Ziel (" + set.protein + " g)." : "Protein-Ziel erreicht 💪"} />
      <RecCard Icon={Flame} c={kLeft >= 0 ? H.up : H.amber} t={act == null ? "Sobald Coros heute synct, siehst du hier dein Kalorien-Budget." : (kLeft >= 0 ? "Noch " + kLeft + " kcal bis zum Verbrauch (" + verbrauch + " kcal)." : Math.abs(kLeft) + " kcal über deinem Verbrauch.")} />
    </Page>
  );
}
const RecCard = ({ Icon, c, t }) => <div style={{ display: "flex", gap: 11, alignItems: "flex-start", background: H.card, borderRadius: 14, border: "1px solid " + H.line, borderLeft: "3px solid " + c, padding: "13px 14px", marginBottom: 8 }}><Icon size={16} color={c} style={{ marginTop: 1, flexShrink: 0 }} /><span style={{ fontSize: 13.5, lineHeight: 1.45 }}>{t}</span></div>;

/* ================= ANALYSE ================= */
function Analyse({ data }) {
  const days = Array.from({ length: 7 }, (_, i) => dstr(i)); // heute … -6 Tage
  const ctxOf = (d) => data.context[d] || {};
  const nums = (key) => days.map((d) => ctxOf(d)[key]).filter((v) => typeof v === "number");
  const sleeps = nums("sleep"); const acts = nums("activity"); const rhrs = nums("rhf");
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const workoutsWk = (data.workouts || []).filter((w) => days.includes(w.date));
  const protDays = days.map((d) => { const n = data.nutrition[d]; if (!n) return null; const p = [].concat(...MEALS.map(([k]) => n[k] || [])).reduce((a, m) => a + m.p, 0); return p > 0 ? p : null; }).filter((v) => v != null);
  // Gewicht: neuester & ältester Wert im Fenster
  let curW = null, oldW = null;
  for (const d of days) { const w = ctxOf(d).weight; if (typeof w === "number") { if (curW == null) curW = w; oldW = w; } }
  const wChange = curW != null && oldW != null ? Math.round((curW - oldW) * 10) / 10 : null;
  const r0 = (v) => (v == null ? "—" : Math.round(v));
  const r1 = (v) => (v == null ? "—" : Math.round(v * 10) / 10);

  const areas = [
    { Icon: Activity, c: H.blue, l: "Training", v: workoutsWk.length + " Einh.", n: "letzte 7 Tage" },
    { Icon: Watch, c: H.violet, l: "Schlaf", v: sleeps.length ? r1(avg(sleeps)) + " h" : "—", n: "Ø / Nacht" },
    { Icon: Flame, c: H.up, l: "Aktiv-Energie", v: acts.length ? r0(acts.reduce((a, b) => a + b, 0)) + " kcal" : "—", n: "Summe 7 Tage" },
    { Icon: Utensils, c: H.amber, l: "Protein", v: protDays.length ? r0(avg(protDays)) + " g" : "—", n: "Ø / erf. Tag" },
  ];

  return (
    <Page title="Wochenauswertung" sub="Letzte 7 Tage">
      <Label style={{ margin: "0 4px 8px" }}>Deine Daten</Label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 16 }}>{areas.map((a) => <Card key={a.l} style={{ padding: 13 }}><div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}><a.Icon size={14} color={a.c} /><span style={{ fontSize: 12, color: H.sub, fontWeight: 600 }}>{a.l}</span></div><div style={{ fontSize: 16, fontWeight: 750 }}>{a.v}</div><div style={{ fontSize: 11.5, color: H.faint, marginTop: 2 }}>{a.n}</div></Card>)}</div>

      <Label style={{ margin: "0 4px 8px" }}>Körper & Erholung</Label>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 9 }}>
          <Stat label="Gewicht" value={curW != null ? curW + " kg" : "—"} accent />
          <Stat label="7-Tage-Trend" value={wChange == null ? "—" : (wChange > 0 ? "+" : "") + wChange + " kg"} color={wChange != null && wChange <= 0 ? H.up : H.text} />
          <Stat label="Ruhepuls Ø" value={rhrs.length ? r0(avg(rhrs)) : "—"} />
        </div>
      </Card>

      <div style={{ fontSize: 11.5, color: H.faint, textAlign: "center", marginTop: 6, lineHeight: 1.5 }}>Basiert auf deinen echten Health- & App-Daten der letzten 7 Tage.<br />Wettkampf-Prognose kommt später mit richtiger Formel.</div>
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
  return (<div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 460, zIndex: 50, display: "flex", background: "rgba(13,13,16,.92)", backdropFilter: "blur(10px)", borderTop: "1px solid " + H.line, padding: "8px 0 calc(8px + env(safe-area-inset-bottom))" }}>
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
