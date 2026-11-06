import { describe, expect, it } from "vitest";
import { applyMapping, detectMapping, parseStatementText, readStatementRecords } from "@/lib/imports/parse";

const MAP = detectMapping(["Date", "Description", "Amount"]);
const parsed = (rows: ReturnType<typeof parseStatementText>) => rows.map((r) => applyMapping(r, MAP, "Asia/Kolkata"));

/** Made-up statement in the "several lines per transaction, running balance" layout, with a page break in the middle of a transaction. */
const PAGE_FOOTER = ["Statement Period 01 Jan 2026 - 03 Nov 2026", "Statement generated on 03 Nov 2026, 15:46 IST", "-- 1 of 3 --"];
const PAGE_HEADER = ["Example Bank Limited", "# Date Transaction Details Chq/Ref. No. Withdrawal (Dr.) Deposit (Cr.) Balance"];
const lines = [
  ...PAGE_HEADER,
  "- - Opening balance - - - 1,000.00",
  "1 02 Jan 2026 UPI/Swiggy Foods/100000000001/Paid via",
  "app",
  "UPI-100000000001 250.00 750.00",
  "2 03 Jan 2026 NEFT/ACME LTD/SALARY/100000000002 UTR-1 50,000.00 50,750.00",
  "3 04 Jan 2026 UPI/Blinkit/100000000003/Paid",
  ...PAGE_FOOTER, ...PAGE_HEADER, // the page ends in the middle of transaction 3; its amounts are on the next page
  "UPI-100000000003 1,200.50 49,549.50",
  "4 05 Jan 2026 UPI/Friend/100000000004/Refund of dinner UTR-4 300.00 49,849.50",
  ...PAGE_FOOTER.map((l) => l.replace("1 of 3", "2 of 3")), ...PAGE_HEADER,
  "5 06 Jan 2026 ATM/CASH WITHDRAWAL/100000000005 UTR-5 2,000.00 47,849.50",
  ...Array.from({ length: 10 }, (_, i) => `Customer care: 1800-000-000${i % 2}`), // repeated page furniture-like lines must not matter
];
const text = lines.join("\n");

describe("multi-line PDF statements", () => {
  const rows = parseStatementText(text);
  it("finds every transaction, including the one split by a page break", () => expect(rows).toHaveLength(5));
  it("reads amounts and works out money in/out from the running balance", () => {
    expect(rows.map((r) => r.Amount)).toEqual(["250.00 Dr", "50000.00 Cr", "1200.50 Dr", "300.00 Cr", "2000.00 Dr"]);
    const p = parsed(rows); expect(p.map((x) => x.txType)).toEqual(["expense", "income", "expense", "income", "expense"]); expect(p.every((x) => x.occurredAt && x.amountMinor)).toBe(true);
  });
  it("keeps page headers and footers out of descriptions", () => { for (const r of rows) expect(r.Description).not.toMatch(/Statement (Period|generated)|Example Bank|Withdrawal \(Dr/); expect(rows[0].Description).toBe("UPI/Swiggy Foods/100000000001/Paid via app UPI-100000000001"); });
  it("the money in and out add up to the balance movement", () => {
    const { stats } = readStatementRecords(text); expect(stats.opening).toBe(100000); expect(stats.closing).toBe(4784950); expect(stats.byGuess).toBe(0);
    const net = rows.reduce((n, r) => n + Math.round(parseFloat(r.Amount) * 100) * (r.Amount.endsWith("Cr") ? 1 : -1), 0); expect(net).toBe((stats.closing ?? 0) - (stats.opening ?? 0));
  });
  it("handles newest-first statements", () => {
    const rev = ["- - Opening balance - - - 1,000.00", "2 03 Jan 2026 SALARY UTR-2 5,000.00 5,750.00", "1 02 Jan 2026 UPI/Shop UTR-1 250.00 750.00"];
    const r = parseStatementText(rev.join("\n")); expect(r.map((x) => x.Amount)).toEqual(["250.00 Dr", "5000.00 Cr"].slice(0, r.length));
  });
  it("still reads simple one-line statements the old way", () => expect(parseStatementText("01/11/2026 UPI-SWIGGY 450.00 Dr 10,000.00 Cr\nheader line")).toEqual([{ Date: "01/11/2026", Description: "UPI-SWIGGY", Amount: "450.00 Dr" }]));
  it("finds nothing in text that has no transactions", () => expect(parseStatementText("Hello\nThis is not a statement\n12 pages")).toEqual([]));
});

describe("column detection", () => {
  it("does not read the Description column as Credit (it contains the letters 'cr')", () => { const m = detectMapping(["Date", "Description", "Debit", "Credit"]); expect(m.credit).toBe("Credit"); expect(m.debit).toBe("Debit"); expect(m.description).toBe("Description"); });
  it("still understands short and long bank headers", () => {
    expect(detectMapping(["Txn Date", "Narration", "Withdrawal (Dr.)", "Deposit (Cr.)", "Balance"])).toMatchObject({ date: "Txn Date", description: "Narration", debit: "Withdrawal (Dr.)", credit: "Deposit (Cr.)" });
    expect(detectMapping(["Date", "Particulars", "Dr", "Cr"])).toMatchObject({ debit: "Dr", credit: "Cr" });
  });
  it("reads a credit row of a Date/Description/Debit/Credit CSV as income", () => { const m = detectMapping(["Date", "Description", "Debit", "Credit"]); const p = applyMapping({ Date: "02/11/2026", Description: "SALARY", Debit: "", Credit: "50000.00" }, m, "Asia/Kolkata"); expect(p.txType).toBe("income"); expect(p.amountMinor).toBe(5000000); });
});
