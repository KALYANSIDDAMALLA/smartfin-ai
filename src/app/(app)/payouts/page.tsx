import { requireUser } from "@/lib/server/auth";
import { demoLiveBlock, razorpayIsLive, razorpayKeyMismatch, razorpayxConfigured } from "@/lib/integrations/razorpay";
import { formatMoney } from "@/lib/finance/money";
import { sendTestPayout } from "@/app/actions/razorpay";
import { ActionForm } from "@/components/action-form";
import { NumInput } from "@/components/num-input";
import { Badge, Card, EmptyState, Field, Input, PageHeader } from "@/components/ui";

const TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = { processed: "good", queued: "warn", pending: "warn", processing: "warn", failed: "bad", rejected: "bad", reversed: "bad", cancelled: "neutral" };

export default async function Payouts() {
  const { supabase, profile, user } = await requireUser(); const demoBlocked = demoLiveBlock(user.email); const ready = razorpayxConfigured() && !demoBlocked; const live = razorpayIsLive();
  const { data: rows, error } = await supabase.from("razorpayx_payouts").select("*").order("created_at", { ascending: false }).limit(25);
  return (
    <>
      <PageHeader title={live ? "Send money (RazorpayX)" : "Send money (RazorpayX test)"} desc={live ? "UPI payouts through RazorpayX. This moves real money." : "Test-mode UPI payouts through RazorpayX. No real money moves."} />
      <div className="grid gap-6">
        {live && <div role="status" className="rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad"><b>Live mode.</b> Payouts here move real money from your RazorpayX balance and cannot be undone.</div>}
        {demoBlocked && <div role="status" className="rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm text-muted">{demoBlocked}</div>}
        {!ready && !demoBlocked && <div role="status" className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn"><b>{razorpayKeyMismatch() ? `These Razorpay keys don't match ${live ? "live" : "test"} mode, so Razorpay is switched off.` : `RazorpayX ${live ? "live" : "test"} mode is not set up yet.`}</b>{" "}
          Add <code>RAZORPAY_KEY_ID</code> (must start with <code>{live ? "rzp_live_" : "rzp_test_"}</code>), <code>RAZORPAY_KEY_SECRET</code> and <code>RAZORPAYX_ACCOUNT_NUMBER</code> in the server settings and redeploy. See <code>docs/RAZORPAY.md</code>.</div>}
        {error && <div role="alert" className="rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-bad">Payouts need a one-time database update (migration 20261101000009).</div>}
        <Card>
          <h2 className="mb-1 font-medium">{live ? "New payout" : "New test payout"}</h2>
          <p className="mb-4 text-sm text-muted">{live ? "Enter the payee's real UPI ID." : <>Use a test UPI ID from the RazorpayX docs (for example <code>success@razorpay</code>).</>} Limit ₹10,000 per payout.</p>
          <fieldset disabled={!ready} className={ready ? "min-w-0 border-0 p-0" : "min-w-0 border-0 p-0 opacity-60"}>
            <ActionForm action={sendTestPayout} submit={live ? "Send payout" : "Send test payout"} confirm={live ? "Send this payout with real money? It cannot be undone." : undefined}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Payee name"><Input name="name" required maxLength={100} placeholder="e.g. Test Vendor" /></Field>
                <Field label="UPI ID"><Input name="upi" required autoComplete="off" placeholder="success@razorpay" /></Field>
                <Field label="Amount (₹)"><NumInput name="amount" required /></Field>
                <Field label="Note (optional)"><Input name="note" maxLength={30} placeholder="e.g. Rent share" /></Field>
              </div>
            </ActionForm>
          </fieldset>
        </Card>
        <Card>
          <h2 className="mb-3 font-medium">Recent payouts</h2>
          {!rows?.length ? <EmptyState title="No payouts yet" hint="Your test payouts and their status will show here." /> : (
            <ul className="grid gap-2">{rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface/60 px-3 py-2.5">
                <div className="min-w-0"><p className="truncate text-sm font-medium">{r.payee_name} <span className="text-muted">· {r.upi_masked}</span></p>
                  <p className="text-xs text-muted">{new Date(r.created_at).toLocaleString("en-IN", { timeZone: profile.timezone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}{r.utr ? ` · UTR ${r.utr}` : ""}{r.failure ? ` · ${r.failure}` : ""}</p></div>
                <div className="flex items-center gap-3"><span className="tabnum font-semibold">{formatMoney(Number(r.amount_minor), profile.currency)}</span><Badge tone={TONE[r.status] ?? "neutral"}>{r.status}</Badge></div>
              </li>))}</ul>)}
        </Card>
      </div>
    </>
  );
}
