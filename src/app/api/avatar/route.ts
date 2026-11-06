import { NextResponse } from "next/server";
import { getUserOrNull, requireUser } from "@/lib/server/auth";

/** Redirects to a short-lived signed URL of the signed-in user's own avatar. The browser caches it, so it costs nothing on later pages. */
export async function GET() {
  const a = await getUserOrNull(); if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { profile } = await requireUser(); if (!profile.avatar_path) return new NextResponse(null, { status: 404 });
  const { data } = await a.supabase.storage.from("private-files").createSignedUrl(profile.avatar_path, 900);
  if (!data?.signedUrl) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(data.signedUrl, { status: 307, headers: { "Cache-Control": "private, max-age=600" } });
}
