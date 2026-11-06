import type { Minor } from "./money";

/** Days in the month of a local YYYY-MM-DD date. */
export const daysInMonthOf = (ymd: string) => { const [y, m] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

/** Monthly income ÷ days in the month, rounded down to a whole rupee (₹1,00,000 ÷ 30 → ₹3,333). */
export const dailyAllowance = (monthlyIncomeMinor: Minor, days: number): Minor =>
  days > 0 && monthlyIncomeMinor > 0 ? Math.floor(monthlyIncomeMinor / days / 100) * 100 : 0;

export interface DayStatus {
  allowanceMinor: Minor; spentMinor: Minor; leftMinor: Minor; usedPct: number;
  state: "fresh" | "ok" | "close" | "over"; // fresh = nothing spent yet; close = ≥80% used
}
export function dayStatus(allowanceMinor: Minor, spentMinor: Minor): DayStatus {
  const spent = Math.max(0, spentMinor), left = allowanceMinor - spent;
  const usedPct = allowanceMinor > 0 ? Math.round((spent * 100) / allowanceMinor) : 0;
  return { allowanceMinor, spentMinor: spent, leftMinor: left, usedPct, state: spent === 0 ? "fresh" : left < 0 ? "over" : usedPct >= 80 ? "close" : "ok" };
}

/** Morning message: "Good morning — your budget for today is ₹3,333". */
export const morningMessage = (allowance: string) => ({ title: `Good morning! Today's budget is ${allowance}`, body: `Spend less than ${allowance} today and you stay on track. Every expense you add is subtracted from it.` });

/** Night message: a friendly verdict on how the day went. */
export function nightMessage(s: DayStatus, m: (v: Minor) => string) {
  if (s.state === "over") return { title: `Today: spent ${m(s.spentMinor)} against ${m(s.allowanceMinor)}`, body: `You went ${m(-s.leftMinor)} over today's budget. Tomorrow is a fresh start — see where it went on the dashboard.` };
  if (s.state === "fresh") return { title: `No spends recorded today`, body: `Your whole ${m(s.allowanceMinor)} is unspent. Forgot to log something? Add it so tomorrow's picture is accurate.` };
  return { title: `Nice! Spent ${m(s.spentMinor)} of ${m(s.allowanceMinor)} today`, body: `You kept ${m(s.leftMinor)} in hand. Consider moving it to a goal.` };
}
