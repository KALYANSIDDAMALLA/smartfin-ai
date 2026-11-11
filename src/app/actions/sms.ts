"use server";
import { revalidatePath } from "next/cache";
import { getUserOrNull } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/ratelimit";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken, newToken } from "@/lib/server/sms-ingest";
import type { FormState } from "./auth";

/** Creates (or replaces) the user's private forwarding token. The token is returned ONCE; only its hash is stored. Replacing it stops the old one working. */
export async function createSmsToken(): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  if (!rateLimit(`sms-token:${a.user.id}`, 10, 60 * 60_000).ok) return { error: "Too many attempts. Try again later." };
  const token = newToken();
  const { error } = await createAdminClient().from("sms_forwarding").upsert({ user_id: a.user.id, token_hash: hashToken(token), token_hint: token.slice(-4), created_at: new Date().toISOString(), last_used_at: null, received_count: 0 }, { onConflict: "user_id" });
  if (error) { console.error("sms token", error.message); return { error: "Could not create the token. Has the sms_forwarding migration been run?" }; }
  revalidatePath("/integrations");
  return { ok: "Token created. Copy it now: it is shown only once.", fields: { token } };
}

export async function revokeSmsToken(): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  const { error } = await createAdminClient().from("sms_forwarding").delete().eq("user_id", a.user.id);
  if (error) return { error: "Could not turn it off." };
  revalidatePath("/integrations");
  return { ok: "Instant SMS alerts are off. The old token no longer works." };
}
