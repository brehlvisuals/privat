import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClientFromCookies } from "@/lib/supabase/server";
import { accessToken, corosTool, loadAuth } from "@/lib/coros";

export const runtime = "nodejs";
export const maxDuration = 60;

const iso = (yyyymmdd: string) => yyyymmdd.slice(0, 4) + "-" + yyyymmdd.slice(4, 6) + "-" + yyyymmdd.slice(6, 8);

type Row = { activity_kcal?: number; sleep_hours?: number; resting_hr?: number; hrv?: number; stress?: string };

// Parst die Text-Outputs der Coros-Tools in tagesweise Werte.
function parseAll(hrvTxt: string, rhrTxt: string, dailyTxt: string) {
  const days: Record<string, Row> = {};
  const get = (d: string) => (days[d] ||= {});

  // HRV: Blöcke "YYYY-MM-DD:" gefolgt von "HRV Avg: N ms"
  const hrvRe = /(\d{4}-\d{2}-\d{2}):\s*\n\s*HRV Avg:\s*(\d+)\s*ms/g;
  for (let m; (m = hrvRe.exec(hrvTxt)); ) get(m[1]).hrv = parseInt(m[2], 10);

  // Ruhepuls: "YYYY-MM-DD: N bpm"
  const rhrRe = /(\d{4}-\d{2}-\d{2}):\s*(\d+)\s*bpm/g;
  for (let m; (m = rhrRe.exec(rhrTxt)); ) get(m[1]).resting_hr = parseInt(m[2], 10);

  // Daily Health: Abschnitte "--- YYYYMMDD ---" mit Calories / Total hh h mm min / Stress Avg
  const blocks = dailyTxt.split(/---\s*(\d{8})\s*---/).slice(1);
  for (let i = 0; i < blocks.length; i += 2) {
    const d = iso(blocks[i]); const body = blocks[i + 1] || ""; const row = get(d);
    const cal = body.match(/Calories:\s*([\d,]+)\s*kcal/i);
    if (cal) row.activity_kcal = parseInt(cal[1].replace(/,/g, ""), 10);
    const sleep = body.match(/Total:\s*(?:(\d+)h)?\s*(?:(\d+)min)?/i);
    if (sleep && (sleep[1] || sleep[2])) row.sleep_hours = Math.round(((parseInt(sleep[1] || "0", 10) * 60 + parseInt(sleep[2] || "0", 10)) / 60) * 100) / 100;
    const stress = body.match(/Stress:\s*Avg\s*(\d+)/i);
    if (stress) row.stress = stress[1];
  }
  return days;
}

export async function POST(request: Request) { return run(request); }
export async function GET(request: Request) { return run(request); }

async function run(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const key = new URL(request.url).searchParams.get("key") || "";
  const provided = bearer || key;
  const a0 = await loadAuth();
  const envSecret = process.env.CRON_SECRET || null;   // von Vercel-Cron automatisch als Bearer geschickt
  const dbSecret = a0?.sync_secret || null;             // für manuellen Test ohne Vercel-Env
  let ok = (!!envSecret && provided === envSecret) || (!!dbSecret && provided === dbSecret);
  // Alternativ: eingeloggter App-Nutzer (Manueller Sync-Button) darf synchronisieren.
  if (!ok) {
    try { const sb = await createServerClientFromCookies(); const { data: { user } } = await sb.auth.getUser(); if (user && user.id === process.env.HEALTH_SYNC_USER_ID) ok = true; } catch { /* keine Session */ }
  }
  if (!ok) return Response.json({ error: "unauthorized" }, { status: 401 });

  let token: string;
  try { token = await accessToken(); }
  catch (e) { return Response.json({ error: "coros_not_connected", detail: String(e) }, { status: 400 }); }

  let hrvTxt = "", rhrTxt = "", dailyTxt = "";
  try {
    hrvTxt = await corosTool(token, "querySleepHrv", { days: 3 });
    rhrTxt = await corosTool(token, "queryRestingHeartRate", { days: 3 });
    dailyTxt = await corosTool(token, "queryDailyHealthData", { days: 3 });
  } catch (e) {
    return Response.json({ error: "coros_query_failed", detail: String(e) }, { status: 502 });
  }

  const days = parseAll(hrvTxt, rhrTxt, dailyTxt);
  const userId = process.env.HEALTH_SYNC_USER_ID!;
  const rows = Object.entries(days)
    .filter(([, r]) => r.activity_kcal != null || r.sleep_hours != null || r.resting_hr != null || r.hrv != null)
    .map(([date, r]) => ({ user_id: userId, date, source: "coros", ...r }));

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  if (rows.length) {
    const { error } = await supabase.from("daily_context").upsert(rows, { onConflict: "user_id,date" });
    if (error) return Response.json({ error: "db_write_failed", detail: error.message }, { status: 500 });
  }

  // Aktuelle Kennzahlen (Recovery, Fitness/VO2max, Rennprognosen) als Snapshot.
  let snapshotSaved = false;
  try {
    const recTxt = await corosTool(token, "queryRecoveryStatus", {});
    const fitTxt = await corosTool(token, "queryFitnessAssessmentOverview", {});
    const g = (txt: string, re: RegExp) => { const m = txt.match(re); return m ? m[1].trim() : null; };
    const recPct = g(recTxt, /Recovery:\s*(\d+)\s*%/i);
    const recovery = recPct ? { pct: parseInt(recPct, 10), level: g(recTxt, /Level:\s*([^\n]+)/i), full: g(recTxt, /Full Recovery:\s*([^\n]+)/i) } : null;
    const vo2 = g(fitTxt, /VO2max:\s*([\d.]+)/i);
    const fitness = {
      vo2max: vo2 ? Number(vo2) : null,
      runningLevel: g(fitTxt, /Running Level:\s*([\d.]+)/i),
      threshold: g(fitTxt, /Threshold Pace:\s*([^\n]+)/i),
      pred5k: g(fitTxt, /5\s*km Prediction:\s*([^\n]+)/i),
      pred10k: g(fitTxt, /10\s*km Prediction:\s*([^\n]+)/i),
      predHM: g(fitTxt, /Half Marathon Prediction:\s*([^\n]+)/i),
      predM: g(fitTxt, /(?<!Half )Marathon Prediction:\s*([^\n]+)/i),
    };
    let profile = null;
    try {
      const uiTxt = await corosTool(token, "queryUserInfo", {});
      const bday = g(uiTxt, /Birthday:\s*(\d{4}-\d{2}-\d{2})/i);
      profile = { birthday: bday, height: g(uiTxt, /Height:\s*([\d.]+)/i), weight: g(uiTxt, /Weight:\s*([\d.]+)/i) };
    } catch { /* profil optional */ }
    const data = { recovery, fitness, profile, access_expires: a0?.access_expires ?? null, synced_at: Date.now() };
    await supabase.from("coros_snapshot").upsert({ user_id: userId, data, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    snapshotSaved = true;
  } catch { /* Snapshot ist optional — Tagesdaten sind das Wichtige */ }

  return Response.json({ ok: true, synced: rows.length, days: rows.map((r) => r.date), snapshot: snapshotSaved });
}
