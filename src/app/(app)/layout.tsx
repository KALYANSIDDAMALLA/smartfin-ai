import { requireAuth, requireUser } from "@/lib/server/auth";
import { memo } from "@/lib/server/memo";
import { AppShell } from "@/components/app-shell";
import { loadLookups } from "@/lib/server/data";
import { RemindersTrigger } from "@/components/reminders-trigger";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireAuth(); // local JWT check, no network
  // One round of parallel reads (each is also cached per user). Reminders are NOT awaited here any more: <RemindersTrigger> starts them after the page paints.
  const [{ profile }, unread, lookups] = await Promise.all([
    requireUser(),
    memo(user.id, "unread", 15_000, async () => (await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null)).count ?? 0),
    loadLookups(supabase),
  ]);
  // The avatar image is fetched by the browser from /api/avatar, so signing a storage URL never delays a page.
  const avatarUrl = profile.avatar_path ? `/api/avatar?v=${encodeURIComponent(profile.avatar_path)}` : null;
  return <><RemindersTrigger unread={unread} /><AppShell name={profile.display_name ?? user.email ?? "You"} email={user.email} unread={unread} avatarUrl={avatarUrl} searchCtx={{ categories: lookups.categories, methods: lookups.methods }} timezone={profile.timezone}>{children}</AppShell></>;
}
