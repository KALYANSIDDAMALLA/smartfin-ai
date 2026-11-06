import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTxs } from "./data";
import { customRange, localDate, formatYmd } from "@/lib/finance/dates";
import { schedule } from "@/lib/finance/loans";
import { dayTotals, isYm, isYmd, monthGrid, occurrences, shiftMonth } from "@/lib/finance/calendar";

export interface CalEvent { kind: "recurring" | "goal" | "draft"; ymd: string; title: string; amountMinor?: number; txType?: string; id?: string; overdue?: boolean; draftType?: string }

/** Everything the calendar page needs for one month: day totals, dated events (recurring due, goal targets, drafts) and an upcoming list. RLS scopes all reads to the caller. */
export async function loadCalendar(sb: SupabaseClient, tz: string, sp: { m?: string; d?: string }) {
  const today = localDate(new Date(), tz);
  const ym = isYm(sp.m) ? sp.m : today.slice(0, 7);
  const grid = monthGrid(ym); const from = grid[0][0].ymd; const to = grid[grid.length - 1][6].ymd;
  const sel = isYmd(sp.d) ? sp.d : today.startsWith(ym) ? today : `${ym}-01`;
  const range = customRange(from, to, tz);
  const upTo = (() => { const d = new Date(today + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 30); return d.toISOString().slice(0, 10); })();
  // The same calendar day a year earlier (29 Feb falls back to 28 Feb), for the "on this day last year" insight.
  const ly = (() => { const [y, m, d] = sel.split("-").map(Number); const dd = m === 2 && d === 29 ? 28 : d; return `${y - 1}-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`; })(); const lyRange = customRange(ly, ly, tz);
  const [{ rows, txs }, drafts, rules, goals, lastYear, loansRes, paysRes] = await Promise.all([
    loadTxs(sb, undefined, range.start, range.end, false),
    sb.from("transaction_drafts").select("*").order("planned_for", { nullsFirst: false }),
    sb.from("recurring_rules").select("id,name,tx_type,estimated_amount_minor,frequency,next_due_date").eq("paused", false),
    sb.from("financial_goals").select("id,name,target_date,status").not("target_date", "is", null).neq("status", "completed"),
    loadTxs(sb, undefined, lyRange.start, lyRange.end, false, "slim"),
    sb.from("loans").select("id,name,principal_minor,interest_rate_pct,tenure_months,emi_minor,first_due_date").eq("status", "active"),
    sb.from("loan_payments").select("loan_id,installment_no"),
  ]);
  const lyTotals = Object.values(dayTotals(lastYear.txs, tz))[0] ?? null;
  const events: CalEvent[] = [];
  for (const r of rules.data ?? []) {
    for (const ymd of occurrences({ nextDue: r.next_due_date, frequency: r.frequency }, from, to))
      events.push({ kind: "recurring", ymd, title: r.name, amountMinor: Number(r.estimated_amount_minor), txType: r.tx_type, id: r.id, overdue: ymd < today });
  }
  for (const g of goals.data ?? []) if (g.target_date >= from && g.target_date <= to) events.push({ kind: "goal", ymd: g.target_date, title: `Goal target: ${g.name}`, id: g.id, overdue: g.target_date < today });
  for (const d of drafts.data ?? []) if (d.planned_for && d.planned_for >= from && d.planned_for <= to)
    events.push({ kind: "draft", ymd: d.planned_for, title: d.name ?? d.merchant ?? "Untitled draft", amountMinor: d.amount_minor != null ? Number(d.amount_minor) : undefined, id: d.id, draftType: d.type, overdue: d.planned_for < today });
  // Loan EMIs still to pay (skipped quietly if the loans table has not been created yet).
  const loanEvents: CalEvent[] = [];
  for (const l of loansRes.error ? [] : loansRes.data ?? []) { const paid = (paysRes.data ?? []).filter((p) => p.loan_id === l.id).length;
    for (const i of schedule({ principalMinor: Number(l.principal_minor), annualRatePct: Number(l.interest_rate_pct), tenureMonths: l.tenure_months, firstDue: l.first_due_date, emiMinor: Number(l.emi_minor) }).slice(paid))
      loanEvents.push({ kind: "recurring", ymd: i.due, title: `EMI ${i.no}: ${l.name}`, amountMinor: i.emiMinor, txType: "expense", id: l.id, overdue: i.due < today }); }
  for (const e of loanEvents) if (e.ymd >= from && e.ymd <= to) events.push(e);
  const byDay: Record<string, CalEvent[]> = {}; events.forEach((e) => (byDay[e.ymd] ??= []).push(e));
  const totals = dayTotals(txs, tz);

  // Upcoming (next 30 days) + overdue + unscheduled drafts, independent of the month being viewed.
  const upcoming: CalEvent[] = [];
  for (const r of rules.data ?? []) for (const ymd of occurrences({ nextDue: r.next_due_date, frequency: r.frequency }, r.next_due_date < today ? r.next_due_date : today, upTo).slice(0, 3))
    upcoming.push({ kind: "recurring", ymd, title: r.name, amountMinor: Number(r.estimated_amount_minor), txType: r.tx_type, id: r.id, overdue: ymd < today });
  for (const g of goals.data ?? []) if (g.target_date <= upTo) upcoming.push({ kind: "goal", ymd: g.target_date, title: `Goal target: ${g.name}`, id: g.id, overdue: g.target_date < today });
  for (const d of drafts.data ?? []) if (d.planned_for && d.planned_for <= upTo) upcoming.push({ kind: "draft", ymd: d.planned_for, title: d.name ?? d.merchant ?? "Untitled draft", amountMinor: d.amount_minor != null ? Number(d.amount_minor) : undefined, id: d.id, draftType: d.type, overdue: d.planned_for < today });
  for (const e of loanEvents) if (e.ymd <= upTo && (e.overdue || upcoming.filter((u) => u.id === e.id).length < 3)) upcoming.push(e);
  upcoming.sort((a, b) => a.ymd.localeCompare(b.ymd));
  const unscheduled = (drafts.data ?? []).filter((d) => !d.planned_for);

  const inMonth = grid.flat().filter((c) => c.inMonth).map((c) => totals[c.ymd]).filter(Boolean);
  const month = { incomeMinor: inMonth.reduce((a, t) => a + t.incomeMinor, 0), expenseMinor: inMonth.reduce((a, t) => a + t.expenseMinor, 0), days: inMonth.length };
  return { today, ym, prev: shiftMonth(ym, -1), next: shiftMonth(ym, 1), grid, sel, selLabel: new Date(sel + "T00:00:00Z").toLocaleDateString("en-IN", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }),
    totals, byDay, upcoming, unscheduled, month, rows, formatYmd, lastYear: { date: ly, totals: lyTotals } };
}
