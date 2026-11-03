import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { requireUser } from "@/lib/server/auth";
import { formatMoney } from "@/lib/finance/money";
import { AutoRefresh } from "@/components/auto-refresh";
import { Card, PageHeader } from "@/components/ui";

/** Shown only from what the DATABASE says (set after server-side verification). The URL alone can never make this page say "paid". */
export default async function Success({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const { order } = await searchParams; const { supabase } = await requireUser();
  const { data: o } = order ? await supabase.from("payment_orders").select("order_id,payment_id,status,amount_minor,currency,paid_at,plan_code").eq("order_id", order).maybeSingle() : { data: null };
  if (!o) redirect("/pricing");
  if (o.status === "failed" || o.status === "cancelled") redirect(`/billing/failed?order=${encodeURIComponent(o.order_id)}`);
  const paid = o.status === "paid";
  return (<>
    <PageHeader title={paid ? "Payment successful" : "Confirming your payment"} />
    <Card className="mx-auto max-w-xl text-center">
      {paid ? <CheckCircle2 size={44} className="mx-auto text-good" aria-hidden /> : <><Loader2 size={40} className="mx-auto animate-spin text-brand" aria-hidden /><AutoRefresh /></>}
      <h2 className="mt-3 text-xl font-semibold">{paid ? "Thank you! You're on Pro." : "Waiting for your bank to confirm…"}</h2>
      <p className="mt-1 text-sm text-muted">{paid ? "Your plan is active. Razorpay also emails you a receipt." : "This usually takes a few seconds. You don't need to pay again; this page updates by itself."}</p>
      {paid && <dl className="mx-auto mt-4 grid max-w-xs gap-1 text-left text-sm"><div className="flex justify-between"><dt className="text-muted">Amount</dt><dd>{formatMoney(Number(o.amount_minor), o.currency)}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Payment id</dt><dd className="font-mono text-xs [overflow-wrap:anywhere]">{o.payment_id}</dd></div>
        <div className="flex justify-between"><dt className="text-muted">Order id</dt><dd className="font-mono text-xs [overflow-wrap:anywhere]">{o.order_id}</dd></div></dl>}
      <Link href={paid ? "/dashboard" : "/pricing"} className="btn-shine mt-5 inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-brandfg">{paid ? "Go to dashboard" : "Back to plans"}</Link>
    </Card></>);
}
