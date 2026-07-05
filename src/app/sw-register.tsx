"use client";

import { useEffect } from "react";

// Registriert den Service Worker (PWA / Offline) und hält die App aktuell:
// prüft beim Start (und stündlich) auf eine neue Version und lädt bei
// Übernahme durch den neuen Worker automatisch einmal neu.
export default function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        reg.update();
        setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      })
      .catch(() => {});
    // Neuer Worker hat übernommen → einmal neu laden (nur wenn vorher schon einer lief,
    // damit die Erst-Installation keinen Reload auslöst).
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded || !hadController) return;
      reloaded = true;
      window.location.reload();
    });
  }, []);
  return null;
}
