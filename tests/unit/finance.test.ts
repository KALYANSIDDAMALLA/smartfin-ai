import { describe, it, expect } from "vitest";
import { parseMoney, formatMoney, percent, allocate, sum } from "@/lib/finance/money";
import { summarize, estimatedBalance } from "@/lib/finance/accounting";
import { presetRange, customRange, previousRange, localDate } from "@/lib/finance/dates";
import { evaluateBudget, newlyCrossedThresholds, type BudgetDef } from "@/lib/finance/budget";
import { goalProgress, crossedMilestones, estimatedCompletion, monthsBetween } from "@/lib/finance/goals";
import { planSavings } from "@/lib/finance/savings";
import { detectDuplicates } from "@/lib/imports/dedupe";
import type { Tx } from "@/lib/finance/types";

let n = 0;
const tx = (o: Partial<Tx> & Pick<Tx, "type" | "amountMinor">): Tx => ({ id: `t${++n}`, occurredAt: "2026-11-10T06:00:00Z", ...o });
const month = presetRange("month", new Date("2026-11-15T06:00:00Z"));

describe("money", () => {
  it("parses without float error", () => {
    expect(parseMoney("0.10")).toBe(10);
    expect(parseMoney("1,234.5")).toBe(123450);
    expect(parseMoney("₹99")).toBe(9900);
    expect(parseMoney("19.99") + parseMoney("0.01")).toBe(2000);
  });
  it("rejects bad input and sub-paise precision", () => {
    expect(() => parseMoney("abc")).toThrow();
    expect(() => parseMoney("1.005")).toThrow();
  });
  it("formats", () => {
    expect(formatMoney(12345)).toContain("123.45");
    expect(formatMoney(-500)).toMatch(/^-/);
  });
  it("percent uses integer math", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
    expect(percent(5, 0)).toBe(0);
  });
  it("allocate preserves total", () => {
    expect(sum(allocate(100, 3))).toBe(100);
    expect(allocate(100, 3)).toEqual([34, 33, 33]);
  });
});

describe("accounting rules", () => {
  it("income vs expense and savings rate", () => {
    const s = summarize([tx({ type: "income", amountMinor: 100000 }), tx({ type: "expense", amountMinor: 30000 })], month);
    expect(s.netCashFlowMinor).toBe(70000);
    expect(s.savingsRatePct).toBe(70);
  });
  it("savings rate is null with no income", () => {
    expect(summarize([tx({ type: "expense", amountMinor: 100 })], month).savingsRatePct).toBeNull();
  });
  it("credit card purchase is expense; bill repayment (transfer) is not a second expense", () => {
    const s = summarize([
      tx({ type: "expense", amountMinor: 50000, paymentMethod: "credit_card" }),
      tx({ type: "transfer", amountMinor: 50000, fromAccountId: "bank", toAccountId: "card" }),
    ], month);
    expect(s.netExpenseMinor).toBe(50000);
  });
  it("own-account transfers are neither income nor expense", () => {
    const s = summarize([tx({ type: "transfer", amountMinor: 99999, fromAccountId: "a", toAccountId: "b" })], month);
    expect(s.incomeMinor + s.netExpenseMinor).toBe(0);
  });
  it("refunds reduce net expense, inheriting category/channel, even from earlier period", () => {
    const orig = tx({ type: "expense", amountMinor: 20000, categoryId: "shop", channel: "online", occurredAt: "2026-10-20T06:00:00Z" });
    const cur = tx({ type: "expense", amountMinor: 10000, categoryId: "shop", channel: "online" });
    const ref = tx({ type: "refund", amountMinor: 5000, refundOfId: orig.id });
    const s = summarize([orig, cur, ref], month);
    expect(s.netExpenseMinor).toBe(5000);
    expect(s.byCategory.shop).toBe(5000);
    expect(s.onlineMinor).toBe(5000);
  });
  it("adjustments don't hit income/expense but change balance", () => {
    const a = tx({ type: "adjustment", amountMinor: 700, direction: "out", fromAccountId: "acc" });
    expect(summarize([a], month).netExpenseMinor).toBe(0);
    expect(estimatedBalance([a], "acc", 1000)).toBe(300);
  });
  it("estimated balance across transfer and expense", () => {
    const t = [tx({ type: "transfer", amountMinor: 400, fromAccountId: "a", toAccountId: "b" }), tx({ type: "expense", amountMinor: 100, fromAccountId: "a" })];
    expect(estimatedBalance(t, "a", 1000)).toBe(500);
    expect(estimatedBalance(t, "b", 0)).toBe(400);
  });
  it("splits online/offline", () => {
    const s = summarize([tx({ type: "expense", amountMinor: 100, channel: "online" }), tx({ type: "expense", amountMinor: 50, channel: "offline" })], month);
    expect([s.onlineMinor, s.offlineMinor]).toEqual([100, 50]);
  });
});

describe("dates & timezones", () => {
  it("IST day boundary: 18:31 UTC is next local day", () => {
    expect(localDate("2026-11-10T18:31:00Z")).toBe("2026-11-11");
    expect(localDate("2026-11-10T18:29:00Z")).toBe("2026-11-10");
  });
  it("month range is half-open in IST", () => {
    const edge = tx({ type: "expense", amountMinor: 1, occurredAt: "2026-10-31T18:30:00Z" }); // = Nov 1 00:00 IST
    const before = tx({ type: "expense", amountMinor: 1, occurredAt: "2026-10-31T18:29:59Z" });
    const s = summarize([edge, before], month);
    expect(s.grossExpenseMinor).toBe(1);
  });
  it("week starts Monday", () => {
    const r = presetRange("week", new Date("2026-11-01T06:00:00Z")); // Sunday
    expect(localDate(r.start)).toBe("2026-10-26");
  });
  it("custom range inclusive and previous month wraps year", () => {
    const r = customRange("2026-01-01", "2026-01-31");
    expect(localDate(new Date(r.end.getTime() - 1))).toBe("2026-01-31");
    const p = previousRange(presetRange("month", new Date("2026-01-15T00:00:00Z")), "month");
    expect(localDate(p.start)).toBe("2025-12-01");
  });
});

describe("budgets", () => {
  const b: BudgetDef = { id: "b", amountMinor: 10000, period: "monthly", categoryId: "food", alertThresholds: [50, 75, 90, 100] };
  it("computes net of refunds, category-scoped", () => {
    const e = tx({ type: "expense", amountMinor: 8000, categoryId: "food" });
    const r = tx({ type: "refund", amountMinor: 2000, refundOfId: e.id });
    const other = tx({ type: "expense", amountMinor: 99999, categoryId: "rent" });
    const ev = evaluateBudget(b, [e, r, other], month);
    expect(ev.spentMinor).toBe(6000);
    expect(ev.pctUsed).toBe(60);
    expect(ev.remainingMinor).toBe(4000);
    expect(ev.status).toBe("on_track");
  });
  it("overspend yields negative remaining and exceeded", () => {
    const ev = evaluateBudget(b, [tx({ type: "expense", amountMinor: 12000, categoryId: "food" })], month);
    expect(ev.status).toBe("exceeded");
    expect(ev.remainingMinor).toBe(-2000);
  });
  it("channel budgets", () => {
    const ob: BudgetDef = { ...b, categoryId: null, channel: "online" };
    const ev = evaluateBudget(ob, [tx({ type: "expense", amountMinor: 500, channel: "online" }), tx({ type: "expense", amountMinor: 900, channel: "offline" })], month);
    expect(ev.spentMinor).toBe(500);
  });
  it("alerts fire once per threshold", () => {
    expect(newlyCrossedThresholds(80, [50, 75, 90, 100], [])).toEqual([50, 75]);
    expect(newlyCrossedThresholds(80, [50, 75, 90, 100], [50, 75])).toEqual([]);
    expect(newlyCrossedThresholds(100, [50, 75, 90, 100], [50, 75])).toEqual([90, 100]);
  });
});

describe("goals", () => {
  const g = { targetMinor: 100000, contributedMinor: 25000, targetDate: "2027-05-01", status: "active" as const };
  it("progress and required monthly", () => {
    const p = goalProgress(g, "2026-11-01");
    expect(p.pct).toBe(25);
    expect(p.remainingMinor).toBe(75000);
    expect(p.monthsLeft).toBe(6);
    expect(p.requiredMonthlyMinor).toBe(12500);
    expect(p.reachedMilestones).toEqual([25]);
  });
  it("over-contribution caps pct at 100", () => {
    expect(goalProgress({ ...g, contributedMinor: 150000 }, "2026-11-01").pct).toBe(100);
  });
  it("milestone crossing reports only new milestones", () => {
    expect(crossedMilestones(100000, 20000, 80000)).toEqual([25, 50, 75]);
    expect(crossedMilestones(100000, 80000, 90000)).toEqual([]);
  });
  it("estimated completion; none when paused or no pace", () => {
    expect(estimatedCompletion(g, 25000, "2026-11-01")).toBe("2027-02-01");
    expect(estimatedCompletion(g, 0, "2026-11-01")).toBeNull();
    expect(estimatedCompletion({ ...g, status: "paused" }, 1000, "2026-11-01")).toBeNull();
  });
  it("goal contributions are not expenses (not in transaction summary)", () => {
    expect(summarize([], month).netExpenseMinor).toBe(0);
  });
  it("monthsBetween", () => { expect(monthsBetween("2026-11-15", "2026-11-10")).toBe(0); });
});

describe("savings planner", () => {
  it("caps recommendation at realistic availability", () => {
    const p = planSavings({ monthlyIncomeMinor: 100000, essentialMinor: 50000, discretionaryMinor: 30000, commitmentsMinor: 10000, goalsRequiredMonthlyMinor: [20000, 20000] });
    expect(p.surplusMinor).toBe(10000);
    expect(p.availableMonthlyMinor).toBe(13000);
    expect(p.recommendedMonthlyMinor).toBe(13000);
    expect(p.shortfallMonthlyMinor).toBe(27000);
    expect(p.yearlyProjectionMinor).toBe(156000);
  });
  it("deficit flagged; no negative recommendations", () => {
    const p = planSavings({ monthlyIncomeMinor: 10000, essentialMinor: 20000, discretionaryMinor: 0, commitmentsMinor: 0, goalsRequiredMonthlyMinor: [5000] });
    expect(p.isDeficit).toBe(true);
    expect(p.recommendedMonthlyMinor).toBe(0);
  });
});

describe("import duplicate detection", () => {
  const ex = [{ amountMinor: 25000, occurredAt: "2026-11-10T06:00:00Z", merchant: "Swiggy", externalRef: "R1" }];
  it("detects by external ref, fingerprint (normalized) and within batch", () => {
    const r = detectDuplicates([
      { amountMinor: 1, occurredAt: "2026-11-01T00:00:00Z", externalRef: "R1" },
      { amountMinor: 25000, occurredAt: "2026-11-10T09:00:00Z", merchant: "SWIGGY!" },
      { amountMinor: 700, occurredAt: "2026-11-11T00:00:00Z", merchant: "Cafe" },
      { amountMinor: 700, occurredAt: "2026-11-11T00:00:00Z", merchant: "cafe" },
    ], ex);
    expect(r.map((x) => x.reason)).toEqual(["external_ref", "fingerprint", undefined, "within_batch"]);
  });
});
