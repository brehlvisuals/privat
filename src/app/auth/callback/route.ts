import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Magic-Link-Rückkehr: tauscht den Code gegen eine Session und leitet in die App.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(origin);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
