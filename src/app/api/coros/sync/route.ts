import { createClient } from "@supabase/supabase-js";
import { accessToken, corosTool } from "@/lib/coros";

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
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  const key = new URL(request.url).searchParams.get("key") || "";
  if (!secret || (auth !== "Bearer " + secret && key !== secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

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

  if (!rows.length) return Response.json({ ok: true, synced: 0, note: "keine verwertbaren Coros-Daten" });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await supabase.from("daily_context").upsert(rows, { onConflict: "user_id,date" });
  if (error) return Response.json({ error: "db_write_failed", detail: error.message }, { status: 500 });

  return Response.json({ ok: true, synced: rows.length, days: rows.map((r) => r.date) });
}
