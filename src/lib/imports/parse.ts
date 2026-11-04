import { fromZonedTime } from "date-fns-tz";
import { parseMoney } from "../finance/money";

export type RawRow = Record<string, string>;
export interface Mapping { date?: string; description?: string; amount?: string; debit?: string; credit?: string; ref?: string }
export interface Parsed { amountMinor: number | null; occurredAt: string | null; description: string | null; txType: "income" | "expense" | null; externalRef: string | null; confidence: number }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const find = (headers: string[], keys: string[]) => headers.find((h) => keys.some((k) => norm(h).includes(k)));

/** Best-effort column detection; the user can override in the UI. */
export function detectMapping(headers: string[]): Mapping {
  return {
    date: find(headers, ["date", "txndate", "valuedate"]),
    description: find(headers, ["description", "narration", "particulars", "details", "merchant", "remarks"]),
    debit: find(headers, ["debit", "withdrawal", "dr"]),
    credit: find(headers, ["credit", "deposit", "cr"]),
    amount: find(headers, ["amount"]),
    ref: find(headers, ["reference", "refno", "utr", "chequeno", "txnid", "transactionid"]),
  };
}

const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** Parses dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, dd Mon yyyy (Indian day-first convention). Returns ISO instant at local midnight, or null. */
export function parseDate(input: string, tz = "Asia/Kolkata"): string | null {
  const s = input.trim(); let y: number, m: number, d: number, x: RegExpExecArray | null;
  if ((x = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s))) [y, m, d] = [+x[1], +x[2], +x[3]];
  else if ((x = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{2,4})/.exec(s))) { [d, m, y] = [+x[1], +x[2], +x[3]]; if (y < 100) y += 2000; }
  else if ((x = /^(\d{1,2})[-/ ]([A-Za-z]{3})[a-z]*[-/ ,]+(\d{2,4})/.exec(s))) { d = +x[1]; m = MON.indexOf(x[2].toLowerCase()) + 1; y = +x[3]; if (y < 100) y += 2000; if (!m) return null; }
  else return null;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d)); if (dt.getUTCDate() !== d) return null; // rejects 31 Feb
  return fromZonedTime(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00`, tz).toISOString();
}

const money = (v?: string) => { if (!v || !v.trim()) return null; try { const n = parseMoney(v.replace(/\b(cr|dr)\b/gi, "").trim()); return n; } catch { return null; } };

/** Convert one raw row with a mapping. Anything uncertain lowers confidence; null fields must be fixed by the user before import. */
export function applyMapping(row: RawRow, map: Mapping, tz = "Asia/Kolkata"): Parsed {
  const occurredAt = map.date ? parseDate(row[map.date] ?? "", tz) : null;
  let amount: number | null = null; let type: Parsed["txType"] = null;
  const deb = map.debit ? money(row[map.debit]) : null, cre = map.credit ? money(row[map.credit]) : null;
  if (deb && deb !== 0 && !cre) { amount = Math.abs(deb); type = "expense"; }
  else if (cre && cre !== 0 && !deb) { amount = Math.abs(cre); type = "income"; }
  else if (map.amount) { const a = money(row[map.amount]); if (a !== null && a !== 0) { amount = Math.abs(a); type = a < 0 || /\bdr\b/i.test(row[map.amount]) ? "expense" : /\bcr\b/i.test(row[map.amount]) ? "income" : "expense"; } }
  const description = map.description ? (row[map.description] ?? "").trim().slice(0, 300) || null : null;
  const externalRef = map.ref ? (row[map.ref] ?? "").trim().slice(0, 100) || null : null;
  const signed = !!map.amount && !map.debit && !map.credit;
  let confidence = 0.4 + (occurredAt ? 0.25 : 0) + (amount ? 0.25 : 0) + (description ? 0.1 : 0);
  if (signed && amount) confidence = Math.min(confidence, 0.8); // sign convention is a guess
  return { amountMinor: amount, occurredAt, description, txType: type, externalRef, confidence: Math.min(1, Math.round(confidence * 100) / 100) };
}

/** Heuristic text-statement parser for PDFs. Handles one-line rows and, when that finds less, statements where one transaction spans several lines. Low confidence by design. */
export function parseStatementText(text: string): RawRow[] {
  const one = parseStatementLines(text); const many = parseStatementRecords(text);
  return many.length > one.length ? many : one;
}

const MONEY_TAIL = /(?:^|\s)(-?(?:\d{1,3}(?:,\d{2,3})+|\d+)\.\d{2})\s*(Cr|Dr)?\s*$/i;
const RECORD_START = /^\s*(?:\d{1,5}\s+)?(\d{1,2}[-/ .](?:\d{1,2}|[A-Za-z]{3,9})[-/ .]\d{2,4})\b(.*)$/;
/** Table headers and "Page n of m" lines can fall in the middle of a transaction: skip them without ending it. */
const PAGE_LINE = /(?:^\s*#?\s*date\b.*\b(?:narration|particulars|description|details|remarks)\b)|\bpage\s+\d+\s*(?:of|\/)\s*\d+|statement\s+(?:period|generated)/i;
/** Lines that close the transaction list (closing balance, totals, summary). */
const END_LINE = /^\s*(?:closing\s+balance|statement\s+summary|total\b|end of statement|this is a computer)/i;
const cents = (v: string) => Math.round(Number(v.replace(/,/g, "")) * 100);
const monthIdx = (m: string) => ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m.slice(0, 3).toLowerCase());
/** Sortable key for a date string like "02 Jan 2026", "02/01/2026" or "02-01-26" (day first, as Indian statements are); null when it is not a real date. */
function dateKey(d: string): number | null {
  const m = /^(\d{1,2})[-/ .](\d{1,2}|[A-Za-z]{3,9})[-/ .](\d{2,4})$/.exec(d.trim()); if (!m) return null;
  const day = Number(m[1]); const mon = /^\d+$/.test(m[2]) ? Number(m[2]) - 1 : monthIdx(m[2]); let y = Number(m[3]); if (y < 100) y += 2000;
  return day >= 1 && day <= 31 && mon >= 0 && mon <= 11 ? y * 10000 + (mon + 1) * 100 + day : null;
}

/**
 * Statements where one transaction takes several lines (date and description first, amounts on a later line), with a withdrawal/deposit pair
 * and a running balance. Each transaction is the date line plus the lines below it up to the next date; the amount is the number before the
 * trailing balance, and money in or out is worked out from how the balance moved (a Cr/Dr label is used when there is one).
 */
export function parseStatementRecords(text: string): RawRow[] { return readStatementRecords(text).rows; }

/** Same as `parseStatementRecords`, plus how each money-in/money-out decision was made (for tests and diagnostics). */
export function readStatementRecords(text: string): { rows: RawRow[]; stats: { byBalance: number; byLabel: number; byGuess: number; opening: number | null; closing: number | null; misses: { i: number; delta: number; amount: number; tokens: number; body: string }[] } } {
  const stats = { byBalance: 0, byLabel: 0, byGuess: 0, opening: null as number | null, closing: null as number | null, misses: [] as { i: number; delta: number; amount: number; tokens: number; body: string }[] };
  type Rec = { date: string; body: string }; const recs: Rec[] = []; let cur: Rec | null = null; let opening: number | null = null;
  const peel = (body: string) => { const t: { v: number; dc: "cr" | "dr" | null }[] = []; let rest = body.trim();
    for (let i = 0; i < 3; i++) { rest = rest.replace(/(?:^|\s)-\s*$/, "").trim(); const m = MONEY_TAIL.exec(rest); if (!m) break; t.unshift({ v: cents(m[1]), dc: m[2] ? (m[2].toLowerCase() as "cr" | "dr") : null }); rest = rest.slice(0, m.index).trim(); }
    return { tokens: t, desc: rest.replace(/(?:^|\s)-(?:\s+-)*\s*$/, "").replace(/\s+/g, " ").trim() }; };
  // Page furniture (bank name, table header, "statement generated on…", page markers) repeats on every page; drop it so it is never glued onto a transaction.
  const all = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean); const seen = new Map<string, number>(); for (const l of all) seen.set(l, (seen.get(l) ?? 0) + 1);
  const furniture = (l: string) => /^-+\s*\d+\s*(?:of|\/)\s*\d+\s*-+$/i.test(l) || (!MONEY_TAIL.test(l) && !RECORD_START.test(l) && ((seen.get(l) ?? 0) >= 8 || ((seen.get(l) ?? 0) >= 3 && l.length >= 12) || ((seen.get(l) ?? 0) >= 2 && l.length >= 25)));
  for (const line of all) {
    if (furniture(line)) continue;
    if (/^\s*(?:\S+\s+)?opening\s+balance|\bopening\s+balance\b/i.test(line) && !RECORD_START.test(line)) { const o = peel(line).tokens; if (o.length) opening = o[o.length - 1].v; cur = null; continue; }
    if (END_LINE.test(line)) { cur = null; continue; }
    if (PAGE_LINE.test(line)) continue;
    const m = RECORD_START.exec(line);
    if (m && dateKey(m[1]) !== null) { cur = { date: m[1], body: m[2].trim() }; recs.push(cur); }
    else if (cur) { cur.body += " " + line.trim(); }
    if (cur && MONEY_TAIL.test(cur.body.replace(/(?:^|\s)-\s*$/, ""))) cur = null; // it ends with its amounts: this transaction is complete
  }
  // newest-first statements: walk them oldest-first so the running balance makes sense
  const keys = recs.map((r) => dateKey(r.date) ?? 0); const desc = keys.length > 1 && keys[0] > keys[keys.length - 1]; const ordered = desc ? [...recs].reverse() : recs;
  stats.opening = opening; let prev: number | null = desc ? null : opening; const rows: RawRow[] = [];
  for (const r of ordered) {
    const { tokens, desc: d } = peel(r.body); if (!tokens.length) continue;
    let amount: number; let bal: number | null = null; let dir: "cr" | "dr" | null = null;
    if (tokens.length === 1) amount = tokens[0].v;
    else if (tokens.length === 2) { amount = tokens[0].v; bal = tokens[1].v; dir = tokens[0].dc; }
    else { const [w, dep] = tokens; bal = tokens[2].v; if (w.v && !dep.v) { amount = w.v; dir = "dr"; } else if (dep.v && !w.v) { amount = dep.v; dir = "cr"; } else { amount = Math.max(w.v, dep.v); } }
    if (!(amount > 0)) { if (bal !== null) prev = bal; continue; }
    let how: "byBalance" | "byLabel" | "byGuess" = dir ? "byLabel" : "byGuess";
    if (bal !== null && prev !== null && Math.abs(Math.abs(bal - prev) - amount) <= 1) { dir = bal > prev ? "cr" : "dr"; how = "byBalance"; } // the balance moved by exactly this amount
    if (bal !== null && prev !== null && how !== "byBalance" && stats.misses.length < 80) stats.misses.push({ i: rows.length, delta: bal - prev, amount, tokens: tokens.length, body: r.body });
    if (bal !== null) { prev = bal; stats.closing = bal; }
    if (!dir) dir = /\b(?:salary|refund|interest|cashback|credit|deposit|received|reversal)\b|(?:^|\/)cr\b/i.test(d) ? "cr" : "dr";
    stats[how]++; rows.push({ Date: r.date, Description: d.slice(0, 300), Amount: `${(amount / 100).toFixed(2)} ${dir === "cr" ? "Cr" : "Dr"}` });
  }
  return { rows, stats };
}

function parseStatementLines(text: string): RawRow[] {
  const rows: RawRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(\d{1,2}[-/ .](?:\d{1,2}|[A-Za-z]{3})[-/ .]\d{2,4})\s+(.+?)\s+(-?[\d,]+\.\d{2})\s*(Cr|Dr|CR|DR)?\s*(?:-?[\d,]+\.\d{2}\s*(?:Cr|Dr|CR|DR)?)?\s*$/.exec(line);
    if (m) rows.push({ Date: m[1], Description: m[2], Amount: `${m[3]}${m[4] ? " " + m[4] : ""}` });
  }
  return rows;
}

/** Magic-byte sniffing so a renamed executable can't masquerade as a statement. */
export function sniffKind(buf: Uint8Array, ext: string): "csv" | "xlsx" | "pdf" | "image" | null {
  const h = (n: number) => Array.from(buf.slice(0, n));
  const is = (...b: number[]) => b.every((v, i) => h(b.length)[i] === v);
  if (ext === "pdf") return is(0x25, 0x50, 0x44, 0x46) ? "pdf" : null;
  if (ext === "xlsx") return is(0x50, 0x4b, 0x03, 0x04) ? "xlsx" : null;
  if (["png"].includes(ext)) return is(0x89, 0x50, 0x4e, 0x47) ? "image" : null;
  if (["jpg", "jpeg"].includes(ext)) return is(0xff, 0xd8, 0xff) ? "image" : null;
  if (ext === "csv") { const head = buf.slice(0, 2048); return head.includes(0) ? null : "csv"; }
  return null;
}
