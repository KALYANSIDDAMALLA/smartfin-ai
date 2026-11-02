import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Razorpay (Checkout / Orders) and RazorpayX (Payouts), TEST MODE ONLY for now.
 * Plain REST with Basic auth, so no SDK dependency. RazorpayX uses the same API keys as Razorpay, plus your RazorpayX account number.
 * Live keys (rzp_live_…) are refused on purpose until this has been reviewed for production.
 */
const BASE = "https://api.razorpay.com/v1";

export const razorpayKeys = () => ({ keyId: process.env.RAZORPAY_KEY_ID ?? "", keySecret: process.env.RAZORPAY_KEY_SECRET ?? "" });
export const razorpayConfigured = () => { const k = razorpayKeys(); return k.keyId.startsWith("rzp_test_") && !!k.keySecret; };
export const razorpayxConfigured = () => razorpayConfigured() && !!process.env.RAZORPAYX_ACCOUNT_NUMBER;
/** True when a key is set but is not a test key, so the UI can say why nothing works. */
export const razorpayLiveKeyBlocked = () => { const id = razorpayKeys().keyId; return !!id && !id.startsWith("rzp_test_"); };

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
