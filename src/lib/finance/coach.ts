import type { Tx } from "./types";

/**
 * The AI coach's maths: where money goes in a typical month, which categories could realistically be trimmed, and what a trim is worth.
 * Pure and deterministic. The AI only writes the plan around these figures; it never calculates them.
 */
const DAY = 864e5;
const rupee = (minor: number) => Math.round(minor / 100) * 100;
/** Essential costs people cannot easily cut: rent, loans, salaries, tax, insurance, utilities, fees, and a business's stock. Everything else is treated as flexible. */
const FIXED = /inventory|stock|raw material|cogs|goods|rent|loan|emi|mortgage|tax|gst|insurance|utilit|electric|water|salar|staff|wage|payroll|interest|school|tuition|fee|medical|health|maintenance|transfer/i;
export const isFlexible = (name: string) => !FIXED.test(name);

export interface Opportunity { id: string; name: string; monthlyMinor: number; prevMonthlyMinor: number; trendPct: number | null; flexible: boolean; suggestedCutPct: number; savesMonthlyMinor: number; savesYearlyMinor: number }
export interface CoachBase {
  incomeMonthlyMinor: number; expenseMonthlyMinor: number; savingsMonthlyMinor: number; savingsRatePct: number | null; fixedMonthlyMinor: number; flexibleMonthlyMinor: number;
  opportunities: Opportunity[]; suggestedSavesMonthlyMinor: number; suggestedSavesYearlyMinor: number; txCount: number;
}

/** A typical month from the last 90 days (3 months), compared with the 90 days before for the trend. Transfers and adjustments are ignored. */
export function coachBase(txs: Tx[], categories: { id: string; name: string }[], now = new Date()): CoachBase {
  const t1 = +now, t0 = t1 - 90 * DAY, tp = t0 - 90 * DAY; const cur = new Map<string, number>(), prev = new Map<string, number>(); let income = 0, n = 0;
  for (const t of txs) {
    const at = +new Date(t.occurredAt); if (at >= t1 || at < tp) continue; const recent = at >= t0;
    if (t.type === "income") { if (recent) { income += t.amountMinor; n++; } continue; }
    if (t.type !== "expense" && t.type !== "refund") continue; const k = t.categoryId ?? "none"; const v = t.type === "expense" ? t.amountMinor : -t.amountMinor;
    (recent ? cur : prev).set(k, ((recent ? cur : prev).get(k) ?? 0) + v); if (recent) n++;
  }
  const name = (id: string) => (id === "none" ? "Uncategorised" : categories.find((c) => c.id === id)?.name ?? "Category");
  // Whole rupees read better than paise.
  const monthly = (v: number) => rupee(v / 3); let fixed = 0, flex = 0; const rows: Opportunity[] = [];
  for (const [id, v] of cur) {
    if (v <= 0) continue; const nm = name(id), m = monthly(v), p = monthly(prev.get(id) ?? 0), flexible = isFlexible(nm) && id !== "none";
    if (!flexible) fixed += m; else flex += m;
    const trend = p > 0 ? Math.round(((m - p) * 100) / p) : null;
    const cut = !flexible || m < 50_000 ? 0 : trend !== null && trend >= 20 ? 20 : 10; const saves = rupee((m * cut) / 100);
    rows.push({ id, name: nm, monthlyMinor: m, prevMonthlyMinor: p, trendPct: trend, flexible, suggestedCutPct: cut, savesMonthlyMinor: saves, savesYearlyMinor: saves * 12 });
  }
  const opportunities = rows.filter((r) => r.flexible && r.monthlyMinor >= 50_000).sort((a, b) => b.monthlyMinor - a.monthlyMinor).slice(0, 8);
  const expense = fixed + flex, inc = rupee(income / 3), save = inc - expense; const sug = opportunities.reduce((a, r) => a + r.savesMonthlyMinor, 0);
  return { incomeMonthlyMinor: inc, expenseMonthlyMinor: expense, savingsMonthlyMinor: save, savingsRatePct: inc > 0 ? Math.floor((save * 100) / inc) : null, fixedMonthlyMinor: fixed, flexibleMonthlyMinor: flex,
    opportunities, suggestedSavesMonthlyMinor: sug, suggestedSavesYearlyMinor: sug * 12, txCount: n };
}

export interface GoalLite { name: string; remainingMinor: number }
export interface WhatIf { extraMonthlyMinor: number; extraYearlyMinor: number; newSavingsMonthlyMinor: number; newRatePct: number | null; goal: { name: string; monthsNow: number | null; monthsNew: number | null; monthsSooner: number | null } | null }

/** What the chosen cuts (category id → percent, 0–100) are worth, and how much sooner they would finish a goal. */
export function whatIf(base: CoachBase, cuts: Record<string, number>, goal?: GoalLite | null): WhatIf {
  const extra = rupee(base.opportunities.reduce((a, o) => a + (o.monthlyMinor * Math.min(100, Math.max(0, cuts[o.id] ?? 0))) / 100, 0));
  const ns = base.savingsMonthlyMinor + extra; const months = (s: number) => (goal && goal.remainingMinor > 0 && s > 0 ? Math.ceil(goal.remainingMinor / s) : null);
  const now = months(base.savingsMonthlyMinor), nw = months(ns);
  return { extraMonthlyMinor: extra, extraYearlyMinor: extra * 12, newSavingsMonthlyMinor: ns, newRatePct: base.incomeMonthlyMinor > 0 ? Math.floor((ns * 100) / base.incomeMonthlyMinor) : null,
    goal: goal && goal.remainingMinor > 0 ? { name: goal.name, monthsNow: now, monthsNew: nw, monthsSooner: now !== null && nw !== null ? now - nw : null } : null };
}
