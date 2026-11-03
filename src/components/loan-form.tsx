"use client";
import { useState } from "react";
import { ActionForm } from "./action-form";
import { Field, Input, Select } from "./ui";
import { NumInput } from "./num-input";
import { DateBox } from "./date-box";
import { saveLoan } from "@/app/actions/loans";
import { computeEmi, schedule } from "@/lib/finance/loans";
import { formatMoney } from "@/lib/finance/money";

export const LOAN_KINDS: Record<string, string> = { home: "Home loan", vehicle: "Vehicle loan", personal: "Personal loan", business: "Business loan", education: "Education loan", gold: "Gold loan", credit_card: "Credit card EMI", other: "Other" };
const num = (s: string) => Number(s.replace(/,/g, "")) || 0;
export type LoanRow = { id: string; name: string; lender: string | null; kind: string; principal_minor: number | string; interest_rate_pct: number | string; tenure_months: number; emi_minor: number | string; first_due_date: string };

/** Add / edit a loan. Shows the EMI, total interest and total payable as you type, using the same maths as the schedule. */
export function LoanForm({ loan, locked = false, currency = "INR" }: { loan?: LoanRow; locked?: boolean; currency?: string }) {
  const [principal, setPrincipal] = useState(loan ? String(Number(loan.principal_minor) / 100) : "");
  const [rate, setRate] = useState(loan ? String(Number(loan.interest_rate_pct)) : ""); const [tenure, setTenure] = useState(loan ? String(loan.tenure_months) : "");
  const [emi, setEmi] = useState(""); const P = Math.round(num(principal) * 100), R = num(rate), N = Math.round(num(tenure)), E = emi.trim() ? Math.round(num(emi) * 100) : undefined;
  const autoEmi = computeEmi(P, R, N); const rows = P > 0 && N > 0 && R <= 100 ? schedule({ principalMinor: P, annualRatePct: R, tenureMonths: N, firstDue: "2026-01-01", emiMinor: E }) : [];
  const m = (v: number) => formatMoney(v, currency); const interest = rows.reduce((a, r) => a + r.interestMinor, 0); const payable = rows.reduce((a, r) => a + r.emiMinor, 0);
  return (
    <ActionForm action={saveLoan} submit={loan ? "Update loan" : "Add loan"}>
      {loan && <input type="hidden" name="id" value={loan.id} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Loan name"><Input name="name" required defaultValue={loan?.name} placeholder="e.g. Home loan" /></Field>
        <Field label="Lender" hint="Bank or person (optional)"><Input name="lender" defaultValue={loan?.lender ?? ""} placeholder="e.g. HDFC Bank" /></Field>
        <Field label="Type"><Select name="kind" defaultValue={loan?.kind ?? "personal"}>{Object.entries(LOAN_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        <Field label="Amount borrowed (₹)"><NumInput name="principal" required value={principal} onValueChange={setPrincipal} disabled={locked} /></Field>
        <Field label="Interest rate (% a year)"><NumInput name="rate" mode="decimal" required value={rate} onValueChange={setRate} placeholder="e.g. 8.5" disabled={locked} /></Field>
        <Field label="Tenure (months)"><NumInput name="tenure" mode="int" required value={tenure} onValueChange={setTenure} placeholder="e.g. 240" disabled={locked} /></Field>
        <Field label="First EMI date"><DateBox name="firstDue" label="First EMI date" required defaultValue={loan?.first_due_date} disabled={locked} /></Field>
        <Field label="EMI (₹)" hint={autoEmi ? `Leave blank to use ${m(autoEmi)}` : "Optional — calculated if blank"}><NumInput name="emi" value={emi} onValueChange={setEmi} placeholder="Auto" disabled={locked} /></Field>
      </div>
      {locked && <p className="mt-2 text-xs text-muted">The amount, rate and dates are locked because a payment is already recorded. You can still rename the loan.</p>}
      {!locked && rows.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-brand/30 bg-brand/8 p-3 text-sm sm:grid-cols-4" aria-live="polite">
          {([["Monthly EMI", m(rows[0].emiMinor)], ["Instalments", `${rows.length}`], ["Total interest", m(interest)], ["Total payable", m(payable)]] as const).map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="tabnum font-semibold">{v}</dd></div>)}
        </dl>)}
      {!locked && E !== undefined && P > 0 && rows.length === 0 && <p className="mt-2 text-sm text-bad">That EMI only covers the interest, so the loan would never be repaid. Enter a higher EMI.</p>}
    </ActionForm>
  );
}
