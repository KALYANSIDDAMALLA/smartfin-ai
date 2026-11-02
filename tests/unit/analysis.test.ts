import { describe, expect, it } from "vitest";
import { analyze, daysOf, pctChange } from "@/lib/finance/analysis";
import { allowedFrom, groundText, isGrounded, rupeeMentions } from "@/lib/finance/ground";
import { customRange, previousRange, likeForLike } from "@/lib/finance/dates";
import type { Tx } from "@/lib/finance/types";

const TZ = "Asia/Kolkata"; let n = 0;
const tx = (type: Tx["type"], ymd: string, rupees: number, extra: Partial<Tx> = {}): Tx => ({ id: `t${++n}`, type, amountMinor: rupees * 100, occurredAt: `${ymd}T06:30:00.000Z`, ...extra });
const fmt = (m: number) => `₹${Math.round(m / 100).toLocaleString("en-IN")}`;
const run = (txs: Tx[], from: string, to: string, now: string) => { const range = customRange(from, to, TZ); const prev = previousRange(range, "custom", TZ); const nowD = new Date(`${now}T10:00:00Z`);
  return analyze({ txs, range, prev, prevLike: likeForLike(range, prev, nowD), tz: TZ, now: nowD, catName: (id) => id.toUpperCase(), fmt }); };

describe("daysOf / pctChange", () => {
  it("lists each day once", () => expect(daysOf(customRange("2026-11-01", "2026-11-05", TZ), TZ)).toEqual(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"]));
  it("percent change rounds and guards zero", () => { expect(pctChange(150, 100)).toBe(50); expect(pctChange(5, 0)).toBeNull(); });
});

describe("analyze", () => {
  const base: Tx[] = [
    ...Array.from({ length: 15 }, (_, i) => tx("expense", `2026-11-${String(i + 1).padStart(2, "0")}`, 400, { categoryId: "food" })),
    tx("income", "2026-11-01", 20000), tx("expense", "2026-11-03", 3000, { categoryId: "rent" }),
    ...Array.from({ length: 15 }, (_, i) => tx("expense", `2026-10-${String(i + 1).padStart(2, "0")}`, 200, { categoryId: "food" })),
    tx("income", "2026-10-01", 20000),
  ];
  const a = run(base, "2026-11-01", "2026-11-30", "2026-11-15");

  it("computes headline numbers", () => { expect(a.current.incomeMinor).toBe(2_000_000); expect(a.current.netExpenseMinor).toBe((15 * 400 + 3000) * 100); expect(a.period.elapsedDays).toBe(15); expect(a.period.days).toBe(30); });
  it("projects the period total from the daily pace (an estimate)", () => { expect(a.forecast).not.toBeNull(); expect(a.forecast!.projectedExpenseMinor).toBe(Math.round(((15 * 400 + 3000) * 100 / 15) * 30)); expect(a.forecast!.remainingDays).toBe(15); });
  // The previous 30-day window is 2–31 Oct, so 14 of the 15 October food days fall in it.
  it("flags the rising category as a mover", () => { expect(a.movers.up[0].id).toBe("food"); expect(a.movers.up[0].deltaMinor).toBe((15 * 400 - 14 * 200) * 100); });
  it("health parts add up to the score and stay within their maximums", () => { expect(a.health.parts.reduce((s, p) => s + p.score, 0)).toBe(a.health.score); a.health.parts.forEach((p) => { expect(p.score).toBeLessThanOrEqual(p.max); expect(p.score).toBeGreaterThanOrEqual(0); }); expect(a.health.score).toBeLessThanOrEqual(100); });
  it("detects a single huge expense as an anomaly", () => { const b = run([...base, tx("expense", "2026-11-10", 9000, { categoryId: "food", merchant: "Big Mart" })], "2026-11-01", "2026-11-30", "2026-11-15"); expect(b.anomalies.some((x) => x.kind === "transaction" && x.minor === 900000)).toBe(true); });
  it("has no forecast once the period is over", () => expect(run(base, "2026-11-01", "2026-11-30", "2026-12-05").forecast).toBeNull());
  it("builds a cumulative series that never decreases", () => { let last = 0; for (const p of a.cumulative) { if (p.current !== null) { expect(p.current).toBeGreaterThanOrEqual(last); last = p.current; } } });
  it("gives actions with a verified impact", () => { expect(a.actions.length).toBeGreaterThan(0); a.actions.forEach((x) => { if (x.impactMinor !== undefined) expect(x.impactMinor).toBeGreaterThan(0); }); });
  it("handles an empty period", () => { const e = run([], "2026-11-01", "2026-11-30", "2026-11-15"); expect(e.txCount).toBe(0); expect(e.headline).toMatch(/No transactions/); expect(e.forecast).toBeNull(); });
});

describe("repeating bills are not spikes", () => {
  const rent = ["2026-08-01", "2026-09-01", "2026-10-01", "2026-11-01"].map((d) => tx("expense", d, 20000, { merchant: "Landlord", categoryId: "rent" }));
  const daily = Array.from({ length: 14 }, (_, i) => tx("expense", `2026-11-${String(i + 1).padStart(2, "0")}`, 300, { categoryId: "food" }));
  it("does not flag the rent day as a spending spike", () => { const a = run([...rent, ...daily], "2026-11-01", "2026-11-30", "2026-11-14"); expect(a.anomalies.filter((x) => x.kind === "day")).toEqual([]); expect(a.anomalies.some((x) => x.minor === 2_000_000)).toBe(false); });
  it("still flags a genuine one-off spike", () => { const a = run([...rent, ...daily, tx("expense", "2026-11-09", 15000, { merchant: "Gadget Store", categoryId: "shop" })], "2026-11-01", "2026-11-30", "2026-11-14"); expect(a.anomalies.some((x) => x.when === "2026-11-09")).toBe(true); });
});

describe("grounding AI text", () => {
  const ok = allowedFrom({ income: 2_000_000, expense: 900_000, deltaPct: 23, rate: 55 });
  it("parses rupee amounts incl. lakh / k", () => { expect(rupeeMentions("Spent ₹9,000 and Rs. 1.5 lakh and ₹2k")).toEqual([9000, 150000, 2000]); });
  it("accepts numbers the engine produced", () => { expect(isGrounded("Spending is 23% higher and you earned ₹20,000.", ok)).toBe(true); });
  it("rejects invented amounts and percentages", () => { expect(isGrounded("You overspent by ₹12,345.", ok)).toBe(false); expect(isGrounded("Spending rose 47%.", ok)).toBe(false); });
  it("keeps only grounded sentences", () => { expect(groundText("Income was ₹20,000. You wasted ₹777 on snacks. Keep going!", ok)).toBe("Income was ₹20,000. Keep going!"); });
  it("returns empty when nothing is grounded", () => expect(groundText("You lost ₹5,555.", ok)).toBe(""));
});

import { fallbackInsight, groundInsight, type Insight } from "@/lib/server/insights";
describe("groundInsight", () => {
  const a = run([tx("income", "2026-11-01", 20000), ...Array.from({ length: 10 }, (_, i) => tx("expense", `2026-11-${String(i + 1).padStart(2, "0")}`, 500, { categoryId: "food" }))], "2026-11-01", "2026-11-30", "2026-11-12");
  const fb = fallbackInsight(a, fmt);
  const ai: Insight = { headline: "You spent ₹99,999 — wow!", summary: "A solid month.", highlights: ["Income was ₹20,000.", "You overspent by ₹4,321."], wins: [], recommendations: [], review: [], forecast: "", actions: [{ title: "Save more", detail: "Save ₹77,777 now." }] };
  const g = groundInsight(ai, fb, { income: 2_000_000 });
  it("replaces an invented headline with the verified one", () => expect(g.headline).toBe(fb.headline));
  it("keeps clean sentences and drops invented ones", () => { expect(g.summary).toBe("A solid month."); expect(g.highlights).toEqual(["Income was ₹20,000."]); });
  it("falls back for fields where nothing is grounded", () => { expect(g.actions).toEqual(fb.actions); expect(g.recommendations).toEqual(fb.recommendations); });
});

describe("plain-language narrative", () => {
  const big = run([tx("income", "2026-11-01", 20000), ...Array.from({ length: 12 }, (_, i) => tx("expense", `2026-11-${String(i + 1).padStart(2, "0")}`, 300, { categoryId: "food" })), tx("expense", "2026-11-09", 15000, { merchant: "Gadget Store", categoryId: "shop" })], "2026-11-01", "2026-11-30", "2026-11-14");
  const text = (() => { const i = fallbackInsight(big, fmt); return [i.headline, i.summary, ...i.highlights, ...i.review, i.forecast].join(" "); })();
  it("never shows raw ISO dates or internal labels", () => { expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/); expect(text).not.toMatch(/excluding repeating bills|Spending spike/); });
  it("uses friendly dates and full weekday names", () => { expect(text).toMatch(/\d{1,2} Nov 2026/); expect(text).not.toMatch(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun) is your costliest/); });
  it("explains unusual items in everyday terms", () => expect(text).toMatch(/times|well above/));
});

import { higherBy, pctText } from "@/lib/finance/pct";
describe("percentages are capped at 100", () => {
  it("formats small values normally and big ones as 100%+", () => { expect(pctText(45)).toBe("45%"); expect(pctText(100)).toBe("100%"); expect(pctText(1197)).toBe("100%+"); expect(pctText(1197, true)).toBe("+100%+"); expect(pctText(-30, true)).toBe("−30%"); expect(pctText(-173)).toBe("−100%+"); });
  it("uses everyday wording in sentences", () => { expect(higherBy(23)).toBe("23% higher"); expect(higherBy(1197)).toBe("more than double"); });
  it("never shows a figure over 100% in the headline", () => {
    const a = run([tx("income", "2026-11-01", 1000), tx("expense", "2026-11-02", 13000, { categoryId: "x" }), tx("expense", "2026-10-02", 1000, { categoryId: "x" })], "2026-11-01", "2026-11-30", "2026-11-10");
    expect(a.headline).not.toMatch(/\d{4}%|\b(1\d\d|[2-9]\d\d)%/); expect(a.headline).toMatch(/more than double/);
  });
  it("rejects AI sentences that quote a percentage above 100", () => { const ok = allowedFrom({ d: 1197 }); expect(isGrounded("Spending rose 1197%.", ok)).toBe(false); });
});
