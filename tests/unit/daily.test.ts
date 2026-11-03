import { describe, expect, it } from "vitest";
import { dailyAllowance, dayStatus, daysInMonthOf, nightMessage } from "@/lib/finance/daily";

const m = (v: number) => `₹${v / 100}`;
describe("daily budget", () => {
  it("₹1,00,000 over 30 days is ₹3,333 a day", () => expect(dailyAllowance(100_000_00, 30)).toBe(3_333_00));
  it("returns 0 with no income", () => expect(dailyAllowance(0, 30)).toBe(0));
  it("knows month lengths", () => { expect(daysInMonthOf("2026-11-03")).toBe(30); expect(daysInMonthOf("2028-02-10")).toBe(29); });
  it("subtracts spends like the video (3333 → 3083)", () => { const s = dayStatus(3_333_00, 250_00); expect(s.leftMinor).toBe(3_083_00); expect(s.state).toBe("ok"); });
  it("flags over budget (₹4,200 vs ₹3,333)", () => { const s = dayStatus(3_333_00, 4_200_00); expect(s.state).toBe("over"); expect(nightMessage(s, m).body).toContain("₹867"); });
  it("fresh and close states", () => { expect(dayStatus(3_333_00, 0).state).toBe("fresh"); expect(dayStatus(3_333_00, 2_800_00).state).toBe("close"); });
});
