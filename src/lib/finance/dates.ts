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

/**
 * Like-for-like comparison window: when the current period is still running (e.g. 1 day into the month),
 * compare it with the same elapsed time of the previous period instead of the whole previous period.
 * Finished periods (and custom ranges in the past) are returned unchanged.
 */
export function likeForLike(cur: Range, prev: Range, now: Date): Range {
  if (now.getTime() >= cur.end.getTime() || now.getTime() < cur.start.getTime()) return prev;
  const end = Math.min(prev.end.getTime(), prev.start.getTime() + (now.getTime() - cur.start.getTime()));
  return { start: prev.start, end: new Date(end) };
}

export const inRange = (iso: string, r: Range) => {
  const t = new Date(iso).getTime();
  return t >= r.start.getTime() && t < r.end.getTime();
};

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-01" -> "1 Nov 2026" (a plain calendar date, no timezone shift). */
export function formatYmd(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd); if (!m) return ymd;
  return `${Number(m[3])} ${MON[Number(m[2]) - 1]} ${m[1]}`;
}

/** An instant as the value of a <input type="datetime-local"> ("2026-11-01T20:00") in the given timezone. */
export function isoToLocalInput(iso: string | Date, tz = DEFAULT_TZ): string {
  return formatInTimeZone(iso, tz, "yyyy-MM-dd'T'HH:mm");
}
/** A datetime-local value ("2026-11-01T20:00", no offset) read as wall-clock time in `tz` -> UTC ISO string. Undefined if it isn't one. */
export function localInputToIso(v: string, tz = DEFAULT_TZ): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)) return undefined;
  const d = fromZonedTime(v, tz); return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
