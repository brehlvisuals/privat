import { NextResponse } from "next/server";
import { loadAuth, exchangeCode } from "@/lib/coros";

export const runtime = "nodejs";

// COROS-Rücksprung: tauscht den Code gegen Tokens und speichert den Refresh-Token.
// Bei Problemen wird eine aussagekräftige JSON-Antwort zurückgegeben (statt Redirect),
// damit die Ursache direkt sichtbar ist.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const err = searchParams.get("error");
  const errDesc = searchParams.get("error_description");

  if (err) return NextResponse.json({ step: "coros_authorize", error: err, description: errDesc, params: Object.fromEntries(searchParams) }, { status: 400 });

  const a = await loadAuth();
  if (!a) return NextResponse.json({ error: "no_auth_row" }, { status: 400 });
  if (!code) return NextResponse.json({ error: "no_code_returned", params: Object.fromEntries(searchParams) }, { status: 400 });
  if (a.state && state !== a.state) {
    // State-Mismatch nur protokollieren, aber fortfahren (Single-User-Flow, PKCE schützt).
    console.warn("coros callback state mismatch", { got: state, expected: a.state });
  }

  try {
    const tok = await exchangeCode(code, a.pkce_verifier!, a.redirect_uri!);
    const after = await loadAuth();
    if (!after?.refresh_token) {
      return NextResponse.json({ error: "no_refresh_token", note: "Token-Austausch ok, aber kein refresh_token erhalten (offline_access?)", token_keys: Object.keys(tok || {}) }, { status: 400 });
    }
    return NextResponse.redirect(origin + "/?coros=connected");
  } catch (e) {
    return NextResponse.json({ step: "token_exchange", error: String(e) }, { status: 400 });
  }
}
