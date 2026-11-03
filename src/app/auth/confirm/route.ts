import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Email links we send ourselves (password reset, resent verification): exchanges the one-time token for a session, then continues to `next`. */
const TYPES = ["recovery", "magiclink", "email", "signup"] as const;
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const token_hash = searchParams.get("token_hash"), type = searchParams.get("type") as (typeof TYPES)[number] | null;
  const next = searchParams.get("next") ?? "/dashboard", safe = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  if (token_hash && type && TYPES.includes(type)) {
    const sb = await createClient();
    const { error } = await sb.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(`${origin}${safe}`);
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
