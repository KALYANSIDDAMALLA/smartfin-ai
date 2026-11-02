import { Banknote, CalendarClock, Landmark, Percent, Wallet } from "lucide-react";
import { deleteLoan, markEmiPaid, undoLastEmi } from "@/app/actions/loans";
import { formatMoney } from "@/lib/finance/money";
import { formatYmd } from "@/lib/finance/dates";
import { loanStatus, schedule } from "@/lib/finance/loans";
import { ActionForm } from "./action-form";
import { razorpayConfigured } from "@/lib/integrations/razorpay";
import { ConfirmAction } from "./confirm-action";
import { PayEmiButton } from "./pay-emi-button";
import { LOAN_KINDS, LoanForm, type LoanRow } from "./loan-form";
import { Badge, Card, EmptyState, cn } from "./ui";

type Pay = { loan_id: string; installment_no: number };

/** Loans: summary tiles, an add form, and one card per loan with progress, next EMI, the full schedule and one-click "mark EMI paid". */
export function LoansSection({ loans, payments, currency, today }: { loans: LoanRow[]; payments: Pay[]; currency: string; today: string }) {
  const m = (v: number) => formatMoney(v, currency);
  const rows = loans.map((l) => {
    const terms = { principalMinor: Number(l.principal_minor), annualRatePct: Number(l.interest_rate_pct), tenureMonths: l.tenure_months, firstDue: l.first_due_date, emiMinor: Number(l.emi_minor) };
    const paid = payments.filter((p) => p.loan_id === l.id).length; return { l, terms, paid, st: loanStatus(terms, paid, today), sched: schedule(terms) };
  });
  const active = rows.filter((r) => !r.st.closed);
  const monthly = active.reduce((a, r) => a + Number(r.l.emi_minor), 0); const outstanding = active.reduce((a, r) => a + r.st.outstandingMinor, 0);
  const interestPaid = rows.reduce((a, r) => a + r.st.interestPaidMinor, 0); const overdue = active.reduce((a, r) => a + r.st.overdue, 0);
  const next = active.filter((r) => r.st.next).sort((a, b) => a.st.next!.due.localeCompare(b.st.next!.due))[0];
  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {([[Landmark, "Active loans", String(active.length), ""], [Wallet, "EMIs every month", m(monthly), ""], [Banknote, "Still to repay", m(outstanding), ""], [Percent, "Interest paid so far", m(interestPaid), ""],
          [CalendarClock, "Next EMI", next ? m(next.st.next!.emiMinor) : "—", next ? `${next.l.name} · ${formatYmd(next.st.next!.due)}` : "No EMI due"]] as const).map(([Icon, k, v, sub]) => (
          <Card key={k} className="p-3 sm:p-4"><p className="flex items-center gap-1.5 text-xs text-muted"><Icon size={13} aria-hidden />{k}</p><p className="tabnum mt-1 text-xl font-semibold">{v}</p>{sub && <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>}</Card>))}
      </div>
      {overdue > 0 && <p role="status" className="rounded-xl border border-bad/40 bg-bad/10 px-4 py-2 text-sm text-bad">{overdue} EMI{overdue === 1 ? " is" : "s are"} overdue. Pay it and press “Mark EMI paid” to keep your records right.</p>}

      <Card><h2 className="mb-3 font-medium">Add a loan</h2><LoanForm currency={currency} /></Card>

      {!rows.length ? <EmptyState title="No loans yet" hint="Add a home, vehicle, business or personal loan to track EMIs, what you still owe and when it ends." /> : (
        <div className="grid gap-4">{rows.map(({ l, st, sched, paid }) => (
          <Card key={l.id} className={cn(st.closed && "opacity-75")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold">{l.name}<Badge>{LOAN_KINDS[l.kind] ?? l.kind}</Badge>{st.closed && <Badge tone="good">cleared</Badge>}{st.overdue > 0 && !st.closed && <Badge tone="bad">{st.overdue} overdue</Badge>}</h3>
                <p className="text-sm text-muted">{l.lender ? `${l.lender} · ` : ""}{Number(l.interest_rate_pct)}% a year · {m(Number(l.principal_minor))} over {l.tenure_months} months · EMI {m(Number(l.emi_minor))}</p></div>
              <div className="flex flex-wrap items-center gap-2">
                {!st.closed && st.next && razorpayConfigured() && <PayEmiButton loanId={l.id} />}
                {!st.closed && st.next && <ConfirmAction action={markEmiPaid} fields={{ id: l.id }} variant="outline" danger={false} confirmLabel="Yes, record it" confirm={`Record EMI ${st.next.no} of ${st.installments} (${m(st.next.emiMinor)}) for “${l.name}” as paid today? It is added to your transactions.`} success={`EMI recorded for ${l.name}.`}>Mark EMI paid</ConfirmAction>}
                {paid > 0 && <ConfirmAction action={undoLastEmi} fields={{ id: l.id }} variant="ghost" danger={false} confirmLabel="Yes, undo" confirm={`Undo instalment ${paid}? Its transaction is removed too.`} success="Last EMI undone.">Undo last</ConfirmAction>}
                <ActionForm action={deleteLoan} compact submit="Delete" variant="danger" confirm={`Delete “${l.name}” and its schedule? Payments already recorded stay in your transactions.`}><input type="hidden" name="id" value={l.id} /></ActionForm>
              </div>
            </div>
            <div className="mt-4"><div className="flex justify-between text-xs text-muted"><span>{paid} of {st.installments} EMIs paid</span><span>{st.progressPct}% repaid</span></div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface2" role="progressbar" aria-valuenow={st.progressPct} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400" style={{ width: `${st.progressPct}%` }} /></div></div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {([["Still to repay", m(st.outstandingMinor)], ["Next EMI", st.next ? `${m(st.next.emiMinor)} · ${formatYmd(st.next.due)}` : "—"], ["Interest paid / left", `${m(st.interestPaidMinor)} / ${m(st.interestRemainingMinor)}`], ["Loan ends", st.payoffDate ? formatYmd(st.payoffDate) : "—"]] as const).map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="tabnum font-medium">{v}</dd></div>)}
            </dl>
            {st.daysToNext !== null && !st.closed && <p className={cn("mt-3 text-xs", st.daysToNext < 0 ? "text-bad" : st.daysToNext <= 3 ? "text-warn" : "text-muted")}>{st.daysToNext < 0 ? `Overdue by ${-st.daysToNext} day${st.daysToNext === -1 ? "" : "s"}` : st.daysToNext === 0 ? "Due today" : `Due in ${st.daysToNext} day${st.daysToNext === 1 ? "" : "s"}`}</p>}
            <details className="mt-3"><summary className="cursor-pointer text-sm text-brand">Repayment schedule</summary>
              <div className="mt-2 max-h-80 overflow-auto rounded-xl border border-line"><table className="w-full text-sm"><thead className="sticky top-0 bg-surface text-left text-xs text-muted"><tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Due</th><th className="px-3 py-2 text-right">EMI</th><th className="px-3 py-2 text-right">Principal</th><th className="px-3 py-2 text-right">Interest</th><th className="px-3 py-2 text-right">Balance</th><th className="px-3 py-2" /></tr></thead>
                <tbody>{sched.map((i) => { const done = i.no <= paid; const late = !done && i.due < today; return (
                  <tr key={i.no} className={cn("border-t border-line", done && "text-muted", i.no === paid + 1 && !st.closed && "bg-brand/8 font-medium")}>
                    <td className="px-3 py-1.5">{i.no}</td><td className="whitespace-nowrap px-3 py-1.5">{formatYmd(i.due)}</td><td className="tabnum px-3 py-1.5 text-right">{m(i.emiMinor)}</td><td className="tabnum px-3 py-1.5 text-right">{m(i.principalMinor)}</td><td className="tabnum px-3 py-1.5 text-right">{m(i.interestMinor)}</td><td className="tabnum px-3 py-1.5 text-right">{m(i.balanceMinor)}</td>
                    <td className="px-3 py-1.5 text-right text-xs">{done ? <span className="text-good">paid</span> : late ? <span className="text-bad">overdue</span> : ""}</td></tr>); })}</tbody></table></div></details>
            <details className="mt-2"><summary className="cursor-pointer text-sm text-brand">Edit</summary><div className="mt-3"><LoanForm loan={l} locked={paid > 0} currency={currency} /></div></details>
          </Card>))}</div>)}
      <p className="text-xs text-muted">The schedule assumes you pay the same EMI each month. Part-prepayments and rate changes are not tracked yet, so the real balance with your lender may differ slightly.</p>
    </div>
  );
}
