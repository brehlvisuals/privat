import Anthropic from "@anthropic-ai/sdk";

// Serverseitiger Proxy für alle KI-Calls. Der API-Key bleibt im Server
// (process.env.ANTHROPIC_API_KEY) und taucht nie im Client auf — das ist
// der zentrale Unterschied zum v3-Prototyp.

export const runtime = "nodejs";

const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 1000;

type Msg = { role: "user" | "assistant"; content: string };

export async function POST(request: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY fehlt auf dem Server." },
      { status: 500 },
    );
  }

  let body: { messages?: unknown; system?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  const { messages, system } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "`messages` fehlt oder ist leer." }, { status: 400 });
  }

  // Whitelist: nur role + content als String durchreichen.
  const clean: Msg[] = [];
  for (const m of messages) {
    if (
      m &&
      typeof m === "object" &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string"
    ) {
      clean.push({ role: m.role, content: m.content });
    }
  }
  if (clean.length === 0) {
    return Response.json({ error: "Keine gültigen Nachrichten." }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey: key });

  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      ...(typeof system === "string" && system ? { system } : {}),
      messages: clean,
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return Response.json({ text });
  } catch (err) {
    console.error("Anthropic-Fehler:", err);
    return Response.json({ error: "KI-Anfrage fehlgeschlagen." }, { status: 502 });
  }
}
