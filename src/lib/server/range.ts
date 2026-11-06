import { presetRange, customRange, previousRange, likeForLike, localDate, formatYmd, DEFAULT_TZ, type Preset, type Range } from "@/lib/finance/dates";

const BUDGET_PRESET: Record<string, Preset> = { daily: "today", weekly: "week", monthly: "month", yearly: "year" };
/** Earliest start among the current periods of the given budget periods (so only that slice of the ledger is loaded). */
export function earliestBudgetStart(periods: string[], tz = DEFAULT_TZ, now = new Date()): Date | undefined {
  const starts = periods.map((p) => presetRange(BUDGET_PRESET[p], now, tz).start.getTime());
  return starts.length ? new Date(Math.min(...starts)) : undefined;
}
export type SP = { range?: string; from?: string; to?: string; q?: string; page?: string; type?: string; cat?: string; method?: string; channel?: string; sort?: string; min?: string; max?: string; size?: string; view?: string };
export const PRESETS: { key: Preset | "custom"; label: string }[] = [
  { key: "today", label: "Today" }, { key: "week", label: "This week" }, { key: "month", label: "This month" }, { key: "year", label: "This year" }, { key: "custom", label: "Custom" },
];
export function resolveRange(sp: SP, tz = DEFAULT_TZ, now = new Date(), def: Preset = "month") {
  const key = (sp.range as Preset | "custom") || def;
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  if (key === "custom" && sp.from && sp.to && ymd.test(sp.from) && ymd.test(sp.to) && sp.from <= sp.to) {
    const range = customRange(sp.from, sp.to, tz); const prev = previousRange(range, "custom", tz); return { key, range, prev, prevLike: likeForLike(range, prev, now) };
  }
  const k: Preset = (["today", "week", "month", "year"] as const).includes(key as Preset) ? (key as Preset) : def;
  const range = presetRange(k, now, tz); const prev = previousRange(range, k, tz); return { key: k, range, prev, prevLike: likeForLike(range, prev, now) };
}

/** "This year · 1 Jan 2026 – 31 Dec 2026" (one date when the range is a single day). */
export function periodLabel(key: string, range: Range, tz = DEFAULT_TZ): string {
  const d1 = localDate(range.start, tz), d2 = localDate(new Date(range.end.getTime() - 1), tz);
  const name = ({ today: "Today", week: "This week", month: "This month", year: "This year", custom: "Custom dates" } as Record<string, string>)[key] ?? "This period";
  return `${name} · ${d1 === d2 ? formatYmd(d1) : `${formatYmd(d1)} – ${formatYmd(d2)}`}`;
}
