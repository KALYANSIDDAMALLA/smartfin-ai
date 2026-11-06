import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { memo } from "./memo";

export interface SessionUser { id: string; email?: string }
/**
 * Identity always comes from the verified session, never from client input.
 * getClaims() verifies the JWT signature locally against Supabase's cached public keys (no network round-trip),
 * and refreshes the session when expired. Sensitive operations (account deletion) additionally call getUser().
 */
/** Auth only: verifies the JWT locally (no network). Cached per request. */
const loadAuth = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return null;
  uids.set(supabase, data.claims.sub);
  return { supabase, user: { id: data.claims.sub, email: data.claims.email as string | undefined } as SessionUser };
});
const uids = new WeakMap<object, string>();
/** The verified user id behind a client created by this module (used to key per-user caches). */
export const userIdOf = (sb: object) => uids.get(sb);

type Profile = { display_name: string | null; currency: string; timezone: string; avatar_path?: string | null };
const DEFAULT_PROFILE: Profile = { display_name: null, currency: "INR", timezone: "Asia/Kolkata", avatar_path: null };
const loadProfile = cache(async (supabase: Awaited<ReturnType<typeof createClient>>, uid: string) => memo(uid, "profile", 60_000, async () => {
  let { data: profile } = await supabase.from("profiles").select("display_name,currency,timezone,avatar_path").eq("id", uid).single<Profile>();
  // If the avatar migration hasn't been applied yet the column is missing: fall back so the app keeps working.
  if (!profile) ({ data: profile } = await supabase.from("profiles").select("display_name,currency,timezone").eq("id", uid).single<Profile>());
  return profile ?? DEFAULT_PROFILE;
}));
const loadSession = cache(async () => {
  const a = await loadAuth(); if (!a) return null;
  return { ...a, profile: await loadProfile(a.supabase, a.user.id) };
});
/** Auth check only (fast): lets a layout start other reads in parallel with the profile read. */
export async function requireAuth() { const a = await loadAuth(); if (!a) redirect("/login"); return a; }
/** Memoised per request: the layout and the page share one auth check + profile read instead of repeating them. */
export async function requireUser() {
  const s = await loadSession();
  if (!s) redirect("/login");
  return s;
}

/** For API routes: returns null instead of redirecting. */
export async function getUserOrNull() {
  const s = await loadSession();
  return s ? { supabase: s.supabase, user: s.user } : null;
}
