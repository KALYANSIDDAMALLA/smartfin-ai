"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/server/ratelimit";
import { recaptchaEnforced, verifyRecaptcha } from "@/lib/server/recaptcha";
import { TERMS_VERSION } from "@/lib/terms";
import { createAdminClient } from "@/lib/supabase/admin";
import { mailConfigured, resetEmail, sendMail, verificationEmail } from "@/lib/server/mail";
import { checkEmailCode, checkEmailProof, checkPhoneCode, checkProof, currentEmailCode, makeEmailProof, makeProof, phoneOtpAvailable, sendPhoneCode as sendCode, validPhone } from "@/lib/server/phone-otp";

/** `fields` maps a form field name to its own error message, shown under that field. */
export type FormState = { error?: string; ok?: string; fields?: Record<string, string>; testCode?: string; proof?: string } | undefined;
const email = z.string().trim().toLowerCase().email();
const password = z.string().min(8, "Password must be at least 8 characters").max(128);
const matches = <T extends { password: string; confirm?: string }>(d: T) => d.password === d.confirm;
const mismatch = { message: "Passwords do not match", path: ["confirm"] };

/** In-app email codes need SMTP + the service role key; otherwise sign-up falls back to Supabase's own email. */
const emailCodesAvailable = () => mailConfigured() && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const EXISTS = "This email already exists. Please try a new email instead, or log in.";
const existsState = (): FormState => ({ fields: { email: EXISTS } }); // shown under the email field
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
  const proof = String(fd.get("phone_proof") ?? ""); const phoneVerified = !!p.data.phone && !!proof && checkProof(p.data.phone, proof); // set only when the number passed the SMS code step
  const meta = { terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION, display_name: `${p.data.firstName} ${p.data.lastName}`, first_name: p.data.firstName, last_name: p.data.lastName, ...(p.data.phone ? { phone: p.data.phone, phone_verified: phoneVerified } : {}) };
  // Verified-email flow: the address was verified with a code BEFORE this submit (sendEmailCode / verifyEmailProof). The account is created already confirmed, then signed in.
  if (emailCodesAvailable()) {
    if (!checkEmailProof(p.data.email, String(fd.get("email_proof") ?? ""))) return { fields: { email: "Verify your email with the 6-digit code first." } };
    const { error: ce } = await createAdminClient().auth.admin.createUser({ email: p.data.email, password: p.data.password, email_confirm: true, user_metadata: meta });
    if (ce) { if (/already|registered|exists/i.test(ce.message) || (ce as { code?: string }).code === "email_exists") return existsState(); return { error: "Could not create your account. Please try again." }; }
    const { error: se } = await sb.auth.signInWithPassword({ email: p.data.email, password: p.data.password });
    if (se) return { ok: "Account created. Please log in." };
    redirect("/dashboard");
  }
  const { data: su, error } = await sb.auth.signUp({ email: p.data.email, password: p.data.password, options: { emailRedirectTo: `${await origin()}/auth/callback`, data: { terms_accepted_at: new Date().toISOString(), terms_version: TERMS_VERSION, display_name: `${p.data.firstName} ${p.data.lastName}`, first_name: p.data.firstName, last_name: p.data.lastName, ...(p.data.phone ? { phone: p.data.phone } : {}) } } });
  if (error) return { error: isRate(error) ? RATE : error.message };
  if (su?.user && su.user.identities?.length === 0) return existsState(); // Supabase's way of saying the address is already registered
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
  if (mailConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY) { // same in-app email as sign-up; a magic-link code also confirms an unverified address
    try {
      const admin = createAdminClient();
      const probe = await admin.auth.admin.generateLink({ type: "recovery", email: p.data }); // errors when there is no such account, so we never create one by accident
      if (!probe.error && probe.data?.user && !probe.data.user.email_confirmed_at) {
        const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email: p.data });
        if (data?.properties) { const link = `${await origin()}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=magiclink&next=/dashboard`; const m = verificationEmail(data.properties.email_otp, link); await sendMail(p.data, m.subject, m.text, m.html); }
      }
    } catch (e) { console.error("resend failed:", (e as Error).message); }
    return { ok: "If that account is awaiting verification, a new code is on its way." };
  }
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
  let { error } = await sb.auth.verifyOtp({ email: p.data.email, token: p.data.code, type: "signup" });
  if (error) ({ error } = await sb.auth.verifyOtp({ email: p.data.email, token: p.data.code, type: "email" })); // codes from "resend" are magic-link codes
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
  if (p.success && emailCodesAvailable()) { // send the reset link ourselves (Supabase's own email sender is unreliable here); same answer whether or not the account exists
    try {
      const { data, error } = await createAdminClient().auth.admin.generateLink({ type: "recovery", email: p.data });
      if (!error && data?.properties?.hashed_token) { const link = `${await origin()}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=recovery&next=/reset-password`; const m = resetEmail(link); await sendMail(p.data, m.subject, m.text, m.html); }
    } catch (e) { console.error("reset email failed:", (e as Error).message); }
  } else if (p.success) { const sb = await createClient(); await sb.auth.resetPasswordForEmail(p.data, { redirectTo: `${await origin()}/auth/callback?next=/reset-password` }); }
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

export async function logout() { const sb = await createClient(); await sb.auth.signOut(); redirect("/"); }

/** Sends a 6-digit code to the phone number (test mode shows it on the page in development). */
export async function sendPhoneCode(_: FormState, fd: FormData): Promise<FormState> {
  if (!phoneOtpAvailable()) return { error: "Phone verification isn't available yet." };
  const phone = String(fd.get("phone") ?? ""); if (!validPhone(phone)) return { error: "Enter a valid phone number first." };
  if (!rateLimit(`sms:${await ip()}`, 5, 10 * 60_000).ok || !rateLimit(`sms-to:${phone}`, 3, 10 * 60_000).ok) return { error: "Too many codes requested. Try again in a few minutes." };
  try { const r = await sendCode(phone); return { ok: r.testCode ? "Test mode: no SMS service is connected, so the code is shown below." : "We sent a 6-digit code to your phone.", testCode: r.testCode }; }
  catch (e) { console.error("sms failed:", (e as Error).message); return { error: "We couldn't send the code. Please try again." }; }
}

/** Checks the code; on success returns a signed proof that the sign-up form sends back. */
export async function verifyPhoneCode(_: FormState, fd: FormData): Promise<FormState> {
  if (!rateLimit(`smsv:${await ip()}`, 10, 10 * 60_000).ok) return { error: "Too many attempts. Try again in a few minutes." };
  const phone = String(fd.get("phone") ?? ""), code = String(fd.get("code") ?? "").trim();
  if (!validPhone(phone) || !/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code." };
  return checkPhoneCode(phone, code) ? { ok: "Phone verified", proof: makeProof(phone) } : { error: "That code is incorrect or has expired. Request a new one." };
}

/** Step 1 of sign-up: email a 6-digit code to the address (needs nothing else from the form). */
export async function sendEmailCode(_: FormState, fd: FormData): Promise<FormState> {
  if (!emailCodesAvailable()) return { error: "Email codes aren't available." };
  const e = email.safeParse(fd.get("email")); if (!e.success) return { error: "Enter a valid email first." };
  if (!rateLimit(`ecode:${await ip()}`, 5, 10 * 60_000).ok || !rateLimit(`ecode-to:${e.data}`, 3, 10 * 60_000).ok) return { error: "Too many codes requested. Try again in a few minutes." };
  const probe = await createAdminClient().auth.admin.generateLink({ type: "recovery", email: e.data }); // only succeeds for an existing account; Supabase sends nothing
  if (!probe.error && probe.data?.user) return existsState();
  try { const m = verificationEmail(currentEmailCode(e.data)); await sendMail(e.data, m.subject, m.text, m.html); }
  catch (err) { console.error("email code failed:", (err as Error).message); return { error: "We couldn't send the code. Please try again in a moment." }; }
  return { ok: "We emailed you a 6-digit code. Enter it below." };
}

/** Step 2: check the code; returns a signed proof the sign-up form sends back with the rest of the details. */
export async function verifyEmailProof(_: FormState, fd: FormData): Promise<FormState> {
  if (!rateLimit(`ecodev:${await ip()}`, 10, 10 * 60_000).ok) return { error: "Too many attempts. Try again in a few minutes." };
  const e = email.safeParse(fd.get("email")), code = String(fd.get("code") ?? "").trim();
  if (!e.success || !/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code." };
  return checkEmailCode(e.data, code) ? { ok: "Email verified", proof: makeEmailProof(e.data) } : { error: "That code is incorrect or has expired. Request a new one." };
}

/** Change password for the logged-in user: asks for the current password first (unless the account was made with Google and has none yet). */
export async function changePassword(_: FormState, fd: FormData): Promise<FormState> {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser(); if (!user?.email) return { error: "Please log in again." };
  if (!rateLimit(`chpw:${user.id}`, 5, 10 * 60_000).ok) return { error: "Too many attempts. Try again in a few minutes." };
  const p = z.object({ password, confirm: z.string() }).refine(matches, mismatch).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const hasPassword = ((user.app_metadata?.providers as string[] | undefined) ?? []).includes("email");
  if (hasPassword) {
    const cur = String(fd.get("current") ?? ""); if (!cur) return { error: "Enter your current password." };
    const { error: ce } = await sb.auth.signInWithPassword({ email: user.email, password: cur }); if (ce) return { error: "Your current password is incorrect." };
    if (cur === p.data.password) return { error: "Choose a new password that is different from the current one." };
  }
  const { error } = await sb.auth.updateUser({ password: p.data.password }); if (error) return { error: error.message };
  return { ok: hasPassword ? "Password changed." : "Password set. You can now also log in with your email and password." };
}
