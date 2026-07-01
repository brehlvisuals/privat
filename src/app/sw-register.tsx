"use client";

import { useEffect } from "react";

// Registriert den Service Worker (PWA / Offline). Läuft nur im Browser.
export default function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
