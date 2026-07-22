import { NextResponse } from "next/server";
import { loadAuth, exchangeCode } from "@/lib/coros";

export const runtime = "nodejs";

// COROS-Rücksprung: tauscht den Code gegen Tokens und speichert den Refresh-Token.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const err = searchParams.get("error");
  if (err) return NextResponse.redirect(origin + "/?coros=error");
  try {
    const a = await loadAuth();
    if (!code || !a || state !== a.state) return NextResponse.redirect(origin + "/?coros=badstate");
    await exchangeCode(code, a.pkce_verifier!, a.redirect_uri!);
    return NextResponse.redirect(origin + "/?coros=connected");
  } catch (e) {
    return NextResponse.json({ error: "callback failed", detail: String(e) }, { status: 500 });
  }
}
