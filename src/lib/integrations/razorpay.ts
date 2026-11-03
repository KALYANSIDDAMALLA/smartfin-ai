import "server-only";
import Razorpay from "razorpay";
import { validatePaymentVerification, validateWebhookSignature } from "razorpay/dist/utils/razorpay-utils";

/**
 * Razorpay Orders + signature checks, using the official `razorpay` SDK.
 * Test or live is decided by the key itself (rzp_test_… / rzp_live_…); there is no separate switch to forget.
 * The Key Secret is read only here, on the server. The browser gets the public Key ID and an order id, nothing else.
 */
export const razorpayKeys = () => ({ keyId: process.env.RAZORPAY_KEY_ID ?? "", keySecret: process.env.RAZORPAY_KEY_SECRET ?? "" });
export const razorpayConfigured = () => { const k = razorpayKeys(); return /^rzp_(test|live)_/.test(k.keyId) && !!k.keySecret; };
export const razorpayMode = (): "test" | "live" => (razorpayKeys().keyId.startsWith("rzp_live_") ? "live" : "test");

export interface RzpOrder { id: string; amount: number; currency: string; status: string }

/** Amount is in paise. Receipt is capped at 40 characters by Razorpay. */
export async function createRazorpayOrder(o: { amountMinor: number; receipt: string; notes?: Record<string, string> }): Promise<RzpOrder> {
  const { keyId, keySecret } = razorpayKeys();
  const rz = new Razorpay({ key_id: keyId, key_secret: keySecret });
  const r = await rz.orders.create({ amount: o.amountMinor, currency: "INR", receipt: o.receipt.slice(0, 40), notes: o.notes });
  return { id: r.id, amount: Number(r.amount), currency: r.currency, status: r.status };
}

/** Checkout success check: HMAC-SHA256 of "order_id|payment_id" with the Key Secret. Never trust the browser's word that it paid. */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string, secret = razorpayKeys().keySecret): boolean {
  if (!orderId || !paymentId || !signature || !secret) return false;
  try { return validatePaymentVerification({ order_id: orderId, payment_id: paymentId }, signature, secret); } catch { return false; }
}

/** Webhook check: HMAC-SHA256 of the RAW request body with the webhook secret (a different secret from the API Key Secret). */
export function verifyWebhookSignature(rawBody: string, signature: string | null, secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? ""): boolean {
  if (!signature || !secret) return false;
  try { return validateWebhookSignature(rawBody, signature, secret); } catch { return false; }
}

/** Asks Razorpay (server to server) what a payment really is, so the amount we trust comes from Razorpay and not from the browser. */
export async function fetchPayment(paymentId: string): Promise<{ id: string; order_id: string | null; amount: number; currency: string; status: string; error_description?: string | null }> {
  const { keyId, keySecret } = razorpayKeys();
  const p = await new Razorpay({ key_id: keyId, key_secret: keySecret }).payments.fetch(paymentId);
  return { id: p.id, order_id: (p.order_id as string | null) ?? null, amount: Number(p.amount), currency: String(p.currency), status: String(p.status), error_description: (p as { error_description?: string | null }).error_description ?? null };
}
