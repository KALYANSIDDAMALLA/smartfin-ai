import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { localDate } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/money";
import { bankClosed, upcomingHolidays } from "@/lib/finance/holidays";
import { loanStatus } from "@/lib/finance/loans";
import { notifyOnce } from "./notify";
import { memo } from "./memo";

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86_400_000);
const nice = (ymd: string) => new Date(ymd + "T00:00:00Z").toLocaleDateString("en-IN", { timeZone: "UTC", day: "numeric", month: "short" });
const when = (n: number) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

/**
 * Time-based reminders, created lazily (no cron needed) and at most every 30 minutes per user: welcome, bills due or overdue,
 * drafts to finish, goal deadlines and upcoming festivals / bank holidays. Each one is de-duplicated by `notifyOnce`.
 */
export function runReminders(sb: SupabaseClient, userId: string, tz: string, currency = "INR") {
  return memo(userId, "reminders", 30 * 60_000, async () => {
    try {
      const today = localDate(new Date(), tz); const m = (v: number) => formatMoney(v, currency);
      await notifyOnce(userId, "welcome", "Welcome to SmartFin AI", "Add an expense, set a budget and create a goal — your insights build up from there. Try pasting a bank SMS into Add expense.", 3650);
      const [rules, drafts, goals, loans, loanPays] = await Promise.all([
        sb.from("recurring_rules").select("name,estimated_amount_minor,next_due_date").eq("paused", false),
        sb.from("transaction_drafts").select("name,merchant,planned_for").not("planned_for", "is", null).lte("planned_for", today),
        sb.from("financial_goals").select("name,target_date").neq("status", "completed").not("target_date", "is", null),
        sb.from("loans").select("id,name,principal_minor,interest_rate_pct,tenure_months,emi_minor,first_due_date").eq("status", "active"),
        sb.from("loan_payments").select("loan_id"),
      ]);
      for (const l of loans.error ? [] : loans.data ?? []) { // loan EMIs: overdue, due today or due within 3 days
        const st = loanStatus({ principalMinor: Number(l.principal_minor), annualRatePct: Number(l.interest_rate_pct), tenureMonths: l.tenure_months, firstDue: l.first_due_date, emiMinor: Number(l.emi_minor) }, (loanPays.data ?? []).filter((p) => p.loan_id === l.id).length, today);
        if (st.overdue > 0) await notifyOnce(userId, "loan", `Overdue EMI: ${l.name}`, `${st.overdue} instalment${st.overdue === 1 ? "" : "s"} (${m(st.overdueMinor)}) overdue. Pay it and mark it paid in Repayments.`, 3);
        else if (st.next && st.daysToNext !== null && st.daysToNext <= 3) await notifyOnce(userId, "loan", `${l.name} EMI is due ${when(st.daysToNext)}`, `${m(st.next.emiMinor)} on ${nice(st.next.due)}. ${m(st.outstandingMinor)} still to repay.`, 4);
      }
      for (const r of rules.data ?? []) {
        const n = dayDiff(today, r.next_due_date); const amt = m(Number(r.estimated_amount_minor));
        if (n < 0) await notifyOnce(userId, "recurring", `Overdue: ${r.name}`, `${amt} was due on ${nice(r.next_due_date)}. Mark it paid once done.`, 3);
        else if (n <= 3) await notifyOnce(userId, "recurring", `${r.name} is due ${when(n)}`, `${amt} on ${nice(r.next_due_date)}.`, 4);
      }
      for (const d of drafts.data ?? []) await notifyOnce(userId, "draft", `Finish your draft: ${d.name ?? d.merchant ?? "Untitled"}`, `It was planned for ${nice(d.planned_for)}. Open Calendar & Drafts to complete it.`, 2);
      for (const g of goals.data ?? []) { const n = dayDiff(today, g.target_date); if (n >= 0 && n <= 7) await notifyOnce(userId, "goal", `Goal deadline ${when(n)}: ${g.name}`, "Add a contribution to stay on track.", 7); }
      for (const h of upcomingHolidays(today, 6).filter((x) => x.inDays <= 2)) {
        const bc = bankClosed(h.date);
        await notifyOnce(userId, "calendar", `${h.name} ${when(h.inDays)}`, bc.closed ? `Banks are closed (${bc.reason ?? "holiday"}). Plan payments and transfers ahead.` : "Enjoy! Spending tends to rise around festivals, so check your budgets.", 3);
      }
    } catch (e) { console.error("reminders failed", (e as Error).message); }
    return true;
  });
}
