import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Razorpay (Checkout / Orders) and RazorpayX (Payouts). Plain REST with Basic auth, so no SDK dependency.
 * RazorpayX uses the same API keys as Razorpay, plus your RazorpayX account number.
 *
 * MODE SWITCH (safe by default): the app is in TEST mode unless BOTH hold:
 *   1. RAZORPAY_MODE=live, and
 *   2. this is the real Vercel production deployment (VERCEL_ENV=production), or RAZORPAY_ALLOW_LIVE_LOCAL=1 is set on purpose.
 * So localhost, previews and any forgotten setting can never take real money. The keys must match the mode
 * (rzp_test_… in test, rzp_live_… in live); a mismatch switches Razorpay OFF instead of guessing.
 */
const BASE = "https://api.razorpay.com/v1";

export const razorpayMode = (): "live" | "test" =>
  process.env.RAZORPAY_MODE === "live" && (process.env.VERCEL_ENV === "production" || process.env.RAZORPAY_ALLOW_LIVE_LOCAL === "1") ? "live" : "test";
export const razorpayIsLive = () => razorpayMode() === "live";
const keyPrefix = () => (razorpayIsLive() ? "rzp_live_" : "rzp_test_");
/** " (test)" in test mode, "" in live mode: appended to button and message text so real payments never say "test". */
export const testTag = () => (razorpayIsLive() ? "" : " (test)");

/** The public demo logins (priya.demo@smartfin.demo and friends) have a password that is published in the repo. */
export const isDemoEmail = (email?: string | null) => (email ?? "").trim().toLowerCase().endsWith("@smartfin.demo");
/** In LIVE mode the shared demo accounts must never take real payments. Returns the refusal message, or null when allowed (always allowed in test mode). */
export const demoLiveBlock = (email?: string | null): string | null =>
  razorpayIsLive() && isDemoEmail(email) ? "The shared demo account can't make real payments. Create your own account to use this." : null;

export const razorpayKeys = () => ({ keyId: process.env.RAZORPAY_KEY_ID ?? "", keySecret: process.env.RAZORPAY_KEY_SECRET ?? "" });
export const razorpayConfigured = () => { const k = razorpayKeys(); return k.keyId.startsWith(keyPrefix()) && !!k.keySecret; };
export const razorpayxConfigured = () => razorpayConfigured() && !!process.env.RAZORPAYX_ACCOUNT_NUMBER;
/** True when a key is set but doesn't match the current mode (e.g. a live key in test mode), so the UI can say why nothing works. */
export const razorpayKeyMismatch = () => { const id = razorpayKeys().keyId; return !!id && !id.startsWith(keyPrefix()); };

export class RazorpayError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  if (!razorpayConfigured()) throw new RazorpayError(400, "NotConfigured", "Razorpay test keys are not configured.");
  const { keyId, keySecret } = razorpayKeys();
  const res = await fetch(`${BASE}${path}`, {
    method, cache: "no-store", signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`, "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { code?: string; description?: string } } & T;
  if (!res.ok) throw new RazorpayError(res.status, json.error?.code ?? "Error", json.error?.description ?? `Razorpay returned ${res.status}`);
  return json;
}

const safeEqual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const hmac = (secret: string, data: string | Buffer) => createHmac("sha256", secret).update(data).digest("hex");

/** Checkout success check: HMAC-SHA256 of "order_id|payment_id" with the key secret. Never trust the browser's word that it paid. */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string, secret = razorpayKeys().keySecret): boolean {
  if (!orderId || !paymentId || !signature || !secret) return false;
  return safeEqual(hmac(secret, `${orderId}|${paymentId}`), signature);
}
/** Webhook check: HMAC-SHA256 of the RAW request body with the webhook secret (not the API key secret). */
export function verifyWebhookSignature(rawBody: string, signature: string | null, secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? ""): boolean {
  if (!signature || !secret) return false;
  return safeEqual(hmac(secret, rawBody), signature);
}

export interface RzpOrder { id: string; amount: number; currency: string; status: string; receipt: string | null }
/** Amount is in paise. Receipt is capped at 40 characters by Razorpay. */
export const createOrder = (o: { amountMinor: number; receipt: string; notes?: Record<string, string> }) =>
  call<RzpOrder>("POST", "/orders", { amount: o.amountMinor, currency: "INR", receipt: o.receipt.slice(0, 40), notes: o.notes ?? {} });

// ---- RazorpayX payouts ----
export interface RzpPayout { id: string; status: string; amount: number; mode: string; utr: string | null; reference_id: string | null }
export const createContact = (o: { name: string; referenceId: string }) => call<{ id: string }>("POST", "/contacts", { name: o.name, type: "vendor", reference_id: o.referenceId });
export const createUpiFundAccount = (o: { contactId: string; upi: string }) => call<{ id: string }>("POST", "/fund_accounts", { contact_id: o.contactId, account_type: "vpa", vpa: { address: o.upi } });
export interface RzpValidation { id: string; status: string; results?: { account_status?: string | null; registered_name?: string | null } | null }
/** "Penny drop": Razorpay sends ₹1 to the UPI id and reports whether it exists and the name registered on it. */
export const createFundAccountValidation = (o: { fundAccountId: string; referenceId: string }) =>
  call<RzpValidation>("POST", "/fund_accounts/validations", { account_number: process.env.RAZORPAYX_ACCOUNT_NUMBER, fund_account: { id: o.fundAccountId }, amount: 100, currency: "INR", reference_id: o.referenceId.slice(0, 40), notes: { purpose: "smartfin_account_check" } });
/** Turns Razorpay's validation answer into our three states. Anything not clearly done stays pending until the webhook says more. */
export function validationState(v: RzpValidation): "verified" | "failed" | "pending" {
  if (v.status === "failed") return "failed";
  if (v.status === "completed") return v.results?.account_status === "active" ? "verified" : "failed";
  return "pending";
}

/** The idempotency key makes a retry of the same request safe: Razorpay returns the first payout instead of paying twice. */
export const createPayout = (o: { fundAccountId: string; amountMinor: number; referenceId: string; narration: string; idempotencyKey: string }) =>
  call<RzpPayout>("POST", "/payouts", {
    account_number: process.env.RAZORPAYX_ACCOUNT_NUMBER, fund_account_id: o.fundAccountId, amount: o.amountMinor, currency: "INR", mode: "UPI", purpose: "payout",
    queue_if_low_balance: true, reference_id: o.referenceId.slice(0, 40), narration: o.narration.slice(0, 30),
  }, { "X-Payout-Idempotency": o.idempotencyKey });
