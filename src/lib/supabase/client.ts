import { createBrowserClient } from "@supabase/ssr";

// Browser-Client (nutzt den öffentlichen Publishable-Key + die User-Session).
// Als Singleton gehalten, damit nicht bei jedem Aufruf ein neuer Client entsteht.
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return browserClient;
}
