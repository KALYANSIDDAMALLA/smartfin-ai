import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTxs } from "./data";
import { localDate, presetRange } from "@/lib/finance/dates";
import { summarize } from "@/lib/finance/accounting";
import { dailyAllowance, daysInMonthOf, dayStatus } from "@/lib/finance/daily";

/**
 * Today's budget. Monthly income = the savings plan's income if set, otherwise income recorded this month.
 * Returns null when there is no income to base it on.
 */
export async function loadDaily(sb: SupabaseClient, tz: string) {
  const now = new Date(), today = localDate(now, tz), month = presetRange("month", now, tz), day = presetRange("today", now, tz);
  const [plan, { txs }] = await Promise.all([
    sb.from("savings_plans").select("monthly_income_minor").maybeSingle(),
    loadTxs(sb, undefined, month.start, month.end, true, "slim"),
  ]);
  const planned = Number(plan.data?.monthly_income_minor ?? 0);
  const income = planned > 0 ? planned : summarize(txs, month).incomeMinor;
  const allowance = dailyAllowance(income, daysInMonthOf(today));
  if (!allowance) return null;
  return { today, source: planned > 0 ? "plan" as const : "recorded" as const, incomeMinor: income, status: dayStatus(allowance, summarize(txs, day).netExpenseMinor) };
}
