// Namenssuche über Open Food Facts (Millionen Produkte, inkl. dt. Marken).
// Liefert normalisierte Nährwerte je 100 g/ml. Ergänzt die lokale Bibliothek.

export const runtime = "nodejs";

function num(v: number | string | undefined | null): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

type OFFHit = {
  code?: string;
  product_name?: string;
  product_name_de?: string;
  brands?: string | string[];
  quantity?: string;
  nutriments?: Record<string, number | string | undefined>;
};

function brandStr(b: string | string[] | undefined): string {
  if (Array.isArray(b)) return b.join(", ");
  return b || "";
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) return Response.json({ results: [] });

  try {
    // search-a-licious (die klassische cgi/search.pl ist stark gedrosselt).
    const url =
      "https://search.openfoodfacts.org/search?" +
      new URLSearchParams({
        q,
        page_size: "25",
        lang: "de",
        fields: "code,product_name,product_name_de,brands,quantity,nutriments",
      }).toString();

    const res = await fetch(url, {
      headers: { "User-Agent": "PerformanceOS/1.0 (privat)" },
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    const hits: OFFHit[] = Array.isArray(data.hits) ? data.hits : [];

    const results = hits
      .map((p) => {
        const nut = p.nutriments || {};
        return {
          barcode: p.code || "",
          name: p.product_name_de || p.product_name || "",
          brand: brandStr(p.brands),
          quantity: p.quantity || "",
          base_unit: "g",
          per: 100,
          kcal: num(nut["energy-kcal_100g"]),
          protein: num(nut["proteins_100g"]),
          fat: num(nut["fat_100g"]),
          carbs: num(nut["carbohydrates_100g"]),
        };
      })
      // nur brauchbare Treffer: Name + wenigstens kcal vorhanden
      .filter((r) => r.name && r.kcal != null)
      .slice(0, 20);

    return Response.json({ results });
  } catch (err) {
    console.error("food-search error:", err);
    return Response.json({ results: [], error: "Suche fehlgeschlagen." }, { status: 200 });
  }
}
