import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/", "/login", "/register", "/forgot-password", "/reset-password", "/auth", "/privacy", "/terms"];
const isPublic = (p: string) => PUBLIC.some((x) => p === x || (x !== "/" && p.startsWith(x + "/")));

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // getClaims() verifies the JWT signature locally (cached JWKS) and refreshes expired sessions — no per-request network call.
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims ?? null;
  const path = request.nextUrl.pathname;
  // Providers/emails may land on "/" or "/login" with an auth code (depending on the Supabase redirect allow-list). Hand it to the callback.
  const code = request.nextUrl.searchParams.get("code");
  if (code && (path === "/" || path === "/login")) {
    const url = request.nextUrl.clone(); url.pathname = "/auth/callback"; url.search = "";
    url.searchParams.set("code", code); const n = request.nextUrl.searchParams.get("next"); if (n) url.searchParams.set("next", n);
    return NextResponse.redirect(url);
  }
  if (!user && !isPublic(path) && !path.startsWith("/api/health") && !path.startsWith("/api/webhooks/")) { // webhooks have no login; each one verifies its own signature
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const url = request.nextUrl.clone(); url.pathname = "/login"; url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  if (user && (path === "/login" || path === "/register")) {
    const url = request.nextUrl.clone(); url.pathname = "/dashboard"; url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"] };
