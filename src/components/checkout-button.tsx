"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { confirmPlanPayment, createPlanOrder, recordPaymentOutcome } from "@/app/actions/billing";
import { toast } from "@/lib/feedback-bus";
import { Button } from "@/components/ui";

type Rzp = new (o: Record<string, unknown>) => { open(): void; on(ev: string, cb: (r: { error?: { description?: string; reason?: string } }) => void): void };
declare global { interface Window { Razorpay?: Rzp } }
const loadCheckout = () => new Promise<boolean>((res) => {
  if (window.Razorpay) return res(true);
  const s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.onload = () => res(true); s.onerror = () => res(false); document.head.appendChild(s);
});

/**
 * "Pay with Razorpay": the server makes the order from a plan code, Razorpay Checkout takes the payment (UPI, cards, net banking, wallets),
 * and the server verifies the signature before the plan changes. This component never decides whether a payment succeeded.
 */
export function CheckoutButton({ planCode, label = "Upgrade to Pro", variant = "primary" }: { planCode: "pro_monthly" | "pro_yearly"; label?: string; variant?: "primary" | "outline" }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "starting" | "confirming">("idle");
  const done = useRef(false); // a payment can finish, fail and be dismissed in one go: only the first outcome counts

  async function pay() {
    if (phase !== "idle") return; // double click guard
    done.current = false; setPhase("starting");
    const o = await createPlanOrder(planCode);
    if ("error" in o) { setPhase("idle"); toast(o.error, "error", 5000); return; }
    if (!(await loadCheckout()) || !window.Razorpay) { setPhase("idle"); toast("Couldn't load the payment window. Check your connection and try again.", "error", 5000); return; }
    const rz = new window.Razorpay({
      key: o.keyId, order_id: o.orderId, amount: o.amountMinor, currency: o.currency, name: "SmartFin AI", description: o.description,
      prefill: { name: o.name, email: o.email }, theme: { color: "#4f46e5" }, retry: { enabled: true },
      handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        if (done.current) return; done.current = true; setPhase("confirming");
        const c = await confirmPlanPayment(r.razorpay_order_id, r.razorpay_payment_id, r.razorpay_signature);
        if ("error" in c) { await recordPaymentOutcome(o.orderId, "failed", c.error); router.push(`/billing/failed?order=${encodeURIComponent(o.orderId)}`); }
        else router.push(`/billing/success?order=${encodeURIComponent(c.orderId)}`);
      },
      modal: { ondismiss: () => { if (done.current) return; done.current = true; setPhase("idle"); void recordPaymentOutcome(o.orderId, "cancelled"); toast("Payment cancelled. You have not been charged.", "info", 4000); } },
    });
    rz.on("payment.failed", (r) => {
      // Checkout lets the customer retry inside the same window, so only record it; the order stays payable.
      void recordPaymentOutcome(o.orderId, "failed", r.error?.description ?? r.error?.reason);
      toast(r.error?.description ?? "The payment failed. You can try another method.", "error", 6000);
    });
    setPhase("idle"); rz.open();
  }

  return (<>
    <Button type="button" variant={variant} onClick={pay} disabled={phase !== "idle"} className="w-full sm:w-auto" aria-busy={phase !== "idle"}>
      {phase === "starting" ? <><Loader2 size={16} className="animate-spin" aria-hidden />Starting…</> : <><ShieldCheck size={16} aria-hidden />{label}</>}
    </Button>
    {phase === "confirming" && (
      <div role="status" aria-live="polite" className="fixed inset-0 z-[100] grid place-items-center bg-black/50 p-4 backdrop-blur-sm">
        <div className="glass flex max-w-sm flex-col items-center gap-3 rounded-2xl p-6 text-center"><Loader2 className="animate-spin text-brand" size={32} aria-hidden />
          <p className="font-medium">Confirming your payment…</p><p className="text-sm text-muted">Please don&apos;t close or refresh this page.</p></div>
      </div>)}
  </>);
}
