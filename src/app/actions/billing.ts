"use server";
import { getUserOrNull } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/ratelimit";
import { createAdminClient } from "@/lib/supabase/admin";
import { fulfilPayment } from "@/lib/server/billing";
import { PAID_PLANS, isPlanCode, paymentsEnabled } from "@/lib/billing/plans";
import { createRazorpayOrder, fetchPayment, razorpayConfigured, razorpayKeys, razorpayMode, verifyCheckoutSignature } from "@/lib/integrations/razorpay";

type Err = { error: string };
const REUSE_MS = 30 * 60_000;

/**
 * Step 1: the browser asks to buy a plan CODE (never an amount). The price, currency and customer come from the server.
 * A recent unpaid order for the same plan is reused, so double clicks and retries don't pile up orders.
 */
export async function createPlanOrder(planCode: string): Promise<{ orderId: string; keyId: string; amountMinor: number; currency: string; description: string; name: string; email: string; mode: "test" | "live" } | Err> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  if (!paymentsEnabled()) return { error: "Paid plans are not available yet." };
  if (!razorpayConfigured()) return { error: "Payments are not set up on this server yet." };
  if (!isPlanCode(planCode)) return { error: "Unknown plan." };
  if (!rateLimit(`pay:${a.user.id}`, 20, 60 * 60_000).ok) return { error: "Too many payment attempts. Try again in a while." };
  const plan = PAID_PLANS()[planCode];
  const { data: prof } = await a.supabase.from("profiles").select("display_name").eq("id", a.user.id).maybeSingle();
  const name = prof?.display_name ?? ""; const email = a.user.email ?? ""; const mode = razorpayMode();
  const db = createAdminClient();
  const base = { orderId: "", keyId: razorpayKeys().keyId, amountMinor: plan.amountMinor, currency: "INR", description: plan.label, name, email, mode };
  try {
    const { data: recent } = await db.from("payment_orders").select("order_id,created_at,amount_minor").eq("user_id", a.user.id).eq("plan_code", planCode).eq("mode", mode)
      .in("status", ["created", "failed", "cancelled"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (recent && Date.now() - new Date(recent.created_at).getTime() < REUSE_MS && Number(recent.amount_minor) === plan.amountMinor) {
      await db.from("payment_orders").update({ status: "created", failure_reason: null }).eq("order_id", recent.order_id).neq("status", "paid");
      return { ...base, orderId: recent.order_id };
    }
    const o = await createRazorpayOrder({ amountMinor: plan.amountMinor, receipt: `${planCode}_${Date.now().toString(36)}`, notes: { user_id: a.user.id, plan: planCode } });
    const ins = await db.from("payment_orders").insert({ user_id: a.user.id, customer_name: name || null, customer_email: email || null, plan_code: planCode, period_days: plan.periodDays, order_id: o.id, amount_minor: plan.amountMinor, currency: "INR", mode });
    if (ins.error) { console.error("payment_orders insert", ins.error.message); return { error: ins.error.code === "42P01" || ins.error.code === "PGRST205" ? "Payments need a one-time database update (migration 20261101000013)." : "Could not start the payment." }; }
    return { ...base, orderId: o.id };
  } catch (e) { console.error("createPlanOrder", (e as Error).message); return { error: "Could not start the payment. Please try again." }; }
}

/**
 * Step 2: Checkout says it succeeded. We do NOT believe it: verify the signature, ask Razorpay what the payment really is,
 * check it belongs to the caller's order with the stored amount, then let the database grant the plan exactly once.
 */
export async function confirmPlanPayment(orderId: string, paymentId: string, signature: string): Promise<{ ok: true; orderId: string } | Err> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  orderId = String(orderId); paymentId = String(paymentId);
  if (!verifyCheckoutSignature(orderId, paymentId, String(signature))) return { error: "We couldn't verify that payment, so your plan was not changed. If money left your account it will be refunded or reconciled." };
  try {
    const db = createAdminClient();
    const { data: ord } = await db.from("payment_orders").select("user_id,status").eq("order_id", orderId).maybeSingle();
    if (!ord || ord.user_id !== a.user.id) return { error: "Payment not found." };
    if (ord.status === "paid") return { ok: true, orderId };
    const p = await fetchPayment(paymentId);
    if (p.order_id !== orderId) return { error: "That payment does not belong to this order." };
    if (p.status !== "captured") return { ok: true, orderId }; // still pending at the bank: the webhook finishes it; the success page shows "confirming"
    const r = await fulfilPayment(orderId, paymentId, p.amount, p.currency);
    if (r === "paid" || r === "duplicate") return { ok: true, orderId };
    console.error("confirmPlanPayment refused", r, orderId, paymentId);
    return { error: "We could not match that payment to your order, so your plan was not changed. Please contact support with your payment id." };
  } catch (e) { console.error("confirmPlanPayment", (e as Error).message); return { error: "We couldn't confirm the payment right now. If you were charged, your plan will update shortly." }; }
}

/** Checkout reported a failure or the customer closed it. Never touches an order that is already paid. */
export async function recordPaymentOutcome(orderId: string, outcome: "failed" | "cancelled", reason?: string): Promise<void> {
  const a = await getUserOrNull(); if (!a) return;
  if (outcome !== "failed" && outcome !== "cancelled") return;
  await createAdminClient().from("payment_orders").update({ status: outcome, failure_reason: reason ? String(reason).slice(0, 300) : outcome === "cancelled" ? "Closed before paying" : null })
    .eq("order_id", String(orderId)).eq("user_id", a.user.id).in("status", ["created", "failed", "cancelled"]);
}
