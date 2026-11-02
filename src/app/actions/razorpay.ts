"use server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getUserOrNull } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/ratelimit";
import { moneyField, nameField } from "@/lib/server/validation";
import { schedule } from "@/lib/finance/loans";
import { formatMoney } from "@/lib/finance/money";
import { createContact, createOrder, createPayout, createUpiFundAccount, razorpayConfigured, razorpayKeys, razorpayxConfigured, RazorpayError, verifyCheckoutSignature } from "@/lib/integrations/razorpay";
import { markEmiPaid } from "./loans";
import type { FormState } from "./auth";

const providerErr = (e: unknown): string => {
  if (e instanceof RazorpayError) { console.error("razorpay:", e.status, e.code, e.message); return e.code === "NotConfigured" ? "Razorpay test keys aren't configured on this server." : `Razorpay said: ${e.message}`; }
  console.error("razorpay error", (e as Error).message); return "Something went wrong. Please try again.";
};
/** The next unpaid instalment of one of the caller's loans. The amount always comes from here (the database), never from the browser. */
async function nextInstalment(a: NonNullable<Awaited<ReturnType<typeof getUserOrNull>>>, loanId: string) {
  const [{ data: l }, { data: pays }] = await Promise.all([
    a.supabase.from("loans").select("*").eq("id", loanId).maybeSingle(),
    a.supabase.from("loan_payments").select("installment_no").eq("loan_id", loanId),
  ]);
  if (!l || l.status !== "active") return null;
  const sched = schedule({ principalMinor: Number(l.principal_minor), annualRatePct: Number(l.interest_rate_pct), tenureMonths: l.tenure_months, firstDue: l.first_due_date as string, emiMinor: Number(l.emi_minor) });
  const no = (pays?.length ? Math.max(...pays.map((x) => x.installment_no)) : 0) + 1; const inst = sched[no - 1];
  return inst ? { loan: l, no, total: sched.length, amountMinor: inst.emiMinor } : null;
}

/** Step 1 of "Pay EMI with Razorpay": create an order for the next instalment and hand the browser what Checkout needs (public key id + order id only). */
export async function createEmiOrder(loanId: string): Promise<{ orderId: string; keyId: string; amountMinor: number; title: string } | { error: string }> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  if (!razorpayConfigured()) return { error: "Razorpay test keys aren't configured on this server." };
  if (!rateLimit(`rzp:${a.user.id}`, 20, 60 * 60_000).ok) return { error: "Too many payment attempts. Try again in a while." };
  const n = await nextInstalment(a, String(loanId)); if (!n) return { error: "There is no EMI left to pay on this loan." };
  try {
    const o = await createOrder({ amountMinor: n.amountMinor, receipt: `emi_${n.loan.id.slice(0, 8)}_${n.no}_${Date.now().toString(36)}`, notes: { loan_id: n.loan.id, installment: String(n.no) } });
    const ins = await a.supabase.from("razorpay_orders").insert({ user_id: a.user.id, order_id: o.id, loan_id: n.loan.id, installment_no: n.no, amount_minor: n.amountMinor });
    if (ins.error) { console.error("razorpay_orders insert", ins.error.message); return { error: ins.error.code === "42P01" || ins.error.code === "PGRST205" ? "Razorpay needs a one-time database update (migration 20261101000009)." : "Could not start the payment." }; }
    return { orderId: o.id, keyId: razorpayKeys().keyId, amountMinor: n.amountMinor, title: `EMI ${n.no}/${n.total}: ${n.loan.name}` };
  } catch (e) { return { error: providerErr(e) }; }
}

/** Step 2: Checkout succeeded in the browser. Verify its signature, claim the order exactly once, then record the EMI the normal way. */
export async function confirmEmiPayment(orderId: string, paymentId: string, signature: string): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  if (!verifyCheckoutSignature(String(orderId), String(paymentId), String(signature))) return { error: "We couldn't verify that payment, so nothing was recorded. If money left your account, it will be reconciled from Razorpay." };
  const { data: ord } = await a.supabase.from("razorpay_orders").select("*").eq("order_id", String(orderId)).maybeSingle(); if (!ord) return { error: "Payment not found." };
  if (ord.status === "paid") return { ok: "This payment was already recorded." };
  const n = await nextInstalment(a, ord.loan_id); if (!n || n.no !== ord.installment_no) return { error: "That instalment is no longer due, so nothing was recorded." };
  // Claim first (only one caller can flip created -> paid), so a double submit or a retry can never record the EMI twice.
  const claim = await a.supabase.from("razorpay_orders").update({ status: "paid", payment_id: String(paymentId) }).eq("order_id", String(orderId)).eq("status", "created").select("id");
  if (claim.error || !claim.data?.length) return { ok: "This payment was already recorded." };
  const fd = new FormData(); fd.set("id", ord.loan_id); await markEmiPaid(fd);
  revalidatePath("/repayments"); return { ok: `Paid ${formatMoney(Number(ord.amount_minor))} with Razorpay (test) and recorded the EMI.` };
}

const payoutSchema = z.object({
  name: nameField("Payee name", { max: 100, required: true }).transform((v) => v as string),
  upi: z.string().trim().regex(/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/, "Enter a valid UPI ID, like name@bank."),
  amount: moneyField, note: nameField("Note", { max: 30 }),
});
const maskUpi = (u: string) => { const [h, d] = u.split("@"); return `${h.slice(0, 2)}${"•".repeat(Math.max(2, h.length - 2))}@${d}`; };

/** RazorpayX test payout to a UPI ID. Creates the contact and fund account, then the payout with an idempotency key. */
export async function sendTestPayout(_: FormState, fd: FormData): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  if (!razorpayxConfigured()) return { error: "RazorpayX test keys or account number aren't configured on this server." };
  if (!rateLimit(`rzpx:${a.user.id}`, 10, 60 * 60_000).ok) return { error: "Too many payouts. Try again in a while." };
  const p = payoutSchema.safeParse(Object.fromEntries(fd)); if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data; if (d.amount > 10_000_00) return { error: "Test payouts are limited to ₹10,000." };
  const key = randomUUID(); // one per submit; the database's unique key also stops the same submit being stored twice
  const row = await a.supabase.from("razorpayx_payouts").insert({ user_id: a.user.id, payee_name: d.name, upi_masked: maskUpi(d.upi), amount_minor: d.amount, note: d.note || null, idempotency_key: key, status: "queued" }).select("id").single();
  if (row.error) return { error: row.error.code === "42P01" || row.error.code === "PGRST205" ? "Payouts need a one-time database update (migration 20261101000009)." : "Could not start the payout." };
  try {
    const contact = await createContact({ name: d.name, referenceId: `u_${a.user.id.slice(0, 8)}` });
    const fund = await createUpiFundAccount({ contactId: contact.id, upi: d.upi });
    const out = await createPayout({ fundAccountId: fund.id, amountMinor: d.amount, referenceId: row.data.id.replace(/-/g, ""), narration: d.note || "SmartFin test", idempotencyKey: key });
    await a.supabase.from("razorpayx_payouts").update({ payout_id: out.id, status: out.status, utr: out.utr }).eq("id", row.data.id);
    revalidatePath("/payouts"); return { ok: `Test payout of ${formatMoney(d.amount)} created (${out.status}).` };
  } catch (e) {
    const msg = providerErr(e); await a.supabase.from("razorpayx_payouts").update({ status: "failed", failure: msg.slice(0, 300) }).eq("id", row.data.id);
    revalidatePath("/payouts"); return { error: msg };
  }
}
