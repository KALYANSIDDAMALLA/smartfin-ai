"use server";
import { forgetUser } from "@/lib/server/memo";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { getUserOrNull } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/ratelimit";
import { checkName, cleanText } from "@/lib/validate";
import { PROFESSIONS } from "@/lib/professions";
import type { FormState } from "./auth";

const BUCKET = "private-files";
const MAX_BYTES = 400 * 1024; // the browser sends a 256x256 JPEG (~20-60 KB); anything bigger is not from our cropper

/** Stores the cropped avatar. Identity from the session; path is server-generated under the user's own folder. */
export async function uploadAvatar(_: FormState, fd: FormData): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  if (!rateLimit(`avatar:${a.user.id}`, 10, 10 * 60_000).ok) return { error: "Too many uploads. Try again in a few minutes." };
  const file = fd.get("file"); if (!(file instanceof File) || !file.size) return { error: "Choose a photo." };
  if (file.size > MAX_BYTES) return { error: "That image is too large." };
  const buf = new Uint8Array(await file.arrayBuffer());
  if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) return { error: "The photo must be a JPEG image." }; // magic bytes, not just the name
  const path = `${a.user.id}/avatar/${randomUUID()}.jpg`;
  const up = await a.supabase.storage.from(BUCKET).upload(path, buf, { contentType: "image/jpeg", upsert: false });
  if (up.error) return { error: "Could not store the photo." };
  const { data: prev } = await a.supabase.from("profiles").select("avatar_path").eq("id", a.user.id).maybeSingle();
  const { error } = await a.supabase.from("profiles").update({ avatar_path: path }).eq("id", a.user.id);
  if (error) {
    await a.supabase.storage.from(BUCKET).remove([path]);
    return { error: /avatar_path/.test(error.message) ? "Profile pictures need a one-time database update (migration 20261101000005)." : "Could not save your photo." };
  }
  if (prev?.avatar_path) await a.supabase.storage.from(BUCKET).remove([prev.avatar_path]);
  forgetUser(a.user.id); revalidatePath("/", "layout"); return { ok: "Profile picture updated." };
}

export async function removeAvatar(): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  const { data: prev } = await a.supabase.from("profiles").select("avatar_path").eq("id", a.user.id).maybeSingle();
  if (!prev?.avatar_path) return { ok: "No profile picture to remove." };
  const { error } = await a.supabase.from("profiles").update({ avatar_path: null }).eq("id", a.user.id);
  if (error) return { error: "Could not remove your photo." };
  await a.supabase.storage.from(BUCKET).remove([prev.avatar_path]);
  forgetUser(a.user.id); revalidatePath("/", "layout"); return { ok: "Profile picture removed." };
}

/** Full name (shown across the app) and profession. The name is also the profile's display name; both live with the signed-in user's own record. */
export async function saveProfileDetails(_: FormState, fd: FormData): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  if (!rateLimit(`profile:${a.user.id}`, 20, 60_000).ok) return { error: "Too many changes. Try again in a minute." };
  const name = String(fd.get("fullName") ?? ""); const profession = String(fd.get("profession") ?? "").trim();
  const e = checkName("Full name", name, { min: 2, max: 80, required: true }); if (e) return { error: e, fields: { fullName: e } };
  if (profession && !PROFESSIONS.includes(profession)) return { error: "Choose a profession from the list.", fields: { profession: "Choose a profession from the list." } };
  const full = cleanText(name);
  const r1 = await a.supabase.from("profiles").update({ display_name: full }).eq("id", a.user.id); if (r1.error) return { error: "Could not save your name." };
  const r2 = await a.supabase.auth.updateUser({ data: { full_name: full, profession: profession || null } });
  if (r2.error) return { error: "Your name was saved, but your profession couldn't be." };
  forgetUser(a.user.id); revalidatePath("/", "layout"); return { ok: "Profile details saved." };
}
