import { describe, expect, it } from "vitest";
import { BANKS, accountName, bankById, bankHue, kindOf } from "@/lib/banks";

describe("bank list", () => {
  it("has unique ids and clear names", () => { expect(new Set(BANKS.map((b) => b.id)).size).toBe(BANKS.length); BANKS.forEach((b) => expect(b.name.length).toBeGreaterThan(2)); });
  it("includes the big banks and an Other option", () => { for (const id of ["state-bank-of-india", "hdfc-bank", "icici-bank", "axis-bank", "kotak-mahindra-bank", "other"]) expect(bankById(id), id).toBeDefined(); });
  it("makes readable ids", () => { expect(bankById("punjab-and-sind-bank")?.name).toBe("Punjab & Sind Bank"); expect(bankById("jammu-and-kashmir-bank")).toBeDefined(); });
  it("gives each bank a stable colour", () => { expect(bankHue("HDFC Bank")).toBe(bankHue("HDFC Bank")); expect(bankHue("HDFC Bank")).toBeLessThan(360); });
});
describe("account names", () => {
  it("uses the bank and last 4 digits", () => expect(accountName({ bank: "HDFC Bank", type: "savings", last4: "4321" })).toBe("HDFC Bank ••4321"));
  it("marks current accounts, cards and wallets", () => { expect(accountName({ bank: "ICICI Bank", type: "current", last4: "9876" })).toBe("ICICI Bank ••9876 (Current)"); expect(accountName({ bank: "Axis Bank", type: "credit_card", last4: "1111" })).toBe("Axis Bank ••1111 (Credit card)"); expect(accountName({ bank: "Paytm Payments Bank", type: "wallet" })).toBe("Paytm Payments Bank (Wallet)"); });
  it("prefers the nickname", () => expect(accountName({ bank: "HDFC Bank", type: "savings", last4: "4321", nickname: "  Salary account " })).toBe("Salary account"));
  it("cash is just Cash", () => expect(accountName({ bank: "ignored", type: "cash" })).toBe("Cash"));
  it("never exceeds 100 characters", () => expect(accountName({ bank: "B".repeat(150), type: "savings" }).length).toBeLessThanOrEqual(100));
});
describe("account kinds", () => { it("maps savings and current to bank", () => { expect(kindOf("savings")).toBe("bank"); expect(kindOf("current")).toBe("bank"); expect(kindOf("credit_card")).toBe("credit_card"); expect(kindOf("cash")).toBe("cash"); }); });
