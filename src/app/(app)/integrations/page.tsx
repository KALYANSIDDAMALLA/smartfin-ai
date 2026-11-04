import Link from "next/link";
import { CheckCircle2, KeyRound, Landmark, ShieldCheck, Smartphone } from "lucide-react";
import { requireUser } from "@/lib/server/auth";
import { bankLinkingOn } from "@/lib/integrations/setu";
import { ACCOUNT_TYPES, bankHue } from "@/lib/banks";
import { formatMoney } from "@/lib/finance/money";
import { archiveAccount } from "@/app/actions/accounts";
import { connectDemoBank, disconnectBank, loadDemoTransactions, refreshConnection, syncConnection } from "@/app/actions/integrations";
import { ActionForm } from "@/components/action-form";
import { AddAccountForm, BankLinkForm } from "@/components/bank-forms";
import { AccountBalance } from "@/components/account-balance";
import { CheckBalance } from "@/components/check-balance";
import { SummaryLine } from "@/components/summary-line";
import { Badge, Card, PageHeader } from "@/components/ui";

const STEPS = [
  { icon: Landmark, t: "Choose your bank", d: "Search the list and pick your bank." },
  { icon: Smartphone, t: "Enter your mobile number", d: "The one your bank has on record, on your phone or computer." },
  { icon: KeyRound, t: "Approve with an OTP", d: "You confirm on the secure consent page. We never see your bank password." },
  { icon: CheckCircle2, t: "Review what comes in", d: "Transactions arrive read-only and wait for your OK before they are saved." },
];
const STATUS: Record<string, { label: string; tone: "good" | "warn" | "neutral" | "bad" }> = {
  connected: { label: "Linked", tone: "good" }, pending_consent: { label: "Waiting for your approval", tone: "warn" }, expired: { label: "Expired", tone: "neutral" }, error: { label: "Problem", tone: "bad" }, pending_configuration: { label: "Not set up", tone: "neutral" },
};
type Meta = { bank?: string; mobileLast4?: string; demo?: boolean; accounts?: { masked: string; type?: string }[] };

export default async function BankLinks() {
  const { supabase, profile } = await requireUser(); const live = bankLinkingOn(); const m = (v: number) => formatMoney(v, profile.currency);
  const [{ data: conns }, { data: accounts }, { data: consents }] = await Promise.all([
    supabase.from("integration_connections").select("*").eq("provider", "account_aggregator").neq("status", "revoked").order("created_at", { ascending: false }),
    supabase.from("accounts").select("*").eq("archived", false).order("created_at"),
    supabase.from("integration_consents").select("*").order("created_at", { ascending: false }).limit(20),
  ]);
  const hasDemo = (conns ?? []).some((c) => (c.meta as Meta | null)?.demo);
  const linked = (conns ?? []).filter((c) => c.status === "connected").length; const nAcc = accounts?.length ?? 0;
  return (
    <>
      <PageHeader title="Bank account links" desc={<SummaryLine pill={linked ? <><span className="tabnum">{linked}</span> bank{linked === 1 ? "" : "s"} linked</> : "No banks linked yet"} items={[`${nAcc} account${nAcc === 1 ? "" : "s"} in your list`, live ? "live linking is on" : { t: "live linking is not switched on yet", small: true }]} />} />
      <div className="grid gap-6">
        <Card>
          <h2 className="mb-1 flex items-center gap-2 font-medium"><ShieldCheck size={16} className="text-brand" aria-hidden />Link a bank account</h2>
          <p className="mb-4 text-sm text-muted">The same way payment apps do it, but read-only: we can see your transactions, never move money, and you can stop sharing any time.</p>
          <ol className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{STEPS.map((s, i) => { const Icon = s.icon; return (
            <li key={s.t} className="flex gap-3 rounded-xl border border-line bg-surface/60 p-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/12 text-brand"><Icon size={17} aria-hidden /></span>
              <div className="min-w-0"><p className="text-sm font-medium"><span className="text-muted">{i + 1}.</span> {s.t}</p><p className="mt-0.5 text-xs text-muted">{s.d}</p></div></li>); })}</ol>
          {!live && <div role="status" className="mb-4 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn"><b>Live bank linking is not switched on yet.</b> You can still try the demo bank, add your accounts below and import bank statements.
            <details className="mt-1 text-xs text-muted"><summary className="cursor-pointer text-brand">App owner? What is needed</summary><span className="mt-1 block">Add Setu Account Aggregator credentials (<code>SETU_CLIENT_ID</code>, <code>SETU_CLIENT_SECRET</code>, <code>SETU_PRODUCT_INSTANCE_ID</code>) to the server settings, set <code>BANK_LINKING_ENABLED=true</code>, and restart. A free sandbox is available on Setu Bridge; going live needs Setu&apos;s approval.</span></details></div>}
          <BankLinkForm enabled={live} />
          {!hasDemo && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><p className="max-w-xl text-sm text-muted">No bank handy, or just exploring? Add a <b className="font-medium text-fg">demo bank</b> with sample accounts and transactions. It is clearly marked and is not a real bank.</p>
            <ActionForm action={connectDemoBank} compact submit="Try a demo bank" variant="outline" /></div>}
        </Card>

        {!!conns?.length && <Card><h2 className="mb-3 font-medium">Your linked banks</h2><ul className="grid gap-3">{conns.map((c) => { const meta = (c.meta ?? {}) as Meta; const st = STATUS[c.status] ?? STATUS.error; const bank = meta.bank ?? "Bank account"; return (
          <li key={c.id} className="rounded-xl border border-line bg-surface/60 p-4"><div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: `hsl(${bankHue(bank)} 60% 45%)` }}><Landmark size={18} aria-hidden /></span>
              <div className="min-w-0"><p className="truncate font-medium">{bank} <Badge tone={st.tone}>{st.label}</Badge>{meta.demo && <> <Badge tone="info">Demo data</Badge></>}</p>
                {!!meta.accounts?.length && <p className="text-sm">{meta.accounts.map((a) => `${a.type ?? "Account"} ${a.masked}`).join(" · ")}</p>}
                <p className="text-xs text-muted">{meta.mobileLast4 ? `Mobile ••••${meta.mobileLast4}` : ""}{c.last_synced_at ? ` · last synced ${new Date(c.last_synced_at).toLocaleString("en-IN", { timeZone: profile.timezone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : ""}</p></div></div>
            <div className="flex flex-wrap items-center gap-2">
              {c.status === "connected" && <CheckBalance connectionId={c.id} currency={profile.currency} timezone={profile.timezone} />}
              {c.status === "pending_consent" && <ActionForm action={refreshConnection} compact submit="I approved, check status" variant="outline"><input type="hidden" name="id" value={c.id} /></ActionForm>}
              {c.status === "connected" && meta.demo && <ActionForm action={loadDemoTransactions} compact submit="Load sample transactions" variant="outline"><input type="hidden" name="id" value={c.id} /></ActionForm>}
              {c.status === "connected" && !meta.demo && <ActionForm action={syncConnection} compact submit="Fetch transactions now" variant="outline"><input type="hidden" name="id" value={c.id} /></ActionForm>}
              <ActionForm action={disconnectBank} compact submit="Disconnect" variant="danger" confirm={`Stop sharing data from ${bank}? Transactions already saved stay.`}><input type="hidden" name="id" value={c.id} /></ActionForm></div></div></li>); })}</ul></Card>}

        <Card>
          <h2 className="mb-1 font-medium">Your accounts</h2>
          <p className="mb-4 text-sm text-muted">Add the accounts you use, even without linking, so you can pick them when you record a transfer between your own accounts.</p>
          {!!nAcc && <ul className="mb-5 grid gap-2 sm:grid-cols-2">{accounts!.map((a) => (
            <li key={a.id} className="rounded-xl border border-line bg-surface/60 px-3 py-2.5"><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white" style={{ background: `hsl(${bankHue(a.name)} 60% 45%)` }}><Landmark size={16} aria-hidden /></span>
              <div className="min-w-0"><p className="truncate text-sm font-medium">{a.name}</p><p className="text-xs text-muted">{a.kind === "bank" ? "Bank account" : a.kind === "credit_card" ? ACCOUNT_TYPES.credit_card : a.kind === "wallet" ? ACCOUNT_TYPES.wallet : a.kind === "cash" ? ACCOUNT_TYPES.cash : "Other"}{Number(a.opening_balance_minor) ? ` · opening ${m(Number(a.opening_balance_minor))}` : ""}</p></div></div>
              <ActionForm action={archiveAccount} compact submit="Remove" variant="ghost" confirm={`Remove “${a.name}” from your list? Past transfers stay.`}><input type="hidden" name="id" value={a.id} /></ActionForm></div>
              <AccountBalance accountId={a.id} currency={profile.currency} timezone={profile.timezone} />
            </li>))}</ul>}
          <h3 className="mb-2 text-sm font-semibold">Add an account</h3><AddAccountForm />
        </Card>

        <Card><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-medium">Prefer not to link?</h2><p className="text-sm text-muted">Import a bank statement (CSV, Excel or PDF) or add transactions yourself. Both always work.</p></div>
          <Link href="/imports" className="inline-flex h-10 items-center rounded-lg border border-line px-4 text-sm font-medium transition hover:border-brand/50 hover:bg-brand/10">Import a statement</Link></div></Card>

        <Card><h2 className="mb-2 font-medium">Consent history</h2>{!consents?.length ? <p className="text-sm text-muted">No consents recorded yet.</p> : <ul className="grid gap-1 text-sm">{consents.map((c) => <li key={c.id}>{new Date(c.created_at).toLocaleString("en-IN", { timeZone: profile.timezone })} · {c.action === "granted" ? "You allowed access" : "You stopped sharing"} · {c.scopes.join(", ")}</li>)}</ul>}</Card>
      </div>
    </>
  );
}
