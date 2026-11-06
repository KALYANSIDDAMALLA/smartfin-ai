import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Phone verification codes without a database: a code is an HMAC of (phone, 10-minute window), so it can be re-computed to check it
 * (valid for the current and previous window = 10–20 minutes). After a correct code the user gets a signed proof (30 min) that the sign-up form
 * sends back, so the server knows the number was verified.
 * Delivery: Twilio when TWILIO_* are set; otherwise TEST MODE (development only): the code is printed in the server log and shown on the page.
 */
const secret = () => process.env.PHONE_OTP_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "dev-only-secret";
const mac = (s: string) => createHmac("sha256", secret()).update(s).digest("hex");
const WINDOW = 10 * 60_000;
export const normalizePhone = (p: string) => p.replace(/[\s()-]/g, "");
export const validPhone = (p: string) => /^\+?\d{7,15}$/.test(normalizePhone(p));

const codeFor = (phone: string, win: number) => String(parseInt(mac(`otp|${normalizePhone(phone)}|${win}`).slice(0, 8), 16) % 1_000_000).padStart(6, "0");
export const smsConfigured = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
/** Phone verification can run when an SMS service is connected, or (development only) in test mode. */
export const phoneOtpAvailable = () => smsConfigured() || process.env.NODE_ENV !== "production";

/** Sends the current code. Returns the code only in test mode (so the UI can show it). */
export async function sendPhoneCode(phone: string): Promise<{ testCode?: string }> {
  const code = codeFor(phone, Math.floor(Date.now() / WINDOW)), to = normalizePhone(phone);
  if (smsConfigured()) {
    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(15_000),
      headers: { Authorization: "Basic " + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Body: `Your SmartFin AI verification code is ${code}. It expires in 10 minutes.` }),
    });
    if (!res.ok) throw new Error(`SMS provider error ${res.status}`);
    return {};
  }
  console.log(`[phone-otp TEST MODE] code for ${to}: ${code}`);
  return { testCode: code };
}

export function checkPhoneCode(phone: string, code: string) {
  const now = Math.floor(Date.now() / WINDOW);
  return [now, now - 1].some((w) => { const a = Buffer.from(codeFor(phone, w)), b = Buffer.from(code); return a.length === b.length && timingSafeEqual(a, b); });
}

export const makeProof = (phone: string) => { const exp = Date.now() + 30 * 60_000, p = normalizePhone(phone); return `${exp}.${mac(`proof|${p}|${exp}`)}`; };
export function checkProof(phone: string, proof: string) {
  const [exp, sig] = proof.split("."); if (!exp || !sig || Number(exp) < Date.now()) return false;
  const want = mac(`proof|${normalizePhone(phone)}|${exp}`); return want.length === sig.length && timingSafeEqual(Buffer.from(want), Buffer.from(sig));
}

// ---- Email codes (same stateless scheme, separate "eotp|" / "eproof|" domains) so the email can be verified BEFORE the rest of the form is filled in.
const emailKey = (e: string) => e.trim().toLowerCase();
const emailCodeFor = (email: string, win: number) => String(parseInt(mac(`eotp|${emailKey(email)}|${win}`).slice(0, 8), 16) % 1_000_000).padStart(6, "0");
export const currentEmailCode = (email: string) => emailCodeFor(email, Math.floor(Date.now() / WINDOW));
export function checkEmailCode(email: string, code: string) {
  const now = Math.floor(Date.now() / WINDOW);
  return [now, now - 1].some((w) => { const a = Buffer.from(emailCodeFor(email, w)), b = Buffer.from(code); return a.length === b.length && timingSafeEqual(a, b); });
}
export const makeEmailProof = (email: string) => { const exp = Date.now() + 30 * 60_000; return `${exp}.${mac(`eproof|${emailKey(email)}|${exp}`)}`; };
export function checkEmailProof(email: string, proof: string) {
  const [exp, sig] = proof.split("."); if (!exp || !sig || Number(exp) < Date.now()) return false;
  const want = mac(`eproof|${emailKey(email)}|${exp}`); return want.length === sig.length && timingSafeEqual(Buffer.from(want), Buffer.from(sig));
}
