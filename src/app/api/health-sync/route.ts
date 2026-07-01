import { createClient } from "@supabase/supabase-js";

// Ingest-Endpunkt für Apple-Health-Daten via "Health Auto Export" (JSON REST API).
// Nimmt das komplette HAE-Format entgegen, aggregiert pro Tag, speichert ALLE
// Metriken in daily_context.metrics (jsonb) und mappt die Kern-Werte zusätzlich
// in typisierte Spalten, die die App direkt liest.
//
// Env (in Vercel gesetzt):
//   SUPABASE_SERVICE_ROLE_KEY, HEALTH_SYNC_TOKEN, HEALTH_SYNC_USER_ID, NEXT_PUBLIC_SUPABASE_URL
//
// HAE-Format:
//   { "data": { "metrics": [ { "name": "active_energy", "units": "kcal",
//       "data": [ { "date": "2026-07-01 00:00:00 +0000", "qty": 812 } ] }, ... ] } }
//   Herzfrequenz-artige Punkte: { date, Min, Avg, Max }
//   Schlaf: { date, totalSleep, asleep, core, deep, rem, ... }

export const runtime = "nodejs";
export const maxDuration = 30;

// Metriken, die pro Tag SUMMIERT werden (kumulativ). Alles andere → Tagesmittel.
const CUMULATIVE = new Set([
  "active_energy",
  "basal_energy_burned",
  "apple_exercise_time",
  "apple_stand_time",
  "step_count",
  "flights_climbed",
  "walking_running_distance",
  "distance_walking_running",
  "cycling_distance",
  "distance_cycling",
  "swimming_distance",
  "distance_swimming",
  "dietary_energy",
  "dietary_water",
]);

// HAE-Metrikname → typisierte Spalte in daily_context.
const COLUMN_MAP: Record<string, { col: string; int: boolean }> = {
  active_energy: { col: "activity_kcal", int: true },
  heart_rate_variability: { col: "hrv", int: true },
  resting_heart_rate: { col: "resting_hr", int: true },
  weight_body_mass: { col: "weight_kg", int: false },
  sleep_analysis: { col: "sleep_hours", int: false },
};

function toNum(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

// Skalaren Wert aus einem HAE-Datenpunkt ziehen.
function pointValue(name: string, p: Record<string, unknown>): number | null {
  if (p.qty !== undefined) return toNum(p.qty);
  if (p.Avg !== undefined) return toNum(p.Avg); // Herzfrequenz-artig
  if (name.includes("sleep")) {
    // Schlaf: Stunden aus totalSleep / asleep
    return toNum(p.totalSleep) ?? toNum(p.asleep) ?? null;
  }
  return null;
}

function dayOf(dateStr: unknown): string | null {
  if (typeof dateStr !== "string" || dateStr.length < 10) return null;
  const day = dateStr.slice(0, 10); // "yyyy-MM-dd"
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

export async function POST(request: Request) {
  const token = process.env.HEALTH_SYNC_TOKEN;
  const userId = process.env.HEALTH_SYNC_USER_ID;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!token || !userId || !serviceKey || !url) {
    return Response.json(
      { error: "Health-Sync ist serverseitig noch nicht konfiguriert." },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültiger Body." }, { status: 400 });
  }

  // Token aus Header, URL-Query (?token=...) oder Body — je nachdem was die App kann.
  const provided =
    request.headers.get("x-health-token") ||
    new URL(request.url).searchParams.get("token") ||
    (typeof body.token === "string" ? body.token : undefined);
  if (provided !== token) {
    return Response.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // --- HAE-Format: { data: { metrics: [...] } } ---
  const data = body.data as { metrics?: unknown } | undefined;
  const metrics = Array.isArray(data?.metrics) ? data!.metrics : null;

  if (metrics) {
    // Pro Tag pro Metrik { sum, count } sammeln.
    const byDay: Record<string, Record<string, { sum: number; count: number }>> = {};
    for (const m of metrics as Array<Record<string, unknown>>) {
      const name = typeof m.name === "string" ? m.name : null;
      const points = Array.isArray(m.data) ? m.data : null;
      if (!name || !points) continue;
      for (const p of points as Array<Record<string, unknown>>) {
        const day = dayOf(p.date);
        const val = pointValue(name, p);
        if (day === null || val === null) continue;
        (byDay[day] ??= {});
        const acc = (byDay[day][name] ??= { sum: 0, count: 0 });
        acc.sum += val;
        acc.count += 1;
      }
    }

    const days = Object.keys(byDay);
    if (days.length === 0) {
      return Response.json(
        { error: "Keine verwertbaren Metriken im Body." },
        { status: 400 },
      );
    }

    const rows = days.map((day) => {
      const metricsObj: Record<string, number> = {};
      const row: Record<string, unknown> = {
        user_id: userId,
        date: day,
        source: "apple_health",
      };
      for (const [name, { sum, count }] of Object.entries(byDay[day])) {
        const value = CUMULATIVE.has(name) ? sum : sum / count;
        const rounded = Math.round(value * 1000) / 1000;
        metricsObj[name] = rounded;
        const map = COLUMN_MAP[name];
        if (map) row[map.col] = map.int ? Math.round(value) : Math.round(value * 100) / 100;
      }
      row.metrics = metricsObj;
      return row;
    });

    const { error } = await supabase
      .from("daily_context")
      .upsert(rows, { onConflict: "user_id,date" });

    if (error) {
      console.error("health-sync (HAE) upsert error:", error);
      return Response.json({ error: "Schreiben fehlgeschlagen." }, { status: 500 });
    }
    return Response.json({
      ok: true,
      format: "health-auto-export",
      days: days.length,
      metrics_seen: [...new Set((metrics as Array<Record<string, unknown>>).map((m) => m.name).filter(Boolean))],
    });
  }

  // --- Einfaches Format (manueller Test / Fallback) ---
  const date = (typeof body.date === "string" && body.date) || new Date().toISOString().slice(0, 10);
  const row: Record<string, unknown> = { user_id: userId, date, source: "manual" };
  const simple: [string, string, boolean][] = [
    ["activity_kcal", "activity_kcal", true],
    ["sleep_hours", "sleep_hours", false],
    ["hrv", "hrv", true],
    ["resting_hr", "resting_hr", true],
    ["weight_kg", "weight_kg", false],
    ["stress", "stress", false],
  ];
  let any = false;
  for (const [key, col, isInt] of simple) {
    const raw = body[key];
    if (raw === undefined || raw === null || raw === "") continue;
    if (col === "stress") row[col] = String(raw);
    else {
      const n = toNum(raw);
      if (n === null) continue;
      row[col] = isInt ? Math.round(n) : n;
    }
    any = true;
  }
  if (!any) {
    return Response.json({ error: "Keine Daten im Body." }, { status: 400 });
  }
  const { error } = await supabase
    .from("daily_context")
    .upsert(row, { onConflict: "user_id,date" });
  if (error) {
    console.error("health-sync (simple) upsert error:", error);
    return Response.json({ error: "Schreiben fehlgeschlagen." }, { status: 500 });
  }
  return Response.json({ ok: true, format: "simple", date });
}
