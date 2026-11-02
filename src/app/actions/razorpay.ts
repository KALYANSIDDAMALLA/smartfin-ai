"use server";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getUserOrNull } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/ratelimit";
import { moneyField, nameField } from "@/lib/server/validation";
import { schedule } from "@/lib/finance/loans";
import { formatMoney } from "@/lib/finance/money";
import { createContact, createFundAccountValidation, createOrder, createPayout, createUpiFundAccount, demoLiveBlock, razorpayConfigured, razorpayIsLive, razorpayKeys, razorpayxConfigured, RazorpayError, testTag, validationState, verifyCheckoutSignature } from "@/lib/integrations/razorpay";
import { UPI_RE, maskUpi } from "@/lib/upi";
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
  const demo = demoLiveBlock(a.user.email); if (demo) return { error: demo };
  if (!razorpayConfigured()) return { error: "Razorpay isn't configured on this server." };
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
  revalidatePath("/repayments"); return { ok: `Paid ${formatMoney(Number(ord.amount_minor))} with Razorpay${testTag()} and recorded the EMI.` };
}

const payoutSchema = z.object({
  name: nameField("Payee name", { max: 100, required: true }).transform((v) => v as string),
  upi: z.string().trim().regex(UPI_RE, "Enter a valid UPI ID, like name@bank."),
  amount: moneyField, note: nameField("Note", { max: 30 }), accountId: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
});

/** RazorpayX test payout to a UPI ID. Creates the contact and fund account, then the payout with an idempotency key. */
export async function sendTestPayout(_: FormState, fd: FormData): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  const demo = demoLiveBlock(a.user.email); if (demo) return { error: demo };
  if (!razorpayxConfigured()) return { error: "RazorpayX keys or account number aren't configured on this server." };
  if (!rateLimit(`rzpx:${a.user.id}`, 10, 60 * 60_000).ok) return { error: "Too many payouts. Try again in a while." };
  const p = payoutSchema.safeParse(Object.fromEntries(fd)); if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data; if (d.amount > 10_000_00) return { error: "Payouts are limited to ₹10,000 for now." };
  if (d.accountId && !(await ownAccount(a, d.accountId))) return { error: "That account wasn't found." };
  const key = randomUUID(); // one per submit; the database's unique key also stops the same submit being stored twice
  const row = await a.supabase.from("razorpayx_payouts").insert({ user_id: a.user.id, payee_name: d.name, upi_masked: maskUpi(d.upi), amount_minor: d.amount, note: d.note || null, idempotency_key: key, status: "queued", account_id: d.accountId ?? null }).select("id").single();
  if (row.error) return { error: row.error.code === "42P01" || row.error.code === "PGRST205" ? "Payouts need a one-time database update (migration 20261101000009)." : "Could not start the payout." };
  try {
    const contact = await createContact({ name: d.name, referenceId: `u_${a.user.id.slice(0, 8)}` });
    const fund = await createUpiFundAccount({ contactId: contact.id, upi: d.upi });
    const out = await createPayout({ fundAccountId: fund.id, amountMinor: d.amount, referenceId: row.data.id.replace(/-/g, ""), narration: d.note || "SmartFin test", idempotencyKey: key });
    await a.supabase.from("razorpayx_payouts").update({ payout_id: out.id, status: out.status, utr: out.utr }).eq("id", row.data.id);
    revalidatePath("/payouts"); revalidatePath("/integrations"); return { ok: `${razorpayIsLive() ? "Payout" : "Test payout"} of ${formatMoney(d.amount)} created (${out.status}).` };
  } catch (e) {
    const msg = providerErr(e); await a.supabase.from("razorpayx_payouts").update({ status: "failed", failure: msg.slice(0, 300) }).eq("id", row.data.id);
    revalidatePath("/payouts"); revalidatePath("/integrations"); return { error: msg };
  }
}

type Auth = NonNullable<Awaited<ReturnType<typeof getUserOrNull>>>;
/** One of the caller's own, non-archived accounts (RLS also scopes the lookup to the caller). */
async function ownAccount(a: Auth, id: string) {
  const { data } = await a.supabase.from("accounts").select("id,name").eq("id", id).eq("archived", false).maybeSingle();
  return data;
}

/** Verify with Razorpay: a ₹1 "penny drop" to the account's UPI id. Reports if it exists and the name the bank has on record. The UPI id itself is not stored. */
export async function verifyAccountUpi(_: FormState, fd: FormData): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  const demo = demoLiveBlock(a.user.email); if (demo) return { error: demo };
  if (!razorpayxConfigured()) return { error: "RazorpayX keys or account number aren't configured on this server." };
  if (!rateLimit(`rzpv:${a.user.id}`, 10, 60 * 60_000).ok) return { error: "Too many checks. Try again in a while." };
  const p = z.object({ accountId: z.string().uuid("Choose an account."), upi: z.string().trim().regex(UPI_RE, "Enter a valid UPI ID, like name@bank.") }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const acct = await ownAccount(a, p.data.accountId); if (!acct) return { error: "That account wasn't found." };
  try {
    const contact = await createContact({ name: acct.name, referenceId: `v_${a.user.id.slice(0, 8)}` });
    const fund = await createUpiFundAccount({ contactId: contact.id, upi: p.data.upi });
    const v = await createFundAccountValidation({ fundAccountId: fund.id, referenceId: `${p.data.accountId.replace(/-/g, "").slice(0, 20)}${Date.now().toString(36)}` });
    const state = validationState(v); const name = v.results?.registered_name?.slice(0, 200) ?? null;
    const ins = await a.supabase.from("account_verifications").insert({ user_id: a.user.id, account_id: acct.id, upi_masked: maskUpi(p.data.upi), status: state, registered_name: name, validation_id: v.id });
    if (ins.error) { console.error("account_verifications insert", ins.error.message); return { error: ins.error.code === "42P01" || ins.error.code === "PGRST205" ? "Account checks need a one-time database update (migration 20261101000010)." : "Could not save the result." }; }
    revalidatePath("/integrations");
    return state === "verified" ? { ok: `Verified${name ? `: the bank has this under “${name}”` : ""}.` } : state === "pending" ? { ok: "Check started. The result will appear here shortly." } : { error: "Razorpay couldn't verify that UPI id. Check it and try again." };
  } catch (e) { return { error: providerErr(e) }; }
}

/** Add money, step 1: an order for the amount; Checkout takes the payment in the browser. */
export async function createTopupOrder(accountId: string, amountMinor: number): Promise<{ orderId: string; keyId: string; amountMinor: number; title: string } | { error: string }> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  const demo = demoLiveBlock(a.user.email); if (demo) return { error: demo };
  if (!razorpayConfigured()) return { error: "Razorpay isn't configured on this server." };
  if (!rateLimit(`rzpt:${a.user.id}`, 20, 60 * 60_000).ok) return { error: "Too many attempts. Try again in a while." };
  if (!Number.isInteger(amountMinor) || amountMinor < 100 || amountMinor > 50_000_00) return { error: "Enter an amount from ₹1 to ₹50,000." };
  const acct = await z.string().uuid().safeParseAsync(accountId).then((r) => (r.success ? ownAccount(a, r.data) : null)); if (!acct) return { error: "That account wasn't found." };
  try {
    const o = await createOrder({ amountMinor, receipt: `top_${acct.id.slice(0, 8)}_${Date.now().toString(36)}`, notes: { account_id: acct.id } });
    const ins = await a.supabase.from("razorpay_topups").insert({ user_id: a.user.id, order_id: o.id, account_id: acct.id, amount_minor: amountMinor });
    if (ins.error) { console.error("razorpay_topups insert", ins.error.message); return { error: ins.error.code === "42P01" || ins.error.code === "PGRST205" ? "Adding money needs a one-time database update (migration 20261101000010)." : "Could not start the payment." }; }
    return { orderId: o.id, keyId: razorpayKeys().keyId, amountMinor, title: `Add money to ${acct.name}` };
  } catch (e) { return { error: providerErr(e) }; }
}

/** Add money, step 2: verify the Checkout signature, claim the order once, then record the money as income on that account. */
export async function confirmTopup(orderId: string, paymentId: string, signature: string): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  if (!verifyCheckoutSignature(String(orderId), String(paymentId), String(signature))) return { error: "We couldn't verify that payment, so nothing was recorded." };
  const { data: t } = await a.supabase.from("razorpay_topups").select("*").eq("order_id", String(orderId)).maybeSingle(); if (!t) return { error: "Payment not found." };
  if (t.status === "paid") return { ok: "This payment was already recorded." };
  const claim = await a.supabase.from("razorpay_topups").update({ status: "paid", payment_id: String(paymentId) }).eq("order_id", String(orderId)).eq("status", "created").select("id");
  if (claim.error || !claim.data?.length) return { ok: "This payment was already recorded." };
  const tx = await a.supabase.from("transactions").insert({ user_id: a.user.id, type: "income", amount_minor: Number(t.amount_minor), occurred_at: new Date().toISOString(), name: `Added with Razorpay${testTag()}`, to_account_id: t.account_id, source: "integration", external_ref: String(paymentId), tags: [razorpayIsLive() ? "razorpay" : "razorpay-test"] });
  if (tx.error) { await a.supabase.from("razorpay_topups").update({ status: "created", payment_id: null }).eq("order_id", String(orderId)); return { error: "The payment went through but we couldn't record it. Try the same payment again." }; } // nothing half-recorded
  for (const p of ["/integrations", "/transactions", "/dashboard", "/income"]) revalidatePath(p);
  return { ok: `Added ${formatMoney(Number(t.amount_minor))}${razorpayIsLive() ? "" : " (test payment)"} to your account.` };
}
