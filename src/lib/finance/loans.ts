/**
 * Loan maths (reducing-balance EMI). Pure and deterministic, so the same numbers appear in the form preview, the schedule and the reminders.
 * Money is integer paise. Rounding is to the nearest paisa each month; the final instalment absorbs the leftover so the balance ends at exactly zero.
 */
export interface LoanTerms { principalMinor: number; annualRatePct: number; tenureMonths: number; firstDue: string; emiMinor?: number }
export interface Installment { no: number; due: string; emiMinor: number; principalMinor: number; interestMinor: number; balanceMinor: number }

/** The standard EMI formula P·r·(1+r)^n / ((1+r)^n − 1) with r = annual rate / 12. A 0% loan is simply principal ÷ months. */
export function computeEmi(principalMinor: number, annualRatePct: number, months: number): number {
  if (!(principalMinor > 0) || !(months > 0)) return 0;
  const r = annualRatePct / 12 / 100; if (r === 0) return Math.round(principalMinor / months);
  const f = Math.pow(1 + r, months); return Math.round((principalMinor * r * f) / (f - 1));
}

/** `ymd` plus n months, keeping the original day where possible (31 Jan → 28 Feb → 31 Mar). */
export function addMonths(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number); const t = (m - 1) + n; const yy = y + Math.floor(t / 12); const mm = ((t % 12) + 12) % 12;
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate(); return `${yy}-${String(mm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** Full repayment schedule. An EMI lower than the monthly interest would never clear the loan, so it yields an empty schedule (callers validate first). */
export function schedule(t: LoanTerms): Installment[] {
  const emi = t.emiMinor ?? computeEmi(t.principalMinor, t.annualRatePct, t.tenureMonths); const r = t.annualRatePct / 12 / 100; const out: Installment[] = [];
  if (!(emi > 0) || !(t.principalMinor > 0)) return out;
  let bal = t.principalMinor;
  // Worst case for paisa rounding over the whole tenure (half a paisa a month, compounding), doubled for safety, never less than ₹1.
  const slack = Math.max(100, Math.ceil(r > 0 ? (Math.pow(1 + r, t.tenureMonths) - 1) / r : t.tenureMonths) + t.tenureMonths);
  for (let no = 1; no <= 1200 && bal > 0; no++) {
    const interest = Math.round(bal * r); // The last instalment is the one that clears the balance. A stored EMI is rounded to the paisa, so after the full tenure a few paise can
    // be left over; fold that into the final instalment instead of inventing an extra month. (A genuinely lower EMI leaves far more and runs on.)
    const crumbs = bal + interest - emi <= slack;
    const last = (no >= t.tenureMonths && (t.emiMinor === undefined || crumbs)) || emi >= bal + interest;
    if (!last && emi <= interest) return []; // negative amortisation
    const principal = last ? bal : emi - interest; bal -= principal;
    out.push({ no, due: addMonths(t.firstDue, no - 1), emiMinor: principal + interest, principalMinor: principal, interestMinor: interest, balanceMinor: bal });
  }
  return out;
}

/** The smallest EMI that still reduces the balance (anything at or below this only pays interest). */
export const minEmi = (principalMinor: number, annualRatePct: number) => Math.floor((principalMinor * annualRatePct) / 1200) + 1;

export interface LoanStatus {
  installments: number; paid: number; outstandingMinor: number; paidMinor: number; interestPaidMinor: number; interestRemainingMinor: number; totalInterestMinor: number; totalPayableMinor: number;
  next: Installment | null; overdue: number; overdueMinor: number; closed: boolean; payoffDate: string | null; progressPct: number; daysToNext: number | null;
}
const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);

/** Where a loan stands after `paidCount` instalments, as of `today` (YYYY-MM-DD). */
export function loanStatus(t: LoanTerms, paidCount: number, today: string): LoanStatus {
  const s = schedule(t); const p = Math.max(0, Math.min(paidCount, s.length)); const sum = (a: Installment[], k: "emiMinor" | "interestMinor") => a.reduce((x, i) => x + i[k], 0);
  const paidRows = s.slice(0, p), left = s.slice(p); const next = left[0] ?? null; const late = left.filter((i) => i.due < today);
  return {
    installments: s.length, paid: p, outstandingMinor: p === 0 ? t.principalMinor : s[p - 1]?.balanceMinor ?? 0, paidMinor: sum(paidRows, "emiMinor"), interestPaidMinor: sum(paidRows, "interestMinor"),
    interestRemainingMinor: sum(left, "interestMinor"), totalInterestMinor: sum(s, "interestMinor"), totalPayableMinor: sum(s, "emiMinor"), next, overdue: late.length, overdueMinor: sum(late, "emiMinor"),
    closed: s.length > 0 && p >= s.length, payoffDate: s.length ? s[s.length - 1].due : null, progressPct: s.length ? Math.round((p / s.length) * 100) : 0, daysToNext: next ? dayDiff(today, next.due) : null,
  };
}
