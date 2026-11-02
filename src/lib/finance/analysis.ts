import { summarize, type Summary } from "./accounting";
import { inRange, localDate, type Range } from "./dates";
import { detectRecurring } from "./automation";
import { normalizeText } from "../imports/dedupe";
import { pctText, OVER } from "./pct";
import { trend, lastKeys } from "./trends";
import type { Tx } from "./types";

/**
 * The analytics engine. Pure and deterministic: every figure shown on the analytics pages, and every number the AI is allowed to
 * mention, comes from here. The AI only narrates this object; it never computes anything.
 */

const DAY = 864e5;
const rupee = (minor: number) => Math.round(minor / 100) * 100; // whole rupees read better than paise
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; };
export const pctChange = (cur: number, prev: number) => (prev === 0 ? null : Math.round(((cur - prev) * 100) / Math.abs(prev)));

/** Every calendar day (YYYY-MM-DD, in tz) in [start, end). */
export function daysOf(range: Range, tz: string): string[] {
  const out: string[] = []; const first = localDate(range.start, tz); const last = localDate(new Date(range.end.getTime() - 1), tz);
  const [y, m, d] = first.split("-").map(Number); let t = Date.UTC(y, m - 1, d);
  for (let i = 0; i < 800; i++) { const s = new Date(t).toISOString().slice(0, 10); out.push(s); if (s >= last) break; t += DAY; }
  return out;
}

export interface Kpi { key: string; label: string; value: number; prev: number; deltaPct: number | null; goodWhenUp: boolean | null; unit: "money" | "pct" | "count" }
export interface HealthPart { label: string; score: number; max: number; note: string }
export interface Mover { id: string; name: string; curMinor: number; prevMinor: number; deltaMinor: number; deltaPct: number | null }
export interface Anomaly { kind: "day" | "transaction"; when: string; minor: number; typicalMinor: number; label: string }
export interface Action { title: string; detail: string; impactMinor?: number }
export interface Analysis {
  period: { start: string; end: string; days: number; elapsedDays: number };
  current: Summary; previous: Summary;
  kpis: Kpi[];
  health: { score: number; label: "Excellent" | "Good" | "Fair" | "Needs attention"; parts: HealthPart[] };
  forecast: { projectedExpenseMinor: number; perDayMinor: number; previousMinor: number; vsPreviousPct: number | null; remainingDays: number; spentMinor: number } | null;
  cumulative: { label: string; current: number | null; previous: number | null }[]; // rupees
  weekday: { label: string; avgMinor: number }[]; peakWeekday: string | null; weekendSharePct: number | null;
  movers: { up: Mover[]; down: Mover[] };
  anomalies: Anomaly[];
  recurring: { items: { name: string; minor: number; frequency: string }[]; monthlyMinor: number };
  biggest: { label: string; minor: number; when: string } | null;
  topCategories: { id: string; name: string; minor: number; sharePct: number }[];
  wins: string[]; actions: Action[]; headline: string;
  txCount: number;
}

export interface AnalyzeInput { txs: Tx[]; range: Range; prev: Range; prevLike: Range; tz: string; now?: Date; catName: (id: string) => string; fmt: (minor: number) => string }

export function analyze({ txs, range, prev, prevLike, tz, now = new Date(), catName, fmt }: AnalyzeInput): Analysis {
  const cur = summarize(txs, range), old = summarize(txs, prevLike), oldFull = summarize(txs, prev);
  const days = daysOf(range, tz); const today = localDate(now, tz);
  const elapsed = days.filter((d) => d <= today); const elapsedDays = elapsed.length || days.length;
  const inCur = txs.filter((t) => inRange(t.occurredAt, range));
  const txCount = inCur.filter((t) => t.type === "income" || t.type === "expense" || t.type === "refund").length;
  const expCount = inCur.filter((t) => t.type === "expense").length;

  // daily net expense (refunds reduce it) for the current and previous period
  const dailyOf = (r: Range) => { const m = new Map<string, number>(); for (const t of txs) { if (!inRange(t.occurredAt, r)) continue; const k = localDate(t.occurredAt, tz); if (t.type === "expense") m.set(k, (m.get(k) ?? 0) + t.amountMinor); else if (t.type === "refund") m.set(k, (m.get(k) ?? 0) - t.amountMinor); } return m; };
  const dCur = dailyOf(range), dPrev = dailyOf(prev); const prevDays = daysOf(prev, tz);

  const avgDaily = rupee(cur.netExpenseMinor / Math.max(1, elapsedDays)); const avgDailyPrev = rupee(old.netExpenseMinor / Math.max(1, daysOf(prevLike, tz).length));
  const prevCount = txs.filter((t) => inRange(t.occurredAt, prevLike) && (t.type === "income" || t.type === "expense" || t.type === "refund")).length;
  const kpis: Kpi[] = [
    { key: "income", label: "Income", value: cur.incomeMinor, prev: old.incomeMinor, deltaPct: pctChange(cur.incomeMinor, old.incomeMinor), goodWhenUp: true, unit: "money" },
    { key: "expense", label: "Net expenses", value: cur.netExpenseMinor, prev: old.netExpenseMinor, deltaPct: pctChange(cur.netExpenseMinor, old.netExpenseMinor), goodWhenUp: false, unit: "money" },
    { key: "flow", label: "Net cash flow", value: cur.netCashFlowMinor, prev: old.netCashFlowMinor, deltaPct: pctChange(cur.netCashFlowMinor, old.netCashFlowMinor), goodWhenUp: true, unit: "money" },
    { key: "rate", label: "Savings rate", value: cur.savingsRatePct ?? 0, prev: old.savingsRatePct ?? 0, deltaPct: cur.savingsRatePct !== null && old.savingsRatePct !== null ? cur.savingsRatePct - old.savingsRatePct : null, goodWhenUp: true, unit: "pct" },
    { key: "daily", label: "Avg daily spend", value: avgDaily, prev: avgDailyPrev, deltaPct: pctChange(avgDaily, avgDailyPrev), goodWhenUp: false, unit: "money" },
    { key: "count", label: "Transactions", value: txCount, prev: prevCount, deltaPct: pctChange(txCount, prevCount), goodWhenUp: null, unit: "count" },
  ];

  // category figures
  const topTotal = Object.entries(cur.byCategory).filter(([, v]) => v > 0).reduce((a, [, v]) => a + v, 0);
  const topCategories = Object.entries(cur.byCategory).filter(([k, v]) => v > 0 && k !== "uncategorized").sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([id, v]) => ({ id, name: catName(id), minor: v, sharePct: topTotal ? Math.round((v * 100) / topTotal) : 0 }));
  const ids = new Set([...Object.keys(cur.byCategory), ...Object.keys(old.byCategory)]); ids.delete("uncategorized");
  const mv: Mover[] = [...ids].map((id) => { const c = cur.byCategory[id] ?? 0, p = old.byCategory[id] ?? 0; return { id, name: catName(id), curMinor: c, prevMinor: p, deltaMinor: c - p, deltaPct: pctChange(c, p) }; }).filter((m) => Math.abs(m.deltaMinor) >= 10000);
  const movers = { up: mv.filter((m) => m.deltaMinor > 0).sort((a, b) => b.deltaMinor - a.deltaMinor).slice(0, 3), down: mv.filter((m) => m.deltaMinor < 0).sort((a, b) => a.deltaMinor - b.deltaMinor).slice(0, 3) };

  // weekday pattern
  const dowSum = Array(7).fill(0) as number[], dowN = Array(7).fill(0) as number[];
  for (const d of elapsed) { const w = new Date(d + "T00:00:00Z").getUTCDay(); dowN[w]++; dowSum[w] += dCur.get(d) ?? 0; }
  const order = [1, 2, 3, 4, 5, 6, 0]; const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekday = order.map((w) => ({ label: names[w], avgMinor: dowN[w] ? rupee(dowSum[w] / dowN[w]) : 0 }));
  const hasWeekday = elapsed.length >= 7 && weekday.some((w) => w.avgMinor > 0);
  const peak = hasWeekday ? weekday.reduce((a, b) => (b.avgMinor > a.avgMinor ? b : a)) : null;
  const totalSpend = dowSum.reduce((a, b) => a + b, 0); const weekendSharePct = hasWeekday && totalSpend > 0 ? Math.round(((dowSum[0] + dowSum[6]) * 100) / totalSpend) : null;

  // cumulative spend: this period vs previous, by day number
  const cumulative: Analysis["cumulative"] = [];
  if (days.length >= 2) { let c = 0, p = 0; const n = Math.max(days.length, prevDays.length);
    for (let i = 0; i < n; i++) { if (i < days.length && days[i] <= today) c += dCur.get(days[i]) ?? 0; if (i < prevDays.length) p += dPrev.get(prevDays[i]) ?? 0;
      cumulative.push({ label: String(i + 1), current: i < days.length && days[i] <= today ? c / 100 : null, previous: i < prevDays.length ? p / 100 : null }); } }

  // forecast (only while the period is still running)
  const running = now >= range.start && now < range.end; const remaining = days.filter((d) => d > today).length;
  const forecast = running && days.length >= 7 && elapsedDays >= 3 && remaining > 0 && cur.netExpenseMinor > 0 ? (() => {
    const perDay = cur.netExpenseMinor / elapsedDays; const projected = Math.round(perDay * days.length);
    return { projectedExpenseMinor: rupee(projected), perDayMinor: rupee(perDay), previousMinor: oldFull.netExpenseMinor, vsPreviousPct: pctChange(projected, oldFull.netExpenseMinor), remainingDays: remaining, spentMinor: cur.netExpenseMinor }; })() : null;

  // anomalies: spike days (ignoring repeating bills such as rent and salaries) and unusually large single expenses
  const anomalies: Anomaly[] = [];
  const expAll = txs.filter((t) => t.type === "expense"); const recAll = detectRecurring(expAll, [], now);
  const recKeys = new Set(recAll.map((r) => normalizeText(r.name))); const isBill = (t: Tx) => recKeys.has(normalizeText(t.merchant || t.description || ""));
  const dNR = new Map<string, number>(); for (const t of inCur) { if (t.type === "expense" && !isBill(t)) { const k = localDate(t.occurredAt, tz); dNR.set(k, (dNR.get(k) ?? 0) + t.amountMinor); } }
  const nonZero = elapsed.map((d) => dNR.get(d) ?? 0).filter((v) => v > 0);
  if (elapsed.length >= 7 && nonZero.length >= 4) { const m = median(nonZero);
    for (const d of elapsed) { const v = dNR.get(d) ?? 0; if (v >= Math.max(3 * m, 50000)) anomalies.push({ kind: "day", when: d, minor: v, typicalMinor: rupee(m), label: "Big spending day" }); } }
  const exp = expAll; const byCat = new Map<string, number[]>(); exp.forEach((t) => { const k = t.categoryId ?? "none"; byCat.set(k, [...(byCat.get(k) ?? []), t.amountMinor]); });
  for (const t of inCur) { if (t.type !== "expense" || isBill(t)) continue; const h = byCat.get(t.categoryId ?? "none") ?? []; if (h.length < 4 || t.amountMinor < 50000) continue; const m = median(h);
    if (t.amountMinor >= 3 * m) anomalies.push({ kind: "transaction", when: localDate(t.occurredAt, tz), minor: t.amountMinor, typicalMinor: rupee(m), label: `${t.categoryId ? catName(t.categoryId) : "Uncategorised"}${t.merchant ? ` · ${t.merchant}` : ""}` }); }
  anomalies.sort((a, b) => b.minor - a.minor); const anomaliesTop = anomalies.slice(0, 5);

  // recurring burden
  const rec = recAll; const perMonth = { weekly: 52 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 } as const;
  const recurring = { items: rec.slice(0, 5).map((r) => ({ name: r.name, minor: r.amountMinor, frequency: r.frequency })), monthlyMinor: rupee(rec.reduce((a, r) => a + r.amountMinor * perMonth[r.frequency], 0)) };

  // biggest expense
  const big = inCur.filter((t) => t.type === "expense").sort((a, b) => b.amountMinor - a.amountMinor)[0];
  const biggest = big ? { label: big.merchant || big.description || (big.categoryId ? catName(big.categoryId) : "Expense"), minor: big.amountMinor, when: localDate(big.occurredAt, tz) } : null;

  // health score (0-100), fully transparent
  const parts: HealthPart[] = [];
  const rate = cur.savingsRatePct;
  parts.push({ label: "Savings rate", max: 35, score: rate === null ? 0 : Math.round((clamp(rate, 0, 30) / 30) * 35), note: rate === null ? "No income in this period" : `${rate < 0 ? "Spending is above income" : `${pctText(rate)} of income saved`} (30%+ earns full marks)` });
  const dExp = pctChange(cur.netExpenseMinor, old.netExpenseMinor);
  parts.push({ label: "Spending trend", max: 20, score: dExp === null ? 10 : dExp <= 0 ? 20 : Math.round(20 * (1 - clamp(dExp, 0, 50) / 50)), note: dExp === null ? "No earlier period to compare" : `${pctText(dExp, true)} vs the previous period` });
  const keys = lastKeys(now, "monthly", 6, tz); const months = trend(txs, "monthly", tz, keys).filter((b) => b.incomeMinor > 0 || b.expenseMinor > 0);
  const posM = months.filter((b) => b.netMinor > 0).length;
  parts.push({ label: "Cash-flow consistency", max: 20, score: months.length < 2 ? 10 : Math.round((posM / months.length) * 20), note: months.length < 2 ? "Needs at least 2 months of history" : `${posM} of the last ${months.length} months ended positive` });
  const topShare = topCategories[0]?.sharePct ?? 0;
  parts.push({ label: "Spending balance", max: 15, score: !topCategories.length ? 8 : Math.round(15 * (1 - clamp(topShare - 40, 0, 40) / 40)), note: !topCategories.length ? "No categorised spending" : `Top category is ${topShare}% of spending (under 40% is balanced)` });
  const daily = elapsed.map((d) => dCur.get(d) ?? 0); const mean = daily.reduce((a, b) => a + b, 0) / Math.max(1, daily.length);
  const cv = mean > 0 ? Math.sqrt(daily.reduce((a, b) => a + (b - mean) ** 2, 0) / daily.length) / mean : 0;
  parts.push({ label: "Spending steadiness", max: 10, score: elapsed.length < 7 || mean <= 0 ? 5 : Math.round(10 * (1 - clamp(cv - 1, 0, 2) / 2)), note: elapsed.length < 7 || mean <= 0 ? "Needs at least a week of data" : cv <= 1 ? "Daily spending is fairly even" : "Spending comes in big, uneven lumps" });
  const score = clamp(parts.reduce((a, p) => a + p.score, 0), 0, 100);
  const label = score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : "Needs attention";

  // wins and actions
  const wins: string[] = [];
  if (dExp !== null && dExp <= -5) wins.push(`Spending is ${pctText(Math.abs(dExp))} lower than the previous period.`);
  if (rate !== null && rate >= 20) wins.push(`You saved ${pctText(rate)} of your income.`);
  const dInc = pctChange(cur.incomeMinor, old.incomeMinor); if (dInc !== null && dInc >= 5) wins.push(dInc > OVER ? "Income is more than double the previous period." : `Income is up ${pctText(dInc)} on the previous period.`);
  if (!anomaliesTop.length && txCount >= 10) wins.push("No unusual spikes in this period.");
  if (months.length >= 3 && posM === months.length) wins.push(`Cash flow was positive in each of the last ${months.length} months.`);

  const actions: Action[] = [];
  if (cur.incomeMinor > 0 && rate !== null && rate < 20) { const need = Math.max(0, rupee(Math.ceil(cur.incomeMinor * 0.2) - cur.netCashFlowMinor));
    if (need > 0) actions.push({ title: "Reach a 20% savings rate", detail: `Moving ${fmt(need)} from spending to savings would get you to 20% of income (a common rule of thumb, not advice).`, impactMinor: need }); }
  if (movers.up[0]) { const m = movers.up[0]; actions.push({ title: `Put a budget on ${m.name}`, detail: `${m.name} is up ${fmt(m.deltaMinor)}${m.deltaPct !== null ? ` (${pctText(m.deltaPct)})` : ""} versus the previous period.`, impactMinor: m.deltaMinor }); }
  if (forecast && forecast.vsPreviousPct !== null && forecast.vsPreviousPct >= 10 && forecast.previousMinor > 0) { const cut = Math.max(100, rupee((forecast.projectedExpenseMinor - forecast.previousMinor) / forecast.remainingDays));
    actions.push({ title: "Slow your daily pace", detail: `At the current pace you will spend about ${fmt(forecast.projectedExpenseMinor)} (an estimate), ${forecast.vsPreviousPct > OVER ? "more than double" : `${pctText(forecast.vsPreviousPct)} more`} than last period. Spending ${fmt(cut)} less per remaining day keeps you level.`, impactMinor: forecast.projectedExpenseMinor - forecast.previousMinor }); }
  if (weekendSharePct !== null && weekendSharePct >= 45) actions.push({ title: "Plan your weekends", detail: `${weekendSharePct}% of your spending lands on Saturday and Sunday. A weekend limit could help.` });
  if (recurring.items.length >= 2) actions.push({ title: "Review recurring payments", detail: `${rec.length} repeating payments add up to about ${fmt(recurring.monthlyMinor)} a month. Cancel any you no longer use.`, impactMinor: recurring.monthlyMinor });

  const headline = (() => {
    if (!txCount) return "No transactions in this period yet.";
    const bits: string[] = [];
    if (dExp !== null && Math.abs(dExp) >= 5) bits.push(dExp > OVER ? "spending is more than double the previous period" : `spending is ${pctText(Math.abs(dExp))} ${dExp > 0 ? "higher" : "lower"} than the previous period`); else bits.push("spending is steady versus the previous period");
    const calm = dExp === null || dExp <= 0; // "lower" or "steady" spending is good news, so a negative savings rate reads as a contrast
    if (rate !== null) bits.push(rate >= 0 ? `you saved ${pctText(rate)} of income` : `${calm ? "but " : ""}spending ${rate < -OVER ? "was more than double your income" : `still exceeded income by ${pctText(Math.abs(rate))}`}`);
    const s = bits.join(rate !== null && rate < 0 && calm ? ", " : " and "); return s.charAt(0).toUpperCase() + s.slice(1) + ".";
  })();
  void expCount;

  return {
    period: { start: days[0] ?? today, end: days[days.length - 1] ?? today, days: days.length, elapsedDays }, current: cur, previous: old, kpis, health: { score, label, parts }, forecast, cumulative,
    weekday: hasWeekday ? weekday : [], peakWeekday: peak?.label ?? null, weekendSharePct, movers, anomalies: anomaliesTop, recurring, biggest, topCategories, wins, actions, headline, txCount,
  };
}
