import { requireAuth, requireUser } from "@/lib/server/auth";
import { memo } from "@/lib/server/memo";
import { AppShell } from "@/components/app-shell";
import { loadLookups } from "@/lib/server/data";
import { runReminders } from "@/lib/server/reminders";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireAuth(); // local JWT check; the profile, unread count and lookups below then load in parallel (and are cached per user)
  const profile0 = await requireUser(); await runReminders(supabase, user.id, profile0.profile.timezone, profile0.profile.currency); // time-based reminders (throttled), before the unread count is read
  const [{ profile }, unread, lookups] = await Promise.all([
    Promise.resolve(profile0),
    memo(user.id, "unread", 15_000, async () => (await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null)).count ?? 0),
    loadLookups(supabase),
  ]);
  // The avatar image is fetched by the browser from /api/avatar, so signing a storage URL never delays a page.
  const avatarUrl = profile.avatar_path ? `/api/avatar?v=${encodeURIComponent(profile.avatar_path)}` : null;
  return <AppShell name={profile.display_name ?? user.email ?? "You"} email={user.email} unread={unread} avatarUrl={avatarUrl} searchCtx={{ categories: lookups.categories, methods: lookups.methods }} timezone={profile.timezone}>{children}</AppShell>;
}
