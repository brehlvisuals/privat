"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import {
  Flame, Dumbbell, Utensils, BarChart3, Plus, X, ChevronLeft, ChevronRight,
  Sparkles, MapPin, Search, Trophy, Watch, Activity, Scale, CheckCircle2,
  AlertTriangle, Zap, Clock, Settings, ClipboardList, Send, MessageCircle,
  Camera, Mic, Pencil, HeartPulse, RefreshCw, Trash2, ArrowUp
} from "lucide-react";

// Apple-Design (iOS Dark Mode, Grouped-Stil): Systemfarben, keine Verläufe/Glows.
// Flächen (glass) sind halbtransparent weiß → passen sich an: auf Schwarz wirken
// sie wie iOS-Karten (#1C1C1E), in einem Sheet eine Ebene heller (#2C2C2E).
const H = {
  bg: "#000000", bg2: "rgba(118,118,128,0.24)", card: "#1C1C1E", cardHi: "#2C2C2E", line: "rgba(84,84,88,0.45)",
  text: "#FFFFFF", sub: "rgba(235,235,245,0.6)", faint: "rgba(235,235,245,0.38)", blue: "#7D7AFF", blueSoft: "rgba(125,122,255,0.18)",
  up: "#30D158", down: "#FF453A", amber: "#FF9F0A", violet: "#BF5AF2",
  glass: "rgba(255,255,255,0.1)", glassHi: "rgba(255,255,255,0.14)", glassLine: "rgba(255,255,255,0.05)",
  blueGlow: "rgba(0,0,0,0)", grad: "#7D7AFF", gradSoft: "#7D7AFF",
  // SF Pro Rounded für Zahlen (Apple-Fitness-Look), sonst Systemschrift.
  round: "ui-rounded, 'SF Pro Rounded', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  font: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif",
};

/* ---------- helpers ---------- */
const e1rm = (w, r) => Math.round(w * (1 + r / 30));
const bestSet = (s) => s.reduce((b, x) => (e1rm(x.w, x.r) > e1rm(b.w, b.r) ? x : b), s[0]);
// Bester passender Vorsatz: nächstliegendes Gewicht (Gleiches mit Gleichem),
// bei Gleichstand der stärkere Satz. So wird ein Satz mit dem vergleichbaren
// Vorsatz gepaart statt gegen einen lockeren Aufwärm-/High-Rep-Satz.
const matchPrev = (w, prevSets) => {
  const list = (prevSets || []).filter((p) => p && p.w != null && p.r != null);
  if (!list.length) return null;
  const cw = dec(w);
  return list.reduce((best, p) => {
    const dp = Math.abs(dec(p.w) - cw), db = Math.abs(dec(best.w) - cw);
    if (dp < db) return p;
    if (dp === db && e1rm(dec(p.w), dec(p.r)) > e1rm(dec(best.w), dec(best.r))) return p;
    return best;
  });
};
// Leistungs-Trend eines Satzes ggü. der letzten Session (Array prevSets): per
// e1RM (Gewicht×Wdh) gegen den bestpassenden Vorsatz. Grün = stärker, Rot =
// schwächer. Kein Wdh-Deckel — sonst könnten hohe-Wdh-Sätze bei gleichem
// Gewicht nie „grün" werden (blieben rot, egal wie viele Wdh man einträgt).
// Referenz-Sätze: alle bisherigen Sätze einer Übung über ALLE Trainings (All-Time),
// je mit pos (Position der Übung im damaligen Workout) und date. `until` filtert
// optional, welche Workouts zählen (z.B. nur die vor einem abgeschlossenen Training).
const exHistory = (workouts, ex, until) => {
  const match = (e) => (ex.exId && e.exId === ex.exId) || e.name === ex.name;
  const out = [];
  (workouts || []).forEach((wk) => {
    if (until && !until(wk)) return;
    wk.exercises.forEach((e, pos) => { if (match(e)) for (const s of e.sets) if (dec(s.w) && dec(s.r)) out.push({ w: dec(s.w), r: dec(s.r), pos, date: wk.date }); });
  });
  return out;
};
// All-Time-High = Satz mit dem höchsten e1RM.
const athOf = (sets) => (sets || []).reduce((b, s) => (!b || e1rm(s.w, s.r) > e1rm(b.w, b.r) ? s : b), null);

// Vergleich gegen den All-Time-Bestwert bei vergleichbarem Gewicht (matchPrev über
// alle bisherigen Sätze → bei gleichem Gewicht gewinnt der stärkste je erreichte).
// curPos = Position der Übung im aktuellen Workout; steht sie heute SPÄTER als beim
// Referenz-Satz, ist man vorermüdet → ein leichter Rückgang wird nicht rot.
const setTrend = (w, r, prevSets, curPos) => {
  if (w === "" || w == null || r === "" || r == null) return null;
  const prev = matchPrev(w, prevSets);
  if (!prev) return null;
  const later = curPos != null && prev.pos != null ? curPos - prev.pos : 0;
  const cur = e1rm(dec(w), dec(r)), ref = e1rm(dec(prev.w), dec(prev.r));
  if (!cur || !ref) return null;
  // Toleranzband ±2 %: praktisch gleichwertige Sätze bleiben neutral (weiß).
  // Steigerung (grün) zählt immer. Bei späterer Position wird die Rot-Schwelle
  // gelockert (~3 % je Platz, max 12 %), damit Vorermüdung nicht unfair rot macht.
  const diff = (cur - ref) / ref;
  if (diff > 0.02) return H.up;
  const negTh = Math.min(0.02 + Math.max(0, later) * 0.03, 0.12);
  if (diff < -negTh) return H.down;
  return null;
};
const dstr = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const today = dstr(0);
const fmtShort = (s) => new Date(s).toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
const dayLabel = (s) => s === today ? "Heute" : s === dstr(1) ? "Gestern" : s === dstr(-1) ? "Morgen" : new Date(s).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
// Deutsche Zahl-Anzeige: Komma statt Punkt. de1 = eine feste Nachkommastelle.
const de = (n) => String(n).replace(".", ",");
const de1 = (n) => n.toFixed(1).replace(".", ",");
// HRV eines Tages: manueller Eintrag (hrvLog) hat Vorrang, sonst aus Health (context).
const hrvOf = (data, date) => {
  const m = (data.hrvLog || {})[date];
  if (typeof m === "number") return m;
  const c = (data.context && data.context[date]) || {};
  return typeof c.hrv === "number" ? c.hrv : null;
};
// Aktivitäts-kcal eines Tages inkl. manueller Korrektur (activityAdj). null wenn gar nichts da.
const actOf = (data, date) => {
  const base = ((data.context && data.context[date]) || {}).activity;
  const adj = ((data.activityAdj || {})[date]) || 0;
  if ((base == null || typeof base !== "number") && !adj) return null;
  return Math.round((typeof base === "number" ? base : 0) + adj);
};
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
  hiddenFavs: [], // ausgeblendete Beispiel-Lebensmittel (FAVS)
  activityAdj: {}, // manuelle Aktivitäts-kcal-Korrektur pro Datum (überlebt Health-Sync)
  hrvLog: {}, // manuell eingetragene HRV pro Datum (Coros exportiert sie nicht)
});
let MEM = null;
let userId = null;
const supabase = createClient();
// Stabile ID für Tagebuch-Einträge (damit der Coach sie ändern/löschen kann).
let _idc = 0;
const mkid = () => "e" + Date.now().toString(36) + (_idc++).toString(36) + Math.floor(Math.random() * 1296).toString(36);
function migrate(d) {
  const s = seed();
  const m = { ...s, ...d, settings: { ...s.settings, ...(d.settings || {}) }, plan: d.plan || s.plan, context: { ...s.context, ...(d.context || {}) } };
  // Bestehenden Einträgen ohne id eine geben (Backfill).
  const nut = { ...(m.nutrition || {}) };
  for (const day of Object.keys(nut)) {
    const dd = { ...nut[day] };
    for (const [mk] of MEALS) {
      if (Array.isArray(dd[mk])) dd[mk] = dd[mk].map((e) => (e && e.id ? e : { ...e, id: mkid() }));
    }
    nut[day] = dd;
  }
  m.nutrition = nut;
  // Übungen ohne stabile id nachrüsten (sonst nicht editier-/löschbar).
  if (Array.isArray(m.exercises)) m.exercises = m.exercises.map((e) => (e && e.id ? e : { ...e, id: "x" + mkid() }));
  return m;
}

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
      ...(r.steps != null ? { steps: r.steps } : {}),
      ...(r.weight_kg != null ? { weight: Number(r.weight_kg) } : {}),
      ...(r.body_fat != null ? { bodyFat: Number(r.body_fat) } : {}),
      ...(r.sleep_score != null ? { sleepScore: r.sleep_score } : {}),
      ...(r.sleep_deep != null ? { sleepDeep: r.sleep_deep } : {}),
      ...(r.sleep_rem != null ? { sleepRem: r.sleep_rem } : {}),
      ...(r.avg_hr != null ? { avgHr: r.avg_hr } : {}),
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
    try { const { data: snap } = await supabase.from("coros_snapshot").select("data").eq("user_id", user.id).maybeSingle(); if (snap && snap.data) d.coros = snap.data; } catch (e) {}
    MEM = d;
    return d;
  } catch (e) { return MEM || s; }
}

let saveTimer = null;
async function writeState() {
  if (!userId || !MEM) return;
  // WICHTIG: awaiten! Der Postgrest-Builder ist "lazy" und feuert den Request
  // erst beim await/.then() — ohne await wird NIE geschrieben.
  try {
    const { error } = await supabase
      .from("app_state")
      .upsert({ user_id: userId, data: MEM, updated_at: new Date().toISOString() });
    if (error) console.error("app_state write error:", error);
  } catch (e) { console.error("app_state write exception:", e); }
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
const COACH_SYS = "Du bist der KI-Coach & Datenanalyst in Felix' privatem Performance OS. Felix ist pescetarischer Ironman-Triathlet, 26, 186 cm, ~83 kg. Er trainiert Schwimmen, Rad, Laufen, Kraft, Calisthenics.\n\nDATEN: Im Abschnitt AKTUELLE DATEN bekommst du seinen echten Verlauf: heutige Ernährung (inkl. Einträge mit id), Ernährungshistorie der letzten 14 Tage (kcal/Protein/Bilanz), tägliche Aktivität (Aktiv-kcal, Schritte) über ~3 Wochen aus Coros, den Coros-Fitnessstand (VO₂max, Laufniveau, Schwellentempo, Rennprognosen, Trainingsbelastung) und die letzten Krafttrainings mit Sätzen/Volumen. WICHTIG: Felix trägt seine Uhr NICHT nachts — Schlaf, HRV, Ruhepuls, Recovery und Readiness gibt es bewusst nicht. Frag nicht danach und stütze keine Empfehlungen darauf. Gewicht trackt er aktuell nicht. Nutze die vorhandenen Daten aktiv für konkrete Auswertungen (Kalorienbilanz, Protein, Trainingsprogression, Volumen, Belastung). Behaupte nie, keinen Zugriff zu haben, ohne zuerst in AKTUELLE DATEN zu schauen; steht ein Wert als '—', benenne genau welcher. Antworte kurz und auf den Punkt (meist unter 150 Wörtern), außer Felix will ausdrücklich Details.\n\nDu kannst aktiv in der App handeln über Tools:\n- log_meal: Gegessenes ins Tagebuch eintragen — für heute ODER rückwirkend (Feld 'date', YYYY-MM-DD, z.B. gestern). Bei zusammengesetzten Mahlzeiten JEDE Zutat als EIGENEN log_meal-Aufruf (nicht zusammenfassen), je mit Menge/Einheit + eigenen Nährwerten.\n- update_meal / delete_meal: bestehende Tagebuch-Einträge ändern oder löschen — anhand der [id: ...], die im Kontext hinter jedem Eintrag steht. Damit kannst du Mengen korrigieren, Werte anpassen oder Einträge entfernen.\n- create_food: ein festes Lebensmittel dauerhaft in Felix' Bibliothek anlegen, Nährwerte pro Referenzmenge.\n- adjust_activity: Aktiv-kcal (Coros/Apple Health) manuell korrigieren, auch rückwirkend per 'date' — z.B. 'addiere 500 kcal' → mode 'add', kcal 500.\nWenn du ein Tool sinnvoll einsetzen kannst, TU es direkt, statt Ausreden zu machen. Sei ein ehrlicher, fordernder Coach: klare Einordnung, konkrete Zahlen, umsetzbare Empfehlungen. Antworte auf Deutsch in der Du-Form. Kein Ersatz für Arzt bei medizinischen Fragen.";

// Baut aus dem echten App-Zustand den Live-Kontext für den Coach: Ziele,
// Heute-Detail, Aktivität über Wochen, Coros-Fitness, Ernährungshistorie und
// Trainings. (Kein Schlaf/HRV/Ruhepuls — Uhr wird nachts nicht getragen.)
function buildCoachContext(data) {
  const s = data.settings;
  const dayTot = (nn) => [].concat(...MEALS.map(([k]) => (nn && nn[k]) || [])).reduce((a, m) => ({ p: a.p + m.p, f: a.f + m.f, c: a.c + m.c, k: a.k + m.k }), { p: 0, f: 0, c: 0, k: 0 });
  const ctx = data.context[today] || {};
  const nut = data.nutrition[today] || emptyDay();
  const eaten = dayTot(nut);
  const meals = MEALS.map(([k, label]) => { const it = nut[k] || []; return it.length ? label + ": " + it.map((m) => m.n + " (" + m.k + " kcal, " + m.p + "g P)").join(", ") : null; }).filter(Boolean);
  const act = actOf(data, today);
  const verbrauch = s.bmr + (act || 0);
  const carbGoal = Math.max(0, Math.round((verbrauch - s.protein * 4 - s.fat * 9) / 4));
  const num = (v) => (v == null ? "—" : v);
  const L = [];

  L.push("== HEUTE (" + today + ", " + new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" }) + ") ==");
  L.push("Ziele: Grundumsatz " + s.bmr + " kcal, Protein " + s.protein + "g (fix), Fett " + s.fat + "g (fix), Kohlenhydrate = Rest-Kalorien/4 (heute Ziel " + carbGoal + "g).");
  L.push("Gegessen: " + eaten.k + " kcal (" + eaten.p + "g P, " + eaten.f + "g F, " + eaten.c + "g KH). Mahlzeiten: " + (meals.length ? meals.join(" | ") : "noch nichts"));
  L.push("Aktiv-kcal: " + num(act) + ", Gesamtverbrauch " + verbrauch + " kcal, Bilanz " + (eaten.k - verbrauch) + " kcal. Noch offen: " + Math.max(0, s.protein - eaten.p) + "g Protein, " + (verbrauch - eaten.k) + " kcal.");

  // Einzel-Einträge mit id (für update_meal/delete_meal) — heute + gestern.
  const entryLines = (dd) => {
    const nn = data.nutrition[dd]; if (!nn) return [];
    const out = [];
    for (const [mk, label] of MEALS) for (const e of (nn[mk] || [])) out.push("  " + label + " › " + e.n + " (" + e.k + " kcal, " + e.p + "g P) [id: " + (e.id || "?") + "]");
    return out;
  };
  const todayEntries = entryLines(today);
  if (todayEntries.length) { L.push("Einträge heute (per id änderbar/löschbar):"); L.push(todayEntries.join("\n")); }
  const yEntries = entryLines(dstr(1));
  if (yEntries.length) { L.push("Einträge gestern (" + dstr(1) + "):"); L.push(yEntries.join("\n")); }

  // Coros-Fitnessstand (tagsüber gültig): VO₂max, Rennprognosen, Trainingsbelastung.
  const co = data.coros || {};
  if (co.fitness || co.load) {
    L.push("\n== COROS-FITNESS (aktuell) ==");
    if (co.fitness) { const f = co.fitness; L.push("Fitness: VO₂max " + num(f.vo2max) + ", Laufniveau " + num(f.runningLevel) + ", Schwellentempo " + num(f.threshold) + ". Rennprognosen — 5k " + num(f.pred5k) + ", 10k " + num(f.pred10k) + ", HM " + num(f.predHM) + ", Marathon " + num(f.predM) + "."); }
    if (co.load) L.push("Trainingsbelastung: " + num(co.load.comment) + " — Kurzzeit-Load " + num(co.load.short) + ", Langzeit-Load " + num(co.load.long) + ", Ratio " + num(co.load.ratio) + ".");
  }

  // Tages-Metriken der letzten 21 Tage
  L.push("\n== AKTIVITÄT je Tag (Aktiv-kcal / Schritte, Coros) ==");
  const dayLines = [];
  for (let i = 0; i <= 21; i++) {
    const dd = dstr(i); const c = data.context[dd]; const a = actOf(data, dd);
    if (a == null && !(c && c.steps != null)) continue;
    dayLines.push(fmtShort(dd) + ": Akt " + num(a) + " kcal, Schritte " + num(c && c.steps));
  }
  L.push(dayLines.length ? dayLines.join("\n") : "keine Aktivitätsdaten");

  // Ernährungshistorie der letzten 14 Tage
  L.push("\n== ERNÄHRUNG letzte 14 Tage (kcal / Protein / Bilanz) ==");
  const nutLines = [];
  for (let i = 1; i <= 14; i++) {
    const dd = dstr(i); const nn = data.nutrition[dd]; if (!nn) continue;
    const tot = dayTot(nn); if (!tot.k) continue;
    const vb = s.bmr + (actOf(data, dd) || 0);
    nutLines.push(fmtShort(dd) + ": " + tot.k + " kcal, " + tot.p + "g P, Bilanz " + (tot.k - vb) + " kcal");
  }
  L.push(nutLines.length ? nutLines.join("\n") : "keine älteren Einträge");

  // Trainings (letzte 12, mit Details)
  L.push("\n== TRAININGS (letzte 12) ==");
  const ws = [...(data.workouts || [])].slice(-12).reverse();
  if (ws.length) {
    L.push(ws.map((w) => {
      const sets = w.exercises.reduce((a, e) => a + e.sets.length, 0);
      const vol = w.exercises.reduce((a, e) => a + e.sets.reduce((ss, x) => ss + x.w * x.r, 0), 0);
      const exs = w.exercises.map((e) => e.name + " (" + e.sets.map((x) => x.w + "×" + x.r).join(",") + ")").join("; ");
      return fmtShort(w.date) + ' "' + w.name + '": ' + w.durationMin + " min, " + sets + " Sätze, " + (vol / 1000).toFixed(1) + " t — " + exs;
    }).join("\n"));
  } else L.push("keine geloggt");

  return L.join("\n");
}

// KI-Auswertungen (Workout-Detail, Ernährung): Anweisung, Ergebnis-Box, Button.
const COACH_ANALYST = "Du bist ein präziser, ehrlicher Performance-Coach für Felix (pescetarischer Ironman-Triathlet, 26, 186cm, ~82kg). Analysiere die gegebenen Daten konkret und knapp auf Deutsch (Du-Form). Nenne 2-4 konkrete Beobachtungen/Empfehlungen, keine Floskeln, kein Fließtext-Roman. Nutze Zahlen aus den Daten. Schlaf, HRV und Ruhepuls werden nicht getrackt.";
const aiBoxStyle = { background: H.glass, borderRadius: 16, padding: 16, marginBottom: 12 };
const aiBtnStyle = { width: "100%", height: 46, borderRadius: 12, border: "none", background: H.blueSoft, color: H.blue, fontWeight: 600, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 };
function AiAnalysis({ prompt, cta, title }) {
  const [txt, setTxt] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const run = async () => { setBusy(true); setErr(""); try { const r = await callClaude([{ role: "user", content: typeof prompt === "function" ? prompt() : prompt }], COACH_ANALYST); setTxt((r || "").trim() || "Keine Analyse erhalten."); } catch (e) { setErr("gerade nicht verfügbar"); } setBusy(false); };
  if (txt) return (<div className="glass fade-in" style={aiBoxStyle}><div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8, color: H.blue, fontSize: 11, fontWeight: 750, letterSpacing: 0.5, textTransform: "uppercase" }}><Sparkles size={13} /> {title || "KI-Analyse"}</div><div style={{ fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{txt}</div></div>);
  return (<button onClick={run} disabled={busy} className="press" style={{ ...aiBtnStyle, opacity: busy ? 0.7 : 1 }}><Sparkles size={15} /> {busy ? "Analysiere …" : (cta || "KI-Analyse")}{err && <span style={{ color: H.down, fontWeight: 600 }}> · {err}</span>}</button>);
}

// Persönliche Rekorde je Übung (Top-Gewicht + bestes e1RM).
function prList(data) {
  const byEx = {};
  for (const w of data.workouts || []) for (const e of w.exercises) {
    const key = e.exId || e.name;
    const rec = byEx[key] || { name: e.name, topW: 0, topWset: null, bestE: 0, bestEset: null, date: w.date };
    for (const x of e.sets) {
      if (x.w > rec.topW) { rec.topW = x.w; rec.topWset = x; rec.date = w.date; }
      const er = e1rm(x.w, x.r); if (er > rec.bestE) { rec.bestE = er; rec.bestEset = x; }
    }
    byEx[key] = rec;
  }
  return Object.values(byEx).filter((r) => r.topW > 0).sort((a, b) => b.bestE - a.bestE);
}

/* ================= SPLASH ================= */
function Splash() {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "#000", display: "grid", placeItems: "center", animation: "splashOut 1.65s ease forwards", pointerEvents: "none" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        <div style={{ width: 100, height: 100, borderRadius: 28, background: "linear-gradient(140deg,#9A8CFF,#6E5CFF 55%,#4A38C4)", display: "grid", placeItems: "center", animation: "popIn .5s cubic-bezier(.32,.72,0,1) both" }}>
          <svg width="66" height="66" viewBox="0 0 512 512">
            <polyline points="118,338 210,262 296,306 392,168" fill="none" stroke="#fff" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="430" strokeDashoffset="430" style={{ animation: "draw .95s .25s cubic-bezier(.65,0,.35,1) forwards" }} />
            <circle cx="392" cy="168" r="27" fill="#fff" style={{ opacity: 0, animation: "popDot .45s 1s forwards" }} />
          </svg>
        </div>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.01em", color: "#fff", animation: "popIn .5s .3s both" }}>Performance OS</div>
      </div>
    </div>
  );
}

/* ================= APP ================= */
export default function App() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("home");
  const [active, setActive] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [splash, setSplash] = useState(true);
  // Coach-Verlauf + „schreibt gerade" leben hier oben: Schließen/Öffnen während
  // einer Antwort verliert nichts und kann keinen zweiten Request dazwischenfunken.
  const [msgs, setMsgs] = useState([COACH_HELLO]);
  const [coachBusy, setCoachBusy] = useState(false);
  useEffect(() => { load().then(setData); }, []);
  useEffect(() => { const t = setTimeout(() => setSplash(false), 1650); return () => clearTimeout(t); }, []);
  // Laufendes Training lokal sichern, damit ein versehentliches App-Schließen es
  // nicht verliert — beim Start wiederherstellen, bei jeder Änderung speichern.
  const activeLoaded = useRef(false);
  useEffect(() => { try { const s = localStorage.getItem("perfos_active"); if (s) setActive(JSON.parse(s)); } catch (e) {} }, []);
  useEffect(() => {
    if (!activeLoaded.current) { activeLoaded.current = true; return; } // Mount-Lauf überspringen (nichts überschreiben)
    try { if (active) localStorage.setItem("perfos_active", JSON.stringify(active)); else localStorage.removeItem("perfos_active"); } catch (e) {}
  }, [active]);
  if (!data) return <div style={{ background: H.bg, minHeight: "100dvh" }}>{splash && <Splash />}</div>;
  const commit = (d) => { setData(d); persist(d); };
  const reload = () => load().then(setData);

  return (
    <div style={{ position: "relative", minHeight: "100dvh", background: H.bg, fontFamily: H.font, color: H.text }}>
      <Style />
      {splash && <Splash />}
      <div className="rotate-hint">📱 Bitte im Hochformat nutzen — Performance OS ist fürs Hochformat gebaut.</div>
      <div style={{ maxWidth: 460, margin: "0 auto", minHeight: "100dvh", position: "relative", display: "flex", flexDirection: "column" }}>
        <div id="appscroll" className="scroll" style={{ flex: 1, padding: "env(safe-area-inset-top) 0 calc(100px + env(safe-area-inset-bottom))" }}>
          <div key={tab} className="fade-in">
            {tab === "home" && <Home data={data} commit={commit} reload={reload} goTrain={() => setTab("train")} />}
            {tab === "train" && <Training data={data} commit={commit} active={active} setActive={setActive} />}
            {tab === "food" && <Food data={data} commit={commit} />}
          </div>
        </div>

        {!chatOpen && (
          <button onClick={() => setChatOpen(true)} aria-label="KI-Coach" className="press"
            style={{ position: "fixed", bottom: "calc(76px + env(safe-area-inset-bottom))", right: "max(16px, calc(50% - 214px))", width: 52, height: 52, borderRadius: 26, border: "none", cursor: "pointer", zIndex: 45,
              background: H.blue, boxShadow: "0 8px 24px rgba(0,0,0,.55)", display: "grid", placeItems: "center" }}>
            <Sparkles size={23} color="#fff" />
          </button>
        )}
        {chatOpen && <Coach msgs={msgs} setMsgs={setMsgs} close={() => setChatOpen(false)} data={data} commit={commit} busy={coachBusy} setBusy={setCoachBusy} reset={() => setMsgs([COACH_HELLO])} />}

        <Nav tab={tab} setTab={setTab} active={!!active} />
      </div>
    </div>
  );
}

/* ================= COACH CHAT ================= */
// local: nur Anzeige, wird nicht an die KI geschickt.
const COACH_HELLO = { role: "assistant", local: true, content: "Moin Felix! Frag mich was zu Training oder Ernährung — oder schreib mir bzw. schick ein Foto von dem, was du gegessen hast, dann trage ich es ein." };
const COACH_MEALS = { breakfast: "Frühstück", lunch: "Mittag", dinner: "Abend", snack: "Snack" };
const TOOL_LABEL = { log_meal: "📝 Eingetragen", create_food: "🥗 Lebensmittel angelegt", adjust_activity: "🔥 Aktiv-kcal angepasst" };
function displayOf(m) {
  if (typeof m.content === "string") return m.content;
  if (Array.isArray(m.content)) {
    if (m.role === "user" && m.content.every((b) => b.type === "tool_result")) return null;
    const hasImg = m.content.some((b) => b.type === "image");
    const txt = m.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    if (m.role === "user") return (hasImg ? "📷 " : "") + (txt || (hasImg ? "Foto" : ""));
    if (txt) return txt;
    const tools = m.content.filter((b) => b.type === "tool_use");
    if (tools.length) return tools.map((b) => (TOOL_LABEL[b.name] || "✓") + (b.input && b.input.name ? ": " + b.input.name : "")).join("\n");
    return null;
  }
  return null;
}

function Coach({ msgs, setMsgs, close, data, commit, busy, setBusy, reset }) {
  const [text, setText] = useState("");
  const [img, setImg] = useState(null); // { media_type, data(base64), preview }
  const [rec, setRec] = useState(false);
  const endRef = useRef(null); const fileRef = useRef(null); const recogRef = useRef(null);
  useEffect(() => { endRef.current && endRef.current.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  // Führt die Tool-Aktionen des Coaches aus, gibt tool_result-Inhalte zurück.
  const applyActions = async (toolUses, startData) => {
    let d = startData; const results = [];
    for (const b of toolUses) {
      const inp = b.input || {};
      try {
        if (b.name === "log_meal") {
          const mday = /^\d{4}-\d{2}-\d{2}$/.test(inp.date || "") ? inp.date : today;
          const meal = COACH_MEALS[inp.meal] ? inp.meal : "snack";
          const amt = dec(inp.amount) || 1; const unit = inp.unit || "Portion";
          const base = { k: Math.round(dec(inp.kcal)), p: Math.round(dec(inp.protein)), f: Math.round(dec(inp.fat)), c: Math.round(dec(inp.carbs)) };
          const label = String(inp.name || "Mahlzeit") + (inp.amount ? " · " + amt + " " + (UNIT_LABEL[unit] || unit) : "");
          const e = { id: mkid(), n: label, k: base.k, p: base.p, f: base.f, c: base.c, ai: true, amount: amt, unit, per: amt, base };
          const day = d.nutrition[mday] || emptyDay();
          d = { ...d, nutrition: { ...d.nutrition, [mday]: { ...day, [meal]: [...(day[meal] || []), e] } } };
          results.push({ id: b.id, content: "Eingetragen für " + (mday === today ? "heute" : mday) + ": " + label + " (" + base.k + " kcal, " + base.p + "g P)." });
        } else if (b.name === "adjust_activity") {
          const date = /^\d{4}-\d{2}-\d{2}$/.test(inp.date || "") ? inp.date : today;
          const kcal = Math.round(dec(inp.kcal));
          const baseVal = ((d.context && d.context[date]) || {}).activity;
          const baseNum = typeof baseVal === "number" ? baseVal : 0;
          const nextAdj = inp.mode === "set" ? (kcal - baseNum) : (((d.activityAdj || {})[date]) || 0) + kcal;
          d = { ...d, activityAdj: { ...(d.activityAdj || {}), [date]: nextAdj } };
          results.push({ id: b.id, content: "Aktiv-kcal für " + date + " " + (inp.mode === "set" ? "gesetzt auf " + kcal : ((kcal >= 0 ? "+" : "") + kcal)) + ". Neuer Wert: " + (actOf(d, date) == null ? "—" : actOf(d, date)) + " kcal." });
        } else if (b.name === "create_food") {
          const f = { name: String(inp.name || "").trim(), brand: (inp.brand || "").trim() || null, barcode: null, base_unit: inp.base_unit || "g", per: dec(inp.per) || 100, kcal: dec(inp.kcal), protein: dec(inp.protein), fat: dec(inp.fat), carbs: dec(inp.carbs) };
          try { const { data: { user } } = await supabase.auth.getUser(); if (user) await supabase.from("foods").insert({ ...f, user_id: user.id }); } catch (e) {}
          results.push({ id: b.id, content: 'Lebensmittel "' + f.name + '" in der Bibliothek angelegt (' + f.kcal + " kcal / " + f.per + " " + f.base_unit + ")." });
        } else if (b.name === "delete_meal") {
          const tid = String(inp.id || ""); let found = false; const nn = { ...d.nutrition };
          for (const dd of Object.keys(nn)) {
            const day = nn[dd]; const nd = { ...day }; let changed = false;
            for (const [mk] of MEALS) { const arr = day[mk] || []; if (arr.some((x) => x.id === tid)) { nd[mk] = arr.filter((x) => x.id !== tid); changed = true; found = true; } }
            if (changed) nn[dd] = nd;
          }
          if (found) d = { ...d, nutrition: nn };
          results.push({ id: b.id, content: found ? "Eintrag gelöscht." : "Kein Eintrag mit dieser id gefunden." });
        } else if (b.name === "update_meal") {
          const tid = String(inp.id || ""); let found = false; const nn = { ...d.nutrition };
          for (const dd of Object.keys(nn)) {
            const day = nn[dd]; const nd = { ...day }; let changed = false;
            for (const [mk] of MEALS) {
              const arr = day[mk] || []; const idx = arr.findIndex((x) => x.id === tid);
              if (idx >= 0) {
                const cur = arr[idx];
                const namePart = inp.name != null ? String(inp.name) : (cur.n || "").split(" · ")[0];
                const unit = inp.unit || cur.unit || "Portion";
                const amount = inp.amount != null ? dec(inp.amount) : cur.amount;
                let k = cur.k, p = cur.p, f = cur.f, c = cur.c;
                if (inp.kcal != null || inp.protein != null || inp.fat != null || inp.carbs != null) {
                  if (inp.kcal != null) k = Math.round(dec(inp.kcal));
                  if (inp.protein != null) p = Math.round(dec(inp.protein));
                  if (inp.fat != null) f = Math.round(dec(inp.fat));
                  if (inp.carbs != null) c = Math.round(dec(inp.carbs));
                } else if (inp.amount != null && cur.base && cur.per) {
                  const factor = dec(inp.amount) / (cur.per || 1);
                  k = Math.round(cur.base.k * factor); p = Math.round(cur.base.p * factor); f = Math.round(cur.base.f * factor); c = Math.round(cur.base.c * factor);
                }
                const label = namePart + (amount != null ? " · " + amount + " " + (UNIT_LABEL[unit] || unit) : "");
                nd[mk] = arr.map((x, j) => (j === idx ? { ...cur, n: label, k, p, f, c, amount, unit } : x)); changed = true; found = true;
              }
            }
            if (changed) nn[dd] = nd;
          }
          if (found) d = { ...d, nutrition: nn };
          results.push({ id: b.id, content: found ? "Eintrag aktualisiert." : "Kein Eintrag mit dieser id gefunden." });
        } else { results.push({ id: b.id, content: "OK." }); }
      } catch (e) { results.push({ id: b.id, content: "Aktion fehlgeschlagen." }); }
    }
    if (d !== startData) commit(d);
    return { results, nextData: d };
  };

  // Für die API aufbereiten: lokale Hinweise (Begrüßung/Fehler) raus, Fotos nur
  // aus der aktuellen Runde mitschicken (ältere → Platzhalter) und den Verlauf
  // begrenzen. Sonst wird jede Folgeanfrage größer — Base64-Fotos sprengen
  // schnell das 4,5-MB-Limit und der Coach „hakt" ab der zweiten Nachricht.
  const toApi = (list, turnStart) => {
    const out = [];
    list.forEach((m, i) => {
      if (m.local) return;
      let c = m.content;
      if (Array.isArray(c) && i < turnStart) c = c.map((b) => (b.type === "image" ? { type: "text", text: "[Foto von vorhin]" } : b));
      out.push({ role: m.role, content: c });
    });
    return out.length > 30 ? out.slice(-30) : out;
  };

  const send = async () => {
    const t = text.trim(); if ((!t && !img) || busy) return;
    const userContent = img
      ? [...(t ? [{ type: "text", text: t }] : [{ type: "text", text: "Was ist das? Schätze die Nährwerte." }]), { type: "image", source: { type: "base64", media_type: img.media_type, data: img.data } }]
      : t;
    // Sauberer Ausgangs-Verlauf (nur bis zur neuen User-Nachricht). Bei einem Fehler
    // fallen wir hierauf zurück, damit kein unvollständiges Tool-Paar hängen bleibt.
    const baseMsgs = [...msgs.filter((m) => !m.error), { role: "user", content: userContent }];
    const turnStart = baseMsgs.length - 1;
    const sentImg = img;
    let convo = baseMsgs; setMsgs(convo); setText(""); setImg(null); setBusy(true);
    let work = data;
    const sys = COACH_SYS + "\n\n## AKTUELLE DATEN\n" + buildCoachContext(data);
    try {
      for (let iter = 0; iter < 5; iter++) {
        const ctrl = new AbortController(); const tmo = setTimeout(() => ctrl.abort(), 75000);
        let resp;
        try { resp = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal, body: JSON.stringify({ messages: toApi(convo, turnStart), system: sys, tools: true }) }); }
        finally { clearTimeout(tmo); }
        let res = null; try { res = await resp.json(); } catch (e) { /* keine JSON-Antwort */ }
        if (!resp.ok || !res || !res.content || res.error) { const err = new Error((res && res.error) || (resp.ok ? "keine gültige Antwort vom Server" : "HTTP " + resp.status)); err.status = resp.status; throw err; }
        convo = [...convo, { role: "assistant", content: res.content }]; setMsgs(convo);
        // Tools ausführen, sobald Tool-Blöcke da sind — auch bei stop_reason "max_tokens".
        const toolUses = res.content.filter((b) => b.type === "tool_use");
        if (toolUses.length) {
          const { results, nextData } = await applyActions(toolUses, work); work = nextData;
          convo = [...convo, { role: "user", content: results.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: r.content })) }]; setMsgs(convo);
          continue;
        }
        break;
      }
    } catch (e) {
      // Kaputten (unvollständigen) Tool-Verlauf verwerfen, nur die User-Nachricht + Hinweis behalten.
      const why = e && e.name === "AbortError" ? "Das hat zu lange gedauert." : e && e.status === 413 ? "Die Anfrage war zu groß (z.B. Foto)." : "Das hat gerade nicht geklappt" + (e && e.message ? " (" + e.message + ")" : "") + ".";
      // Fehlgeschlagene Frage aus dem Verlauf nehmen und Text/Foto zurück ins
      // Eingabefeld legen — ein erneutes Senden schickt sie dann sauber einmal.
      setMsgs([...msgs.filter((m) => !m.error), { role: "assistant", content: why + " Deine Nachricht steht wieder unten — einfach nochmal senden.", local: true, error: true }]);
      setText(t); setImg(sentImg);
    }
    setBusy(false);
  };

  // Fotos vor dem Senden verkleinern (max. 1280 px, JPEG) — iPhone-Fotos sind
  // sonst mehrere MB groß und reißen das Request-Limit.
  const onPickImg = (e) => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      const im = new Image();
      im.onload = () => {
        const sc = Math.min(1, 1280 / Math.max(im.width, im.height));
        const cv = document.createElement("canvas"); cv.width = Math.round(im.width * sc); cv.height = Math.round(im.height * sc);
        cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
        const url = cv.toDataURL("image/jpeg", 0.82);
        setImg({ media_type: "image/jpeg", data: url.split(",")[1] || "", preview: url });
      };
      im.onerror = () => setImg({ media_type: file.type || "image/jpeg", data: src.split(",")[1] || "", preview: src });
      im.src = src;
    };
    reader.readAsDataURL(file); e.target.value = "";
  };

  const toggleDictation = async () => {
    const SR = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (!SR) { alert("Sprach-Diktat wird in der installierten App auf dem iPhone leider nicht unterstützt.\n\nTipp: Tippe ins Textfeld und nutze das 🎤-Symbol direkt auf der iOS-Tastatur — das diktiert genauso in den Chat."); return; }
    if (rec && recogRef.current) { try { recogRef.current.stop(); } catch (e) {} return; }
    // Mikrofon-Berechtigung vorab anstoßen (hilft in einigen WebViews/PWAs).
    try { if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); } } catch (e) {}
    const base = text;
    const r = new SR(); r.lang = "de-DE"; r.interimResults = true; r.continuous = false;
    r.onresult = (ev) => { let s = ""; for (let i = 0; i < ev.results.length; i++) s += ev.results[i][0].transcript; setText((base ? base.replace(/\s*$/, "") + " " : "") + s); };
    r.onerror = (ev) => {
      setRec(false); recogRef.current = null;
      const err = ev && ev.error;
      if (err === "not-allowed" || err === "service-not-allowed") alert("Mikrofon-Zugriff fehlt. Erlaube ihn in den iPhone-Einstellungen — oder nutze das 🎤 auf der Tastatur.");
      else if (err && err !== "no-speech" && err !== "aborted") alert("Diktat gerade nicht möglich (" + err + "). Nutze sonst das 🎤 auf der iOS-Tastatur.");
    };
    r.onend = () => { setRec(false); recogRef.current = null; };
    recogRef.current = r; setRec(true); try { r.start(); } catch (e) { setRec(false); recogRef.current = null; }
  };

  const canSend = !busy && (text.trim() || img);
  return (
    <div className="fade-in" style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", flexDirection: "column", background: H.bg }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "calc(10px + env(safe-area-inset-top)) 12px 10px", background: "rgba(22,22,24,0.85)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", borderBottom: "0.5px solid rgba(84,84,88,0.65)" }}>
        <button onClick={reset} disabled={busy} className="press" style={{ all: "unset", cursor: busy ? "default" : "pointer", color: busy ? H.faint : H.blue, fontSize: 16, padding: "4px 6px", width: 92 }}>Neuer Chat</button>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontSize: 17, fontWeight: 600 }}>Coach</div>
          <div style={{ fontSize: 12, color: H.sub }}>{busy ? "schreibt …" : "kennt deine Daten"}</div>
        </div>
        <div style={{ width: 92, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={close} className="press" aria-label="Schließen" style={{ all: "unset", cursor: "pointer", width: 30, height: 30, borderRadius: 15, background: H.bg2, display: "grid", placeItems: "center", color: H.sub }}><X size={16} strokeWidth={2.6} /></button>
        </div>
      </div>
      <div className="scroll" style={{ flex: 1, overflowY: "auto", padding: "14px 12px" }}>
        {msgs.map((m, i) => { const disp = displayOf(m); if (disp == null) return null; const me = m.role === "user"; return (
          <div key={i} style={{ display: "flex", justifyContent: me ? "flex-end" : "flex-start", marginBottom: 6 }}>
            <div style={{ maxWidth: "80%", padding: "9px 14px", borderRadius: 19, fontSize: 16, lineHeight: 1.38, whiteSpace: "pre-wrap", overflowWrap: "anywhere",
              background: me ? H.blue : m.error ? "rgba(255,69,58,0.18)" : H.cardHi, color: me ? "#fff" : H.text }}>{disp}</div>
          </div>
        ); })}
        {busy && (
          <div style={{ display: "flex", marginBottom: 6 }}>
            <div className="typing" style={{ padding: "12px 14px", borderRadius: 19, background: H.cardHi, display: "flex", gap: 5 }}><i /><i /><i /></div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div style={{ padding: "8px 10px", paddingBottom: "calc(8px + env(safe-area-inset-bottom))", background: "rgba(22,22,24,0.85)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", borderTop: "0.5px solid rgba(84,84,88,0.65)" }}>
        {img && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, background: H.bg2, borderRadius: 14, padding: 7 }}>
            <img src={img.preview} alt="" style={{ width: 44, height: 44, borderRadius: 9, objectFit: "cover" }} />
            <span style={{ flex: 1, fontSize: 14, color: H.sub }}>Foto angehängt</span>
            <button onClick={() => setImg(null)} className="press" aria-label="Foto entfernen" style={{ all: "unset", cursor: "pointer", color: H.sub, padding: "0 6px" }}><X size={18} /></button>
          </div>
        )}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPickImg} style={{ display: "none" }} />
          <button onClick={() => fileRef.current && fileRef.current.click()} aria-label="Foto" className="press" style={{ all: "unset", cursor: "pointer", width: 36, height: 36, display: "grid", placeItems: "center", color: H.blue, flexShrink: 0 }}><Camera size={23} /></button>
          <button onClick={toggleDictation} aria-label="Diktieren" className="press" style={{ all: "unset", cursor: "pointer", width: 36, height: 36, borderRadius: 18, display: "grid", placeItems: "center", color: rec ? "#fff" : H.blue, background: rec ? H.down : "transparent", flexShrink: 0 }}><Mic size={22} /></button>
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", background: H.bg2, borderRadius: 20, padding: "3px 3px 3px 14px" }}>
            <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} placeholder={rec ? "Sprich jetzt …" : "Nachricht"} enterKeyHint="send"
              style={{ flex: 1, minWidth: 0, padding: "7px 0", border: "none", background: "transparent", color: H.text, fontSize: 17, outline: "none" }} />
            <button onClick={send} disabled={!canSend} aria-label="Senden" className="press" style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 15, border: "none", background: canSend ? H.blue : "rgba(118,118,128,0.4)", color: "#fff", cursor: canSend ? "pointer" : "default", display: "grid", placeItems: "center" }}><ArrowUp size={18} strokeWidth={2.8} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= TRAINING ================= */
function Training({ data, commit, active, setActive }) {
  const [mode, setMode] = useState("workout");
  const [detailEx, setDetailEx] = useState(null);
  const [detailW, setDetailW] = useState(null);
  const [picker, setPicker] = useState(false);
  const sessForEx = (id) => data.workouts.flatMap((w) => w.exercises.filter((e) => e.exId === id).map((e) => ({ date: w.date, sets: e.sets, note: e.note }))).sort((a, b) => a.date.localeCompare(b.date));
  // Übung bearbeiten: Bibliothek UND alle bisherigen Trainings mitziehen (Name/Gym),
  // damit Verlauf, Bestwerte & Listen nach dem Umbenennen konsistent bleiben.
  const renameEx = (id, patch) => {
    const old = data.exercises.find((x) => x.id === id);
    const hit = (e) => e.exId === id || (!e.exId && old && e.name === old.name);
    const wPatch = {}; if (patch.name) wPatch.name = patch.name; if (patch.gym !== undefined) wPatch.gym = patch.gym;
    commit({ ...data,
      exercises: data.exercises.map((x) => (x.id === id ? { ...x, ...patch } : x)),
      workouts: data.workouts.map((w) => (w.exercises.some(hit) ? { ...w, exercises: w.exercises.map((e) => (hit(e) ? { ...e, ...wPatch, exId: id } : e)) } : w)),
    });
  };
  // Übung löschen: nur aus der Bibliothek — geloggte Trainings bleiben erhalten.
  const deleteEx = (id) => commit({ ...data, exercises: data.exercises.filter((x) => x.id !== id) });

  // Scroll-Position der Liste merken: beim Öffnen eines Details sichern, bei
  // Rückkehr wiederherstellen; beim Wechsel des Segments zurück nach oben.
  const scrollY = useRef(0); const pending = useRef(false);
  const scrollEl = () => (typeof document !== "undefined" ? document.getElementById("appscroll") : null);
  const openDetail = (fn) => { const el = scrollEl(); scrollY.current = el ? el.scrollTop : 0; pending.current = true; fn(); };
  const setSeg = (m) => { pending.current = false; const el = scrollEl(); if (el) el.scrollTop = 0; setMode(m); };
  useEffect(() => {
    if (mode === "workout" || mode === "library" || mode === "records") {
      const el = scrollEl();
      if (el && pending.current) { requestAnimationFrame(() => { el.scrollTop = scrollY.current; pending.current = false; }); }
    }
  }, [mode]);

  if (mode === "detail" && detailEx) return <Detail ex={detailEx} sess={sessForEx(detailEx.id)} context={data.context} back={() => setMode("library")} onSave={(patch) => { setDetailEx({ ...detailEx, ...patch }); renameEx(detailEx.id, patch); }} onDelete={() => { deleteEx(detailEx.id); setMode("library"); }} />;
  if (mode === "wdetail" && detailW) { const w = data.workouts.find((x) => x.id === detailW) || null; if (!w) { setMode("workout"); return null; } return <WorkoutDetail w={w} data={data} back={() => setMode("workout")} onSave={(nw) => commit({ ...data, workouts: data.workouts.map((x) => (x.id === nw.id ? nw : x)) })} onDelete={() => { commit({ ...data, workouts: data.workouts.filter((x) => x.id !== w.id) }); setMode("workout"); }} />; }

  const startWorkout = () => setActive({ name: "", startedAt: Date.now(), exercises: [] });
  const addEx = (ex) => { setActive((a) => ({ ...a, exercises: [...a.exercises, { exId: ex.id, name: ex.name, gym: ex.gym, note: "", sets: [] }] })); setPicker(false); };
  const createEx = (ex) => { const id = "c" + Date.now(); commit({ ...data, exercises: [...data.exercises, { ...ex, id, custom: true }] }); return { ...ex, id }; };
  const finish = () => {
    const exs = active.exercises.map((e) => ({ ...e, sets: e.sets.filter((s) => dec(s.w) && dec(s.r)).map((s) => ({ w: dec(s.w), r: dec(s.r) })) })).filter((e) => e.sets.length);
    if (exs.length) { const dur = Math.max(1, Math.round((Date.now() - active.startedAt) / 60000)); commit({ ...data, workouts: [...data.workouts, { id: "w" + Date.now(), date: today, name: (active.name || "").trim() || "Workout", durationMin: dur, exercises: exs }] }); }
    setActive(null);
  };

  return (
    <Page title={active ? "Aktives Workout" : "Training"}>
      {!active && (
        <Segmented value={mode} onChange={setSeg} items={[["workout", "Workouts"], ["library", "Übungen"], ["records", "Rekorde"]]} />
      )}
      {active ? <ActiveWorkout active={active} setActive={setActive} openPicker={() => setPicker(true)} finish={finish} data={data} />
        : mode === "workout" ? (
          <>
            <button onClick={startWorkout} className="press" style={{ ...primaryBtn, marginBottom: 18 }}>Neues Workout starten</button>
            {data.workouts.length === 0 && <div style={{ color: H.faint, fontSize: 13.5, textAlign: "center", padding: "18px 0" }}>Noch keine Workouts. Starte oben dein erstes.</div>}
            {(() => {
              const sorted = [...data.workouts].sort((a, b) => b.date.localeCompare(a.date));
              const groups = []; let curKey = null;
              for (const w of sorted) { const key = (w.date || "").slice(0, 7); if (key !== curKey) { groups.push({ key, label: new Date((w.date || today) + "T00:00:00").toLocaleDateString("de-DE", { month: "long", year: "numeric" }), items: [] }); curKey = key; } groups[groups.length - 1].items.push(w); }
              return groups.map((g) => (
                <div key={g.key}>
                  <Label style={{ margin: "14px 4px 8px" }}>{g.label} · {g.items.length}</Label>
                  {g.items.map((w) => { const sets = w.exercises.reduce((a, e) => a + e.sets.length, 0); const vol = w.exercises.reduce((a, e) => a + e.sets.reduce((s, x) => s + x.w * x.r, 0), 0); return (
                    <div key={w.id} style={{ display: "flex", alignItems: "stretch", background: H.glass, borderRadius: 16, marginBottom: 9, overflow: "hidden" }}>
                      <button onClick={() => openDetail(() => { setDetailW(w.id); setMode("wdetail"); })} style={{ all: "unset", cursor: "pointer", flex: 1, minWidth: 0, boxSizing: "border-box", padding: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontSize: 15, fontWeight: 720 }}>{w.name}</span><span style={{ fontSize: 12, color: H.sub }}>{dayLabel(w.date) === "Heute" ? "Heute" : fmtShort(w.date)} <ChevronRight size={13} color={H.faint} style={{ verticalAlign: "-2px" }} /></span></div>
                        <div style={{ fontSize: 12.5, color: H.sub, marginTop: 4, display: "flex", gap: 12 }}><span><Clock size={11} style={{ verticalAlign: "-1px" }} /> {w.durationMin} min</span><span>{w.exercises.length} Üb · {sets} Sätze</span><span>{(vol / 1000).toFixed(1)} t</span></div>
                        <div style={{ fontSize: 12.5, color: H.faint, marginTop: 6 }}>{w.exercises.map((e) => e.name).join(" · ")}</div>
                      </button>
                      <button onClick={() => { if (typeof window !== "undefined" && !window.confirm("Workout „" + w.name + "“ vom " + fmtShort(w.date) + " löschen?")) return; commit({ ...data, workouts: data.workouts.filter((x) => x.id !== w.id) }); }} title="Workout löschen" className="press" style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", padding: "0 15px", color: H.faint, fontSize: 19, borderLeft: "1px solid " + H.line }}>×</button>
                    </div>); })}
                </div>
              ));
            })()}
          </>
        ) : mode === "records" ? <Records data={data} />
        : <Library data={data} open={(ex) => openDetail(() => { setDetailEx(ex); setMode("detail"); })} createEx={createEx} del={(ex) => deleteEx(ex.id)} editEx={renameEx} />}
      {picker && <ExercisePicker data={data} onPick={addEx} onCreate={(ex) => addEx(createEx(ex))} close={() => setPicker(false)} />}
    </Page>
  );
}

function Records({ data }) {
  const prs = prList(data);
  const topVol = (() => { let best = null; for (const w of data.workouts || []) { const v = w.exercises.reduce((a, e) => a + e.sets.reduce((s, x) => s + x.w * x.r, 0), 0); if (!best || v > best.v) best = { v, name: w.name, date: w.date }; } return best; })();
  if (!prs.length) return <div style={{ color: H.faint, fontSize: 13.5, textAlign: "center", padding: "24px 0" }}>Noch keine Rekorde — logge ein Workout mit Gewichten, dann erscheinen hier deine Bestwerte.</div>;
  return (<div className="rise">
    {topVol && <Card style={{ marginBottom: 14, background: H.grad, border: "none", boxShadow: "0 10px 28px -10px " + H.blueGlow }}>
      <div style={{ fontSize: 10.5, letterSpacing: 0.6, textTransform: "uppercase", fontWeight: 750, color: "rgba(255,255,255,.8)" }}>🏆 Größtes Workout-Volumen</div>
      <div style={{ fontSize: 30, fontWeight: 820, color: "#fff", letterSpacing: -1, marginTop: 3 }}>{(topVol.v / 1000).toFixed(1)} t</div>
      <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.8)", marginTop: 2 }}>{topVol.name} · {fmtShort(topVol.date)}</div>
    </Card>}
    <Label style={{ margin: "0 4px 8px" }}>Persönliche Rekorde je Übung</Label>
    {prs.map((r, i) => (
      <Card key={i} style={{ marginBottom: 9, display: "flex", alignItems: "center", gap: 12, padding: "13px 15px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 720, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
          <div style={{ fontSize: 11.5, color: H.faint, marginTop: 2 }}>Top-Satz {r.topWset.w}×{r.topWset.r} · {fmtShort(r.date)}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 820, color: H.blue, fontVariantNumeric: "tabular-nums", letterSpacing: -0.5 }}>{r.topW} kg</div>
          <div style={{ fontSize: 10.5, color: H.faint }}>e1RM {r.bestE} kg</div>
        </div>
      </Card>
    ))}
  </div>);
}

function WorkoutDetail({ w, data, back, onDelete, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(w);
  const src = editing ? draft : w;
  // Sätze derselben Übung aus dem letzten Workout VOR diesem (für Farb-Vergleich).
  // Referenz: alle Sätze dieser Übung aus Trainings VOR diesem (All-Time-Stand von
  // damals) — so zeigt grün, ob ein Satz zu dem Zeitpunkt ein neuer Bestwert war.
  const allW = (data && data.workouts) || [];
  const wIdx = allW.findIndex((x) => x.id === w.id);
  const before = (x) => x.id !== w.id && (x.date < w.date || (x.date === w.date && allW.indexOf(x) < wIdx));
  const prevSetsFor = (ex) => { const h = exHistory(allW, ex, before); return h.length ? h : null; };
  const totalSets = src.exercises.reduce((a, e) => a + e.sets.length, 0);
  const vol = src.exercises.reduce((a, e) => a + e.sets.reduce((s, x) => s + dec(x.w) * dec(x.r), 0), 0);
  const totalReps = src.exercises.reduce((a, e) => a + e.sets.reduce((s, x) => s + dec(x.r), 0), 0);
  const nS = (label, v) => <div style={{ flex: 1 }}><div style={{ fontSize: 10, color: H.faint, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>{label}</div><div style={{ fontSize: 13, fontWeight: 700, marginTop: 2, color: H.text, fontVariantNumeric: "tabular-nums" }}>{v}</div></div>;

  const updEx = (i, fn) => setDraft((d) => ({ ...d, exercises: d.exercises.map((e, j) => (j === i ? fn(e) : e)) }));
  const rmEx = (i) => setDraft((d) => ({ ...d, exercises: d.exercises.filter((_, j) => j !== i) }));
  const startEdit = () => { setDraft(w); setEditing(true); };
  const cancel = () => { setDraft(w); setEditing(false); };
  const save = () => {
    const cleaned = { ...draft, name: (draft.name || "").trim() || "Workout",
      exercises: draft.exercises.map((e) => ({ ...e, name: (e.name || "").trim() || e.name, sets: e.sets.filter((s) => dec(s.w) && dec(s.r)).map((s) => ({ w: dec(s.w), r: dec(s.r) })) })).filter((e) => e.sets.length) };
    onSave && onSave(cleaned); setEditing(false);
  };

  const editAction = editing
    ? <button onClick={save} className="press" style={{ ...iconBtn, color: H.up, fontWeight: 750, fontSize: 14, width: "auto", padding: "0 6px" }}>Fertig</button>
    : <button onClick={startEdit} className="press" style={iconBtn} title="Bearbeiten"><Settings size={18} color={H.sub} /></button>;

  return (
    <Page title={editing ? "Bearbeiten" : src.name} backFn={editing ? cancel : back} action={editAction}
      subEl={!editing && <span style={{ fontSize: 13, color: H.sub }}>{dayLabel(src.date)} · <Clock size={12} style={{ verticalAlign: "-2px" }} /> {src.durationMin} min</span>}>
      {editing && <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Workout-Name" className="fld"
        style={{ width: "100%", marginBottom: 14, padding: "13px 14px", borderRadius: 13, border: "1px solid transparent", background: H.bg2, color: H.text, fontSize: 16, fontWeight: 700, boxSizing: "border-box", outline: "none" }} />}
      {!editing && <div style={{ display: "flex", gap: 9, marginBottom: 16 }}>
        <Stat label="Volumen" value={(vol / 1000).toFixed(1) + " t"} accent />
        <Stat label="Sätze" value={totalSets} />
        <Stat label="Wdh gesamt" value={totalReps} />
      </div>}
      <Label style={{ margin: "0 4px 8px" }}>Übungen</Label>
      {src.exercises.map((e, i) => {
        if (editing) return (
          <Card key={i} style={{ marginBottom: 9 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input value={e.name} onChange={(ev) => updEx(i, (x) => ({ ...x, name: ev.target.value }))} className="fld" style={{ flex: 1, padding: "10px 12px", borderRadius: 11, border: "1px solid transparent", background: H.bg2, color: H.blue, fontSize: 15, fontWeight: 720, boxSizing: "border-box", outline: "none" }} />
              <button onClick={() => rmEx(i)} className="press" style={{ all: "unset", cursor: "pointer", color: H.faint, fontSize: 18, padding: "0 4px" }}>×</button>
            </div>
            <SetTable sets={e.sets.map((s) => ({ w: String(s.w), r: String(s.r) }))} onChange={(sets) => updEx(i, (x) => ({ ...x, sets }))} />
          </Card>
        );
        const evol = e.sets.reduce((s, x) => s + x.w * x.r, 0);
        const best = e.sets.length ? bestSet(e.sets) : null;
        const top = best ? e1rm(best.w, best.r) : 0;
        const prevSets = editing ? null : prevSetsFor(e);
        const ath = athOf(prevSets);
        const later = ath ? i - ath.pos : 0;
        return (
          <Card key={i} style={{ marginBottom: 9 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontSize: 15, fontWeight: 720, color: H.blue }}>{e.name}</span><span style={{ fontSize: 12, color: H.sub }}>{e.sets.length} Sätze</span></div>
            {e.gym && <div style={{ fontSize: 11.5, color: H.faint, marginTop: 1 }}><MapPin size={10} style={{ verticalAlign: "-1px" }} /> {e.gym}</div>}
            {ath && <div style={{ fontSize: 11.5, color: H.sub, marginTop: 4 }}>🏆 Bestwert davor: <b style={{ color: H.text }}>{de(ath.w)}×{ath.r}</b> · e1RM {e1rm(ath.w, ath.r)} kg</div>}
            {ath && later !== 0 && <div style={{ fontSize: 11, color: later > 0 ? H.amber : H.sub, marginTop: 3, fontWeight: 600 }}>Reihenfolge: Bestwert war Übung #{ath.pos + 1}, hier #{i + 1}{later > 0 ? " · vorermüdet, milder gewertet" : ""}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "26px 1fr 1fr", gap: 8, margin: "10px 0 2px" }}>{["#", "KG", "WDH"].map((h, j) => <span key={j} style={{ fontSize: 10, letterSpacing: 1, color: H.faint, fontWeight: 700, textAlign: j ? "left" : "center" }}>{h}</span>)}</div>
            {e.sets.map((s, j) => {
              const col = setTrend(s.w, s.r, prevSets, i);
              return (
              <div key={j} style={{ display: "grid", gridTemplateColumns: "26px 1fr 1fr", gap: 8, alignItems: "center", padding: "4px 0" }}>
                <span style={{ width: 22, height: 22, borderRadius: 6, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 750, margin: "0 auto", background: H.bg2, color: H.sub }}>{j + 1}</span>
                <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: col || H.text }}>{s.w} kg</span>
                <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: col || H.text }}>{s.r}</span>
              </div>
            ); })}
            <div style={{ display: "flex", gap: 14, marginTop: 10, paddingTop: 10, borderTop: "1px solid " + H.line }}>
              {nS("Volumen", (evol / 1000).toFixed(2) + " t")}
              {nS("Bester Satz", best ? best.w + " × " + best.r : "—")}
              {nS("e1RM", top + " kg")}
            </div>
            {e.note && <div style={{ fontSize: 13, color: H.sub, marginTop: 9, fontStyle: "italic" }}>„{e.note}“</div>}
          </Card>
        );
      })}
      {!editing && <AiAnalysis title="Workout-Analyse" cta="KI: dieses Workout auswerten" prompt={() => {
        const exs = src.exercises.map((e) => e.name + ": " + e.sets.map((x) => x.w + "×" + x.r).join(", ")).join("\n");
        return "Analysiere dieses Krafttraining vom " + src.date + ' ("' + src.name + '", ' + src.durationMin + " min, Volumen " + (vol / 1000).toFixed(1) + " t):\n" + exs + "\n\nGib eine kurze Einordnung: Satz-/Volumen-Qualität, mögliche Schwachstellen (z.B. wenig Sätze pro Muskelgruppe, Reps zu niedrig/hoch), und 1-2 konkrete Tipps für nächstes Mal.";
      }} />}
      <button onClick={onDelete} className="press" style={{ width: "100%", marginTop: 4, padding: 12, borderRadius: 12, border: "none", background: H.bg2, color: H.down, fontWeight: 650, fontSize: 13.5, cursor: "pointer" }}>Workout löschen</button>
    </Page>
  );
}

const restChip = { border: "none", background: H.bg2, color: H.text, borderRadius: 10, padding: "7px 11px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" };
function RestTimer() {
  const [end, setEnd] = useState(null);
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!end) return;
    const tick = () => { const l = Math.max(0, Math.round((end - Date.now()) / 1000)); setLeft(l); if (l <= 0) { setEnd(null); try { navigator.vibrate && navigator.vibrate([120, 60, 120]); } catch (e) {} } };
    tick(); const t = setInterval(tick, 250); return () => clearInterval(t);
  }, [end]);
  const mm = String(Math.floor(left / 60)).padStart(2, "0"), ss = String(left % 60).padStart(2, "0");
  if (!end) return (
    <div style={{ display: "flex", gap: 6, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, color: H.faint, marginRight: 2 }}>Pause-Timer:</span>
      {[60, 90, 120, 180].map((s) => <button key={s} onClick={() => setEnd(Date.now() + s * 1000)} className="press" style={restChip}>{s < 120 ? s + "s" : (s / 60) + " min"}</button>)}
    </div>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, background: H.blueSoft, border: "none", borderRadius: 14, padding: "10px 12px" }}>
      <Clock size={16} color={H.blue} />
      <span style={{ fontSize: 20, fontWeight: 800, color: H.blue, fontVariantNumeric: "tabular-nums", minWidth: 56 }}>{mm}:{ss}</span>
      <div style={{ flex: 1 }} />
      <button onClick={() => setEnd((e) => (e || Date.now()) + 30000)} className="press" style={restChip}>+30s</button>
      <button onClick={() => setEnd(null)} className="press" style={{ ...restChip, color: H.down }}>Stop</button>
    </div>
  );
}
function ActiveWorkout({ active, setActive, openPicker, finish, data }) {
  const updEx = (i, fn) => setActive((a) => ({ ...a, exercises: a.exercises.map((e, j) => (j === i ? fn(e) : e)) }));
  const rmEx = (i) => setActive((a) => ({ ...a, exercises: a.exercises.filter((_, j) => j !== i) }));
  const setName = (v) => setActive((a) => ({ ...a, name: v }));
  const [el, setEl] = useState(0);
  useEffect(() => { const t = setInterval(() => setEl(Math.round((Date.now() - active.startedAt) / 1000)), 1000); return () => clearInterval(t); }, [active.startedAt]);
  const mm = String(Math.floor(el / 60)).padStart(2, "0"), ss = String(el % 60).padStart(2, "0");
  // Letzte Session dieser Übung (nach exId, sonst Name) für „letztes Mal"-Anzeige.
  // prevPos = an welcher Position (0-basiert) die Übung damals im Workout stand.
  const lastSets = (ex) => {
    const match = (e) => (ex.exId && e.exId === ex.exId) || e.name === ex.name;
    const past = (data.workouts || []).filter((w) => w.exercises.some(match));
    if (!past.length) return null;
    const w = past[past.length - 1];
    const idx = w.exercises.findIndex(match);
    const e = w.exercises[idx];
    return e && e.sets.length ? { date: w.date, sets: e.sets, prevPos: idx } : null;
  };
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10 }}>
        <span style={{ fontSize: 14, color: H.sub, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}><Clock size={13} style={{ verticalAlign: "-2px" }} /> {mm}:{ss}</span>
        <button onClick={finish} className="press" style={{ border: "none", background: H.up, color: "#06281C", padding: "8px 16px", borderRadius: 10, fontWeight: 750, fontSize: 13, cursor: "pointer", flexShrink: 0 }}>Beenden & speichern</button>
      </div>
      <input value={active.name} onChange={(e) => setName(e.target.value)} placeholder="Workout-Name (z.B. Push A, Beine, Oberkörper)" className="fld"
        style={{ width: "100%", marginBottom: 12, padding: "13px 14px", borderRadius: 13, border: "1px solid transparent", background: H.bg2, color: H.text, fontSize: 16, fontWeight: 700, boxSizing: "border-box", outline: "none" }} />
      <RestTimer />
      {active.exercises.length === 0 && <div style={{ color: H.faint, fontSize: 14, textAlign: "center", padding: "30px 0" }}>Noch keine Übung. Füg unten welche hinzu.</div>}
      {active.exercises.map((ex, i) => { const last = lastSets(ex); const hist = exHistory(data.workouts, ex); const ath = athOf(hist); const later = ath ? i - ath.pos : 0; return (
        <Card key={i} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div><div style={{ fontSize: 17, fontWeight: 720, color: H.blue }}>{ex.name}</div>{ex.gym && <div style={{ fontSize: 11.5, color: H.faint, marginTop: 1 }}><MapPin size={10} style={{ verticalAlign: "-1px" }} /> {ex.gym}</div>}</div>
            <button onClick={() => rmEx(i)} className="press" style={{ all: "unset", cursor: "pointer", color: H.faint, fontSize: 18 }}>×</button>
          </div>
          {ath && <div style={{ fontSize: 12, color: H.text, marginTop: 6, background: "rgba(52,224,161,.08)", border: "1px solid rgba(52,224,161,.22)", borderRadius: 9, padding: "7px 10px" }}>🏆 Bestwert: <b>{de(ath.w)}×{ath.r}</b> <span style={{ color: H.sub }}>· e1RM {e1rm(ath.w, ath.r)} kg · {fmtShort(ath.date)}</span></div>}
          {last && <div style={{ fontSize: 11.5, color: H.faint, marginTop: 5, background: H.bg2, borderRadius: 9, padding: "7px 10px" }}>Letztes Mal ({fmtShort(last.date)}): {last.sets.map((x) => x.w + "×" + x.r).join("  ·  ")}</div>}
          {ath && later !== 0 && <div style={{ fontSize: 11, color: later > 0 ? H.amber : H.sub, marginTop: 5, fontWeight: 600 }}>Reihenfolge: Bestwert war Übung #{ath.pos + 1}, heute #{i + 1}{later > 0 ? " · vorermüdet, Wertung milder" : ""}</div>}
          <SetTable sets={ex.sets} onChange={(sets) => updEx(i, (e) => ({ ...e, sets }))} last={last ? last.sets : null} hist={hist} pos={i} />
          <input value={ex.note} onChange={(e) => updEx(i, (x) => ({ ...x, note: e.target.value }))} placeholder="Notiz …" className="fld" style={{ width: "100%", marginTop: 9, padding: "10px 12px", borderRadius: 11, border: "1px solid transparent", background: H.bg2, color: H.text, fontSize: 13, boxSizing: "border-box", outline: "none" }} />
        </Card>
      ); })}
      <button onClick={openPicker} className="press" style={{ width: "100%", padding: 14, borderRadius: 14, border: "none", background: H.blueSoft, color: H.blue, fontSize: 14, fontWeight: 750, cursor: "pointer" }}>+ Übung hinzufügen</button>
    </>
  );
}
function SetTable({ sets, onChange, last, hist, pos }) {
  const add = () => onChange([...sets, { w: "", r: "" }]); const upd = (i, k, v) => onChange(sets.map((s, j) => (j === i ? { ...s, [k]: v } : s))); const del = (i) => onChange(sets.filter((_, j) => j !== i));
  return (<>
    <div style={{ display: "grid", gridTemplateColumns: "26px 1fr 1fr 30px", gap: 8, margin: "12px 0 2px" }}>{["SATZ", "KG", "WDH", ""].map((h, i) => <span key={i} style={{ fontSize: 10, letterSpacing: 1, color: H.faint, fontWeight: 700, textAlign: i ? "left" : "center" }}>{h}</span>)}</div>
    {sets.map((s, i) => {
      const done = s.w && s.r; const lp = last && last[i];
      // Satz-Trend gegen den All-Time-Bestwert bei vergleichbarem Gewicht (hist),
      // mit Reihenfolge (pos): heute später als damals → mildere Wertung.
      // Platzhalter (lp) bleiben vom letzten Training — als Lade-Hilfe.
      const wCol = setTrend(s.w, s.r, hist, pos), rCol = wCol;
      return (
      <div key={i} style={{ display: "grid", gridTemplateColumns: "26px 1fr 1fr 30px", gap: 8, alignItems: "center", padding: "5px 0", background: done ? H.blueSoft : "transparent", borderRadius: 8 }}>
        <span style={{ width: 24, height: 24, borderRadius: 7, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 750, margin: "0 auto", background: done ? H.blue : H.bg2, color: done ? "#fff" : H.sub }}>{i + 1}</span>
        <input value={s.w} onChange={(e) => upd(i, "w", e.target.value)} inputMode="decimal" placeholder={lp ? String(lp.w) : "kg"} className="fld" style={{ ...numStyle, color: wCol || numStyle.color }} />
        <input value={s.r} onChange={(e) => upd(i, "r", e.target.value)} inputMode="numeric" placeholder={lp ? String(lp.r) : "Wdh"} className="fld" style={{ ...numStyle, color: rCol || numStyle.color }} />
        <button onClick={() => del(i)} className="press" style={{ all: "unset", cursor: "pointer", textAlign: "center", color: H.faint, fontSize: 17 }}>×</button>
      </div>); })}
    <button onClick={add} className="addset" style={{ width: "100%", marginTop: 9, padding: 10, borderRadius: 11, border: "none", background: H.bg2, cursor: "pointer", color: H.blue, fontSize: 13, fontWeight: 700 }}>+ Satz</button>
  </>);
}
const numStyle = { width: "100%", padding: "10px", borderRadius: 10, border: "1px solid transparent", background: H.bg2, color: H.text, fontSize: 16, fontWeight: 700, textAlign: "center", outline: "none", boxSizing: "border-box", fontVariantNumeric: "tabular-nums" };

function Library({ data, open, createEx, del, editEx }) {
  const [q, setQ] = useState(""); const [creating, setCreating] = useState(false); const [editing, setEditing] = useState(null);
  const list = data.exercises.filter((e) => e.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name, "de"));
  const rmEx = (ev, ex) => { ev.stopPropagation(); if (typeof window !== "undefined" && !window.confirm("Übung „" + ex.name + "“ löschen? (Bereits geloggte Workouts bleiben erhalten.)")) return; del && del(ex); };
  return (<>
    <div style={{ position: "relative", marginBottom: 12 }}><Search size={15} color={H.faint} style={{ position: "absolute", left: 12, top: 12 }} />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Übung suchen" className="fld" style={{ width: "100%", padding: "10px 12px 10px 34px", borderRadius: 12, border: "1px solid transparent", background: H.bg2, color: H.text, fontSize: 14, boxSizing: "border-box", outline: "none" }} /></div>
    <button onClick={() => setCreating(true)} style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: H.blueSoft, color: H.blue, fontWeight: 750, fontSize: 14, cursor: "pointer", marginBottom: 14 }}>+ Neue Übung erstellen</button>
    {list.length === 0 && <div style={{ fontSize: 13.5, color: H.faint, textAlign: "center", padding: "18px 0" }}>Keine Übungen. Erstelle oben deine erste.</div>}
    {list.map((ex) => (
      <div key={ex.id} style={{ display: "flex", alignItems: "stretch", background: H.glass, borderRadius: 14, marginBottom: 9, overflow: "hidden" }}>
        <button onClick={() => open(ex)} style={{ all: "unset", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", flex: 1, boxSizing: "border-box", padding: "14px 8px 14px 16px", minWidth: 0 }}>
          <div><div style={{ fontSize: 15.5, fontWeight: 700 }}>{ex.name} {ex.custom && <span style={{ fontSize: 10, color: H.blue, border: "1px solid " + H.blue, borderRadius: 5, padding: "1px 5px", marginLeft: 4 }}>eigen</span>}</div>
            <div style={{ fontSize: 12, color: H.faint, marginTop: 2 }}>{ex.group}{ex.gym && " · "}{ex.gym && <span><MapPin size={10} style={{ verticalAlign: "-1px" }} /> {ex.gym}</span>}</div></div>
          <ChevronRight size={16} color={H.faint} />
        </button>
        <button onClick={(ev) => { ev.stopPropagation(); setEditing(ex); }} title="Übung bearbeiten" className="press" style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", padding: "0 13px", color: H.sub, borderLeft: "1px solid " + H.line }}><Pencil size={16} /></button>
        <button onClick={(ev) => rmEx(ev, ex)} title="Übung löschen" className="press" style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", padding: "0 14px", color: H.faint, fontSize: 19, borderLeft: "1px solid " + H.line }}>×</button>
      </div>))}
    {creating && <CreateExercise onSave={(ex) => { createEx(ex); setCreating(false); }} close={() => setCreating(false)} />}
    {editing && <CreateExercise initial={editing} onSave={(patch) => { editEx && editEx(editing.id, patch); setEditing(null); }} close={() => setEditing(null)} />}
  </>);
}
function CreateExercise({ onSave, close, initial }) {
  const [name, setName] = useState((initial && initial.name) || ""); const [group, setGroup] = useState((initial && initial.group && initial.group !== "—" ? initial.group : "")); const [gym, setGym] = useState((initial && initial.gym) || "");
  const editing = !!initial;
  return (<Sheet close={close} title={editing ? "Übung bearbeiten" : "Neue Übung"}>
    <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="z.B. Bulgarian Split Squat" className="fld" style={sheetInput} /></Field>
    <Field label="Muskelgruppe"><input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="z.B. Beine" className="fld" style={sheetInput} /></Field>
    <Field label="Gym / Ort"><input value={gym} onChange={(e) => setGym(e.target.value)} placeholder="z.B. McFit Köln-Süd" className="fld" style={sheetInput} /></Field>
    <button disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), group: group.trim() || "—", gym: gym.trim() })} style={{ width: "100%", marginTop: 6, padding: 14, borderRadius: 13, border: "none", background: name.trim() ? H.blue : H.card, color: name.trim() ? "#fff" : H.faint, fontWeight: 750, fontSize: 15, cursor: name.trim() ? "pointer" : "default" }}>{editing ? "Änderungen speichern" : "Übung speichern"}</button>
  </Sheet>);
}
function ExercisePicker({ data, onPick, onCreate, close }) {
  const [q, setQ] = useState(""); const [creating, setCreating] = useState(false);
  const list = data.exercises.filter((e) => e.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name, "de"));
  return (<Sheet close={close} title="Übung hinzufügen">
    <div style={{ position: "relative", marginBottom: 12 }}><Search size={15} color={H.faint} style={{ position: "absolute", left: 12, top: 12 }} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen" className="fld" style={{ ...sheetInput, paddingLeft: 34 }} /></div>
    <button onClick={() => setCreating(true)} style={{ width: "100%", padding: 11, borderRadius: 11, border: "none", background: H.blueSoft, color: H.blue, fontWeight: 700, fontSize: 13.5, cursor: "pointer", marginBottom: 12 }}>+ Neue Übung erstellen</button>
    <div style={{ maxHeight: 280, overflowY: "auto" }} className="scroll">{list.map((ex) => (
      <button key={ex.id} onClick={() => onPick(ex)} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", boxSizing: "border-box", background: H.bg2, borderRadius: 11, padding: "12px 14px", marginBottom: 7 }}>
        <div style={{ fontSize: 14.5, fontWeight: 650 }}>{ex.name}</div><div style={{ fontSize: 11.5, color: H.faint, marginTop: 1 }}>{ex.group}{ex.gym && " · " + ex.gym}</div></button>))}</div>
    {creating && <CreateExercise onSave={(ex) => { onCreate(ex); setCreating(false); }} close={() => setCreating(false)} />}
  </Sheet>);
}

function Detail({ ex, sess, context, back, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const points = sess.map((s) => ({ date: s.date, val: e1rm(bestSet(s.sets).w, bestSet(s.sets).r) }));
  const tr = trend(points.map((p) => p.val));
  const cur = points.length ? points[points.length - 1].val : 0;
  const prW = sess.length ? Math.max(...sess.flatMap((s) => s.sets.map((x) => x.w))) : 0;       // Top-Gewicht
  const bestE = points.length ? Math.max(...points.map((p) => p.val)) : 0;                        // bestes e1RM
  const isPR = points.length >= 2 && cur >= bestE;                                                // aktuell = Rekord?
  // bester Satz nach e1RM
  let bestSetStr = "—";
  if (sess.length) { let bv = -1; for (const s of sess) for (const x of s.sets) { const e = e1rm(x.w, x.r); if (e > bv) { bv = e; bestSetStr = x.w + "×" + x.r; } } }
  const totalVol = sess.reduce((a, s) => a + s.sets.reduce((ss, x) => ss + x.w * x.r, 0), 0);
  const recent = [...sess].reverse().slice(0, 6);
  const askDelete = () => { if (typeof window !== "undefined" && !window.confirm("Übung „" + ex.name + "“ löschen? (Bereits geloggte Trainings bleiben erhalten.)")) return; onDelete && onDelete(); };
  const editAction = (onSave || onDelete) ? (
    <div style={{ display: "flex", gap: 8 }}>
      {onSave && <button onClick={() => setEditing(true)} className="press" style={iconBtn} title="Übung bearbeiten"><Pencil size={17} color={H.sub} /></button>}
      {onDelete && <button onClick={askDelete} className="press" style={iconBtn} title="Übung löschen"><Trash2 size={17} color={H.down} /></button>}
    </div>
  ) : null;
  const cmini = (c, dd) => {
    const items = [];
    // Nur noch Tagesaktivität (Schlaf/Ruhepuls/Gewicht werden nicht mehr getrackt).
    const a = actOf({ context, activityAdj: {} }, dd); if (a != null) items.push(["Aktiv", a + " kcal", null]);
    if (c && c.steps != null) items.push(["Schritte", Math.round(c.steps).toLocaleString("de-DE"), null]);
    return items;
  };
  return (
    <Page title={ex.name} backFn={back} action={editAction} subEl={ex.gym && <span style={{ fontSize: 13, color: H.sub }}><MapPin size={12} style={{ verticalAlign: "-2px" }} /> {ex.gym}</span>}>
      {editing && <CreateExercise initial={ex} onSave={(patch) => { onSave(patch); setEditing(false); }} close={() => setEditing(false)} />}
      {sess.length < 1 ? <div style={{ color: H.faint, padding: 20, fontSize: 14 }}>Noch keine Sessions geloggt. Oben rechts kannst du die Übung bearbeiten (Stift) oder löschen (Papierkorb).</div> : <>
        <div style={{ display: "flex", gap: 9, marginBottom: 9 }}>
          <Stat label={isPR ? "🏆 Top-Gewicht" : "Top-Gewicht"} value={prW + " kg"} accent />
          <Stat label="e1RM aktuell" value={cur + " kg"} />
          <Stat label="Trend" value={tr.arrow + " " + tr.label} color={tr.color} />
        </div>
        <div style={{ display: "flex", gap: 9, marginBottom: 14 }}>
          <Stat label="Bester Satz" value={bestSetStr} />
          <Stat label="Sessions" value={sess.length} />
          <Stat label="Volumen ges." value={(totalVol / 1000).toFixed(1) + " t"} />
        </div>
        <Card style={{ marginBottom: 14, padding: "16px 10px 6px" }}><Label style={{ padding: "0 6px 4px" }}>Verlauf · geschätztes 1RM · wischen</Label><Chart points={points} /></Card>
        <Label style={{ margin: "0 4px 8px" }}>Letzte Sessions</Label>
        {recent.map((s, i) => { const c = context[s.date]; const minis = cmini(c, s.date); return (
          <Card key={i} style={{ marginBottom: 9 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}><span style={{ fontSize: 12.5, color: H.sub, fontWeight: 600 }}>{fmtShort(s.date)}</span><span style={{ fontSize: 15, fontWeight: 750, fontVariantNumeric: "tabular-nums" }}>{s.sets.map((x) => x.w + "×" + x.r).join("  ")}</span></div>
            {s.note && <div style={{ fontSize: 13, color: H.sub, marginTop: 5, fontStyle: "italic" }}>„{s.note}“</div>}
            {minis.length > 0 && <div style={{ display: "flex", gap: 14, marginTop: 9, paddingTop: 9, borderTop: "1px solid " + H.line }}>{minis.map(([l, v, g], j) => <Mini key={j} label={l} v={v} good={g} />)}</div>}
          </Card>); })}
      </>}
    </Page>
  );
}

/* ================= FOOD ================= */
function Food({ data, commit }) {
  const [date, setDate] = useState(today); const [addTo, setAddTo] = useState(null); const [showSet, setShowSet] = useState(false); const [edit, setEdit] = useState(null); const [mealView, setMealView] = useState(null);
  const touch = useRef(null); const set = data.settings;
  const day = (data.nutrition && data.nutrition[date]) || emptyDay();
  const all = [].concat(...MEALS.map(([k]) => day[k] || []));
  const sum = all.reduce((a, m) => ({ p: a.p + m.p, f: a.f + m.f, c: a.c + m.c, k: a.k + m.k }), { p: 0, f: 0, c: 0, k: 0 });
  const act = actOf(data, date);
  const verbrauch = set.bmr + (act || 0); const bilanz = sum.k - verbrauch;
  // Protein & Fett sind feste Ziele; Kohlenhydrate = restliche Kalorien / 4 (wachsen so
  // automatisch mit der Aktivität UND passen exakt zum kcal-Budget).
  const carbTarget = Math.max(0, Math.round((verbrauch - set.protein * 4 - set.fat * 9) / 4));

  const setDay = (next) => commit({ ...data, nutrition: { ...data.nutrition, [date]: next } });
  const addItem = (meal, item) => setDay({ ...day, [meal]: [...(day[meal] || []), item] });
  const delItem = (meal, idx) => setDay({ ...day, [meal]: day[meal].filter((_, j) => j !== idx) });
  const updItem = (meal, idx, ne) => setDay({ ...day, [meal]: day[meal].map((x, j) => (j === idx ? ne : x)) });
  const onTS = (e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY, t: Date.now() }; };
  const onTE = (e) => {
    if (!touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x, dy = t.clientY - touch.current.y, dt = Date.now() - touch.current.t;
    touch.current = null;
    // Nur eindeutige, schnelle Horizontal-Wischer: weit genug, klar horizontal, nicht zu langsam.
    if (Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 2.2 && Math.abs(dy) < 45 && dt < 600) {
      setDate((d) => shiftDate(d, dx < 0 ? 1 : -1));
    }
  };

  // Overlays (Hinzufügen / Bearbeiten / Ziele) — in beiden Ansichten verfügbar.
  const overlays = (<>
    {addTo && <AddFood mealLabel={MEALS.find((m) => m[0] === addTo)[1]} onAdd={(item) => { addItem(addTo, item); setAddTo(null); }} close={() => setAddTo(null)} data={data} commit={commit} />}
    {edit && day[edit.meal] && day[edit.meal][edit.idx] && <EditFood entry={day[edit.meal][edit.idx]} onSave={(ne) => { updItem(edit.meal, edit.idx, ne); setEdit(null); }} onDelete={() => { delItem(edit.meal, edit.idx); setEdit(null); }} close={() => setEdit(null)} />}
    {showSet && <NutSettings set={set} onSave={(s) => { commit({ ...data, settings: s }); setShowSet(false); }} close={() => setShowSet(false)} />}
  </>);

  // Yazio-artige Einzel-Auswertung einer Mahlzeit.
  if (mealView) {
    const k = mealView; const label = (MEALS.find((m) => m[0] === k) || [k, k])[1];
    const items = day[k] || [];
    const ms = items.reduce((a, m) => ({ p: a.p + m.p, f: a.f + m.f, c: a.c + m.c, k: a.k + m.k }), { p: 0, f: 0, c: 0, k: 0 });
    return (
      <Page title={label} backFn={() => setMealView(null)} subEl={<span style={{ fontSize: 13, color: H.sub }}>{dayLabel(date)}</span>}>
        <div className="rise" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <MacroTile label="Kalorien" v={Math.round(ms.k)} unit="kcal" accent />
          <MacroTile label="Protein" v={Math.round(ms.p)} unit="g" color={H.blue} />
          <MacroTile label="Fett" v={Math.round(ms.f)} unit="g" color={H.amber} />
          <MacroTile label="Kohlenhydrate" v={Math.round(ms.c)} unit="g" color={H.up} />
        </div>
        <Label style={{ margin: "0 4px 8px" }}>Einträge</Label>
        {items.length === 0 && <div style={{ fontSize: 13.5, color: H.faint, textAlign: "center", padding: "16px 0" }}>Noch nichts eingetragen.</div>}
        {items.map((m, i) => (
          <Card key={m.id || i} style={{ marginBottom: 8, padding: "12px 14px", display: "flex", alignItems: "center" }}>
            <div onClick={() => setEdit({ meal: k, idx: i })} style={{ flex: 1, cursor: "pointer", minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 650 }}>{m.n}{m.ai && <Sparkles size={11} color={H.blue} style={{ marginLeft: 5, verticalAlign: "-1px" }} />}</div>
              <div style={{ fontSize: 11.5, color: H.faint, fontVariantNumeric: "tabular-nums", marginTop: 2 }}>{m.p}P · {m.f}F · {m.c}K · {m.k} kcal</div>
            </div>
            <button onClick={() => delItem(k, i)} className="press" style={{ all: "unset", cursor: "pointer", color: H.faint, fontSize: 18, paddingLeft: 10 }}>×</button>
          </Card>
        ))}
        <button onClick={() => setAddTo(k)} className="press" style={{ ...primaryBtn, marginTop: 8 }}>Zu {label} hinzufügen</button>
        {overlays}
      </Page>
    );
  }

  return (
    <Page title="Ernährung" action={<button onClick={() => setShowSet(true)} style={iconBtn} title="Ziele einstellen"><Settings size={19} color={H.sub} /></button>}>
      <div onTouchStart={onTS} onTouchEnd={onTE}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, padding: "0 2px" }}>
          <button onClick={() => setDate((d) => shiftDate(d, -1))} className="press" aria-label="Vorheriger Tag" style={navBtn}><ChevronLeft size={24} /></button>
          <span style={{ fontSize: 17, fontWeight: 600 }}>{dayLabel(date)}</span>
          <button onClick={() => setDate((d) => shiftDate(d, 1))} className="press" aria-label="Nächster Tag" style={navBtn}><ChevronRight size={24} /></button>
        </div>

        {/* energy balance */}
        <Card style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, color: H.sub, fontWeight: 600 }}>Energiebilanz</div>
              <div style={{ fontFamily: H.round, fontSize: 32, fontWeight: 600, letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums", color: bilanz >= 0 ? H.amber : H.blue, marginTop: 2 }}>{bilanz >= 0 ? "+" : "−"}{Math.abs(bilanz)}<span style={{ fontSize: 14, color: H.sub, fontWeight: 600 }}> kcal {bilanz >= 0 ? "Überschuss" : "Defizit"}</span></div>
            </div>
            <Donut eaten={sum.k} total={verbrauch} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 12, columnGap: 12, marginTop: 14, paddingTop: 12, borderTop: "0.5px solid " + H.line }}>
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
          <Macro label="Kohlenhydrate (Rest-kcal)" v={sum.c} t={carbTarget} color={H.up} />
        </Card>

        {MEALS.map(([k, label]) => { const items = day[k] || []; const ms = items.reduce((a, m) => ({ p: a.p + m.p, f: a.f + m.f, c: a.c + m.c, k: a.k + m.k }), { p: 0, f: 0, c: 0, k: 0 }); return (
          <Card key={k} style={{ marginBottom: 11 }}>
            <div onClick={() => setMealView(k)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: items.length ? 8 : 0, cursor: "pointer" }}>
              <span style={{ fontSize: 17, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>{label}<ChevronRight size={16} color={H.faint} /></span>
              <span style={{ fontSize: 12, color: H.faint, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                {items.length ? <span style={{ marginRight: 8 }}>{Math.round(ms.p)}P · {Math.round(ms.f)}F · {Math.round(ms.c)}K</span> : null}{Math.round(ms.k)} kcal
              </span>
            </div>
            {items.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderTop: "0.5px solid " + H.line }}>
                <div onClick={() => setEdit({ meal: k, idx: i })} style={{ flex: 1, cursor: "pointer" }}><span style={{ fontSize: 15 }}>{m.n}{m.ai && <Sparkles size={11} color={H.blue} style={{ marginLeft: 5 }} />}</span><div style={{ fontSize: 11, color: H.faint, fontVariantNumeric: "tabular-nums", marginTop: 1 }}>{m.p}P · {m.f}F · {m.c}K · {m.k} kcal</div></div>
                <button onClick={() => delItem(k, i)} style={{ all: "unset", cursor: "pointer", color: H.faint, fontSize: 16, paddingLeft: 8 }}>×</button>
              </div>))}
            <button onClick={() => setAddTo(k)} className="press" style={{ all: "unset", boxSizing: "border-box", width: "100%", display: "flex", alignItems: "center", gap: 6, marginTop: items.length ? 0 : 4, padding: "10px 0 0", borderTop: items.length ? "0.5px solid " + H.line : "none", color: H.blue, fontSize: 15, fontWeight: 500, cursor: "pointer" }}><Plus size={18} /> Hinzufügen</button>
          </Card>); })}
        {all.length > 0 && <div style={{ marginTop: 6 }}><AiAnalysis title="Ernährungs-Analyse" cta="KI: Tag auswerten" prompt={() => {
          const items = MEALS.map(([k, label]) => { const it = day[k] || []; return it.length ? label + ": " + it.map((m) => m.n + " (" + m.k + "kcal " + m.p + "P " + m.f + "F " + m.c + "K)").join(", ") : null; }).filter(Boolean).join("\n");
          return "Bewerte meinen Ernährungstag (" + dayLabel(date) + "). Ziele: Protein " + set.protein + "g (fix), Fett " + set.fat + "g (fix), Kohlenhydrate = Rest-kcal (heute " + carbTarget + "g). Verbrauch " + verbrauch + " kcal.\nGegessen gesamt: " + sum.k + " kcal, " + sum.p + "g P, " + sum.f + "g F, " + sum.c + "g KH. Bilanz " + bilanz + " kcal.\n" + items + "\n\nKurze Einordnung: Protein-/Kalorienziel getroffen? Verteilung/Qualität? 1-2 konkrete Tipps.";
        }} /></div>}
        <div style={{ fontSize: 11, color: H.faint, textAlign: "center", marginTop: 6 }}>Mahlzeit antippen für Details · wischen für anderen Tag</div>
      </div>

      {overlays}
    </Page>
  );
}
const MacroTile = ({ label, v, unit, color, accent }) => (
  <div style={{ background: H.glass, borderRadius: 14, padding: "12px 14px 13px" }}>
    <div style={{ fontSize: 13, fontWeight: 600, color: accent ? H.blue : (color || H.sub) }}>{label}</div>
    <div style={{ fontFamily: H.round, fontSize: 28, fontWeight: 600, letterSpacing: "-0.01em", marginTop: 3, fontVariantNumeric: "tabular-nums", color: H.text, lineHeight: 1.1 }}>{v}<span style={{ fontSize: 15, fontWeight: 600, color: H.sub }}> {unit}</span></div>
  </div>
);
const Bal = ({ label, v, sub, strong }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ fontSize: 12.5, color: H.sub, fontWeight: 500 }}>{label}{sub && <span style={{ color: H.faint }}> · {sub}</span>}</div>
    <div style={{ fontFamily: H.round, fontSize: 19, fontWeight: 600, marginTop: 1, fontVariantNumeric: "tabular-nums", color: strong ? H.text : "rgba(235,235,245,0.85)" }}>{v}</div>
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
    <div style={{ fontSize: 12, color: H.sub, margin: "2px 0 4px", background: H.bg2, borderRadius: 11, padding: "11px 13px" }}>
      <b style={{ color: H.text }}>Kohlenhydrate: automatisch</b><br />
      KH = übrige Kalorien nach Protein & Fett, geteilt durch 4. Steigen so von selbst mit der Aktivität und passen immer exakt zu deinem kcal-Budget.
    </div>
    <button onClick={() => onSave(s)} style={{ width: "100%", marginTop: 6, padding: 14, borderRadius: 13, border: "none", background: H.blue, color: "#fff", fontWeight: 750, fontSize: 15, cursor: "pointer" }}>Speichern</button>
    <div style={{ height: 1, background: H.line, margin: "16px 0" }} />
    <SetPassword />
    <form action="/auth/signout" method="post" style={{ marginTop: 10 }}>
      <button type="submit" style={{ width: "100%", padding: 12, borderRadius: 13, border: "none", background: H.bg2, color: H.sub, fontWeight: 650, fontSize: 13.5, cursor: "pointer" }}>Abmelden</button>
    </form>
  </Sheet>);
}
function SetPassword() {
  const [pw, setPw] = useState(""); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  const save = async () => {
    if (pw.length < 6 || busy) { setMsg("Mindestens 6 Zeichen."); return; }
    setBusy(true); setMsg("");
    try { const { error } = await supabase.auth.updateUser({ password: pw }); setMsg(error ? "Fehlgeschlagen: " + error.message : "✓ Passwort gesetzt — künftig direkt einloggen."); if (!error) setPw(""); }
    catch (e) { setMsg("Fehlgeschlagen."); }
    setBusy(false);
  };
  return (<div>
    <Field label="Passwort für direkten Login setzen/ändern"><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Neues Passwort (min. 6 Zeichen)" autoComplete="new-password" className="fld" style={sheetInput} /></Field>
    <button onClick={save} disabled={busy || pw.length < 6} style={{ width: "100%", padding: 12, borderRadius: 13, border: "1px solid " + H.blue + "55", background: H.blueSoft, color: H.blue, fontWeight: 750, fontSize: 14, cursor: busy || pw.length < 6 ? "default" : "pointer" }}>{busy ? "…" : "Passwort speichern"}</button>
    {msg && <div style={{ fontSize: 12.5, color: msg.startsWith("✓") ? H.up : H.down, marginTop: 8 }}>{msg}</div>}
  </div>);
}
const UNIT_LABEL = { g: "g", ml: "ml", piece: "Stück", Portion: "Portion" };
// Komma-toleranter Parser: deutsche Tastatur liefert "3,8" — Number("3,8") ist NaN.
const dec = (v) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const favAsFood = (f) => ({ name: f.n, brand: "", base_unit: "Portion", per: 1, kcal: f.k, protein: f.p, fat: f.f, carbs: f.c, _fav: f.n });
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
      <button onClick={onClose} style={{ width: "100%", marginTop: 10, padding: 12, borderRadius: 12, border: "none", background: H.bg2, color: H.sub, fontWeight: 650, fontSize: 13.5, cursor: "pointer" }}>Abbrechen</button>
    </div>
  );
}

function EditFood({ entry, onSave, onDelete, close }) {
  const baseName = (entry.n || "").split(" · ")[0];
  const base = entry.base || { k: entry.k, p: entry.p, f: entry.f, c: entry.c };
  const per = dec(entry.per) || dec(entry.amount) || 1;
  const unit = entry.unit || "Portion";
  const [amount, setAmount] = useState(String(entry.amount != null ? entry.amount : per));
  const factor = dec(amount) / (per || 1);
  const sc = (v) => Math.round(dec(v) * factor);
  const save = () => onSave({ ...entry, n: baseName + " · " + amount + " " + (UNIT_LABEL[unit] || unit), amount: dec(amount), unit, per, base, k: sc(base.k), p: sc(base.p), f: sc(base.f), c: sc(base.c) });
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
    <button onClick={onDelete} style={{ width: "100%", marginTop: 8, padding: 12, borderRadius: 12, border: "none", background: H.bg2, color: H.down, fontWeight: 650, fontSize: 13.5, cursor: "pointer" }}>Löschen</button>
  </Sheet>);
}

function AddFood({ mealLabel, onAdd, close, data, commit }) {
  const [mode, setMode] = useState("search"); // search | portion | create | scan
  const [q, setQ] = useState("");
  const [library, setLibrary] = useState([]);
  const [selected, setSelected] = useState(null);
  const [amount, setAmount] = useState("");
  const [form, setForm] = useState(blankForm);
  const [text, setText] = useState(""); const [aiBusy, setAiBusy] = useState(false); const [err, setErr] = useState("");
  const [scanBusy, setScanBusy] = useState(false);
  const [remote, setRemote] = useState([]); const [searching, setSearching] = useState(false);
  const [libLoading, setLibLoading] = useState(true);

  // Bibliothek laden — robust: wiederholt, falls die Session beim Öffnen noch
  // nicht bereit ist (sonst blieb die Liste manchmal leer).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 4 && !cancelled; attempt++) {
        let uid = userId; // Modul-Global aus load()
        if (!uid) { try { const { data: { user } } = await supabase.auth.getUser(); uid = user ? user.id : null; } catch (e) {} }
        if (uid) {
          try {
            const { data, error } = await supabase.from("foods").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(500);
            if (!cancelled && !error && Array.isArray(data)) { setLibrary(data); setLibLoading(false); return; }
          } catch (e) {}
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      if (!cancelled) setLibLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Online-Datenbank (Open Food Facts) mitdurchsuchen — debounced.
  useEffect(() => {
    const s = q.trim();
    if (s.length < 3) { setRemote([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try { const r = await fetch("/api/food-search?q=" + encodeURIComponent(s)).then((x) => x.json());
        setRemote(Array.isArray(r.results) ? r.results : []);
      } catch (e) { setRemote([]); }
      setSearching(false);
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const hiddenFavs = (data && data.hiddenFavs) || [];
  const results = (() => {
    const all = [...library, ...FAVS.filter((f) => !hiddenFavs.includes(f.n)).map(favAsFood)];
    const s = q.trim().toLowerCase();
    return (s ? all.filter((f) => (f.name + " " + (f.brand || "")).toLowerCase().includes(s)) : all).slice(0, 60);
  })();

  const pick = (food) => { setSelected(food); setAmount(String(food.per || (food.base_unit === "g" || food.base_unit === "ml" ? 100 : 1))); setMode("portion"); };

  const delLibrary = async (ev, food) => {
    ev.stopPropagation();
    if (typeof window !== "undefined" && !window.confirm("„" + food.name + "“ aus der Liste löschen?")) return;
    if (food._fav) { // Beispiel-Lebensmittel: dauerhaft ausblenden (in app_state)
      if (commit && data) commit({ ...data, hiddenFavs: [...((data.hiddenFavs) || []), food._fav] });
      return;
    }
    if (!food.id) return;
    setLibrary((l) => l.filter((x) => x.id !== food.id));
    try { await supabase.from("foods").delete().eq("id", food.id); } catch (e) {}
  };

  const factor = selected ? dec(amount) / (dec(selected.per) || 1) : 0;
  const sc = (v) => Math.round(dec(v) * factor);

  const addPortion = () => {
    if (!selected) return;
    onAdd({
      id: mkid(),
      n: selected.name + " · " + amount + " " + (UNIT_LABEL[selected.base_unit] || selected.base_unit),
      p: sc(selected.protein), f: sc(selected.fat), c: sc(selected.carbs), k: sc(selected.kcal),
      amount: dec(amount), unit: selected.base_unit, per: dec(selected.per) || 1,
      base: { k: dec(selected.kcal), p: dec(selected.protein), f: dec(selected.fat), c: dec(selected.carbs) },
    });
    close();
  };

  const saveAndPick = async () => {
    const f = { name: form.name.trim(), brand: form.brand.trim() || null, barcode: form.barcode || null, base_unit: form.base_unit, per: dec(form.per) || 100, kcal: dec(form.kcal), protein: dec(form.protein), fat: dec(form.fat), carbs: dec(form.carbs) };
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

  const est = async () => { if (!text.trim()) return; setAiBusy(true); setErr(""); try { const r = await estimateFood(text.trim()); onAdd({ id: mkid(), ...r, amount: 1, unit: "Portion", per: 1, base: { k: r.k, p: r.p, f: r.f, c: r.c } }); close(); } catch (e) { setErr("KI-Schätzung fehlgeschlagen."); setAiBusy(false); } };

  const uf = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const title = mode === "portion" ? "Menge wählen" : mode === "create" ? "Lebensmittel anlegen" : mode === "scan" ? "Barcode scannen" : "Hinzufügen · " + mealLabel;

  return (<Sheet close={close} title={title} full={mode === "search" || mode === "scan"}>
    {mode === "search" && <>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexShrink: 0 }}>
        <button onClick={() => setMode("scan")} style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: H.blueSoft, color: H.blue, fontWeight: 750, fontSize: 13.5, cursor: "pointer" }}>📷 Barcode scannen</button>
        <button onClick={() => { setForm(blankForm); setMode("create"); }} style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: H.bg2, color: H.text, fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>+ Neues Lebensmittel</button>
      </div>
      <div style={{ position: "relative", marginBottom: 10, flexShrink: 0 }}><Search size={15} color={H.faint} style={{ position: "absolute", left: 12, top: 12 }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Lebensmittel suchen" className="fld" style={{ ...sheetInput, paddingLeft: 34 }} /></div>
      <div style={{ flex: 1, minHeight: 120, overflowY: "auto" }} className="scroll">
        {libLoading && library.length === 0 && <div style={{ fontSize: 13, color: H.faint, textAlign: "center", padding: "16px 0" }}>Lade deine Lebensmittel …</div>}
        {results.map((f, i) => (
          <div key={(f.id || f.name) + i} style={{ display: "flex", alignItems: "stretch", background: H.bg2, borderRadius: 11, marginBottom: 7, overflow: "hidden" }}>
            <button onClick={() => pick(f)} style={{ all: "unset", cursor: "pointer", flex: 1, boxSizing: "border-box", padding: "11px 13px", minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 650 }}>{f.name}{f.brand ? <span style={{ color: H.faint, fontWeight: 400 }}> · {f.brand}</span> : null}</div>
              <div style={{ fontSize: 11.5, color: H.sub, fontVariantNumeric: "tabular-nums", marginTop: 1 }}>{f.kcal} kcal · {f.protein}P · {f.fat}F · {f.carbs}K <span style={{ color: H.faint }}>/ {f.per} {UNIT_LABEL[f.base_unit] || f.base_unit}</span></div>
            </button>
            {(f.id || f._fav) && <button onClick={(ev) => delLibrary(ev, f)} title="Aus Liste löschen" style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", padding: "0 15px", color: H.faint, fontSize: 19 }}>×</button>}
          </div>
        ))}
        {(() => {
          const known = new Set(library.map((f) => f.barcode).filter(Boolean));
          const rem = remote.filter((r) => !r.barcode || !known.has(r.barcode)).slice(0, 20);
          return (<>
            {(rem.length > 0 || searching) && <div style={{ fontSize: 11, fontWeight: 700, color: H.faint, textTransform: "uppercase", letterSpacing: 0.4, margin: "10px 2px 7px" }}>Online-Datenbank {searching && "· sucht …"}</div>}
            {rem.map((f, i) => (
              <button key={"r" + (f.barcode || f.name) + i} onClick={() => pick(f)} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", boxSizing: "border-box", background: H.bg2, borderRadius: 11, padding: "11px 13px", marginBottom: 7 }}>
                <div style={{ fontSize: 14, fontWeight: 650 }}>{f.name}{f.brand ? <span style={{ color: H.faint, fontWeight: 400 }}> · {f.brand}</span> : null}</div>
                <div style={{ fontSize: 11.5, color: H.sub, fontVariantNumeric: "tabular-nums", marginTop: 1 }}>{f.kcal} kcal · {f.protein}P · {f.fat}F · {f.carbs}K <span style={{ color: H.faint }}>/ {f.per} {UNIT_LABEL[f.base_unit] || f.base_unit}</span></div>
              </button>
            ))}
          </>);
        })()}
        {results.length === 0 && remote.length === 0 && !searching && q.trim().length >= 3 && <div style={{ fontSize: 13, color: H.faint, textAlign: "center", padding: "16px 0" }}>Nichts gefunden — leg es als neues Lebensmittel an oder scanne den Barcode.</div>}
      </div>
      <Label style={{ margin: "14px 0 8px", color: H.blue, flexShrink: 0 }}><Sparkles size={12} style={{ verticalAlign: "-2px" }} /> Oder mit KI schätzen</Label>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
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
// Coros-Sync als kompakte Kapsel (Toolbar-Stil); Status meldet die Übersicht.
function SyncButton({ reload, onStatus }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return; setBusy(true); onStatus && onStatus(null);
    let st;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 90000); // nicht ewig hängen
      const res = await fetch("/api/coros/sync", { method: "POST", credentials: "same-origin", signal: ctrl.signal });
      clearTimeout(t);
      let r = null; try { r = await res.json(); } catch (e) { /* keine JSON-Antwort (z.B. Timeout-Seite) */ }
      if (res.ok && r && r.ok) { st = { text: "Mit Coros synchronisiert", tone: "ok" }; if (reload) await reload(); }
      else if (r && r.error === "coros_not_connected") st = { text: "Coros-Verbindung abgelaufen – tippen zum Erneuern", tone: "reauth" };
      else st = { text: "Sync fehlgeschlagen (" + (res.status !== 200 ? "HTTP " + res.status : (r && r.error) || "?") + ")", tone: "err" };
    } catch (e) {
      st = { text: e && e.name === "AbortError" ? "Zeitüberschreitung – nochmal versuchen" : "Netzwerkfehler – nochmal versuchen", tone: "err" };
    }
    setBusy(false); onStatus && onStatus(st);
    if (st.tone === "ok") setTimeout(() => onStatus && onStatus(null), 3500);
  };
  return (
    <button onClick={go} disabled={busy} className="press" aria-label="Mit Coros synchronisieren" style={{ all: "unset", cursor: busy ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 999, background: H.bg2, color: H.blue, fontSize: 15, fontWeight: 600 }}>
      <RefreshCw size={15} strokeWidth={2.4} className={busy ? "spin" : ""} /> {busy ? "Sync …" : "Sync"}
    </button>
  );
}
// Zwei konzentrische Ringe (Apple-Aktivitätsringe): außen Kalorien, innen Protein.
function DualRing({ outer, inner, size = 112 }) {
  const w = 13, c0 = size / 2;
  const ring = (r, p, col) => {
    const c = 2 * Math.PI * r, pc = Math.max(0, Math.min(1, p || 0));
    return (<g key={r}>
      <circle cx={c0} cy={c0} r={r} fill="none" stroke={col} strokeOpacity="0.2" strokeWidth={w} />
      <circle cx={c0} cy={c0} r={r} fill="none" stroke={col} strokeWidth={w} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pc)} transform={"rotate(-90 " + c0 + " " + c0 + ")"} style={{ transition: "stroke-dashoffset .9s cubic-bezier(.32,.72,0,1)" }} />
    </g>);
  };
  return <svg width={size} height={size} viewBox={"0 0 " + size + " " + size} style={{ flexShrink: 0 }} aria-hidden>{ring(c0 - w / 2 - 1, outer.p, outer.col)}{ring(c0 - w * 1.5 - 4, inner.p, inner.col)}</svg>;
}
const RingRow = ({ label, col, v, t, unit }) => (
  <div style={{ marginBottom: 8 }}>
    <div style={{ fontSize: 13, fontWeight: 600, color: col }}>{label}</div>
    <div style={{ fontFamily: H.round, fontVariantNumeric: "tabular-nums", lineHeight: 1.15 }}>
      <span style={{ fontSize: 22, fontWeight: 600, color: H.text }}>{v}</span>
      <span style={{ fontSize: 15, fontWeight: 600, color: H.sub }}>/{t} {unit}</span>
    </div>
  </div>
);
const LOAD_DE = { optimized: "Optimal", optimal: "Optimal", maintaining: "Erhaltend", recovery: "Erholung", overreaching: "Hoch", high: "Hoch", detraining: "Zu wenig", low: "Niedrig" };

function Home({ data, reload, goTrain }) {
  const set = data.settings; const ctx = data.context[today] || {}; const nut = data.nutrition[today] || emptyDay();
  const eaten = [].concat(...MEALS.map(([k]) => nut[k] || [])).reduce((a, m) => ({ p: a.p + m.p, k: a.k + m.k }), { p: 0, k: 0 });
  const act = actOf(data, today);
  const verbrauch = set.bmr + (act || 0);
  const pLeft = Math.max(0, set.protein - eaten.p); const kLeft = verbrauch - eaten.k;
  const lastW = (data.workouts || [])[data.workouts.length - 1] || null;
  const h = new Date().getHours();
  const greet = (h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend") + ", Felix";
  const dateStr = new Date().toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
  const summary = [pLeft > 0 ? "noch " + pLeft + " g Protein" : "Protein-Ziel erreicht", act != null ? (kLeft >= 0 ? kLeft.toLocaleString("de-DE") + " kcal übrig" : Math.abs(kLeft).toLocaleString("de-DE") + " kcal drüber") : null].filter(Boolean).join(" · ");
  const c0 = data.coros || {}; const fit = c0.fitness; const load = c0.load;
  const expDays = c0.access_expires ? Math.floor((c0.access_expires - Date.now()) / 864e5) : null;
  const needReauth = expDays != null && expDays <= 5;
  const [status, setStatus] = useState(null);

  // Verlaufs-Graph pro Kachel: Messpunkte einer Metrik über alle Tage (aufsteigend).
  const [hist, setHist] = useState(null);
  const ptsOf = (key) => Object.keys(data.context || {}).filter((d) => typeof (data.context[d] || {})[key] === "number").sort().map((d) => ({ date: d, val: data.context[d][key] }));
  const actPts = () => Array.from(new Set([...Object.keys(data.context || {}), ...Object.keys(data.activityAdj || {})])).sort().map((d) => ({ date: d, val: actOf(data, d) })).filter((p) => typeof p.val === "number");
  const int0 = (v) => Math.round(v).toLocaleString("de-DE");
  const ST = ({ children }) => <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", margin: "28px 2px 10px" }}>{children}</div>;
  const toneCol = (t) => (t === "ok" ? H.up : t === "err" ? H.down : H.amber);
  const lastVol = lastW ? lastW.exercises.reduce((a, e) => a + e.sets.reduce((s, x) => s + x.w * x.r, 0), 0) : 0;

  return (
    <div style={{ padding: "8px 16px 8px" }}>
      <div style={{ height: 14 }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: H.sub, textTransform: "uppercase", letterSpacing: "0.02em" }}>{dateStr}</div>
        <SyncButton reload={reload} onStatus={setStatus} />
      </div>
      <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.012em", lineHeight: 1.12, margin: "6px 0 0" }}>{greet}</h1>
      <div style={{ fontSize: 15, color: H.sub, marginTop: 4 }}>{summary}</div>
      {status && (status.tone === "reauth"
        ? <a href="/api/coros/connect" style={{ display: "block", marginTop: 8, fontSize: 14, color: H.amber, fontWeight: 600, textDecoration: "none" }}>{status.text} ›</a>
        : <div style={{ marginTop: 8, fontSize: 14, color: toneCol(status.tone), fontWeight: 600 }}>{status.text}</div>)}
      {needReauth && !status && (
        <a href="/api/coros/connect" style={{ textDecoration: "none", display: "block", marginTop: 14 }}>
          <Card className="press" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px" }}>
            <RefreshCw size={18} color={H.amber} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: H.text }}>Coros-Verbindung {expDays <= 0 ? "abgelaufen" : "läuft in " + expDays + " Tag" + (expDays === 1 ? "" : "en") + " ab"}</div>
              <div style={{ fontSize: 13, color: H.sub }}>Tippen zum Erneuern</div>
            </div>
            <ChevronRight size={18} color={H.faint} />
          </Card>
        </a>
      )}

      <ST>Heute</ST>
      <Card style={{ display: "flex", alignItems: "center", gap: 18, padding: "18px 16px" }}>
        <DualRing outer={{ p: verbrauch ? eaten.k / verbrauch : 0, col: H.blue }} inner={{ p: set.protein ? eaten.p / set.protein : 0, col: H.up }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <RingRow label="Kalorien" col={H.blue} v={int0(eaten.k)} t={int0(verbrauch)} unit="kcal" />
          <RingRow label="Protein" col={H.up} v={Math.round(eaten.p)} t={set.protein} unit="g" />
          <div style={{ fontSize: 13, color: kLeft < 0 ? H.amber : H.sub, fontWeight: 500 }}>
            {act == null ? "Verbrauch = Grundumsatz (noch keine Coros-Aktivität)" : kLeft >= 0 ? int0(kLeft) + " kcal übrig" : int0(-kLeft) + " kcal über Verbrauch"}
          </div>
        </div>
      </Card>

      <ST>Aktivität</ST>
      <div style={{ display: "flex", gap: 10 }}>
        <Stat label="Aktiv-Kalorien" value={act != null ? int0(act) + " kcal" : "—"} accent onClick={() => setHist({ title: "Aktiv-Kalorien", unit: " kcal", points: actPts(), fmt: int0 })} />
        <Stat label="Schritte" value={ctx.steps != null ? int0(ctx.steps) : "—"} onClick={() => setHist({ title: "Schritte", unit: "", points: ptsOf("steps"), fmt: int0 })} />
      </div>
      {(fit && fit.vo2max) || (load && load.short != null) ? (
        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          {fit && fit.vo2max && <Stat label="VO₂max" value={fit.vo2max} />}
          {load && load.short != null && <Stat label="Trainingsbelastung" value={(LOAD_DE[String(load.comment || "").toLowerCase()] || load.comment || "—") + (load.ratio ? " · " + String(load.ratio).replace(".", ",") : "")} color={Number(load.ratio) > 1.5 ? H.amber : undefined} />}
        </div>
      ) : null}

      <ST>Letztes Training</ST>
      {lastW ? (
        <Card onClick={goTrain} className="press" style={{ display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }}>
          <span style={{ width: 42, height: 42, borderRadius: 11, background: H.blueSoft, display: "grid", placeItems: "center", flexShrink: 0 }}><Dumbbell size={21} color={H.blue} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lastW.name}</div>
            <div style={{ fontSize: 13, color: H.sub, marginTop: 2 }}>{dayLabel(lastW.date) === "Heute" ? "Heute" : fmtShort(lastW.date)} · {lastW.exercises.length} Übungen · {lastW.durationMin} min · {(lastVol / 1000).toFixed(1).replace(".", ",")} t</div>
          </div>
          <ChevronRight size={18} color={H.faint} />
        </Card>
      ) : <Card><div style={{ fontSize: 15, color: H.sub }}>Noch kein Workout geloggt.</div></Card>}

      {hist && <MetricHistory {...hist} close={() => setHist(null)} />}
    </div>
  );
}
// Verlaufs-Ansicht einer Metrik: Kennzahlen + wischbarer Graph über alle Messungen.
function MetricHistory({ title, unit, points, fmt, close }) {
  const f = fmt || ((v) => v);
  if (!points || !points.length) return (
    <Sheet title={title} close={close}>
      <div style={{ fontSize: 13.5, color: H.sub, lineHeight: 1.55, padding: "4px 0 6px" }}>Noch keine Daten. Sobald {title} synchronisiert wurde, erscheint hier dein Verlauf.</div>
    </Sheet>
  );
  const vals = points.map((p) => p.val);
  const cur = vals[vals.length - 1], first = vals[0];
  const lo = Math.min(...vals), hi = Math.max(...vals), avgv = vals.reduce((a, b) => a + b, 0) / vals.length;
  const change = Math.round((cur - first) * 10) / 10;
  return (
    <Sheet title={title} close={close}>
      <div style={{ display: "flex", gap: 9, marginBottom: 6 }}>
        <Stat label="Aktuell" value={f(cur) + unit} accent />
        <Stat label="Ø" value={f(Math.round(avgv * 10) / 10) + unit} />
        <Stat label="Spanne" value={f(lo) + "–" + f(hi)} />
      </div>
      <Card style={{ padding: "16px 10px 6px", marginTop: 8 }}>
        <Label style={{ padding: "0 6px 4px" }}>Verlauf · {points.length} Messungen · wischen</Label>
        <Chart points={points} unit={unit} fmt={f} />
      </Card>
      {points.length >= 2 && <div style={{ fontSize: 12.5, color: H.sub, marginTop: 12, textAlign: "center" }}>Seit erster Messung ({fmtShort(points[0].date)}): <span style={{ fontWeight: 750, color: change === 0 ? H.sub : (title === "Körperfett" || title === "Gewicht" || title === "Ruhepuls" ? (change < 0 ? H.up : H.down) : (change > 0 ? H.up : H.down)) }}>{change > 0 ? "+" : ""}{f(change)}{unit}</span></div>}
    </Sheet>
  );
}

/* ================= shared ================= */
// Apple-Seitenkopf: Large Title (34 pt) auf Hauptseiten, kompakter Titel mit
// „‹ Zurück" (Tint) auf Unterseiten.
const Page = ({ title, sub, subEl, backFn, action, children }) => (
  <div style={{ padding: "8px 16px 8px" }}>
    {backFn
      ? <button onClick={backFn} className="press" style={{ all: "unset", cursor: "pointer", color: H.blue, fontSize: 17, display: "inline-flex", alignItems: "center", margin: "10px 0 6px -8px" }}><ChevronLeft size={26} strokeWidth={2.2} />Zurück</button>
      : <div style={{ height: 22 }} />}
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
      <h1 style={{ fontSize: backFn ? 28 : 34, fontWeight: 700, letterSpacing: "-0.012em", lineHeight: 1.12, margin: 0, minWidth: 0, overflowWrap: "anywhere" }}>{title}</h1>
      {action && <div style={{ flexShrink: 0, marginBottom: 2 }}>{action}</div>}
    </div>
    {sub && <div style={{ fontSize: 15, color: H.sub, margin: "4px 0 22px" }}>{sub}</div>}
    {subEl && <div style={{ margin: "4px 0 22px" }}>{subEl}</div>}
    {!sub && !subEl && <div style={{ height: 20 }} />}
    {children}
  </div>
);
// Grouped-Karte (iOS „inset grouped"): keine Rahmen, keine Schatten.
const Card = ({ children, style, onClick, className }) => <div onClick={onClick} className={className || ""} style={{ background: H.glass, borderRadius: 16, padding: 16, ...style }}>{children}</div>;
// Abschnitts-Überschrift im iOS-Stil (13 pt, sekundär).
const Label = ({ children, style }) => <div style={{ fontSize: 13, color: H.sub, fontWeight: 600, letterSpacing: "-0.005em", marginBottom: 8, ...style }}>{children}</div>;
const Bar = ({ pct, color }) => <div style={{ height: 6, borderRadius: 3, background: H.bg2, overflow: "hidden" }}><div className="b" style={{ width: pct + "%", height: "100%", background: color, borderRadius: 3 }} /></div>;
// Kennzahl-Kachel (Apple-Health-Stil): farbiges Label, große gerundete Zahl.
const Stat = ({ label, value, accent, color, onClick }) => (
  <div onClick={onClick} className={onClick ? "press" : ""} style={{ flex: 1, minWidth: 0, background: H.glass, borderRadius: 14, padding: "11px 12px 12px", cursor: onClick ? "pointer" : "default", position: "relative" }}>
    <div style={{ fontSize: 12.5, color: accent ? H.blue : H.sub, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: onClick ? 12 : 0 }}>{label}</div>
    <div style={{ fontFamily: H.round, fontSize: 21, fontWeight: 600, marginTop: 3, color: color || H.text, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
    {onClick && <ChevronRight size={14} color={H.faint} style={{ position: "absolute", top: 12, right: 8 }} />}
  </div>
);
const Mini = ({ label, v, good }) => <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, color: H.sub, fontWeight: 500 }}>{label}</div><div style={{ fontFamily: H.round, fontSize: 15, fontWeight: 600, marginTop: 2, color: good === true ? H.up : good === false ? H.down : H.text }}>{v}</div></div>;
function Chart({ points, unit = " kg", fmt }) {
  const [sel, setSel] = useState(null);
  const ref = useRef(null);
  const W = 400, Ht = 150, pad = { l: 10, r: 10, t: 16, b: 22 };
  if (points.length < 2) return <div style={{ color: H.faint, fontSize: 13, padding: 16 }}>Mehr Messungen nötig.</div>;
  const fv = (v) => (fmt ? fmt(v) : v);
  const vals = points.map((p) => p.val), lo = Math.min(...vals), hi = Math.max(...vals);
  const padV = (hi - lo) * 0.15 || Math.max(1, Math.abs(hi) * 0.05);
  const min = lo - padV, max = hi + padV, rng = max - min || 1;
  const x = (i) => pad.l + (i / (points.length - 1)) * (W - pad.l - pad.r), y = (v) => pad.t + (1 - (v - min) / rng) * (Ht - pad.t - pad.b);
  const line = points.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.val).toFixed(1)).join(" ");
  const area = line + " L" + x(points.length - 1) + " " + (Ht - pad.b) + " L" + x(0) + " " + (Ht - pad.b) + " Z";
  const si = sel == null ? points.length - 1 : sel;
  const pick = (clientX) => { const el = ref.current; if (!el) return; const r = el.getBoundingClientRect(); const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width)); setSel(Math.round(frac * (points.length - 1))); };
  const onTouch = (e) => { if (e.touches && e.touches[0]) pick(e.touches[0].clientX); };
  const onMouse = (e) => { if (e.buttons) pick(e.clientX); };
  const labelLeft = Math.max(14, Math.min(86, (x(si) / W) * 100));
  return (
    <div ref={ref} style={{ position: "relative", touchAction: "pan-y", userSelect: "none", cursor: "pointer" }}
      onTouchStart={onTouch} onTouchMove={onTouch} onMouseDown={(e) => pick(e.clientX)} onMouseMove={onMouse}>
      <div style={{ position: "absolute", top: -2, left: labelLeft + "%", transform: "translateX(-50%)", background: H.cardHi, color: H.text, fontFamily: H.round, fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 8, whiteSpace: "nowrap", pointerEvents: "none" }}>{fv(points[si].val)}{unit} · {fmtShort(points[si].date)}</div>
      <svg viewBox={"0 0 " + W + " " + Ht} style={{ width: "100%", display: "block", marginTop: 14 }}>
        <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={H.blue} stopOpacity="0.22" /><stop offset="100%" stopColor={H.blue} stopOpacity="0" /></linearGradient></defs>
        <path d={area} fill="url(#cg)" />
        <path d={line} fill="none" stroke={H.blue} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <line x1={x(si)} y1={pad.t - 6} x2={x(si)} y2={Ht - pad.b} stroke={H.sub} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
        {points.map((p, i) => { const on = i === si; return <circle key={i} cx={x(i)} cy={y(p.val)} r={on ? 5.5 : 2.5} fill={on ? H.blue : H.card} stroke={H.blue} strokeWidth="2" />; })}
        <text x={x(0)} y={Ht - 5} fontSize="10" fill={H.faint}>{fmtShort(points[0].date)}</text>
        <text x={x(points.length - 1)} y={Ht - 5} fontSize="10" fill={H.faint} textAnchor="end">{fmtShort(points[points.length - 1].date)}</text>
      </svg>
    </div>
  );
}
// iOS-Sheet: Griff oben, großer Titel, runder Schließen-Knopf, fährt von unten
// mit iOS-Kurve ein. full=true: fast bildschirmhoch (Tastatur verdeckt nichts).
function Sheet({ title, close, children, full }) {
  const inner = full
    ? { height: "92dvh", maxHeight: "92dvh", display: "flex", flexDirection: "column" }
    : { maxHeight: "88dvh", overflowY: "auto" };
  const overlay = (<div onClick={close} className="scrim" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 70 }}>
    <div onClick={(e) => e.stopPropagation()} className={"sheet" + (full ? "" : " scroll")} style={{ width: "100%", maxWidth: 460, background: H.card, borderRadius: "14px 14px 0 0", padding: "7px 16px calc(18px + env(safe-area-inset-bottom))", boxSizing: "border-box", ...inner }}>
      <div style={{ width: 36, height: 5, borderRadius: 3, background: "rgba(235,235,245,0.3)", margin: "0 auto 12px", flexShrink: 0 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16, flexShrink: 0 }}>
        <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>{title}</span>
        <button onClick={close} className="press" aria-label="Schließen" style={{ all: "unset", cursor: "pointer", width: 30, height: 30, borderRadius: 15, background: H.bg2, display: "grid", placeItems: "center", color: H.sub, flexShrink: 0 }}><X size={16} strokeWidth={2.6} /></button>
      </div>
      {full ? <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>{children}</div> : children}
    </div></div>);
  // Via Portal direkt an den <body>, damit transformierte Vorfahren das
  // position:fixed-Overlay nicht ans Seitenende schieben.
  return typeof document !== "undefined" ? createPortal(overlay, document.body) : overlay;
}
// iOS-Segment-Steuerung: volle Breite, gewähltes Segment hell abgesetzt.
const Segmented = ({ value, onChange, items }) => (
  <div style={{ display: "flex", gap: 2, marginBottom: 16, background: H.bg2, padding: 2, borderRadius: 9 }}>
    {items.map(([k, l]) => (
      <button key={k} onClick={() => onChange(k)} style={{ flex: 1, border: "none", cursor: "pointer", padding: "6px 8px", borderRadius: 7, fontSize: 13, fontWeight: 600, background: value === k ? "#636366" : "transparent", color: H.text, boxShadow: value === k ? "0 3px 8px rgba(0,0,0,.12), 0 3px 1px rgba(0,0,0,.04)" : "none", transition: "background .2s ease" }}>{l}</button>
    ))}
  </div>
);
const primaryBtn = { width: "100%", height: 50, borderRadius: 12, border: "none", background: H.blue, color: "#fff", fontSize: 17, fontWeight: 600, cursor: "pointer" };
const Field = ({ label, children }) => <div style={{ marginBottom: 14 }}><div style={{ fontSize: 13, color: H.sub, fontWeight: 500, marginBottom: 6, paddingLeft: 2 }}>{label}</div>{children}</div>;
const sheetInput = { width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid transparent", background: H.bg2, color: H.text, fontSize: 17, boxSizing: "border-box", outline: "none" };
const navBtn = { all: "unset", cursor: "pointer", padding: "4px 10px", display: "grid", placeItems: "center", color: H.blue };
const iconBtn = { all: "unset", cursor: "pointer", width: 36, height: 36, borderRadius: 18, background: H.bg2, display: "grid", placeItems: "center" };
// iOS-Tab-Bar: Material (Blur), Haarlinie oben, Tint für den aktiven Tab.
function Nav({ tab, setTab, active }) {
  const items = [{ k: "home", l: "Übersicht", I: Activity }, { k: "train", l: "Training", I: Dumbbell }, { k: "food", l: "Ernährung", I: Utensils }];
  return (<nav style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 460, zIndex: 50, display: "flex", background: "rgba(22,22,24,0.8)", backdropFilter: "blur(24px) saturate(180%)", WebkitBackdropFilter: "blur(24px) saturate(180%)", borderTop: "0.5px solid rgba(84,84,88,0.65)", padding: "7px 0 calc(3px + env(safe-area-inset-bottom))" }}>
    {items.map(({ k, l, I }) => { const on = tab === k; const dot = active && k === "train"; return (
      <button key={k} onClick={() => setTab(k)} className="tabbtn" aria-current={on ? "page" : undefined} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: on ? H.blue : "#8E8E93", position: "relative", padding: "1px 0 2px" }}>
        <I size={25} strokeWidth={on ? 2.2 : 1.8} />
        {dot && <span style={{ position: "absolute", top: 0, left: "calc(50% + 11px)", width: 8, height: 8, borderRadius: 4, background: H.up }} />}
        <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.01em" }}>{l}</span>
      </button>); })}
  </nav>);
}
const Style = () => (<style>{`
  .scroll::-webkit-scrollbar{width:0}
  .scroll{ -webkit-overflow-scrolling:touch; overscroll-behavior-y:contain; }
  body{ -webkit-font-smoothing:antialiased; }
  .fld{ transition: background .15s ease, box-shadow .15s ease; }
  .fld:focus{ box-shadow:0 0 0 2px ` + H.blue + `; }
  .fld::placeholder{ color:rgba(235,235,245,0.3); }
  .b{transition:width .6s cubic-bezier(.32,.72,0,1)}
  button,input,textarea,select{font-family:inherit}
  *{ -webkit-tap-highlight-color:transparent; }
  button{ touch-action:manipulation; }
  /* Feedback sofort beim Drücken (nicht erst beim Loslassen) */
  .press{ transition:transform .12s ease-out, opacity .12s ease-out; }
  .press:active{ transform:scale(.97); opacity:.7; transition:transform 0s, opacity 0s; }
  .tabbtn:active{ opacity:.6; }
  .fade-in{ animation:fadeIn .22s ease both; }
  .rise > *{ animation:rise .35s cubic-bezier(.32,.72,0,1) both; }
  .rise > *:nth-child(2){animation-delay:.03s} .rise > *:nth-child(3){animation-delay:.06s}
  .rise > *:nth-child(4){animation-delay:.09s} .rise > *:nth-child(n+5){animation-delay:.12s}
  /* Sheet: iOS-Kurve, Scrim blendet mit */
  .scrim{ animation:scrimIn .3s ease both; }
  .sheet{ animation:sheetIn .42s cubic-bezier(.32,.72,0,1) both; }
  @keyframes scrimIn{ from{background:rgba(0,0,0,0)} }
  @keyframes sheetIn{ from{transform:translateY(100%)} to{transform:none} }
  @keyframes fadeIn{ from{opacity:0} to{opacity:1} }
  @keyframes rise{ from{opacity:0; transform:translateY(8px)} to{opacity:1; transform:none} }
  @keyframes popIn{ from{opacity:0; transform:scale(.9)} to{opacity:1; transform:scale(1)} }
  @keyframes popDot{ from{opacity:0; transform:scale(.4)} to{opacity:1; transform:scale(1)} }
  @keyframes draw{ to{ stroke-dashoffset:0 } }
  @keyframes splashOut{ 0%,62%{opacity:1} 100%{opacity:0} }
  .typing i{ width:8px; height:8px; border-radius:4px; background:rgba(235,235,245,0.45); display:block; animation:typing 1.2s ease-in-out infinite; }
  .typing i:nth-child(2){ animation-delay:.15s } .typing i:nth-child(3){ animation-delay:.3s }
  @keyframes typing{ 0%,60%,100%{ opacity:.35; transform:none } 30%{ opacity:1; transform:translateY(-2px) } }
  .spin{ animation:spin 1s linear infinite; }
  @keyframes spin{ to{ transform:rotate(360deg) } }
  .rotate-hint{ display:none }
  @media screen and (orientation:landscape) and (max-height:560px){
    .rotate-hint{ display:flex; position:fixed; inset:0; z-index:300; background:#000; color:#fff; align-items:center; justify-content:center; text-align:center; padding:28px; font-size:17px; font-weight:600; line-height:1.5; }
  }
  @media (prefers-reduced-motion: reduce){
    .b,circle,.press,.fade-in,.rise>*{transition:none;animation:none}
    .sheet{ animation:fadeIn .2s ease both; }
  }
  @media (prefers-reduced-transparency: reduce){ nav{ background:#161618 !important; backdrop-filter:none !important; -webkit-backdrop-filter:none !important; } }
`}</style>);
