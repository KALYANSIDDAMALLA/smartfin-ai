import type { Tx } from "./types";
import { localDate } from "./dates";

const pad = (n: number) => String(n).padStart(2, "0");
const ymdOf = (d: Date) => d.toISOString().slice(0, 10);
const utc = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };

export const isYm = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
export const isYmd = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(+utc(v));

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
export function monthName(ym: string): string {
  const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { timeZone: "UTC", month: "long", year: "numeric" });
}

/** Monday-first weeks covering the month; days outside the month are flagged. */
export function monthGrid(ym: string): { ymd: string; inMonth: boolean }[][] {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)); const lead = (first.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(y, m - 1, 1 - lead));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate(); const weeks = Math.ceil((lead + days) / 7);
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => {
    const dt = new Date(start.getTime() + (w * 7 + d) * 86_400_000); return { ymd: ymdOf(dt), inMonth: dt.getUTCMonth() === m - 1 };
  }));
}

function addMonthsClamped(ymd: string, months: number, anchorDay: number): string {
  const b = utc(ymd); const y = b.getUTCFullYear(), m = b.getUTCMonth() + months;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return ymdOf(new Date(Date.UTC(y, m, Math.min(anchorDay, last))));
}

/** Due dates of a recurring rule inside [from, to] (inclusive), starting at its next due date. */
export function occurrences(rule: { nextDue: string; frequency: string }, from: string, to: string): string[] {
  const out: string[] = []; const anchor = utc(rule.nextDue).getUTCDate(); let cur = rule.nextDue;
  for (let n = 1; cur <= to && n < 800; n++) {
    if (cur >= from) out.push(cur);
    switch (rule.frequency) {
      case "daily": cur = ymdOf(new Date(utc(cur).getTime() + 86_400_000)); break;
      case "weekly": cur = ymdOf(new Date(utc(cur).getTime() + 7 * 86_400_000)); break;
      case "quarterly": cur = addMonthsClamped(rule.nextDue, 3 * n, anchor); break;
      case "yearly": cur = addMonthsClamped(rule.nextDue, 12 * n, anchor); break;
      default: cur = addMonthsClamped(rule.nextDue, n, anchor);
    }
  }
  return out;
}

export interface DayTotal { incomeMinor: number; expenseMinor: number; count: number }
/** Per local calendar day: income, net expense (refunds reduce it); transfers/adjustments are ignored like everywhere else. */
export function dayTotals(txs: Tx[], tz: string): Record<string, DayTotal> {
  const out: Record<string, DayTotal> = {};
  for (const t of txs) {
    if (t.type !== "income" && t.type !== "expense" && t.type !== "refund") continue;
    const k = localDate(t.occurredAt, tz); const d = (out[k] ??= { incomeMinor: 0, expenseMinor: 0, count: 0 });
    d.count++; if (t.type === "income") d.incomeMinor += t.amountMinor; else if (t.type === "expense") d.expenseMinor += t.amountMinor; else d.expenseMinor -= t.amountMinor;
  }
  return out;
}
