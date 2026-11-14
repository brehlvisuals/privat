"use client";

import { useEffect } from "react";
import { isChunkError, reloadOnce, reportClientError } from "@/lib/client-error";

// Registriert den Service Worker (PWA / Offline) und hält die App aktuell:
// prüft beim Start (und stündlich) auf eine neue Version und lädt bei
// Übernahme durch den neuen Worker automatisch einmal neu.
export default function SwRegister() {
  // Unbehandelte Browser-Fehler melden; veraltete Skript-Dateien nach einem
  // Update (PWA lag im Hintergrund) durch einmaliges Neuladen selbst heilen.
  useEffect(() => {
    const onErr = (ev: ErrorEvent) => { reportClientError(ev.error || ev.message, "window"); if (isChunkError(ev.error || ev.message)) reloadOnce(); };
    const onRej = (ev: PromiseRejectionEvent) => { reportClientError(ev.reason, "promise"); if (isChunkError(ev.reason)) reloadOnce(); };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); };
  }, []);

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
