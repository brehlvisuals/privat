import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy-helper";

// Next.js 16: Middleware wurde in "proxy" umbenannt (Funktion heißt proxy).
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Alles außer statischen Assets und PWA-Dateien.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icon-192.png|icon-512.png|apple-touch-icon.png).*)",
  ],
};
