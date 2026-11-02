import { NextResponse, type NextRequest } from "next/server";
import { getUserOrNull } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/ratelimit";

export const runtime = "nodejs";
/** Permanently deletes the caller (identity from session only). Cascades remove all rows; stored files are removed first. */
export async function POST(req: NextRequest) {
  const a = await getUserOrNull(); if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const back = (code: string) => NextResponse.redirect(new URL(`/settings?delete_error=${code}`, req.url), 303);
  if (!rateLimit(`del:${a.user.id}`, 10, 10 * 60_000).ok) return back("rate");
  // Destructive: re-verify the session with the auth server rather than trusting the local JWT check.
  const { data: fresh } = await a.supabase.auth.getUser(); if (!fresh.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const fd = await req.formData();
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 100); const detail = String(fd.get("detail") ?? "").trim().slice(0, 300);
  if (!reason) return back("reason");
  // Files first, as the user (storage RLS allows only their own folder). Then the database function deletes the account
  // using the verified session identity — no service_role key needed.
  for (const dir of ["imports", "avatar"]) {
    const { data: files } = await a.supabase.storage.from("private-files").list(`${a.user.id}/${dir}`, { limit: 1000 });
    if (files?.length) await a.supabase.storage.from("private-files").remove(files.map((f) => `${a.user.id}/${dir}/${f.name}`));
  }
  const { error } = await a.supabase.rpc("delete_my_account", { p_reason: reason, p_detail: detail || null });
  if (error) { console.error("account delete failed:", error.code, error.message); return back(error.code === "PGRST202" || error.code === "42883" ? "config" : "failed"); }
  await a.supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login?deleted=1", req.url), 303);
}
