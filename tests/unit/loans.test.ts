import { describe, expect, it } from "vitest";
import { addMonths, computeEmi, loanStatus, minEmi, schedule } from "@/lib/finance/loans";

const T = { principalMinor: 100_000_000, annualRatePct: 8.5, tenureMonths: 240, firstDue: "2026-12-05" }; // ₹10,00,000 at 8.5% for 20 years

describe("EMI", () => {
  it("matches the standard formula (₹10L, 8.5%, 20y ≈ ₹8,678)", () => expect(Math.round(computeEmi(T.principalMinor, 8.5, 240) / 100)).toBe(8678));
  it("handles 0% interest", () => expect(computeEmi(120_000_00, 0, 12)).toBe(10_000_00));
  it("returns 0 for nonsense input", () => { expect(computeEmi(0, 8, 12)).toBe(0); expect(computeEmi(100, 8, 0)).toBe(0); });
});

describe("addMonths", () => {
  it("clamps to month end and returns to the original day", () => { expect(addMonths("2026-01-31", 1)).toBe("2026-02-28"); expect(addMonths("2026-01-31", 2)).toBe("2026-03-31"); });
  it("rolls the year", () => expect(addMonths("2026-11-15", 3)).toBe("2027-02-15"));
});

describe("schedule", () => {
  const s = schedule(T);
  it("has one row per month and ends at exactly zero", () => { expect(s).toHaveLength(240); expect(s[239].balanceMinor).toBe(0); expect(s[0].due).toBe("2026-12-05"); });
  it("repays exactly the principal in total", () => expect(s.reduce((a, i) => a + i.principalMinor, 0)).toBe(T.principalMinor));
  it("interest falls and principal rises over time", () => { expect(s[0].interestMinor).toBeGreaterThan(s[100].interestMinor); expect(s[0].principalMinor).toBeLessThan(s[100].principalMinor); });
  it("each row: emi = principal + interest", () => s.forEach((i) => expect(i.emiMinor).toBe(i.principalMinor + i.interestMinor)));
  it("a custom larger EMI clears the loan sooner", () => { const f = schedule({ ...T, emiMinor: 15_000_00 }); expect(f.length).toBeLessThan(240); expect(f[f.length - 1].balanceMinor).toBe(0); });
  it("rejects an EMI that only covers interest", () => expect(schedule({ ...T, emiMinor: 100_00 })).toEqual([]));
  it("minEmi is just above the monthly interest", () => expect(minEmi(100_000_000, 12)).toBe(1_000_001));
});

describe("a stored (rounded) EMI never adds an extra month", () => {
  it("matches the tenure exactly for 480 realistic loans", () => {
    for (const P of [50_000_00, 120_000_00, 6_00_000_00, 12_87_000_00, 50_00_000_00]) for (const R of [0, 6.5, 8.5, 9.5, 11, 12, 18, 24]) for (const N of [6, 12, 18, 24, 36, 60, 84, 120, 240, 360]) {
      const emiMinor = computeEmi(P, R, N); const s = schedule({ principalMinor: P, annualRatePct: R, tenureMonths: N, firstDue: "2026-12-05", emiMinor });
      expect(s.length, `${P} @ ${R}% for ${N}`).toBe(N); expect(s[N - 1].balanceMinor).toBe(0); expect(s.reduce((a, i) => a + i.principalMinor, 0)).toBe(P);
    }
  });
  it("the last instalment differs from the EMI by only a few rupees at most", () => {
    const emiMinor = computeEmi(120_000_00, 12, 12); const s = schedule({ principalMinor: 120_000_00, annualRatePct: 12, tenureMonths: 12, firstDue: "2026-12-05", emiMinor });
    expect(Math.abs(s[11].emiMinor - emiMinor)).toBeLessThan(200);
  });
  it("a clearly lower EMI still runs past the tenure", () => expect(schedule({ principalMinor: 120_000_00, annualRatePct: 12, tenureMonths: 12, firstDue: "2026-12-05", emiMinor: 9_000_00 }).length).toBeGreaterThan(12));
});

describe("loanStatus", () => {
  it("fresh loan: full outstanding, next is #1", () => { const st = loanStatus(T, 0, "2026-11-02"); expect(st.outstandingMinor).toBe(T.principalMinor); expect(st.next?.no).toBe(1); expect(st.overdue).toBe(0); expect(st.daysToNext).toBe(33); expect(st.progressPct).toBe(0); });
  it("after 12 payments the balance matches the schedule", () => { const s = schedule(T); const st = loanStatus(T, 12, "2027-12-01"); expect(st.outstandingMinor).toBe(s[11].balanceMinor); expect(st.paid).toBe(12); expect(st.next?.no).toBe(13); });
  it("counts missed instalments as overdue", () => { const st = loanStatus(T, 0, "2027-02-10"); expect(st.overdue).toBe(3); expect(st.overdueMinor).toBe(3 * computeEmi(T.principalMinor, 8.5, 240)); });
  it("a fully paid loan is closed with nothing outstanding", () => { const st = loanStatus({ principalMinor: 12_000_00, annualRatePct: 0, tenureMonths: 12, firstDue: "2026-01-01" }, 12, "2027-06-01"); expect(st.closed).toBe(true); expect(st.outstandingMinor).toBe(0); expect(st.next).toBeNull(); });
  it("interest paid + remaining = total interest", () => { const st = loanStatus(T, 50, "2031-01-01"); expect(st.interestPaidMinor + st.interestRemainingMinor).toBe(st.totalInterestMinor); });
});

describe("demo seed loans behave sensibly", () => {
  // principal ₹, rate %, months, EMI ₹ (null = calculated): the exact figures in supabase/seed/demo_loans.sql
  const seed: [string, number, number, number, number | null][] = [["Priya home", 660000, 8.5, 180, 6500], ["Priya personal", 150000, 12, 24, null], ["Arjun education", 400000, 8.15, 84, null], ["Arjun phone", 36000, 0, 12, null], ["Rohan business", 1287000, 11, 60, 28000], ["Rohan van", 600000, 9.5, 36, null]];
  for (const [name, P, R, N, E] of seed) it(`${name} finishes within a month of its tenure and ends at zero`, () => {
    const s = schedule({ principalMinor: P * 100, annualRatePct: R, tenureMonths: N, firstDue: "2026-01-05", emiMinor: E === null ? computeEmi(P * 100, R, N) : E * 100 });
    expect(s.length).toBeLessThanOrEqual(N); expect(s.length).toBeGreaterThanOrEqual(N - 3); expect(s[s.length - 1].balanceMinor).toBe(0);
  });
});
