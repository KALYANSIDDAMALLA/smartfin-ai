"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserOrNull } from "@/lib/server/auth";
import { forgetUser } from "@/lib/server/memo";
import { notify } from "@/lib/server/notify";
import { moneyField, nameField } from "@/lib/server/validation";
import { computeEmi, loanStatus, minEmi, schedule } from "@/lib/finance/loans";
import { localDate } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/money";
import type { FormState } from "./auth";

const KINDS = ["home", "vehicle", "personal", "business", "education", "gold", "credit_card", "other"] as const;
const loanSchema = z.object({
  name: nameField("Loan name", { max: 100, required: true }).transform((v) => v as string),
  lender: nameField("Lender", { max: 100 }), kind: z.enum(KINDS),
  principal: moneyField, rate: z.string().transform((v) => Number(v.replace(/,/g, ""))).pipe(z.number({ message: "Enter the interest rate." }).min(0, "Interest rate can't be negative.").max(100, "Interest rate can't be above 100%.")),
  tenure: z.string().transform((v) => Number(v.replace(/,/g, ""))).pipe(z.number().int("Tenure must be a whole number of months.").min(1, "Tenure must be at least 1 month.").max(600, "Tenure can be at most 600 months (50 years).")),
  firstDue: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the first EMI date."), emi: z.string().optional(),
});
const MISSING = "Loans need a one-time database update (migration 20261101000008).";
const missing = (e: { code?: string; message: string }) => e.code === "42P01" || e.code === "PGRST205" || /loans|loan_payments/.test(e.message) && /does not exist|schema cache/.test(e.message);
const touch = () => { for (const p of ["/repayments", "/dashboard", "/transactions", "/calendar", "/notifications"]) revalidatePath(p); };

export async function saveLoan(_: FormState, fd: FormData): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  const p = loanSchema.safeParse(Object.fromEntries(fd)); if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data; const id = String(fd.get("id") ?? "");
  const emiIn = d.emi && d.emi.trim() ? moneyField.safeParse(d.emi) : null; if (emiIn && !emiIn.success) return { error: "Enter a valid EMI amount, or leave it blank to calculate it." };
  const emi = emiIn?.success ? emiIn.data : computeEmi(d.principal, d.rate, d.tenure);
  if (emi <= 0) return { error: "Could not work out the EMI. Check the amount, rate and tenure." };
  if (emiIn?.success && emi < minEmi(d.principal, d.rate)) return { error: `That EMI only covers interest. It must be above ${formatMoney(minEmi(d.principal, d.rate))} a month to repay the loan.` };
  const base = { name: d.name, lender: d.lender || null, kind: d.kind };
  if (id) {
    const { count } = await a.supabase.from("loan_payments").select("id", { count: "exact", head: true }).eq("loan_id", id);
    const terms = { principal_minor: d.principal, interest_rate_pct: d.rate, tenure_months: d.tenure, emi_minor: emi, first_due_date: d.firstDue };
    const r = await a.supabase.from("loans").update((count ?? 0) > 0 ? base : { ...base, ...terms }).eq("id", id); if (r.error) return missing(r.error) ? { error: MISSING } : { error: "Could not save the loan." };
    touch(); return { ok: (count ?? 0) > 0 ? "Loan details updated. The amount, rate and dates are locked once a payment is recorded." : "Loan updated." };
  }
  const r = await a.supabase.from("loans").insert({ ...base, user_id: a.user.id, principal_minor: d.principal, interest_rate_pct: d.rate, tenure_months: d.tenure, emi_minor: emi, first_due_date: d.firstDue });
  if (r.error) return missing(r.error) ? { error: MISSING } : { error: "Could not save the loan." };
  await notify(a.user.id, "loan", `Loan added: ${d.name}`, `EMI ${formatMoney(emi)} for ${d.tenure} months. We'll remind you before each due date.`);
  touch(); return { ok: "Loan added." };
}

export async function deleteLoan(_: FormState, fd: FormData): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  const { error } = await a.supabase.from("loans").delete().eq("id", String(fd.get("id") ?? "")); if (error) return { error: "Could not delete the loan." };
  touch(); return { ok: "Loan deleted. Payments already recorded stay in your transactions." };
}

/** Records the next instalment: claims the instalment number first (unique, so a double click can't pay twice), then creates the expense.
 *  Independent lookups run together and the last writes run together, because each round trip to the database costs real time. */
export async function markEmiPaid(fd: FormData) {
  const a = await getUserOrNull(); if (!a) return;
  const id = String(fd.get("id") ?? "");
  const [{ data: l }, { data: pays }, { data: prof }, { data: cat }] = await Promise.all([
    a.supabase.from("loans").select("*").eq("id", id).maybeSingle(),
    a.supabase.from("loan_payments").select("installment_no").eq("loan_id", id),
    a.supabase.from("profiles").select("timezone").eq("id", a.user.id).single(),
    a.supabase.from("categories").select("id").ilike("name", "loan%").limit(1).maybeSingle(),
  ]);
  if (!l) return;
  const terms = { principalMinor: Number(l.principal_minor), annualRatePct: Number(l.interest_rate_pct), tenureMonths: l.tenure_months, firstDue: l.first_due_date as string, emiMinor: Number(l.emi_minor) };
  const sched = schedule(terms); const no = (pays?.length ? Math.max(...pays.map((x) => x.installment_no)) : 0) + 1; const inst = sched[no - 1]; if (!inst) return;
  const today = localDate(new Date(), prof?.timezone ?? "Asia/Kolkata");
  const claim = await a.supabase.from("loan_payments").insert({ user_id: a.user.id, loan_id: id, installment_no: no, paid_on: today, amount_minor: inst.emiMinor }).select("id").single(); if (claim.error) return;
  const tx = await a.supabase.from("transactions").insert({ user_id: a.user.id, type: "expense", amount_minor: inst.emiMinor, occurred_at: new Date().toISOString(), name: `EMI ${no}/${sched.length}: ${l.name}`, merchant: l.lender, category_id: cat?.id ?? null, source: "recurring", notes: `Instalment ${no} of ${sched.length}. Principal ${formatMoney(inst.principalMinor)}, interest ${formatMoney(inst.interestMinor)}.` }).select("id").single();
  if (tx.error) { await a.supabase.from("loan_payments").delete().eq("id", claim.data.id); return; } // nothing half-recorded
  const st = loanStatus(terms, no, today);
  await Promise.all([
    a.supabase.from("loan_payments").update({ transaction_id: tx.data.id }).eq("id", claim.data.id),
    st.closed ? a.supabase.from("loans").update({ status: "closed" }).eq("id", id) : null,
    st.closed ? notify(a.user.id, "loan", `Loan cleared: ${l.name}`, "You've paid every instalment. Congratulations, that's a big milestone!")
      : notify(a.user.id, "loan", `EMI paid: ${l.name}`, `Instalment ${no} of ${sched.length} recorded. ${formatMoney(st.outstandingMinor)} still outstanding.`),
  ]);
  forgetUser(a.user.id); touch();
}

/** Undo the most recent instalment (a mistaken click): removes the payment and the expense it created. */
export async function undoLastEmi(fd: FormData) {
  const a = await getUserOrNull(); if (!a) return; const id = String(fd.get("id") ?? "");
  const { data: last } = await a.supabase.from("loan_payments").select("id,transaction_id").eq("loan_id", id).order("installment_no", { ascending: false }).limit(1).maybeSingle(); if (!last) return;
  await Promise.all([
    last.transaction_id ? a.supabase.from("transactions").update({ deleted_at: new Date().toISOString() }).eq("id", last.transaction_id) : null,
    a.supabase.from("loan_payments").delete().eq("id", last.id), a.supabase.from("loans").update({ status: "active" }).eq("id", id),
  ]);
  forgetUser(a.user.id); touch();
}
