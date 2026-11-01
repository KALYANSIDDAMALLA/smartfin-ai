import { type Minor, percent, ceilDiv } from "./money";

export const MILESTONES = [25, 50, 75, 100] as const;

export interface GoalInput {
  targetMinor: Minor;
  contributedMinor: Minor;
  targetDate?: string | null; // YYYY-MM-DD
  status: "active" | "paused" | "completed";
}

export function goalProgress(g: GoalInput, today: string) {
  const pct = Math.min(100, percent(g.contributedMinor, g.targetMinor));
  const remainingMinor = Math.max(0, g.targetMinor - g.contributedMinor);
  const monthsLeft = g.targetDate ? monthsBetween(today, g.targetDate) : null;
  const requiredMonthlyMinor =
    monthsLeft && monthsLeft > 0 && remainingMinor > 0 ? ceilDiv(remainingMinor, monthsLeft) : remainingMinor > 0 && monthsLeft === 0 ? remainingMinor : 0;
  return { pct, remainingMinor, requiredMonthlyMinor, monthsLeft, reachedMilestones: MILESTONES.filter((m) => pct >= m) };
}

/** Whole months from `from` to `to` (rounded up, min 0). */
export function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  let m = (ty - fy) * 12 + (tm - fm);
  if (td > fd) m += 1;
  return Math.max(0, m);
}

/** Milestones crossed by a contribution that moves total from `before` to `after` (new ones only). */
export function crossedMilestones(targetMinor: Minor, before: Minor, after: Minor): number[] {
  const b = percent(before, targetMinor), a = percent(after, targetMinor);
  return MILESTONES.filter((m) => a >= m && b < m);
}

/** Estimated completion given a monthly pace; null if pace <= 0. */
export function estimatedCompletion(g: GoalInput, monthlyPaceMinor: Minor, today: string): string | null {
  const remaining = Math.max(0, g.targetMinor - g.contributedMinor);
  if (remaining === 0) return today;
  if (monthlyPaceMinor <= 0 || g.status === "paused") return null;
  const months = Math.ceil(remaining / monthlyPaceMinor);
  const [y, m, d] = today.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, last));
  return dt.toISOString().slice(0, 10);
}
