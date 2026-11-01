import { fromZonedTime, toZonedTime, formatInTimeZone } from "date-fns-tz";

export const DEFAULT_TZ = "Asia/Kolkata";
export interface Range { start: Date; end: Date } // [start, end) in UTC instants

/** Local calendar date (YYYY-MM-DD) of an instant in a timezone. */
export function localDate(iso: string | Date, tz = DEFAULT_TZ): string {
  return formatInTimeZone(iso, tz, "yyyy-MM-dd");
}

function startOfLocalDay(ymd: string, tz: string): Date {
  return fromZonedTime(`${ymd}T00:00:00.000`, tz);
}
function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export type Preset = "today" | "week" | "month" | "year";

/** Half-open [start,end) range in the user's timezone. Weeks start Monday. */
export function presetRange(preset: Preset, now: Date, tz = DEFAULT_TZ): Range {
  const today = localDate(now, tz);
  const [y, m] = today.split("-").map(Number);
  let startYmd: string, endYmd: string;
  if (preset === "today") { startYmd = today; endYmd = addDaysYmd(today, 1); }
  else if (preset === "week") {
    const dow = (toZonedTime(now, tz).getDay() + 6) % 7; // Mon=0
    startYmd = addDaysYmd(today, -dow); endYmd = addDaysYmd(startYmd, 7);
  } else if (preset === "month") {
    startYmd = `${y}-${String(m).padStart(2, "0")}-01`;
    endYmd = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  } else { startYmd = `${y}-01-01`; endYmd = `${y + 1}-01-01`; }
  return { start: startOfLocalDay(startYmd, tz), end: startOfLocalDay(endYmd, tz) };
}

/** Custom inclusive local-date range -> half-open UTC range. */
export function customRange(fromYmd: string, toYmd: string, tz = DEFAULT_TZ): Range {
  if (fromYmd > toYmd) throw new Error("from must be <= to");
  return { start: startOfLocalDay(fromYmd, tz), end: startOfLocalDay(addDaysYmd(toYmd, 1), tz) };
}

/** Immediately preceding range of equal calendar length (for previous-period comparison). */
export function previousRange(r: Range, preset: Preset | "custom", tz = DEFAULT_TZ): Range {
  if (preset === "month" || preset === "year") {
    const s = localDate(r.start, tz).split("-").map(Number);
    const startYmd = preset === "month"
      ? (s[1] === 1 ? `${s[0] - 1}-12-01` : `${s[0]}-${String(s[1] - 1).padStart(2, "0")}-01`)
      : `${s[0] - 1}-01-01`;
    return { start: startOfLocalDay(startYmd, tz), end: r.start };
  }
  const days = Math.round((r.end.getTime() - r.start.getTime()) / 86_400_000);
  return { start: startOfLocalDay(addDaysYmd(localDate(r.start, tz), -days), tz), end: r.start };
}

export const inRange = (iso: string, r: Range) => {
  const t = new Date(iso).getTime();
  return t >= r.start.getTime() && t < r.end.getTime();
};
