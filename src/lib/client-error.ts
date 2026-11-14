// Client-Fehler melden & erkennen. Fehler im Browser (iPhone-PWA) tauchen sonst
// nirgends auf — so landen sie in den Vercel-Logs (/api/client-error).

export function reportClientError(err: unknown, kind: string) {
  try {
    const e = err as { name?: string; message?: string; stack?: string; digest?: string } | null;
    const payload = JSON.stringify({
      kind,
      name: e?.name || null,
      message: String(e?.message || err || "").slice(0, 600),
      stack: String(e?.stack || "").slice(0, 2000),
      digest: e?.digest || null,
      url: typeof location !== "undefined" ? location.href : null,
      ua: typeof navigator !== "undefined" ? navigator.userAgent : null,
      standalone: typeof window !== "undefined" ? window.matchMedia?.("(display-mode: standalone)").matches : null,
    });
    const blob = new Blob([payload], { type: "application/json" });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) navigator.sendBeacon("/api/client-error", blob);
    else fetch("/api/client-error", { method: "POST", body: payload, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
  } catch { /* Melden darf nie selbst crashen */ }
}

// Diagnose-Ereignis (kein Absturz) melden, z.B. Layout-Korrekturen auf dem iPhone.
export function reportClientInfo(kind: string, data: Record<string, unknown>) {
  try {
    const payload = JSON.stringify({ kind, ...data, url: typeof location !== "undefined" ? location.href : null, ua: typeof navigator !== "undefined" ? navigator.userAgent : null });
    const blob = new Blob([payload], { type: "application/json" });
    if (typeof navigator !== "undefined" && navigator.sendBeacon) navigator.sendBeacon("/api/client-error", blob);
  } catch { /* nie crashen */ }
}

// Typischer PWA-Fall nach einem Deploy: Die offene App will eine Skript-Datei
// der alten Version nachladen, die es nicht mehr gibt.
export function isChunkError(err: unknown): boolean {
  const e = err as { name?: string; message?: string } | null;
  const msg = String(e?.message || err || "");
  return e?.name === "ChunkLoadError" || /Loading (CSS )?chunk|dynamically imported module|Importing a module script failed|error loading dynamically/i.test(msg);
}

// Einmal neu laden (nicht in Schleife: höchstens alle 30 s).
export function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem("perfos_autoreload") || 0);
    if (Date.now() - last < 30000) return false;
    sessionStorage.setItem("perfos_autoreload", String(Date.now()));
  } catch { /* ohne Storage trotzdem neu laden */ }
  window.location.reload();
  return true;
}
