import { describe, expect, it } from "vitest";
import { coachBase, isFlexible, whatIf } from "@/lib/finance/coach";
import type { Tx } from "@/lib/finance/types";

const NOW = new Date("2026-11-02T10:00:00Z"); let n = 0;
const ago = (days: number) => new Date(+NOW - days * 864e5).toISOString();
const tx = (type: Tx["type"], daysAgo: number, rupees: number, categoryId?: string): Tx => ({ id: `c${++n}`, type, amountMinor: rupees * 100, occurredAt: ago(daysAgo), categoryId });
const cats = [{ id: "food", name: "Food and groceries" }, { id: "rent", name: "Rent" }, { id: "fun", name: "Entertainment" }, { id: "tiny", name: "Snacks" }];
// 3 months: income 30,000/month; rent 10,000/month; food 6,000/month (up from 3,000); entertainment 2,000/month; snacks ₹100/month
const data: Tx[] = [
  ...[5, 35, 65].flatMap((d) => [tx("income", d, 30000), tx("expense", d, 10000, "rent"), tx("expense", d, 6000, "food"), tx("expense", d, 2000, "fun"), tx("expense", d, 100, "tiny")]),
  ...[95, 125, 155].map((d) => tx("expense", d, 3000, "food")),
];
const b = coachBase(data, cats, NOW);

describe("fixed vs flexible", () => {
  it("treats rent, loans and salaries as fixed", () => { expect(isFlexible("Rent")).toBe(false); expect(isFlexible("Loan payments")).toBe(false); expect(isFlexible("Staff salaries")).toBe(false); expect(isFlexible("Inventory & stock")).toBe(false); expect(isFlexible("Entertainment")).toBe(true); });
});
describe("coachBase", () => {
  it("works out a typical month", () => { expect(b.incomeMonthlyMinor).toBe(30000_00); expect(b.expenseMonthlyMinor).toBe((10000 + 6000 + 2000 + 100) * 100); expect(b.savingsMonthlyMinor).toBe(11900_00); expect(b.savingsRatePct).toBe(39); });
  it("lists only flexible categories worth trimming, biggest first", () => { expect(b.opportunities.map((o) => o.id)).toEqual(["food", "fun"]); expect(b.fixedMonthlyMinor).toBe(10000_00); });
  it("suggests a bigger trim where spending is rising fast", () => { const food = b.opportunities[0]; expect(food.trendPct).toBe(100); expect(food.suggestedCutPct).toBe(20); expect(food.savesMonthlyMinor).toBe(1200_00); expect(b.opportunities[1].suggestedCutPct).toBe(10); });
  it("totals the suggested savings", () => { expect(b.suggestedSavesMonthlyMinor).toBe(1200_00 + 200_00); expect(b.suggestedSavesYearlyMinor).toBe(12 * 1400_00); });
  it("handles no data", () => { const e = coachBase([], cats, NOW); expect(e.opportunities).toEqual([]); expect(e.savingsRatePct).toBeNull(); });
});
describe("whatIf", () => {
  it("is zero with no cuts", () => { const w = whatIf(b, {}); expect(w.extraMonthlyMinor).toBe(0); expect(w.newRatePct).toBe(39); });
  // (11,900 + 2,200) / 30,000 = 47%
  it("adds up the chosen cuts and raises the savings rate", () => { const w = whatIf(b, { food: 20, fun: 50 }); expect(w.extraMonthlyMinor).toBe(1200_00 + 1000_00); expect(w.extraYearlyMinor).toBe(12 * 2200_00); expect(w.newRatePct).toBe(47) });
  it("clamps silly percentages", () => expect(whatIf(b, { food: 500 }).extraMonthlyMinor).toBe(6000_00));
  it("shows how many months sooner a goal is reached", () => { const w = whatIf(b, { food: 20 }, { name: "Laptop", remainingMinor: 120000_00 }); expect(w.goal?.monthsNow).toBe(11); expect(w.goal?.monthsNew).toBe(10); expect(w.goal?.monthsSooner).toBe(1); });
  it("no goal timeline when nothing is saved", () => { const w = whatIf({ ...b, savingsMonthlyMinor: 0 }, {}, { name: "X", remainingMinor: 100 }); expect(w.goal?.monthsNow).toBeNull(); });
});
