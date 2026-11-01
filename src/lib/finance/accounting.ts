import { type Minor, sum } from "./money";
import { type Range, inRange } from "./dates";
import type { Tx, Channel } from "./types";

export interface Summary {
  incomeMinor: Minor;
  grossExpenseMinor: Minor;
  refundsMinor: Minor;
  netExpenseMinor: Minor;
  netCashFlowMinor: Minor;
  /** Tracked savings = net cash flow (income - net expenses); goal allocations are not expenses. */
  trackedSavingsMinor: Minor;
  /** Integer percent; null when income is 0. */
  savingsRatePct: number | null;
  onlineMinor: Minor;
  offlineMinor: Minor;
  unclassifiedMinor: Minor;
  byCategory: Record<string, Minor>;
  byPaymentMethod: Record<string, Minor>;
  byMerchant: Record<string, Minor>;
}

/** Resolve the attributes a refund should inherit from the expense it reverses. */
function resolveRefund(t: Tx, byId: Map<string, Tx>): Tx {
  const orig = t.refundOfId ? byId.get(t.refundOfId) : undefined;
  if (!orig) return t;
  return {
    ...t,
    categoryId: t.categoryId ?? orig.categoryId,
    channel: t.channel ?? orig.channel,
    paymentMethod: t.paymentMethod ?? orig.paymentMethod,
    merchant: t.merchant ?? orig.merchant,
  };
}

const add = (rec: Record<string, Minor>, key: string | null | undefined, v: Minor) => {
  const k = key || "uncategorized";
  rec[k] = (rec[k] ?? 0) + v;
};

/**
 * Pure summary over transactions in `range`.
 * `all` is used only to look up the original expense of a refund (which may be outside the range).
 * Rules: transfers (incl. credit-card bill settlements) and adjustments never count as income/expense;
 * credit-card purchases are expenses; refunds reduce net expense.
 */
export function summarize(txs: Tx[], range: Range, all: Tx[] = txs): Summary {
  const byId = new Map(all.map((t) => [t.id, t]));
  const inR = txs.filter((t) => inRange(t.occurredAt, range));
  const incomes = inR.filter((t) => t.type === "income").map((t) => t.amountMinor);
  const expenses = inR.filter((t) => t.type === "expense");
  const refunds = inR.filter((t) => t.type === "refund").map((t) => resolveRefund(t, byId));

  const chan: Record<Channel | "none", Minor> = { online: 0, offline: 0, none: 0 };
  const byCategory: Record<string, Minor> = {};
  const byPaymentMethod: Record<string, Minor> = {};
  const byMerchant: Record<string, Minor> = {};
  const apply = (t: Tx, sign: 1 | -1) => {
    const v = sign * t.amountMinor;
    chan[t.channel ?? "none"] += v;
    add(byCategory, t.categoryId, v);
    add(byPaymentMethod, t.paymentMethod, v);
    add(byMerchant, t.merchant?.trim().toLowerCase(), v);
  };
  expenses.forEach((t) => apply(t, 1));
  refunds.forEach((t) => apply(t, -1));

  const incomeMinor = sum(incomes);
  const grossExpenseMinor = sum(expenses.map((t) => t.amountMinor));
  const refundsMinor = sum(refunds.map((t) => t.amountMinor));
  const netExpenseMinor = grossExpenseMinor - refundsMinor;
  const netCashFlowMinor = incomeMinor - netExpenseMinor;
  return {
    incomeMinor, grossExpenseMinor, refundsMinor, netExpenseMinor, netCashFlowMinor,
    trackedSavingsMinor: netCashFlowMinor,
    savingsRatePct: incomeMinor > 0 ? Math.floor((netCashFlowMinor * 100) / incomeMinor) : null,
    onlineMinor: chan.online, offlineMinor: chan.offline, unclassifiedMinor: chan.none,
    byCategory, byPaymentMethod, byMerchant,
  };
}

/**
 * Estimated tracked balance for an account from recorded transactions only.
 * Must be labelled "estimated" in the UI unless all accounts are configured.
 */
export function estimatedBalance(txs: Tx[], accountId: string, openingMinor: Minor = 0): Minor {
  let bal = openingMinor;
  for (const t of txs) {
    const from = t.fromAccountId === accountId, to = t.toAccountId === accountId;
    if (t.type === "transfer") { if (from) bal -= t.amountMinor; if (to) bal += t.amountMinor; }
    else if (t.type === "income" || t.type === "refund") { if (to || (!from && t.toAccountId == null && t.fromAccountId == null)) bal += t.amountMinor; }
    else if (t.type === "expense") { if (from) bal -= t.amountMinor; }
    else if (t.type === "adjustment" && (from || to)) bal += t.direction === "out" ? -t.amountMinor : t.amountMinor;
  }
  return bal;
}
