"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const H = {
  bg: "#07070B",
  card: "rgba(255,255,255,0.055)",
  line: "rgba(255,255,255,0.12)",
  text: "#F4F3F8",
  sub: "#9C99AB",
  blue: "#8B7CFF",
  up: "#34E0A1",
  down: "#FB6A62",
};

const input: React.CSSProperties = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: 12,
  border: "1px solid " + H.line,
  background: "rgba(255,255,255,0.04)",
  color: H.text,
  fontSize: 15,
  boxSizing: "border-box",
  outline: "none",
  marginBottom: 10,
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState("");

  const login = async () => {
    if (!email.trim() || !pw || busy) return;
    setBusy(true); setMsg("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) { setMsg("E-Mail oder Passwort falsch. Beim ersten Mal: unten den Login-Link per Mail nutzen und danach in der App ein Passwort setzen."); return; }
    window.location.assign("/");
  };

  const sendLink = async () => {
    if (!email.trim() || busy) return;
    setBusy(true); setMsg("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) { setMsg("Konnte den Link nicht senden — nochmal versuchen."); return; }
    setSent(true);
  };

  return (
    <div style={{ minHeight: "100dvh", background: "linear-gradient(180deg,#0C0A16,#07070B)", color: H.text, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-manrope), -apple-system, sans-serif", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ fontSize: 30, fontWeight: 820, letterSpacing: -0.7 }}>Performance OS</div>
        <div style={{ fontSize: 14, color: H.sub, margin: "6px 0 26px" }}>Dein privates Training- & Ernährungs-Hub</div>

        {sent ? (
          <div style={{ background: H.card, border: "1px solid " + H.line, borderRadius: 16, padding: 20, fontSize: 14.5, lineHeight: 1.55 }}>
            <div style={{ color: H.up, fontWeight: 750, marginBottom: 6 }}>Check deine Mails 📬</div>
            Login-Link an <b>{email}</b> geschickt. Öffne ihn auf diesem Gerät — danach kannst du in den Einstellungen ein Passwort setzen.
          </div>
        ) : (
          <>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-Mail" autoComplete="username" style={input} />
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") login(); }} placeholder="Passwort" autoComplete="current-password" style={input} />
            <button onClick={login} disabled={busy || !email.trim() || !pw}
              style={{ width: "100%", padding: 14, borderRadius: 13, border: "none", background: busy || !email.trim() || !pw ? H.card : "linear-gradient(140deg,#8B7CFF,#6E5CFF)", color: busy || !email.trim() || !pw ? H.sub : "#fff", fontWeight: 750, fontSize: 15, cursor: busy ? "default" : "pointer" }}>
              {busy ? "…" : "Anmelden"}
            </button>
            {msg && <div style={{ fontSize: 13, color: H.down, marginTop: 10, lineHeight: 1.5 }}>{msg}</div>}
            <div style={{ height: 1, background: H.line, margin: "20px 0" }} />
            <button onClick={sendLink} disabled={busy || !email.trim()}
              style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid " + H.line, background: "transparent", color: H.text, fontWeight: 650, fontSize: 14, cursor: busy ? "default" : "pointer" }}>
              Login-Link per Mail (erstes Mal / Passwort vergessen)
            </button>
            <div style={{ fontSize: 12, color: H.sub, marginTop: 14, lineHeight: 1.5 }}>
              Erstes Mal? Nutze den Mail-Link — danach in den Einstellungen ein Passwort festlegen, dann geht der direkte Login.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
