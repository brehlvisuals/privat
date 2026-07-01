import Anthropic from "@anthropic-ai/sdk";

// Serverseitiger Proxy für alle KI-Calls. API-Key bleibt im Server.
// Unterstützt Tool-Use (log_meal): der Coach kann Mahlzeiten eintragen.
// Der Tool-Loop läuft im Client (er wendet die Aktion auf den App-Zustand an
// und schickt das tool_result zurück).

export const runtime = "nodejs";

const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 1200;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "log_meal",
    description:
      "Trägt EIN einzelnes Lebensmittel in Felix' Ernährungstagebuch ein. WICHTIG: Bei zusammengesetzten Mahlzeiten (z.B. 'Brötchen mit Frischkäse und 5 Eiern') rufe das Tool MEHRFACH auf — ein Aufruf pro Lebensmittel (Brötchen; Frischkäse; Eier) —, damit jedes einzeln editierbar ist. Fasse NICHT alles zu einem Eintrag zusammen. Gib je Lebensmittel Menge + Einheit + die Nährwerte für DIESE Menge an. Schätze realistische Werte, wenn nötig. Nur aufrufen, wenn Felix mitteilt, dass er etwas gegessen hat.",
    input_schema: {
      type: "object",
      properties: {
        meal: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"], description: "Mahlzeitenkategorie (Frühstück/Mittag/Abend/Snack)" },
        name: { type: "string", description: "Name des EINZELNEN Lebensmittels, z.B. 'Körnerbrötchen' oder 'Eier'" },
        amount: { type: "number", description: "Menge (z.B. 100 für 100 g, oder 5 für 5 Stück)" },
        unit: { type: "string", enum: ["g", "ml", "piece", "Portion"], description: "Einheit der Menge" },
        kcal: { type: "number", description: "Kalorien für diese Menge" },
        protein: { type: "number", description: "Protein in Gramm für diese Menge" },
        fat: { type: "number", description: "Fett in Gramm für diese Menge" },
        carbs: { type: "number", description: "Kohlenhydrate in Gramm für diese Menge" },
      },
      required: ["meal", "name", "kcal", "protein", "fat", "carbs"],
    },
  },
];

type Role = "user" | "assistant";

export async function POST(request: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return Response.json({ error: "ANTHROPIC_API_KEY fehlt auf dem Server." }, { status: 500 });
  }

  let body: { messages?: unknown; system?: unknown; tools?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  const { messages, system } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "`messages` fehlt oder ist leer." }, { status: 400 });
  }

  // role prüfen; content darf String ODER Block-Array sein (für Tool-Use).
  const clean: { role: Role; content: unknown }[] = [];
  for (const m of messages) {
    if (m && typeof m === "object" && (m.role === "user" || m.role === "assistant") &&
        (typeof m.content === "string" || Array.isArray(m.content))) {
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
      ...(body.tools ? { tools: TOOLS } : {}),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: clean as any,
    });

    // Normalisierte Blöcke zurückgeben (text + tool_use), damit der Client
    // den Tool-Loop fahren kann.
    const content = resp.content
      .map((b) => {
        if (b.type === "text") return { type: "text", text: b.text };
        if (b.type === "tool_use") return { type: "tool_use", id: b.id, name: b.name, input: b.input };
        return { type: b.type };
      })
      // Leere Text-Blöcke entfernen — sonst lehnt die API den Folge-Request (Tool-Loop) ab.
      .filter((b) => !(b.type === "text" && (!("text" in b) || !String(b.text).trim())));
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return Response.json({ stop_reason: resp.stop_reason, content, text });
  } catch (err) {
    console.error("Anthropic-Fehler:", err);
    return Response.json({ error: "KI-Anfrage fehlgeschlagen." }, { status: 502 });
  }
}
