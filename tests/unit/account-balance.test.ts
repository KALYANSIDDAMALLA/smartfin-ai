import { describe, expect, it } from "vitest";
import { accountBalance, pinProblem, type BalanceRow } from "@/lib/finance/account-balance";

const A = "acct-a", B = "acct-b";
const row = (o: Partial<BalanceRow> & Pick<BalanceRow, "type" | "amount_minor">): BalanceRow => ({ id: Math.random().toString(36), from_account_id: null, to_account_id: null, direction: null, ...o });

describe("Account balance (estimated)", () => {
  it("starts from the opening balance", () => expect(accountBalance([], A, 150_000_00)).toBe(150_000_00));
  it("adds income and refunds paid into the account, subtracts expenses paid from it", () => {
    const rows = [row({ type: "income", amount_minor: 85_000_00, to_account_id: A }), row({ type: "expense", amount_minor: 1_200_00, from_account_id: A }), row({ type: "refund", amount_minor: 300_00, to_account_id: A })];
    expect(accountBalance(rows, A, 10_000_00)).toBe(10_000_00 + 85_000_00 - 1_200_00 + 300_00);
  });
  it("moves money both ways on transfers", () => {
    const t = [row({ type: "transfer", amount_minor: 5_000_00, from_account_id: A, to_account_id: B })];
    expect(accountBalance(t, A, 20_000_00)).toBe(15_000_00); expect(accountBalance(t, B, 0)).toBe(5_000_00);
  });
  it("applies adjustments by direction", () => {
    const r = [row({ type: "adjustment", amount_minor: 500_00, from_account_id: A, direction: "out" }), row({ type: "adjustment", amount_minor: 200_00, to_account_id: A, direction: "in" })];
    expect(accountBalance(r, A, 1_000_00)).toBe(1_000_00 - 500_00 + 200_00);
  });
  it("accepts amounts that arrive as strings (bigint columns) and can go negative (credit card)", () => {
    expect(accountBalance([row({ type: "expense", amount_minor: "1284000", from_account_id: A })], A, 0)).toBe(-1_284_000);
  });
  it("ignores expenses that came from a different account", () => {
    expect(accountBalance([row({ type: "expense", amount_minor: 900_00, from_account_id: B })], A, 5_000_00)).toBe(5_000_00);
  });
});

describe("PIN format", () => {
  it("accepts 4 to 6 digits only", () => { for (const p of ["1234", "123456", "0000"]) expect(pinProblem(p)).toBeNull(); });
  it("rejects short, long and non-digit PINs", () => { for (const p of ["", "123", "1234567", "12a4", "12 34", "１２３４"]) expect(pinProblem(p)).not.toBeNull(); });
});
