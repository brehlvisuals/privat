"use client";

import { useEffect, useState } from "react";
import { isChunkError, reloadOnce, reportClientError } from "@/lib/client-error";

// Gemeinsame Fehleransicht (Apple-Stil) für error.tsx und global-error.tsx.
// Meldet den Fehler an den Server und heilt den PWA-Update-Fall selbst.
export default function ErrorView({ error, reset, kind }: { error: Error & { digest?: string }; reset?: () => void; kind: string }) {
  const [healing, setHealing] = useState(false);
  useEffect(() => {
    reportClientError(error, kind);
    if (isChunkError(error) && reloadOnce()) setHealing(true);
  }, [error, kind]);

  const btn: React.CSSProperties = { width: "100%", height: 50, borderRadius: 12, border: "none", fontSize: 17, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
  return (
    <div style={{ minHeight: "100dvh", background: "#000", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380, textAlign: "center" }}>
        <div style={{ fontSize: 44, marginBottom: 10 }}>⚠️</div>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.01em" }}>{healing ? "Neue Version wird geladen …" : "Da ist was schiefgelaufen"}</div>
        <div style={{ fontSize: 15, color: "rgba(235,235,245,0.6)", margin: "8px 0 24px", lineHeight: 1.45 }}>
          {healing ? "Die App aktualisiert sich gerade." : "Deine Daten sind sicher. Lade die App einfach neu — der Fehler wurde automatisch gemeldet."}
        </div>
        {!healing && <>
          <button onClick={() => window.location.reload()} style={{ ...btn, background: "#7D7AFF", color: "#fff" }}>Neu laden</button>
          {reset && <button onClick={() => reset()} style={{ ...btn, marginTop: 10, background: "rgba(118,118,128,0.24)", color: "#7D7AFF" }}>Nochmal versuchen</button>}
          <div style={{ marginTop: 22, fontSize: 12, color: "rgba(235,235,245,0.38)", wordBreak: "break-word" }}>{error?.message || "Unbekannter Fehler"}</div>
        </>}
      </div>
    </div>
  );
}
