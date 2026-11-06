import Link from "next/link";
import { redirect } from "next/navigation";
import { XCircle } from "lucide-react";
import { requireUser } from "@/lib/server/auth";
import { Card, PageHeader } from "@/components/ui";
import { CheckoutButton } from "@/components/checkout-button";
import { isPlanCode } from "@/lib/billing/plans";

export default async function Failed({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order } = await searchParams; const { supabase } = await requireUser();
  const { data: o } = order ? await supabase.from("payment_orders").select("order_id,status,plan_code,failure_reason").eq("order_id", order).maybeSingle() : { data: null };
  if (!o) redirect("/pricing");
  if (o.status === "paid") redirect(`/billing/success?order=${encodeURIComponent(o.order_id)}`);
  return (<>
    <PageHeader title={o.status === "cancelled" ? "Payment cancelled" : "Payment failed"} />
    <Card className="mx-auto max-w-xl text-center"><XCircle size={44} className="mx-auto text-bad" aria-hidden />
      <h2 className="mt-3 text-xl font-semibold">{o.status === "cancelled" ? "You haven't been charged" : "We couldn't complete your payment"}</h2>
      <p className="mt-1 text-sm text-muted">{o.failure_reason ?? "Your plan has not changed."} If money left your account, it is automatically refunded by your bank within 5–7 working days.</p>
      <div className="mt-5 flex flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center">
        {isPlanCode(o.plan_code) && <CheckoutButton planCode={o.plan_code} label="Try again" />}
        <Link href="/pricing" className="inline-flex h-10 items-center justify-center rounded-lg border border-line px-4 text-sm font-medium hover:bg-surface2/60">Back to plans</Link></div>
    </Card></>);
}
