/**
 * Indian holidays and festivals for the calendar.
 *  - "govt":        gazetted holidays of the Central Government (offices and banks closed).
 *  - "festival":    major pan-India festivals that are not central holidays.
 *  - "regional":    state/regional festivals and new years.
 *  - "observance":  notable days that are not holidays.
 * 2026 follows the DoPT list for Central Government offices (Delhi); 2027 follows the Government-office list published for 2027.
 * Fixed-date national days are generated for every year; lunar-calendar festivals are listed per year and can move by a day with moon sighting
 * or by region, so the UI says so. Other years show the fixed national days only.
 */
export type HolidayKind = "govt" | "festival" | "regional" | "observance";
export interface Holiday { date: string; name: string; kind: HolidayKind }
export const KIND_LABEL: Record<HolidayKind, string> = { govt: "Government holiday", festival: "Festival", regional: "Regional", observance: "Observance" };

const pad = (n: number) => String(n).padStart(2, "0");
const FIXED: [number, number, string, HolidayKind][] = [
  [1, 1, "New Year's Day", "observance"], [1, 26, "Republic Day", "govt"], [4, 14, "Ambedkar Jayanti", "observance"], [5, 1, "Labour Day / Maharashtra Day", "observance"],
  [8, 15, "Independence Day", "govt"], [10, 2, "Gandhi Jayanti", "govt"], [12, 24, "Christmas Eve", "observance"], [12, 25, "Christmas Day", "govt"],
];
type Row = [string, string, HolidayKind];
const Y2026: Row[] = [
  ["2026-01-14", "Makar Sankranti", "festival"], ["2026-01-15", "Pongal", "regional"], ["2026-01-23", "Vasant Panchami", "festival"], ["2026-02-15", "Maha Shivaratri", "festival"], ["2026-02-19", "Shivaji Jayanti", "regional"],
  ["2026-03-03", "Holika Dahan", "festival"], ["2026-03-04", "Holi", "govt"], ["2026-03-19", "Ugadi / Gudi Padwa", "regional"], ["2026-03-21", "Id-ul-Fitr (Eid)", "govt"], ["2026-03-26", "Ram Navami", "govt"],
  ["2026-03-31", "Mahavir Jayanti", "govt"], ["2026-04-03", "Good Friday", "govt"], ["2026-04-05", "Easter Sunday", "observance"], ["2026-04-14", "Vaisakhi / Vishu / Tamil New Year", "regional"], ["2026-04-15", "Bengali New Year / Bahag Bihu", "regional"],
  ["2026-05-01", "Buddha Purnima", "govt"], ["2026-05-09", "Rabindranath Tagore Jayanti", "regional"], ["2026-05-27", "Id-ul-Zuha (Bakrid)", "govt"], ["2026-06-26", "Muharram", "govt"], ["2026-07-16", "Rath Yatra", "regional"],
  ["2026-08-26", "Milad-un-Nabi", "govt"], ["2026-08-26", "Onam", "regional"], ["2026-08-28", "Raksha Bandhan", "festival"], ["2026-09-04", "Janmashtami", "govt"], ["2026-09-14", "Ganesh Chaturthi", "festival"],
  ["2026-10-10", "Mahalaya Amavasya", "regional"], ["2026-10-11", "Navratri begins", "festival"], ["2026-10-17", "Durga Puja begins", "regional"], ["2026-10-19", "Maha Ashtami", "festival"], ["2026-10-20", "Dussehra (Vijayadashami)", "govt"],
  ["2026-10-26", "Valmiki Jayanti", "festival"], ["2026-10-29", "Karwa Chauth", "festival"], ["2026-11-06", "Dhanteras", "festival"], ["2026-11-08", "Diwali (Deepavali)", "govt"], ["2026-11-08", "Naraka Chaturdashi (Choti Diwali)", "festival"],
  ["2026-11-09", "Govardhan Puja", "festival"], ["2026-11-11", "Bhai Dooj", "festival"], ["2026-11-15", "Chhath Puja", "regional"], ["2026-11-24", "Guru Nanak Jayanti", "govt"], ["2026-11-24", "Guru Tegh Bahadur Martyrdom Day", "observance"],
];
const Y2027: Row[] = [
  ["2027-01-14", "Makar Sankranti", "festival"], ["2027-01-15", "Pongal", "regional"], ["2027-02-11", "Vasant Panchami", "festival"], ["2027-02-19", "Shivaji Jayanti", "regional"], ["2027-03-06", "Maha Shivaratri", "festival"],
  ["2027-03-10", "Id-ul-Fitr (Eid)", "govt"], ["2027-03-22", "Holika Dahan", "festival"], ["2027-03-23", "Holi", "govt"], ["2027-03-26", "Good Friday", "govt"], ["2027-03-28", "Easter Sunday", "observance"],
  ["2027-04-07", "Ugadi / Gudi Padwa", "regional"], ["2027-04-14", "Vaisakhi / Vishu / Tamil New Year", "regional"], ["2027-04-15", "Ram Navami", "govt"], ["2027-04-15", "Bengali New Year / Bahag Bihu", "regional"],
  ["2027-04-19", "Mahavir Jayanti", "govt"], ["2027-05-09", "Rabindranath Tagore Jayanti", "regional"], ["2027-05-17", "Id-ul-Zuha (Bakrid)", "govt"], ["2027-05-20", "Buddha Purnima", "govt"], ["2027-06-16", "Muharram", "govt"],
  ["2027-07-05", "Rath Yatra", "regional"], ["2027-08-15", "Milad-un-Nabi", "govt"], ["2027-08-17", "Raksha Bandhan", "festival"], ["2027-08-25", "Janmashtami", "govt"], ["2027-09-04", "Ganesh Chaturthi", "festival"],
  ["2027-09-12", "Onam", "regional"], ["2027-10-06", "Navratri: Maha Saptami", "festival"], ["2027-10-07", "Maha Ashtami", "festival"], ["2027-10-08", "Maha Navami", "festival"], ["2027-10-09", "Dussehra (Vijayadashami)", "govt"],
  ["2027-10-15", "Valmiki Jayanti", "festival"], ["2027-10-18", "Karwa Chauth", "festival"], ["2027-10-28", "Naraka Chaturdashi (Choti Diwali)", "festival"], ["2027-10-29", "Diwali (Deepavali)", "govt"],
  ["2027-10-30", "Govardhan Puja", "festival"], ["2027-10-31", "Bhai Dooj", "festival"], ["2027-11-04", "Chhath Puja", "regional"], ["2027-11-14", "Guru Nanak Jayanti", "govt"], ["2027-11-24", "Guru Tegh Bahadur Martyrdom Day", "observance"],
];
/** Years that have the full lunar-festival list loaded. */
export const FESTIVAL_YEARS = [2026, 2027];

const byYear = new Map<number, Holiday[]>();
function holidaysOfYear(y: number): Holiday[] {
  const hit = byYear.get(y); if (hit) return hit;
  const list: Holiday[] = FIXED.map(([m, d, name, kind]) => ({ date: `${y}-${pad(m)}-${pad(d)}`, name, kind }));
  for (const [date, name, kind] of y === 2026 ? Y2026 : y === 2027 ? Y2027 : []) if (!list.some((h) => h.date === date && h.name === name)) list.push({ date, name, kind });
  list.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind)); byYear.set(y, list); return list;
}

export const holidaysOn = (ymd: string): Holiday[] => holidaysOfYear(+ymd.slice(0, 4)).filter((h) => h.date === ymd);
export function holidaysBetween(from: string, to: string, kinds?: HolidayKind[]): Holiday[] {
  const out: Holiday[] = []; for (let y = +from.slice(0, 4); y <= +to.slice(0, 4); y++) for (const h of holidaysOfYear(y)) if (h.date >= from && h.date <= to && (!kinds || kinds.includes(h.kind))) out.push(h);
  return out;
}
/** The next `n` holidays on or after `today` (government holidays and festivals by default). */
export function upcomingHolidays(today: string, n: number, kinds: HolidayKind[] = ["govt", "festival", "regional"]): (Holiday & { inDays: number })[] {
  const y = +today.slice(0, 4); const end = `${y + 1}-12-31`; const t0 = Date.parse(today + "T00:00:00Z");
  return holidaysBetween(today, end, kinds).slice(0, n).map((h) => ({ ...h, inDays: Math.round((Date.parse(h.date + "T00:00:00Z") - t0) / 86_400_000) }));
}

/** RBI rule: banks are closed on every Sunday and on the 2nd and 4th Saturday, plus government holidays. */
export function bankClosed(ymd: string): { closed: boolean; reason?: string } {
  const d = new Date(ymd + "T00:00:00Z"); const dow = d.getUTCDay();
  if (dow === 0) return { closed: true, reason: "Sunday" };
  if (dow === 6) { const nth = Math.ceil(d.getUTCDate() / 7); if (nth === 2 || nth === 4) return { closed: true, reason: `${nth === 2 ? "2nd" : "4th"} Saturday` }; }
  const g = holidaysOn(ymd).find((h) => h.kind === "govt"); return g ? { closed: true, reason: g.name } : { closed: false };
}
/** Working days (banks open) in a month, and how many days are government holidays/festivals. */
export function monthStats(ym: string) {
  const [y, m] = ym.split("-").map(Number); const days = new Date(Date.UTC(y, m, 0)).getUTCDate(); let working = 0, closed = 0;
  for (let d = 1; d <= days; d++) { if (bankClosed(`${ym}-${pad(d)}`).closed) closed++; else working++; }
  const hs = holidaysBetween(`${ym}-01`, `${ym}-${pad(days)}`);
  return { days, working, closed, govt: hs.filter((h) => h.kind === "govt").length, festivals: hs.filter((h) => h.kind === "festival" || h.kind === "regional").length };
}
