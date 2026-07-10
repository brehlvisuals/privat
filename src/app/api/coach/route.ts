import Anthropic from "@anthropic-ai/sdk";

// Serverseitiger Proxy für alle KI-Calls. API-Key bleibt im Server.
// Unterstützt Tool-Use (log_meal): der Coach kann Mahlzeiten eintragen.
// Der Tool-Loop läuft im Client (er wendet die Aktion auf den App-Zustand an
// und schickt das tool_result zurück).

export const runtime = "nodejs";

const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 4096;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "log_meal",
    description:
      "Trägt EIN einzelnes Lebensmittel in Felix' Ernährungstagebuch ein (für heute). WICHTIG: Bei zusammengesetzten Mahlzeiten (z.B. 'Brötchen mit Frischkäse und 5 Eiern') rufe das Tool MEHRFACH auf — ein Aufruf pro Lebensmittel (Brötchen; Frischkäse; Eier) —, damit jedes einzeln editierbar ist. Fasse NICHT alles zu einem Eintrag zusammen. Gib je Lebensmittel Menge + Einheit + die Nährwerte für DIESE Menge an. Schätze realistische Werte, wenn nötig. Nur aufrufen, wenn Felix mitteilt, dass er etwas gegessen hat.",
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
  {
    name: "create_food",
    description:
      "Legt ein FESTES Lebensmittel dauerhaft in Felix' Bibliothek an (taucht danach in der Ernährungs-Suchliste auf, zum späteren Wiederverwenden). Nutze das, wenn Felix sagt 'leg mal X als Lebensmittel an' oder ein Produkt/Rezept speichern will. Nährwerte IMMER pro Referenzmenge (per + unit) angeben, z.B. pro 100 g. Das trägt nichts ins Tagebuch ein — dafür ist log_meal da.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name des Lebensmittels, z.B. 'Magerquark 20%'" },
        brand: { type: "string", description: "Marke (optional)" },
        base_unit: { type: "string", enum: ["g", "ml", "piece"], description: "Einheit der Referenzmenge" },
        per: { type: "number", description: "Referenzmenge, meist 100 (= Werte pro 100 g/ml) oder 1 (pro Stück)" },
        kcal: { type: "number", description: "Kalorien pro Referenzmenge" },
        protein: { type: "number", description: "Protein (g) pro Referenzmenge" },
        fat: { type: "number", description: "Fett (g) pro Referenzmenge" },
        carbs: { type: "number", description: "Kohlenhydrate (g) pro Referenzmenge" },
      },
      required: ["name", "base_unit", "per", "kcal", "protein", "fat", "carbs"],
    },
  },
  {
    name: "adjust_activity",
    description:
      "Passt die Aktivitätsenergie (Aktiv-kcal aus Coros/Apple Health) in Performance OS manuell an — für den Fall, dass Coros falsch/unvollständig übertragen hat. mode 'add' addiert kcal drauf (auch negativ zum Abziehen), mode 'set' setzt einen absoluten Aktiv-kcal-Wert. Standard-Tag ist heute. Die Korrektur überlebt spätere Health-Syncs.",
    input_schema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["add", "set"], description: "'add' = draufrechnen (z.B. +500), 'set' = absoluten Wert setzen" },
        kcal: { type: "number", description: "kcal-Betrag (bei 'add' auch negativ möglich)" },
        date: { type: "string", description: "Datum YYYY-MM-DD (optional, Standard heute)" },
      },
      required: ["mode", "kcal"],
    },
  },
];

type Role = "user" | "assistant";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Block = any;
type Msg = { role: Role; content: unknown };

// Repariert Tool-Use/Tool-Result-Paarung, damit die Anthropic-API nie ein
// „tool_use ohne folgendes tool_result" (oder umgekehrt) sieht.
function sanitizeToolPairs(msgs: Msg[]): Msg[] {
  const out: Msg[] = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    // Assistant mit tool_use: nur behalten, wenn die NÄCHSTE Nachricht alle
    // passenden tool_result-Blöcke enthält. Sonst tool_use verwerfen (Text behalten).
    if (m.role === "assistant" && Array.isArray(m.content)) {
      const ids = (m.content as Block[]).filter((b) => b && b.type === "tool_use").map((b) => b.id);
      if (ids.length) {
        const next = msgs[i + 1];
        const resIds: string[] = next && next.role === "user" && Array.isArray(next.content)
          ? (next.content as Block[]).filter((b) => b && b.type === "tool_result").map((b) => b.tool_use_id)
          : [];
        const ok = ids.every((id) => resIds.includes(id));
        if (!ok) {
          const text = (m.content as Block[]).filter((b) => b && b.type === "text" && String(b.text || "").trim());
          if (text.length) out.push({ role: "assistant", content: text });
          continue; // nacktes tool_use verwerfen
        }
      }
    }
    // User mit tool_result: nur behalten, wenn die zuletzt behaltene Nachricht ein
    // Assistant mit passenden tool_use-Ids ist. Verwaiste tool_results verwerfen.
    if (m.role === "user" && Array.isArray(m.content) && (m.content as Block[]).some((b) => b && b.type === "tool_result")) {
      const prev = out[out.length - 1];
      const prevIds: string[] = prev && prev.role === "assistant" && Array.isArray(prev.content)
        ? (prev.content as Block[]).filter((b) => b && b.type === "tool_use").map((b) => b.id)
        : [];
      const kept = (m.content as Block[]).filter((b) => !(b && b.type === "tool_result") || prevIds.includes(b.tool_use_id));
      const nonEmpty = kept.filter((b) => !(b && b.type === "text" && !String(b.text || "").trim()));
      if (nonEmpty.length) out.push({ role: "user", content: nonEmpty });
      continue;
    }
    out.push(m);
  }
  // Führende Assistant-Nachrichten sind bei der API unzulässig → abschneiden.
  while (out.length && out[0].role === "assistant") out.shift();
  return out;
}

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

  // Verlauf reparieren: jeder tool_use MUSS direkt danach ein passendes tool_result haben.
  // Bricht ein Tool-Loop im Client ab, bleibt sonst ein „nacktes" tool_use hängen und
  // die API lehnt ALLE Folgeanfragen ab. Wir entfernen unvollständige Tool-Paare.
  const sanitized = sanitizeToolPairs(clean);
  if (sanitized.length === 0) {
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
      messages: sanitized as any,
    });

    // Normalisierte Blöcke zurückgeben (text + tool_use), damit der Client
    // den Tool-Loop fahren kann.
    const content = resp.content
      .map((b) => {
        if (b.type === "text") return { type: "text", text: b.text };
        if (b.type === "tool_use") return { type: "tool_use", id: b.id, name: b.name, input: b.input };
        // Thinking-Blöcke MÜSSEN vollständig (inkl. Signatur) erhalten bleiben,
        // sonst lehnt die API den Folge-Request im Tool-Loop ab
        // ("messages.N.content.0.thinking.thinking: Field required").
        if (b.type === "thinking") return { type: "thinking", thinking: b.thinking, signature: b.signature };
        if (b.type === "redacted_thinking") return { type: "redacted_thinking", data: b.data };
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
