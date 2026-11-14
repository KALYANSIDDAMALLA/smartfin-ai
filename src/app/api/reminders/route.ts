import { NextResponse } from "next/server";
import { getUserOrNull, requireUser } from "@/lib/server/auth";
import { runReminders } from "@/lib/server/reminders";

/**
 * Runs the time-based reminders for the signed-in user. The layout no longer waits for them (they can take many database round trips),
 * so a small client trigger calls this after the page is on screen. Throttled to once per 30 minutes per user inside runReminders.
 */
export const dynamic = "force-dynamic";
export async function POST() {
  const a = await getUserOrNull(); if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { profile } = await requireUser();
  await runReminders(a.supabase, a.user.id, profile.timezone, profile.currency);
  const { count } = await a.supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  return NextResponse.json({ unread: count ?? 0 });
}
