// COROS-Anbindung: OAuth (Dynamic Client Registration + Authorization Code + Refresh)
// und ein MCP-Client, der die Coros-Datentools serverseitig aufruft.
// Token/Client-Daten liegen in Supabase (coros_auth), nur per Service-Role zugänglich.

import { createClient } from "@supabase/supabase-js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const OAUTH = {
  authorize: "https://mcpeu.coros.com/oauth2/authorize",
  token: "https://mcpeu.coros.com/oauth2/token",
  register: "https://mcpeu.coros.com/connect/register",
};
export const COROS_MCP_URL = "https://mcp.coros.com/mcp";
export const COROS_SCOPE = "openid mcp.tools offline_access";

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type CorosAuth = {
  target_user_id: string; client_id: string | null; client_secret: string | null;
  refresh_token: string | null; redirect_uri: string | null; pkce_verifier: string | null; state: string | null;
  sync_secret?: string | null;
};

export async function loadAuth(): Promise<CorosAuth | null> {
  const { data } = await admin().from("coros_auth").select("*").eq("id", "singleton").maybeSingle();
  return (data as CorosAuth) || null;
}
export async function saveAuth(patch: Partial<CorosAuth>) {
  const { error } = await admin().from("coros_auth").upsert({ id: "singleton", updated_at: new Date().toISOString(), ...patch });
  if (error) { console.error("coros saveAuth error:", error); throw new Error("saveAuth: " + error.message); }
}

// PKCE-Helfer
function b64url(buf: ArrayBuffer | Uint8Array) {
  const b = Buffer.from(buf as Uint8Array);
  return b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function randomString(n = 48) {
  return b64url(crypto.getRandomValues(new Uint8Array(n)));
}
export async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

// Registriert (einmalig) einen OAuth-Client per Dynamic Client Registration.
export async function ensureClient(redirectUri: string): Promise<{ client_id: string; client_secret: string | null }> {
  const existing = await loadAuth();
  if (existing?.client_id) return { client_id: existing.client_id, client_secret: existing.client_secret || null };
  const res = await fetch(OAUTH.register, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Performance OS",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
      scope: COROS_SCOPE,
    }),
  });
  if (!res.ok) throw new Error("register failed: " + res.status + " " + (await res.text()));
  const j = await res.json();
  await saveAuth({ target_user_id: process.env.HEALTH_SYNC_USER_ID!, client_id: j.client_id, client_secret: j.client_secret || null, redirect_uri: redirectUri });
  return { client_id: j.client_id, client_secret: j.client_secret || null };
}

export async function exchangeCode(code: string, verifier: string, redirectUri: string) {
  const a = await loadAuth();
  const body = new URLSearchParams({
    grant_type: "authorization_code", code, redirect_uri: redirectUri,
    client_id: a!.client_id!, code_verifier: verifier,
  });
  if (a!.client_secret) body.set("client_secret", a!.client_secret);
  const res = await fetch(OAUTH.token, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!res.ok) throw new Error("token exchange failed: " + res.status + " " + (await res.text()));
  const j = await res.json();
  await saveAuth({ refresh_token: j.refresh_token, pkce_verifier: null, state: null });
  return j;
}

export async function accessToken(): Promise<string> {
  const a = await loadAuth();
  if (!a?.refresh_token) throw new Error("not_connected");
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: a.refresh_token, client_id: a.client_id! });
  if (a.client_secret) body.set("client_secret", a.client_secret);
  const res = await fetch(OAUTH.token, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!res.ok) throw new Error("refresh failed: " + res.status + " " + (await res.text()));
  const j = await res.json();
  if (j.refresh_token && j.refresh_token !== a.refresh_token) await saveAuth({ refresh_token: j.refresh_token });
  return j.access_token as string;
}

// Ruft ein Coros-MCP-Tool auf und gibt den Text-Output zurück.
export async function corosTool(token: string, name: string, args: Record<string, unknown>): Promise<string> {
  const transport = new StreamableHTTPClientTransport(new URL(COROS_MCP_URL), {
    requestInit: { headers: { Authorization: "Bearer " + token } },
  });
  const client = new Client({ name: "performance-os-sync", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    const res = await client.callTool({ name, arguments: args });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content = (res as any).content;
    if (Array.isArray(content)) return content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
    return typeof content === "string" ? content : JSON.stringify(content);
  } finally {
    try { await client.close(); } catch { /* ignore */ }
  }
}
