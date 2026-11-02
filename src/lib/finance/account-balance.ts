import { estimatedBalance } from "./accounting";
import type { Tx } from "./types";

/** The few transaction columns a balance needs (as stored in the database). */
export interface BalanceRow { id: string; type: string; amount_minor: number | string; from_account_id: string | null; to_account_id: string | null; direction: "in" | "out" | null; occurred_at?: string }

/**
 * Estimated balance of ONE account: opening balance plus the recorded transactions linked to it
 * (income and refunds in, expenses out, transfers both ways, adjustments by direction). Always an estimate: it only knows what you recorded.
 */
export function accountBalance(rows: BalanceRow[], accountId: string, openingMinor: number): number {
  const txs = rows.map((r) => ({
    id: r.id, type: r.type, amountMinor: Number(r.amount_minor), occurredAt: r.occurred_at ?? "", fromAccountId: r.from_account_id, toAccountId: r.to_account_id, direction: r.direction,
  }) as Tx);
  return estimatedBalance(txs, accountId, openingMinor);
}

/** A PIN is 4 to 6 digits and nothing else. */
export const PIN_RE = /^\d{4,6}$/;
export const pinProblem = (pin: string): string | null => (PIN_RE.test(pin) ? null : "A PIN is 4 to 6 digits.");
