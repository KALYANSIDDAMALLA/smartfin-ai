import Link from "next/link";
import { Check } from "lucide-react";
import { requireUser } from "@/lib/server/auth";
import { getPlan } from "@/lib/server/billing";
import { FREE_FEATURES, PAID_PLANS, PRO_FEATURES, paymentsEnabled } from "@/lib/billing/plans";
import { razorpayConfigured, razorpayMode } from "@/lib/integrations/razorpay";
import { formatMoney } from "@/lib/finance/money";
import { Badge, Card, PageHeader } from "@/components/ui";
import { CheckoutButton } from "@/components/checkout-button";

const List = ({ items }: { items: string[] }) => <ul className="mt-4 grid gap-2 text-sm">{items.map((f) => <li key={f} className="flex items-start gap-2"><Check size={16} className="mt-0.5 shrink-0 text-good" aria-hidden />{f}</li>)}</ul>;

export default async function Pricing() {
  const { supabase, user } = await requireUser();
  const plan = await getPlan(supabase, user.id);
  const live = paymentsEnabled() && razorpayConfigured();
  const P = PAID_PLANS();
  return (<>
    <PageHeader title="Plans" desc="SmartFin AI is free to use today. Pro is coming later." />
    {!live && <p role="status" className="mb-4 rounded-xl border border-line bg-surface2/40 px-4 py-2 text-sm text-muted">Pro isn&apos;t open yet. Nothing changes for you: every feature stays free.</p>}
    {live && razorpayMode() === "test" && <p role="status" className="mb-4 rounded-xl border border-warn/40 bg-warn/10 px-4 py-2 text-sm text-warn">Test mode: no real money is charged. Use Razorpay&apos;s test cards or UPI id <code>success@razorpay</code>.</p>}
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="flex flex-col"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Free</h2>{plan.plan === "free" && <Badge tone="good">Your plan</Badge>}</div>
        <p className="mt-2 text-3xl font-semibold">₹0<span className="text-sm font-normal text-muted"> forever</span></p><List items={FREE_FEATURES} /></Card>
      <Card className="flex flex-col border-brand/40"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Pro</h2>{plan.plan === "pro" ? <Badge tone="good">Your plan</Badge> : !live && <Badge tone="info">Coming soon</Badge>}</div>
        <p className="mt-2 text-3xl font-semibold">{formatMoney(P.pro_monthly.amountMinor)}<span className="text-sm font-normal text-muted"> / month</span></p>
        <p className="text-sm text-muted">or {formatMoney(P.pro_yearly.amountMinor)} / year</p><List items={PRO_FEATURES} />
        {plan.plan === "pro" && plan.proUntil && <p className="mt-4 text-sm text-muted">Active until {new Date(plan.proUntil).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}. Paying again adds to your time.</p>}
        <div className="mt-auto flex flex-col gap-2 pt-5 sm:flex-row">
          {live ? <><CheckoutButton planCode="pro_monthly" label={plan.plan === "pro" ? "Add a month" : "Choose monthly"} /><CheckoutButton planCode="pro_yearly" label={plan.plan === "pro" ? "Add a year" : "Choose yearly"} variant="outline" /></>
            : <span className="inline-flex h-10 items-center rounded-lg border border-line px-4 text-sm text-muted">Not available yet</span>}
        </div>
        {live && <p className="mt-3 text-xs text-muted">Pay with UPI, cards, net banking or wallets via Razorpay. One-time payment; it does not renew by itself. See our <Link href="/terms" className="underline">terms</Link>.</p>}
      </Card>
    </div></>);
}
