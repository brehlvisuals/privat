"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const H = {
  bg: "#0D0D10",
  card: "#1A1A21",
  line: "#2A2A33",
  text: "#F3F3F6",
  sub: "#9A9AA6",
  blue: "#2E6BFF",
  up: "#27C28B",
  down: "#FF5A52",
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );

  const send = async () => {
    if (!email.trim() || status === "sending") return;
    setStatus("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setStatus(error ? "error" : "sent");
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: H.bg,
        color: H.text,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "ui-sans-serif,-apple-system,Segoe UI,Roboto,sans-serif",
        padding: 20,
      }}
    >
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ fontSize: 30, fontWeight: 820, letterSpacing: -0.7 }}>
          Performance OS
        </div>
        <div style={{ fontSize: 14, color: H.sub, margin: "6px 0 26px" }}>
          Dein privates Training- & Ernährungs-Hub
        </div>

        {status === "sent" ? (
          <div
            style={{
              background: H.card,
              border: "1px solid " + H.line,
              borderRadius: 16,
              padding: 20,
              fontSize: 14.5,
              lineHeight: 1.55,
            }}
          >
            <div style={{ color: H.up, fontWeight: 750, marginBottom: 6 }}>
              Check deine Mails 📬
            </div>
            Ich hab dir einen Login-Link an <b>{email}</b> geschickt. Öffne ihn
            auf diesem Gerät, dann bist du drin.
          </div>
        ) : (
          <>
            <label
              style={{
                fontSize: 12.5,
                color: H.sub,
                display: "block",
                marginBottom: 8,
              }}
            >
              E-Mail-Adresse
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
              placeholder="du@example.com"
              autoComplete="email"
              style={{
                width: "100%",
                padding: "13px 14px",
                borderRadius: 12,
                border: "1px solid " + H.line,
                background: "#101015",
                color: H.text,
                fontSize: 15,
                boxSizing: "border-box",
                outline: "none",
                marginBottom: 12,
              }}
            />
            <button
              onClick={send}
              disabled={status === "sending" || !email.trim()}
              style={{
                width: "100%",
                padding: 14,
                borderRadius: 13,
                border: "none",
                background:
                  status === "sending" || !email.trim() ? H.card : H.blue,
                color: status === "sending" || !email.trim() ? H.sub : "#fff",
                fontWeight: 750,
                fontSize: 15,
                cursor: status === "sending" ? "default" : "pointer",
              }}
            >
              {status === "sending" ? "Wird gesendet …" : "Login-Link senden"}
            </button>
            {status === "error" && (
              <div style={{ fontSize: 13, color: H.down, marginTop: 10 }}>
                Da ging was schief — nochmal versuchen.
              </div>
            )}
            <div style={{ fontSize: 12, color: H.sub, marginTop: 14, lineHeight: 1.5 }}>
              Kein Passwort nötig — du bekommst einen einmaligen Login-Link per
              Mail.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
