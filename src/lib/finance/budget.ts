import { type Minor, percent } from "./money";
import { type Range, inRange } from "./dates";
import type { Tx } from "./types";

export interface BudgetDef {
  id: string;
  amountMinor: Minor;
  period: "daily" | "weekly" | "monthly" | "yearly";
  categoryId?: string | null;
  channel?: "online" | "offline" | null;
  alertThresholds: number[]; // e.g. [50,75,90,100]
}
export type BudgetStatus = "on_track" | "warning" | "critical" | "exceeded";

export function budgetSpent(b: BudgetDef, txs: Tx[], range: Range): Minor {
  const byId = new Map(txs.map((t) => [t.id, t]));
  let spent = 0;
  for (const t of txs) {
    if (!inRange(t.occurredAt, range)) continue;
    if (t.type !== "expense" && t.type !== "refund") continue;
    const orig = t.type === "refund" && t.refundOfId ? byId.get(t.refundOfId) : undefined;
    const cat = t.categoryId ?? orig?.categoryId;
    const ch = t.channel ?? orig?.channel;
    if (b.categoryId && cat !== b.categoryId) continue;
    if (b.channel && ch !== b.channel) continue;
    spent += t.type === "expense" ? t.amountMinor : -t.amountMinor;
  }
  return spent;
}

export function budgetStatus(pct: number): BudgetStatus {
  return pct >= 100 ? "exceeded" : pct >= 90 ? "critical" : pct >= 75 ? "warning" : "on_track";
}

export function evaluateBudget(b: BudgetDef, txs: Tx[], range: Range) {
  const spentMinor = Math.max(0, budgetSpent(b, txs, range));
  const pctUsed = percent(spentMinor, b.amountMinor);
  return {
    amountMinor: b.amountMinor, spentMinor,
    remainingMinor: b.amountMinor - spentMinor, // negative when overspent
    pctUsed, status: budgetStatus(pctUsed),
  };
}

/**
 * Alert de-duplication: returns the thresholds newly crossed since `alreadyAlerted`
 * (thresholds already fired for this budget+period). Caller persists the returned set.
 */
export function newlyCrossedThresholds(pctUsed: number, thresholds: number[], alreadyAlerted: number[]): number[] {
  const done = new Set(alreadyAlerted);
  return [...thresholds].sort((a, b) => a - b).filter((t) => pctUsed >= t && !done.has(t));
}
