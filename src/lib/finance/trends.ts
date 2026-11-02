import { localDate } from "./dates";
import type { Tx } from "./types";

export type Grain = "daily" | "weekly" | "monthly" | "yearly";
export interface Bucket { key: string; label: string; incomeMinor: number; expenseMinor: number; netMinor: number }

/** Bucket key for an instant in tz. Weeks are keyed by their Monday. */
export function bucketKey(iso: string, grain: Grain, tz: string): string {
  const d = localDate(iso, tz);
  if (grain === "daily") return d;
  if (grain === "monthly") return d.slice(0, 7);
  if (grain === "yearly") return d.slice(0, 4);
  const [y, m, dd] = d.split("-").map(Number); const dt = new Date(Date.UTC(y, m - 1, dd));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7)); return dt.toISOString().slice(0, 10);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Human label for a bucket key: "Nov 2026", "1 Nov", "Wk 4 · 26 Oct", "2026". */
export function bucketLabel(key: string, grain: Grain): string {
  const [y, m, d] = key.split("-").map(Number);
  if (grain === "monthly") return `${MONTHS[m - 1]} ${y}`;
  if (grain === "daily") return `${d} ${MONTHS[m - 1]}`;
  if (grain === "weekly") return `Wk ${Math.ceil(d / 7)} · ${d} ${MONTHS[m - 1]}`; // week-of-month by its Monday
  return key;
}

/** Income vs net expense per bucket. Transfers/adjustments excluded; refunds reduce expense (in the refund's own bucket). */
export function trend(txs: Tx[], grain: Grain, tz: string, keys: string[]): Bucket[] {
  const map = new Map<string, Bucket>(keys.map((k) => [k, { key: k, label: bucketLabel(k, grain), incomeMinor: 0, expenseMinor: 0, netMinor: 0 }]));
  for (const t of txs) {
    const b = map.get(bucketKey(t.occurredAt, grain, tz)); if (!b) continue;
    if (t.type === "income") b.incomeMinor += t.amountMinor;
    else if (t.type === "expense") b.expenseMinor += t.amountMinor;
    else if (t.type === "refund") b.expenseMinor -= t.amountMinor;
  }
  const out = [...map.values()]; out.forEach((b) => (b.netMinor = b.incomeMinor - b.expenseMinor)); return out;
}

/** The last n bucket keys ending at `now`, oldest first. */
export function lastKeys(now: Date, grain: Grain, n: number, tz: string): string[] {
  const keys: string[] = []; const cur = bucketKey(now.toISOString(), grain, tz);
  const [y, m, d] = cur.split("-").map(Number);
  for (let i = n - 1; i >= 0; i--) {
    if (grain === "daily") keys.push(new Date(Date.UTC(y, m - 1, d - i)).toISOString().slice(0, 10));
    else if (grain === "weekly") keys.push(new Date(Date.UTC(y, m - 1, d - 7 * i)).toISOString().slice(0, 10));
    else if (grain === "monthly") { const dt = new Date(Date.UTC(y, m - 1 - i, 1)); keys.push(dt.toISOString().slice(0, 7)); }
    else keys.push(String(y - i));
  }
  return keys;
}
