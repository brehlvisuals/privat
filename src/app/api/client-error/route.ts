// Nimmt Browser-Fehlerberichte der App entgegen und schreibt sie in die
// Vercel-Logs (console.error) — so sind iPhone-Abstürze nachvollziehbar.
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const raw = (await request.text()).slice(0, 5000);
    let data: unknown = raw;
    try { data = JSON.parse(raw); } catch { /* Rohtext loggen */ }
    console.error("[client-error]", JSON.stringify(data));
  } catch { /* ignorieren */ }
  return new Response(null, { status: 204 });
}
