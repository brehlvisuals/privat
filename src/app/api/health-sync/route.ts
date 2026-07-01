import { createClient } from "@supabase/supabase-js";

// Ingest-Endpunkt für Apple-Health-Daten (Apple Kurzbefehl / Health Auto Export).
// Kein User-Login vorhanden → per Shared-Token gesichert + Service-Role-Key,
// schreibt in daily_context für die feste User-ID (Ein-Personen-App).
//
// Benötigte Env-Variablen (serverseitig, in Vercel setzen):
//   SUPABASE_SERVICE_ROLE_KEY  – Secret aus Supabase (Settings → API)
//   HEALTH_SYNC_TOKEN          – frei gewähltes Geheimnis, muss der Kurzbefehl mitsenden
//   HEALTH_SYNC_USER_ID        – Felix' auth.users-UUID (nach erstem Login)

export const runtime = "nodejs";

type Body = {
  token?: string;
  date?: string; // YYYY-MM-DD; default heute
  activity_kcal?: number;
  sleep_hours?: number;
  hrv?: number;
  resting_hr?: number;
  weight_kg?: number;
  stress?: string;
};

function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return typeof n === "number" && !Number.isNaN(n) ? n : null;
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

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültiger Body." }, { status: 400 });
  }

  // Token akzeptieren aus Header ODER Body (Kurzbefehle können beides).
  const provided = request.headers.get("x-health-token") || body.token;
  if (provided !== token) {
    return Response.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  const date = body.date || new Date().toISOString().slice(0, 10);

  // Nur gesetzte Felder schreiben (kein Überschreiben mit null).
  const row: Record<string, unknown> = { user_id: userId, date, source: "apple_health" };
  const fields: [keyof Body, string, "num" | "str"][] = [
    ["activity_kcal", "activity_kcal", "num"],
    ["sleep_hours", "sleep_hours", "num"],
    ["hrv", "hrv", "num"],
    ["resting_hr", "resting_hr", "num"],
    ["weight_kg", "weight_kg", "num"],
    ["stress", "stress", "str"],
  ];
  for (const [key, col, kind] of fields) {
    const raw = body[key];
    if (raw === undefined || raw === null || raw === "") continue;
    row[col] = kind === "num" ? num(raw) : String(raw);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase
    .from("daily_context")
    .upsert(row, { onConflict: "user_id,date" });

  if (error) {
    console.error("health-sync upsert error:", error);
    return Response.json({ error: "Schreiben fehlgeschlagen." }, { status: 500 });
  }

  return Response.json({ ok: true, date, written: Object.keys(row).length - 3 });
}
