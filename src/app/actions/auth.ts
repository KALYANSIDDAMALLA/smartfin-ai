"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/server/ratelimit";
import { recaptchaEnforced, verifyRecaptcha } from "@/lib/server/recaptcha";
import { TERMS_VERSION } from "@/lib/terms";

/** `fields` maps a form field name to its own error message, shown under that field. */
export type FormState = { error?: string; ok?: string; fields?: Record<string, string> } | undefined;
const email = z.string().trim().toLowerCase().email();
const password = z.string().min(8, "Password must be at least 8 characters").max(128);
const matches = <T extends { password: string; confirm?: string }>(d: T) => d.password === d.confirm;
const mismatch = { message: "Passwords do not match", path: ["confirm"] };

const RATE = "Too many verification emails were sent recently. Please wait about an hour and try again (the email service allows only a few per hour).";
const isRate = (e: { message?: string; code?: string; status?: number }) => e.code === "over_email_send_rate_limit" || e.status === 429 || /rate limit/i.test(e.message ?? "");

async function origin() { const h = await headers(); return process.env.NEXT_PUBLIC_SITE_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`; }
async function ip() { const h = await headers(); return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"; }

export async function register(_: FormState, fd: FormData): Promise<FormState> {
  if (!rateLimit(`reg:${await ip()}`, 5, 60_000).ok) return { error: "Too many attempts. Try again in a minute." };
  const nm = (l: string) => z.string().trim().min(1, `${l} is required`).max(50);
  const phone = z.string().trim().optional().transform((v) => v?.replace(/[\s()-]/g, "") ?? "").refine((v) => v === "" || /^\+?\d{7,15}$/.test(v), "Enter a valid phone number or leave it blank");
  const p = z.object({ firstName: nm("First name"), lastName: nm("Last name"), email, phone, password, confirm: z.string(), terms: z.literal("on", { error: "Please agree to the Terms and Privacy Policy to create an account." }) }).refine(matches, mismatch).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  // Bot check (only when reCAPTCHA keys are configured). Done after the cheap field checks and before anything is sent to Supabase.
  if (recaptchaEnforced() && !(await verifyRecaptcha(String(fd.get("g-recaptcha-response") ?? ""), await ip()))) return { error: "Please confirm you're not a robot, then try again." };
  const sb = await createClient();
  const { error } = await sb.auth.signUp({ email: p.data.email, password: p.data.password, options: { emailRedirectTo: `${await origin()}/auth/callback`, data: { terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION, display_name: `${p.data.firstName} ${p.data.lastName}`, first_name: p.data.firstName, last_name: p.data.lastName, ...(p.data.phone ? { phone: p.data.phone } : {}) } } });
  if (error) return { error: isRate(error) ? RATE : error.message };
  return { ok: "Check your email to verify your account, then log in." };
}

export async function login(_: FormState, fd: FormData): Promise<FormState> {
  if (!rateLimit(`login:${await ip()}`, 10, 60_000).ok) return { error: "Too many attempts. Try again in a minute." };
  const p = z.object({ email, password: z.string().min(1) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Enter a valid email and password." };
  const sb = await createClient();
  const { error } = await sb.auth.signInWithPassword(p.data);
  if (error) return { error: error.message.includes("not confirmed") ? "Please verify your email first." : "Invalid email or password." };
  const next = String(fd.get("next") ?? "/dashboard");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

/** Resends the sign-up verification email. Same response whether or not the account exists. */
export async function resendVerification(_: FormState, fd: FormData): Promise<FormState> {
  if (!rateLimit(`resend:${await ip()}`, 3, 60_000).ok) return { error: "Too many attempts. Try again in a minute." };
  const p = email.safeParse(fd.get("email")); if (!p.success) return { error: "Enter a valid email." };
  const sb = await createClient();
  const { error } = await sb.auth.resend({ type: "signup", email: p.data, options: { emailRedirectTo: `${await origin()}/auth/callback` } });
  if (error && isRate(error)) return { error: RATE };
  return { ok: "If that account is awaiting verification, a new link is on its way." };
}

/** Confirms the 6-digit signup code from the verification email, then signs the user in. */
export async function verifyEmailCode(_: FormState, fd: FormData): Promise<FormState> {
  if (!rateLimit(`otp:${await ip()}`, 10, 10 * 60_000).ok) return { error: "Too many attempts. Try again in a few minutes." };
  const p = z.object({ email, code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const sb = await createClient();
  const { error } = await sb.auth.verifyOtp({ email: p.data.email, token: p.data.code, type: "signup" });
  if (error) return { error: "That code is incorrect or has expired. Request a new one." };
  redirect("/dashboard");
}

/** Starts Google OAuth. Works only after the Google provider is enabled in Supabase; otherwise returns a clear error. */
export async function signInWithGoogle(_: FormState, fd: FormData): Promise<FormState> {
  if (!rateLimit(`oauth:${await ip()}`, 10, 60_000).ok) return { error: "Too many attempts. Try again in a minute." };
  const next = String(fd.get("next") ?? "/dashboard");
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  // signInWithOAuth builds a URL without checking the provider is enabled, so ask Supabase first.
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! }, cache: "no-store" });
    const cfg = await r.json();
    if (!cfg?.external?.google) return { error: "Google sign-in isn't enabled yet. In Supabase: Authentication → Providers → Google. Please use email for now." };
  } catch { return { error: "Could not reach the sign-in service. Try again." }; }
  const sb = await createClient();
  const { data, error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${await origin()}/login?next=${encodeURIComponent(safe)}` } });
  if (error || !data.url) return { error: /not enabled|unsupported provider/i.test(error?.message ?? "") ? "Google sign-in isn't set up yet. Use email for now." : "Could not start Google sign-in." };
  // Supabase reports provider misconfiguration (e.g. a missing client secret) as a raw JSON 400 at this URL. Probe it first.
  try {
    const probe = await fetch(data.url, { redirect: "manual", cache: "no-store" });
    if (probe.status === 400) {
      const j = await probe.json().catch(() => null);
      console.error("google oauth misconfigured:", j?.msg);
      return { error: /secret/i.test(j?.msg ?? "") ? "Google sign-in is turned on, but its Client Secret is missing in Supabase. Paste the secret in Authentication → Providers → Google and Save." : "Google sign-in isn't set up correctly in Supabase yet." };
    }
  } catch { /* if the probe fails, let the browser try */ }
  redirect(data.url);
}

export async function forgotPassword(_: FormState, fd: FormData): Promise<FormState> {
  if (!rateLimit(`forgot:${await ip()}`, 5, 60_000).ok) return { error: "Too many attempts. Try again in a minute." };
  const p = email.safeParse(fd.get("email"));
  if (p.success) { const sb = await createClient(); await sb.auth.resetPasswordForEmail(p.data, { redirectTo: `${await origin()}/auth/callback?next=/reset-password` }); }
  return { ok: "If that email has an account, a reset link is on its way." }; // never reveal whether an account exists
}

export async function resetPassword(_: FormState, fd: FormData): Promise<FormState> {
  const p = z.object({ password, confirm: z.string() }).refine(matches, mismatch).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const sb = await createClient();
  const { error } = await sb.auth.updateUser({ password: p.data.password });
  if (error) return { error: error.message };
  redirect("/dashboard");
}

export async function logout() { const sb = await createClient(); await sb.auth.signOut(); redirect("/login"); }
