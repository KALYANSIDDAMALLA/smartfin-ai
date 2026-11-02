import { normalizeText } from "../imports/dedupe";
import type { Tx } from "./types";
import { sum } from "./money";
import { pctText, higherBy, OVER } from "./pct";

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
const DAY = 864e5;

export interface DetectedRecurring { name: string; type: "expense" | "income"; amountMinor: number; frequency: "weekly" | "monthly" | "quarterly" | "yearly"; nextDue: string; count: number; categoryId?: string | null; paymentMethod?: string | null }

/** Finds payments that repeat at a regular interval with a steady amount (subscriptions, rent, EMIs, salary). Needs >= 3 occurrences. */
export function detectRecurring(txs: Tx[], existingNames: string[] = [], now = new Date()): DetectedRecurring[] {
  const known = existingNames.map((n) => normalizeText(n)); const groups = new Map<string, Tx[]>();
  for (const t of txs) { if (t.type !== "expense" && t.type !== "income") continue; const k = `${t.type}|${normalizeText(t.merchant || t.description)}`; if (k.endsWith("|")) continue; groups.set(k, [...(groups.get(k) ?? []), t]); }
  const out: DetectedRecurring[] = [];
  for (const [k, g] of groups) {
    if (g.length < 3) continue; const sorted = [...g].sort((a, b) => +new Date(a.occurredAt) - +new Date(b.occurredAt));
    const gaps = sorted.slice(1).map((t, i) => (+new Date(t.occurredAt) - +new Date(sorted[i].occurredAt)) / DAY); const md = median(gaps);
    const freq = md >= 6 && md <= 8 ? ["weekly", 7] : md >= 27 && md <= 34 ? ["monthly", 30.4] : md >= 85 && md <= 97 ? ["quarterly", 91] : md >= 350 && md <= 380 ? ["yearly", 365] : null; if (!freq) continue;
    const regular = gaps.filter((x) => Math.abs(x - md) <= md * 0.2).length / gaps.length; if (regular < 0.75) continue;
    const amts = sorted.map((t) => t.amountMinor); const ma = median(amts); if (ma <= 0 || amts.filter((a) => Math.abs(a - ma) <= ma * 0.15).length / amts.length < 0.75) continue;
    const last = sorted[sorted.length - 1]; const display = last.merchant || last.description || ""; const nm = normalizeText(display);
    if (known.some((x) => x && (x === nm || x.includes(nm) || nm.includes(x)))) continue;
    const next = new Date(+new Date(last.occurredAt) + (freq[1] as number) * DAY); while (+next < +now - DAY) next.setTime(+next + (freq[1] as number) * DAY);
    out.push({ name: display, type: last.type as "expense" | "income", amountMinor: Math.round(ma), frequency: freq[0] as DetectedRecurring["frequency"], nextDue: next.toISOString().slice(0, 10), count: g.length, categoryId: last.categoryId, paymentMethod: last.paymentMethod });
    void k;
  }
  return out.sort((a, b) => b.amountMinor - a.amountMinor);
}

export interface BudgetSuggestion { categoryId: string; name: string; amountMinor: number; avgMinor: number }
/** Monthly budget per top spending category = last-90-day monthly average + 5%, rounded up to the nearest ₹500 (≥ ₹500). Skips categories that already have a budget. */
export function suggestBudgets(txs: Tx[], categories: { id: string; name: string }[], existingCategoryIds: string[], now = new Date(), top = 6): BudgetSuggestion[] {
  const start = +now - 90 * DAY; const by = new Map<string, number>();
  for (const t of txs) { if (!t.categoryId || +new Date(t.occurredAt) < start || +new Date(t.occurredAt) > +now) continue; if (t.type === "expense") by.set(t.categoryId, (by.get(t.categoryId) ?? 0) + t.amountMinor); else if (t.type === "refund") by.set(t.categoryId, (by.get(t.categoryId) ?? 0) - t.amountMinor); }
  return [...by.entries()].filter(([id, v]) => v > 0 && !existingCategoryIds.includes(id)).sort((a, b) => b[1] - a[1]).slice(0, top).map(([id, v]) => {
    const avg = Math.round(v / 3); const amt = Math.max(50000, Math.ceil((avg * 1.05) / 50000) * 50000); return { categoryId: id, name: categories.find((c) => c.id === id)?.name ?? "Category", amountMinor: amt, avgMinor: avg };
  });
}

/** Is this new expense unusually large for its category? (>= 3x the category median over >= 3 earlier entries, and >= ₹500). A prompt to review — never "fraud". */
export function isUnusual(amountMinor: number, history: number[]): { unusual: boolean; typicalMinor: number } {
  if (history.length < 3 || amountMinor < 50000) return { unusual: false, typicalMinor: 0 }; const m = median(history); return { unusual: amountMinor >= 3 * m, typicalMinor: Math.round(m) };
}

export interface QuickInsight { tone: "good" | "warn" | "info"; text: string; tag?: string }
/** Instant, deterministic highlights for the dashboard (no AI needed). All numbers come straight from the summaries. */
export function quickInsights(cur: { incomeMinor: number; netExpenseMinor: number; savingsRatePct: number | null; byCategory: Record<string, number> }, prev: { netExpenseMinor: number; byCategory: Record<string, number> }, catName: (id: string) => string, fmt: (m: number) => string): QuickInsight[] {
  const out: QuickInsight[] = []; const top = Object.entries(cur.byCategory).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])[0];
  if (top && cur.netExpenseMinor > 0) out.push({ tone: "info", text: `${catName(top[0])} is your biggest spend: ${fmt(top[1])} (${Math.round((top[1] * 100) / cur.netExpenseMinor)}% of spending).` });
  if (prev.netExpenseMinor > 0 && cur.netExpenseMinor > 0) { const d = Math.round(((cur.netExpenseMinor - prev.netExpenseMinor) * 100) / prev.netExpenseMinor); if (Math.abs(d) >= 5) out.push({ tone: d > 0 ? "warn" : "good", text: `Spending is ${d > 0 ? higherBy(d) : `${pctText(Math.abs(d))} lower`} than the previous period.` }); }
  const rise = Object.entries(cur.byCategory).map(([id, v]) => [id, v - (prev.byCategory[id] ?? 0), prev.byCategory[id] ?? 0] as const).filter(([, dv, pv]) => dv > 0 && pv > 0 && dv / pv >= 0.25).sort((a, b) => b[1] - a[1])[0];
  if (rise) out.push({ tone: "warn", text: `${catName(rise[0])} rose ${pctText(Math.round((rise[1] * 100) / rise[2]))} versus the previous period — consider a budget for it.` });
  if (cur.savingsRatePct !== null && cur.savingsRatePct < 0) out.push({ tone: "warn", text: cur.savingsRatePct < -OVER ? "You spent more than double what you earned in this period." : `You spent ${pctText(Math.abs(cur.savingsRatePct))} more than you earned in this period.` });
  else if (cur.savingsRatePct !== null) out.push(cur.savingsRatePct >= 20 ? { tone: "good", text: `Savings rate is ${pctText(cur.savingsRatePct)} — at or above the common 20% rule of thumb.` } : { tone: "warn", text: `Savings rate is ${pctText(cur.savingsRatePct)}. Many aim for 20%+ (a rule of thumb, not advice).` });
  void sum; return out.slice(0, 4);
}
