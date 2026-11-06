import { describe, expect, it } from "vitest";
import { DEMO_BANK, sampleBankRows } from "@/lib/integrations/demo";
import { AA_MAPPING } from "@/lib/integrations/aa-map";

describe("demo bank sample rows", () => {
  const today = new Date("2026-11-04T10:00:00Z"); const rows = sampleBankRows(today);
  it("has debits and credits, never both on one row", () => { expect(rows.length).toBeGreaterThan(15); for (const r of rows) expect(Boolean(r.Debit) !== Boolean(r.Credit)).toBe(true); });
  it("stays within the last 6 weeks and not in the future", () => { for (const r of rows) { const d = r.Date as string; expect(d <= "2026-11-04").toBe(true); expect(d >= "2026-09-20").toBe(true); } });
  it("gives every row a unique, stable reference (so a second load is flagged as duplicates)", () => { const refs = rows.map((r) => r.Reference); expect(new Set(refs).size).toBe(refs.length); expect(sampleBankRows(today).map((r) => r.Reference)).toEqual(refs); });
  it("uses the column names the import mapping expects", () => { for (const k of Object.values(AA_MAPPING)) expect(rows[0]).toHaveProperty(k); expect(rows[0].Account).toBe(DEMO_BANK.masked); });
  it("amounts are plain numbers with two decimals", () => { for (const r of rows) expect(String(r.Debit || r.Credit)).toMatch(/^\d+\.\d{2}$/); });
});
