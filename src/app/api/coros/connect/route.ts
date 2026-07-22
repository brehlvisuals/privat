import { NextResponse } from "next/server";
import { ensureClient, saveAuth, randomString, pkceChallenge } from "@/lib/coros";

export const runtime = "nodejs";

// Startet den OAuth-Flow: registriert (einmalig) den Client, erzeugt PKCE + State
// und leitet zu COROS zur Autorisierung weiter.
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const redirectUri = origin + "/api/coros/callback";
  try {
    const { client_id } = await ensureClient(redirectUri);
    const verifier = randomString(48);
    const state = randomString(16);
    const challenge = await pkceChallenge(verifier);
    await saveAuth({ target_user_id: process.env.HEALTH_SYNC_USER_ID!, redirect_uri: redirectUri, pkce_verifier: verifier, state });
    const u = new URL("https://mcpeu.coros.com/oauth2/authorize");
    u.searchParams.set("response_type", "code");
    u.searchParams.set("client_id", client_id);
    u.searchParams.set("redirect_uri", redirectUri);
    u.searchParams.set("state", state);
    u.searchParams.set("code_challenge", challenge);
    u.searchParams.set("code_challenge_method", "S256");
    return NextResponse.redirect(u.toString());
  } catch (e) {
    return NextResponse.json({ error: "connect failed", detail: String(e) }, { status: 500 });
  }
}
