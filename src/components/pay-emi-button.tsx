"use client";
import { useState, useTransition } from "react";
import { CreditCard } from "lucide-react";
import { confirmEmiPayment, createEmiOrder } from "@/app/actions/razorpay";
import { toast } from "@/lib/feedback-bus";
import { loadCheckout } from "@/lib/razorpay-client";


/** "Pay with Razorpay (test)": server makes the order, Checkout takes the payment, the server verifies the signature and then records the EMI. */
export function PayEmiButton({ loanId, live = false }: { loanId: string; live?: boolean }) {
  const [pending, start] = useTransition(); const [busy, setBusy] = useState(false);
  const pay = () => start(async () => {
    const o = await createEmiOrder(loanId); if ("error" in o) { toast(o.error, "error", 5000); return; }
    if (!(await loadCheckout()) || !window.Razorpay) { toast("Couldn't load Razorpay Checkout. Check your connection.", "error", 5000); return; }
    const rz = new window.Razorpay({
      key: o.keyId, order_id: o.orderId, amount: o.amountMinor, currency: "INR", name: "SmartFin AI", description: o.title, theme: { color: "#4f46e5" },
      handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        setBusy(true); const c = await confirmEmiPayment(r.razorpay_order_id, r.razorpay_payment_id, r.razorpay_signature); setBusy(false);
        if (c?.error) toast(c.error, "error", 7000); else if (c?.ok) toast(c.ok);
      },
    });
    rz.on("payment.failed", (r) => toast(r.error?.description ?? "The payment failed. Nothing was recorded.", "error", 6000));
    rz.open();
  });
  return (
    <button type="button" onClick={pay} disabled={pending || busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-sm font-medium transition hover:border-brand/50 hover:bg-brand/10 disabled:opacity-60">
      <CreditCard size={15} aria-hidden />{pending || busy ? "Working…" : live ? "Pay with Razorpay" : "Pay with Razorpay (test)"}</button>
  );
}
