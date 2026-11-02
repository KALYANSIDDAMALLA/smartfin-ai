"use client";
import { useState, useTransition } from "react";
import { BadgeCheck, CreditCard, Send, ShieldCheck } from "lucide-react";
import { confirmTopup, createTopupOrder, sendTestPayout, verifyAccountUpi } from "@/app/actions/razorpay";
import { toast } from "@/lib/feedback-bus";
import { loadCheckout } from "@/lib/razorpay-client";
import { ActionForm } from "./action-form";
import { NumInput } from "./num-input";
import { Badge, Field, Input, cn, inputCls } from "./ui";

export interface Verification { status: "pending" | "verified" | "failed"; name: string | null; upi: string }
export interface PayoutRow { id: string; payee: string; upi: string; amountLabel: string; status: string; when: string }
export interface HubStatus { tone: "good" | "warn" | "bad" | "neutral"; label: string; detail: string }
type Tab = "add" | "verify" | "send";

/** Adds money with Razorpay Checkout: the server makes the order, Checkout takes the payment, the server verifies it and records it as income on the account. */
function AddMoney({ accountId, live }: { accountId: string; live: boolean }) {
  const [amount, setAmount] = useState(""); const [pending, start] = useTransition(); const [busy, setBusy] = useState(false);
  const go = () => start(async () => {
    const minor = Math.round(Number(amount.replace(/,/g, "")) * 100);
    if (!Number.isFinite(minor) || minor < 100) { toast("Enter an amount of at least ₹1.", "error", 4000); return; }
    const o = await createTopupOrder(accountId, minor); if ("error" in o) { toast(o.error, "error", 6000); return; }
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
      <div className="w-44"><Field label="Amount (₹)"><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, "").slice(0, 9))} placeholder="500" aria-label="Amount to add in rupees" /></Field></div>
      <button type="button" onClick={go} disabled={pending || busy} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60">
        <CreditCard size={15} aria-hidden />{pending || busy ? "Working…" : live ? "Add money" : "Add money (test)"}</button>
    </div>
  );
}

const TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = { processed: "good", queued: "warn", pending: "warn", processing: "warn", failed: "bad", rejected: "bad", reversed: "bad", cancelled: "neutral" };
const TABS: { id: Tab; label: string; icon: typeof CreditCard }[] = [{ id: "add", label: "Add money", icon: CreditCard }, { id: "verify", label: "Verify account", icon: BadgeCheck }, { id: "send", label: "Send money", icon: Send }];

/**
 * The Razorpay section of "Bank account links": always visible, with its status, an account picker and three sub-modules.
 * A sub-module that can't run says exactly why instead of disappearing.
 */
export function RazorpayHub({ accounts, status, live, checkoutReady, payoutsReady, verifs, payouts }: {
  accounts: { id: string; name: string }[]; status: HubStatus; live: boolean; checkoutReady: boolean; payoutsReady: boolean;
  verifs: Record<string, Verification | null>; payouts: Record<string, PayoutRow[]>;
}) {
  const [tab, setTab] = useState<Tab>("add"); const [acc, setAcc] = useState(accounts[0]?.id ?? "");
  const current = accounts.find((a) => a.id === acc) ?? accounts[0]; const v = current ? verifs[current.id] : null; const recent = current ? payouts[current.id] ?? [] : [];
  const ready = tab === "add" ? checkoutReady : payoutsReady;
  const whyNot = !accounts.length ? "Add an account above first. Razorpay actions are tied to one of your accounts."
    : !ready ? (status.tone === "neutral" || status.tone === "bad" ? status.detail : tab === "add" ? "Razorpay keys are not set up on this server." : "RazorpayX isn't set up on this server (it needs RAZORPAYX_ACCOUNT_NUMBER).") : "";
  const on = !!accounts.length && ready;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2"><Badge tone={status.tone}>{status.label}</Badge><span className="text-xs text-muted">{status.detail}</span></div>
      <div role="tablist" aria-label="Razorpay tools" className="mb-4 flex flex-wrap gap-2">{TABS.map((t) => { const I = t.icon; return (
        <button key={t.id} role="tab" type="button" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
          className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition", tab === t.id ? "border-brand bg-brand/10 text-brand" : "border-line hover:border-brand/50")}><I size={15} aria-hidden />{t.label}</button>); })}</div>
      {!!accounts.length && <div className="mb-4 max-w-sm"><Field label="Account">
        <select value={acc} onChange={(e) => setAcc(e.target.value)} className={inputCls} aria-label="Account for Razorpay actions">{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        {v?.status === "verified" && <p className="mt-1 inline-flex items-center gap-1 text-xs text-good"><BadgeCheck size={13} aria-hidden />Verified{v.name ? ` as “${v.name}”` : ""} · {v.upi}</p>}
        {v?.status === "pending" && <p className="mt-1 text-xs text-warn">Verification in progress…</p>}
        {v?.status === "failed" && <p className="mt-1 text-xs text-bad">Last verification failed. Check the UPI id and try again.</p>}</div>}
      {!on && <p role="status" className="mb-3 rounded-lg border border-line bg-surface/60 px-3 py-2 text-sm text-muted">{whyNot}</p>}
      <fieldset disabled={!on} className={cn("min-w-0 border-0 p-0", !on && "opacity-60")}>
        {tab === "add" && <section aria-label="Add money">
          <p className="mb-3 text-sm text-muted">Pay with Razorpay Checkout{live ? "" : " (test card or UPI)"}. A successful payment is recorded as income on the selected account.</p>
          {current ? <AddMoney key={current.id} accountId={current.id} live={live} /> : <AddMoneyPlaceholder />}</section>}
        {tab === "verify" && <section aria-label="Verify account">
          <p className="mb-3 text-sm text-muted">Sends ₹1 to the account&apos;s UPI id and shows the name the bank has on record.{live ? "" : <> In test mode use <code>success@razorpay</code>.</>} The UPI id isn&apos;t saved.</p>
          <ActionForm action={verifyAccountUpi} submit="Verify" variant="outline"><input type="hidden" name="accountId" value={current?.id ?? ""} />
            <div className="max-w-sm"><Field label="UPI id"><Input name="upi" required autoComplete="off" placeholder="success@razorpay" /></Field></div></ActionForm></section>}
        {tab === "send" && <section aria-label="Send money">
          <p className="mb-3 text-sm text-muted">{live ? "A real payout through RazorpayX, paid from your RazorpayX balance. It cannot be undone." : "A test payout through RazorpayX, paid from the RazorpayX test balance (not from your real bank)."} Limit ₹10,000.</p>
          <ActionForm action={sendTestPayout} submit={live ? "Send money" : "Send test money"} variant="outline" confirm={live ? "Send this payout with real money? It cannot be undone." : undefined}><input type="hidden" name="accountId" value={current?.id ?? ""} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Payee name"><Input name="name" required maxLength={100} placeholder="Test Vendor" /></Field>
              <Field label="UPI id"><Input name="upi" required autoComplete="off" placeholder="success@razorpay" /></Field>
              <Field label="Amount (₹)"><NumInput name="amount" required /></Field></div></ActionForm>
          {!!recent.length && <ul className="mt-4 grid gap-1.5" aria-label="Recent payouts from this account">{recent.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="truncate"><ShieldCheck size={12} className="mr-1 inline" aria-hidden />{p.payee} · {p.upi} · {p.when}</span>
              <span className="inline-flex items-center gap-2"><span className="tabnum font-medium">{p.amountLabel}</span><Badge tone={TONE[p.status] ?? "neutral"}>{p.status}</Badge></span></li>))}</ul>}</section>}
      </fieldset>
    </div>
  );
}

/** Shown (disabled) when there is no account yet, so the control is still visible. */
function AddMoneyPlaceholder() {
  return (<div className="flex flex-wrap items-end gap-2"><div className="w-44"><Field label="Amount (₹)"><Input disabled placeholder="500" aria-label="Amount to add in rupees" /></Field></div>
    <button type="button" disabled className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-medium text-white opacity-60"><CreditCard size={15} aria-hidden />Add money</button></div>);
}
