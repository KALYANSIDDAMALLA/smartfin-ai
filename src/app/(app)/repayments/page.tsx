import { requireUser } from "@/lib/server/auth";
import { loadLookups, loadTxs } from "@/lib/server/data";
import { detectRecurring } from "@/lib/finance/automation";
import { Sparkles } from "lucide-react";
import { formatMoney } from "@/lib/finance/money";
import { localDate, formatYmd } from "@/lib/finance/dates";
import { saveRecurring, toggleRecurring, deleteRecurring } from "@/app/actions/plan";
import { ConfirmAction } from "@/components/confirm-action";
import { markRecurringPaid } from "@/app/actions/transactions";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, EmptyState, Field, Input, PageHeader, Select } from "@/components/ui";
import { NumInput } from "@/components/num-input";
import { groupedCategoryOptions } from "@/lib/category-options";
import { DateBox } from "@/components/date-box";
import { LoansSection } from "@/components/loans-section";import { SummaryLine } from "@/components/summary-line";

function Fields({ cats, methods, r }: { cats: { id: string; name: string; kind: string }[]; methods: { id: string; label: string }[]; r?: Record<string, any> }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    {r && <input type="hidden" name="id" value={r.id} />}
    <Field label="Name"><Input name="name" required defaultValue={r?.name} /></Field>
    <Field label="Type"><Select name="txType" defaultValue={r?.tx_type ?? "expense"}><option value="expense">Expense</option><option value="income">Income</option></Select></Field>
    <Field label="Estimated amount (₹)"><NumInput name="amount" required defaultValue={r ? String(Number(r.estimated_amount_minor) / 100) : ""} /></Field>
    <Field label="Frequency"><Select name="frequency" defaultValue={r?.frequency ?? "monthly"}>{["daily", "weekly", "monthly", "quarterly", "yearly"].map((f) => <option key={f}>{f}</option>)}</Select></Field>
    <Field label="Next due"><DateBox name="nextDue" label="Next due" required defaultValue={r?.next_due_date} /></Field>
    <Field label="Category"><Select kind="category" name="categoryId" defaultValue={r?.category_id ?? ""}><option value="">—</option>{groupedCategoryOptions(cats)}</Select></Field>
    <Field label="Payment method"><Select kind="method" name="paymentMethodId" defaultValue={r?.payment_method_id ?? ""}><option value="">—</option>{methods.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</Select></Field>
  </div>);
}

/** Start of a look-back window (module-level helper keeps the page component pure). */
const daysAgo = (n: number) => new Date(new Date().getTime() - n * 864e5);

export default async function Repayments() {
  const { supabase, profile } = await requireUser();
  const [lookups, { data: rules }, loansRes, paysRes, hist] = await Promise.all([loadLookups(supabase), supabase.from("recurring_rules").select("*").order("next_due_date"), supabase.from("loans").select("*").order("created_at"), supabase.from("loan_payments").select("loan_id,installment_no"), loadTxs(supabase, undefined, daysAgo(400), undefined, false)]);
  const detected = detectRecurring(hist.txs, (rules ?? []).map((r) => r.name)).slice(0, 6);
  const methodId = (code?: string | null) => lookups.methods.find((m) => m.code === code)?.id ?? "";
  const today = localDate(new Date(), profile.timezone);
  return (
    <>
      <PageHeader title="Repayments" desc={(() => { const L = loansRes.error ? [] : (loansRes.data ?? []).filter((l) => l.status === "active"); const late = (rules ?? []).filter((r) => !r.paused && r.next_due_date < today).length;
          return <SummaryLine pill={L.length ? <><span className="tabnum">{L.length}</span> active loan{L.length === 1 ? "" : "s"}</> : <><span className="tabnum">{(rules ?? []).length}</span> repeating payment{(rules ?? []).length === 1 ? "" : "s"}</>}
            items={[L.length > 0 && `EMIs ${formatMoney(L.reduce((a, l) => a + Number(l.emi_minor), 0), profile.currency)} a month`, L.length > 0 && `${(rules ?? []).length} other repeating`, late > 0 && `${late} overdue`, { t: "nothing is recorded until you press “Mark paid”", small: true }]} />; })()} />
      <div className="grid gap-10">
        <section aria-labelledby="loans-h" className="grid gap-4"><h2 id="loans-h" className="text-xl font-semibold">Loans &amp; EMIs</h2>
          {loansRes.error ? <Card className="border-warn/40"><p className="font-medium">Loans are almost ready</p><p className="mt-1 text-sm text-muted">This part of the app needs a one-time setup before you can add loans. Your repeating payments below work as usual in the meantime.</p>
              <details className="mt-2 text-sm"><summary className="cursor-pointer text-brand">App owner? How to finish the setup</summary><p className="mt-2 text-muted">Run <code>supabase/migrations/20261101000008_loans.sql</code> on your database (Supabase dashboard → SQL editor), then reload this page.</p></details></Card>
            : <LoansSection loans={loansRes.data ?? []} payments={paysRes.data ?? []} currency={profile.currency} today={today} />}</section>
        <section aria-labelledby="bills-h" className="grid gap-6"><h2 id="bills-h" className="text-xl font-semibold">Other repeating payments</h2>
        {detected.length > 0 && <Card><h2 className="mb-1 flex items-center gap-2 font-medium"><Sparkles size={16} className="text-brand" aria-hidden />Detected from your history</h2>
          <p className="mb-3 text-sm text-muted">These payments repeat at a regular interval with a steady amount. Add the ones you want as reminders.</p>
          <ul className="grid gap-2">{detected.map((d) => (
            <li key={d.name + d.frequency} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
              <div className="text-sm"><b>{d.name}</b> <Badge tone={d.type === "income" ? "good" : "neutral"}>{d.type}</Badge> <span className="text-muted">≈ {formatMoney(d.amountMinor, profile.currency)} {d.frequency} · seen {d.count}× · next ~{d.nextDue}</span></div>
              <ActionForm action={saveRecurring} submit="Add as reminder" variant="outline"><input type="hidden" name="name" value={d.name} /><input type="hidden" name="txType" value={d.type} /><input type="hidden" name="amount" value={String(d.amountMinor / 100)} /><input type="hidden" name="frequency" value={d.frequency} /><input type="hidden" name="nextDue" value={d.nextDue} /><input type="hidden" name="categoryId" value={d.categoryId ?? ""} /><input type="hidden" name="paymentMethodId" value={methodId(d.paymentMethod)} /></ActionForm>
            </li>))}</ul></Card>}
        <Card><h2 className="mb-3 font-medium">New repeating payment</h2><ActionForm action={saveRecurring} submit="Add"><Fields cats={lookups.categories} methods={lookups.methods} /></ActionForm></Card>
        {!rules?.length ? <EmptyState title="Nothing scheduled" hint="Add rent, subscriptions, bills or salary. Loans go in the section above." /> :
          <div className="grid gap-3">{rules.map((r) => { const overdue = !r.paused && r.next_due_date < today; return (
            <Card key={r.id}><div className="flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="font-medium">{r.name} <Badge tone={r.tx_type === "income" ? "good" : "neutral"}>{r.tx_type}</Badge> {r.paused && <Badge>paused</Badge>} {overdue && <Badge tone="bad">overdue</Badge>}</h3>
                <p className="text-sm text-muted">{r.frequency} · next due {formatYmd(r.next_due_date)} · est. {formatMoney(Number(r.estimated_amount_minor), profile.currency)}</p></div>
              <div className="flex flex-wrap items-center gap-2">
                {!r.paused && <ConfirmAction action={markRecurringPaid} fields={{ id: r.id }} variant="outline" danger={false} confirmLabel="Yes, record it" confirm={`Record “${r.name}” (${formatMoney(Number(r.estimated_amount_minor), profile.currency)}) as ${r.tx_type === "income" ? "received" : "paid"} today? It will be added to your transactions.`} success={`${r.name} recorded.`}>{r.tx_type === "income" ? "Mark received" : "Mark paid"}</ConfirmAction>}
                <ActionForm action={toggleRecurring} compact submit={r.paused ? "Resume" : "Pause"} variant="outline"><input type="hidden" name="id" value={r.id} /><input type="hidden" name="paused" value={String(!r.paused)} /></ActionForm>
                <ActionForm action={deleteRecurring} compact submit="Delete" variant="danger" confirm={`Delete "${r.name}"?`}><input type="hidden" name="id" value={r.id} /></ActionForm>
              </div></div>
              <details className="mt-2"><summary className="cursor-pointer text-sm text-brand">Edit</summary><div className="mt-3"><ActionForm action={saveRecurring} submit="Update"><Fields cats={lookups.categories} methods={lookups.methods} r={r} /></ActionForm></div></details>
            </Card>); })}</div>}
        </section>
      </div>
    </>
  );
}
