import type { Minor } from "./money";

export type TxType = "income" | "expense" | "transfer" | "refund" | "adjustment";
export type Channel = "online" | "offline";

export interface Tx {
  id: string;
  type: TxType;
  /** Always positive paise. Direction for adjustments is in `direction`. */
  amountMinor: Minor;
  occurredAt: string; // ISO instant (UTC)
  categoryId?: string | null;
  merchant?: string | null;
  paymentMethod?: string | null; // e.g. "upi", "cash", "credit_card"
  channel?: Channel | null;
  /** For transfers: account ids. Transfers between own accounts are never income/expense. */
  fromAccountId?: string | null;
  toAccountId?: string | null;
  /** For refunds: the expense it reverses (reduces that category's net spend). */
  refundOfId?: string | null;
  /** For adjustments: whether the adjustment adds to or removes from tracked balance. */
  direction?: "in" | "out" | null;
  description?: string | null;
  externalRef?: string | null;
}
