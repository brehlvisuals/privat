// Namenssuche über Open Food Facts (Millionen Produkte, inkl. dt. Marken).
// Liefert normalisierte Nährwerte je 100 g/ml. Ergänzt die lokale Bibliothek.
// Mehrere Quellen als Fallback-Kette, da die OFF-Endpunkte zeitweise ausfallen.

export const runtime = "nodejs";

const UA = "PerformanceOS/1.0 (privat; felix)";

function num(v: number | string | undefined | null): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

type OFFProduct = {
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

type Result = {
  barcode: string; name: string; brand: string; quantity: string;
  base_unit: string; per: number;
  kcal: number | null; protein: number | null; fat: number | null; carbs: number | null;
};

function normalize(products: OFFProduct[]): Result[] {
  return products
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
    .filter((r) => r.name && r.kcal != null)
    .slice(0, 20);
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(7000) });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("json")) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const FIELDS = "code,product_name,product_name_de,brands,quantity,nutriments";

// Quelle 1: klassische Text-Suche (cgi/search.pl) auf de. und world.
async function viaCgi(q: string): Promise<Result[]> {
  for (const host of ["https://de.openfoodfacts.org", "https://world.openfoodfacts.org"]) {
    const url = host + "/cgi/search.pl?" + new URLSearchParams({
      search_terms: q, search_simple: "1", action: "process", json: "1",
      page_size: "30", sort_by: "unique_scans_n", fields: FIELDS,
    }).toString();
    const data = (await fetchJson(url)) as { products?: OFFProduct[] } | null;
    if (data && Array.isArray(data.products) && data.products.length) {
      const r = normalize(data.products);
      if (r.length) return r;
    }
  }
  return [];
}

// Quelle 2: search-a-licious (schnell, aber fällt manchmal aus).
async function viaSalicious(q: string): Promise<Result[]> {
  const url = "https://search.openfoodfacts.org/search?" + new URLSearchParams({
    q, page_size: "30", lang: "de", fields: FIELDS,
  }).toString();
  const data = (await fetchJson(url)) as { hits?: OFFProduct[] } | null;
  return data && Array.isArray(data.hits) ? normalize(data.hits) : [];
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) return Response.json({ results: [] });

  // Fallback-Kette: erste Quelle mit Treffern gewinnt.
  for (const source of [viaCgi, viaSalicious]) {
    try {
      const results = await source(q);
      if (results.length) return Response.json({ results });
    } catch (err) {
      console.error("food-search source error:", err);
    }
  }
  return Response.json({ results: [] });
}
