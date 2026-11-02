import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateBudget, newlyCrossedThresholds, type BudgetDef } from "@/lib/finance/budget";
import { presetRange, localDate, type Preset } from "@/lib/finance/dates";
import { loadTxs } from "./data";
import { earliestBudgetStart } from "./range";
import { notify } from "./notify";

const PRESET: Record<string, Preset> = { daily: "today", weekly: "week", monthly: "month", yearly: "year" };

/** Evaluates all active budgets and fires each threshold at most once per budget+period (DB primary key enforces it). */
export async function checkBudgetAlerts(sb: SupabaseClient, userId: string, tz: string) {
  const { data: budgets } = await sb.from("budgets").select("*").eq("active", true);
  if (!budgets?.length) return;
  const { txs } = await loadTxs(sb, undefined, earliestBudgetStart(budgets.map((b) => b.period), tz), undefined, true, "slim");
  for (const b of budgets) {
    const range = presetRange(PRESET[b.period], new Date(), tz);
    const def: BudgetDef = { id: b.id, amountMinor: Number(b.amount_minor), period: b.period, categoryId: b.category_id, channel: b.channel, alertThresholds: b.alert_thresholds };
    const ev = evaluateBudget(def, txs, range);
    const periodStart = localDate(range.start, tz);
    const { data: fired } = await sb.from("budget_alert_state").select("threshold").eq("budget_id", b.id).eq("period_start", periodStart);
    const crossed = newlyCrossedThresholds(ev.pctUsed, def.alertThresholds, (fired ?? []).map((f) => f.threshold));
    for (const t of crossed) {
      const { error } = await sb.from("budget_alert_state").insert({ budget_id: b.id, user_id: userId, period_start: periodStart, threshold: t });
      if (error) continue; // already fired concurrently
      await notify(userId, "budget", `Budget "${b.name}" reached ${t}%`, `You have used ${ev.pctUsed}% of this ${b.period} budget.`);
    }
  }
}
