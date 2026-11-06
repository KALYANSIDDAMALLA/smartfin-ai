import "server-only";
import { forgetUser } from "./memo";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Creates an in-app notification for the CURRENT user. Prefers the service-role path when configured; otherwise uses the
 * `notify_me` database function through the user's own session (migration 20261101000006), so it works without any admin key.
 */
export async function notify(userId: string, kind: string, title: string, body?: string) {
  forgetUser(userId); // the cached unread count is now out of date
  try {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) { await createAdminClient().from("notifications").insert({ user_id: userId, kind, title, body }); return; }
    const sb = await createClient(); const { error } = await sb.rpc("notify_me", { p_kind: kind, p_title: title, p_body: body ?? null });
    if (error) console.error("notify (rpc) failed:", error.code);
  } catch (e) { console.error("notify failed", (e as Error).message); } // never block the user's action
}

/** Like `notify`, but skips it when the same kind+title was already sent within `days` (so reminders never repeat on every page load). */
export async function notifyOnce(userId: string, kind: string, title: string, body?: string, days = 1) {
  try {
    const sb = await createClient(); const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const { data } = await sb.from("notifications").select("id").eq("kind", kind).eq("title", title).gte("created_at", since).limit(1);
    if (data?.length) return false;
  } catch { return false; }
  await notify(userId, kind, title, body); return true;
}
