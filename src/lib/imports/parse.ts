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

/** Heuristic text-statement parser for PDFs: lines that start with a date and end with amount(s). Low confidence by design. */
export function parseStatementText(text: string): RawRow[] {
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
