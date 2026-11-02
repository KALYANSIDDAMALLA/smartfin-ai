import { describe, it, expect } from "vitest";
import { bankClosed, holidaysBetween, holidaysOn, monthStats, upcomingHolidays } from "@/lib/finance/holidays";

describe("Indian holidays", () => {
  it("2026 has the 17 central government holidays", () => {
    const g = holidaysBetween("2026-01-01", "2026-12-31", ["govt"]); expect(g).toHaveLength(17);
    for (const [d, n] of [["2026-01-26", "Republic Day"], ["2026-03-04", "Holi"], ["2026-08-15", "Independence Day"], ["2026-10-20", "Dussehra (Vijayadashami)"], ["2026-11-08", "Diwali (Deepavali)"], ["2026-12-25", "Christmas Day"]]) expect(g.some((h) => h.date === d && h.name === n)).toBe(true);
  });
  it("lists the Diwali week in November 2026", () => {
    const names = holidaysBetween("2026-11-01", "2026-11-30").map((h) => `${h.date.slice(8)} ${h.name}`);
    expect(names).toEqual(expect.arrayContaining(["06 Dhanteras", "08 Diwali (Deepavali)", "09 Govardhan Puja", "11 Bhai Dooj", "15 Chhath Puja", "24 Guru Nanak Jayanti"]));
  });
  it("fixed national days exist in every year; lunar ones only where loaded", () => {
    expect(holidaysOn("2030-01-26")[0]).toMatchObject({ name: "Republic Day", kind: "govt" }); expect(holidaysOn("2030-08-15")).toHaveLength(1);
    expect(holidaysBetween("2030-01-01", "2030-12-31", ["festival"])).toHaveLength(0); expect(holidaysBetween("2027-01-01", "2027-12-31", ["govt"]).length).toBeGreaterThanOrEqual(17);
  });
  it("applies the RBI bank-closure rule", () => {
    expect(bankClosed("2026-11-01")).toEqual({ closed: true, reason: "Sunday" }); // Sunday
    expect(bankClosed("2026-11-14")).toEqual({ closed: true, reason: "2nd Saturday" }); expect(bankClosed("2026-11-28")).toEqual({ closed: true, reason: "4th Saturday" });
    expect(bankClosed("2026-11-07").closed).toBe(false); expect(bankClosed("2026-11-21").closed).toBe(false); // 1st and 3rd Saturday are working days
    expect(bankClosed("2026-11-24")).toEqual({ closed: true, reason: "Guru Nanak Jayanti" }); expect(bankClosed("2026-11-03").closed).toBe(false);
  });
  it("counts working days", () => {
    expect(monthStats("2026-11")).toMatchObject({ days: 30, closed: 8, working: 22, govt: 2 }); // 5 Sundays + 2nd/4th Sat + Guru Nanak Jayanti (Diwali is a Sunday)
  });
  it("finds the next holidays", () => {
    const u = upcomingHolidays("2026-11-02", 3); expect(u.map((h) => h.date)).toEqual(["2026-11-06", "2026-11-08", "2026-11-08"]);
    expect(upcomingHolidays("2026-11-02", 1)[0]).toMatchObject({ date: "2026-11-06", name: "Dhanteras", inDays: 4 });
  });
});
