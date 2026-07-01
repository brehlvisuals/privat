// Produkt-Lookup per Barcode über Open Food Facts (frei, Millionen Produkte).
// Liefert normalisierte Nährwerte je 100 g zurück.

export const runtime = "nodejs";

type Nutriments = Record<string, number | string | undefined>;

function num(v: number | string | undefined): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

export async function GET(request: Request) {
  const barcode = new URL(request.url).searchParams.get("barcode")?.trim();
  if (!barcode || !/^\d{6,14}$/.test(barcode)) {
    return Response.json({ error: "Ungültiger Barcode." }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,product_name_de,brands,nutriments,quantity`,
      {
        headers: { "User-Agent": "PerformanceOS/1.0 (privat)" },
        // OFF kann langsam sein — Timeout via AbortSignal
        signal: AbortSignal.timeout(8000),
      },
    );
    const data = await res.json();

    if (data.status !== 1 || !data.product) {
      return Response.json({ found: false, barcode });
    }

    const p = data.product;
    const nut: Nutriments = p.nutriments || {};
    return Response.json({
      found: true,
      barcode,
      name: p.product_name_de || p.product_name || "",
      brand: p.brands || "",
      quantity: p.quantity || "",
      base_unit: "g",
      per: 100,
      kcal: num(nut["energy-kcal_100g"]),
      protein: num(nut["proteins_100g"]),
      fat: num(nut["fat_100g"]),
      carbs: num(nut["carbohydrates_100g"]),
    });
  } catch (err) {
    console.error("food-lookup error:", err);
    return Response.json({ error: "Lookup fehlgeschlagen." }, { status: 502 });
  }
}
