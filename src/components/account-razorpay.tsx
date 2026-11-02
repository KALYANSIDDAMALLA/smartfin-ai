"use client";
import { useState, useTransition } from "react";
import { BadgeCheck, CreditCard, Send, ShieldCheck } from "lucide-react";
import { confirmTopup, createTopupOrder, sendTestPayout, verifyAccountUpi } from "@/app/actions/razorpay";
import { toast } from "@/lib/feedback-bus";
import { loadCheckout } from "@/lib/razorpay-client";
import { ActionForm } from "./action-form";
import { NumInput } from "./num-input";
import { Badge, Field, Input } from "./ui";

export interface Verification { status: "pending" | "verified" | "failed"; name: string | null; upi: string }
export interface PayoutRow { id: string; payee: string; upi: string; amountLabel: string; status: string; when: string }

/** Adds money with Razorpay Checkout: the server makes the order, Checkout takes the payment, the server verifies it and records it as income on the account. */
function AddMoney({ accountId }: { accountId: string }) {
  const [amount, setAmount] = useState(""); const [pending, start] = useTransition(); const [busy, setBusy] = useState(false);
  const go = () => start(async () => {
    const minor = Math.round(Number(amount.replace(/,/g, "")) * 100);
    if (!Number.isFinite(minor) || minor < 100) { toast("Enter an amount of at least ₹1.", "error", 4000); return; }
    const o = await createTopupOrder(accountId, minor); if ("error" in o) { toast(o.error, "error", 5000); return; }
    if (!(await loadCheckout()) || !window.Razorpay) { toast("Couldn't load Razorpay Checkout. Check your connection.", "error", 5000); return; }
    const rz = new window.Razorpay({
      key: o.keyId, order_id: o.orderId, amount: o.amountMinor, currency: "INR", name: "SmartFin AI", description: o.title, theme: { color: "#4f46e5" },
      handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        setBusy(true); const c = await confirmTopup(r.razorpay_order_id, r.razorpay_payment_id, r.razorpay_signature); setBusy(false);
        if (c?.error) toast(c.error, "error", 7000); else if (c?.ok) { toast(c.ok); setAmount(""); }
      },
    });
    rz.on("payment.failed", (r) => toast(r.error?.description ?? "The payment failed. Nothing was recorded.", "error", 6000));
    rz.open();
  });
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="w-40"><Field label="Amount (₹)"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, "").slice(0, 9))} placeholder="500" aria-label="Amount to add in rupees" /></Field></div>
      <button type="button" onClick={go} disabled={pending || busy} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium transition hover:border-brand/50 hover:bg-brand/10 disabled:opacity-60">
        <CreditCard size={15} aria-hidden />{pending || busy ? "Working…" : "Add money (test)"}</button>
    </div>
  );
}

const TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = { processed: "good", queued: "warn", pending: "warn", processing: "warn", failed: "bad", rejected: "bad", reversed: "bad", cancelled: "neutral" };

/** Razorpay tools for one account on Bank account links (test mode): Verify, Send money, Add money, plus the account's recent test payouts. */
export function AccountRazorpay({ accountId, verification, payouts, checkoutReady, payoutsReady }: { accountId: string; verification: Verification | null; payouts: PayoutRow[]; checkoutReady: boolean; payoutsReady: boolean }) {
  if (!checkoutReady && !payoutsReady) return null;
  return (
    <details className="group mt-2 rounded-lg border border-line/70 bg-surface/40 px-3 py-2 text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium">
        <span className="inline-flex items-center gap-2"><ShieldCheck size={15} className="text-brand" aria-hidden />Razorpay (test)
          {verification?.status === "verified" && <Badge tone="good"><span className="inline-flex items-center gap-1"><BadgeCheck size={12} aria-hidden />Verified</span></Badge>}
          {verification?.status === "pending" && <Badge tone="warn">Checking…</Badge>}
          {verification?.status === "failed" && <Badge tone="bad">Not verified</Badge>}</span>
        <span className="text-xs text-muted group-open:hidden">Open</span><span className="hidden text-xs text-muted group-open:inline">Close</span>
      </summary>
      <div className="mt-3 grid gap-5">
        {payoutsReady && <section aria-label="Verify this account">
          <h4 className="mb-1 font-medium">Verify with Razorpay</h4>
          <p className="mb-2 text-xs text-muted">Sends ₹1 to the account&apos;s UPI id and shows the name the bank has on record. In test mode use <code>success@razorpay</code>. The UPI id isn&apos;t saved.</p>
          {verification?.status === "verified" && <p className="mb-2 text-xs text-good">Verified{verification.name ? ` as “${verification.name}”` : ""} · {verification.upi}</p>}
          <ActionForm action={verifyAccountUpi} submit="Verify" variant="outline">
            <input type="hidden" name="accountId" value={accountId} />
            <div className="max-w-sm"><Field label="UPI id"><Input name="upi" required autoComplete="off" placeholder="success@razorpay" /></Field></div>
          </ActionForm>
        </section>}
        {payoutsReady && <section aria-label="Send money">
          <h4 className="mb-1 font-medium">Send money</h4>
          <p className="mb-2 text-xs text-muted">A test payout through RazorpayX, paid from the RazorpayX test balance (not from your real bank). Limit ₹10,000.</p>
          <ActionForm action={sendTestPayout} submit="Send test money" variant="outline">
            <input type="hidden" name="accountId" value={accountId} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Payee name"><Input name="name" required maxLength={100} placeholder="Test Vendor" /></Field>
              <Field label="UPI id"><Input name="upi" required autoComplete="off" placeholder="success@razorpay" /></Field>
              <Field label="Amount (₹)"><NumInput name="amount" required /></Field>
            </div>
          </ActionForm>
          {!!payouts.length && <ul className="mt-3 grid gap-1.5" aria-label="Recent test payouts from this account">{payouts.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="truncate"><Send size={12} className="mr-1 inline" aria-hidden />{p.payee} · {p.upi} · {p.when}</span>
              <span className="inline-flex items-center gap-2"><span className="tabnum font-medium">{p.amountLabel}</span><Badge tone={TONE[p.status] ?? "neutral"}>{p.status}</Badge></span></li>))}</ul>}
        </section>}
        {checkoutReady && <section aria-label="Add money">
          <h4 className="mb-1 font-medium">Add money</h4>
          <p className="mb-2 text-xs text-muted">Pay with Razorpay Checkout (test card or UPI). A successful payment is recorded as income on this account.</p>
          <AddMoney accountId={accountId} />
        </section>}
      </div>
    </details>
  );
}
