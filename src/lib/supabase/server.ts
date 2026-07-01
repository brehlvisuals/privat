import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server-Client für Route Handler / Server Components. cookies() ist in
// Next.js 15+ async — daher await.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // In Server Components kann set() blockiert sein — Proxy erneuert die Session.
          }
        },
      },
    },
  );
}
