import { parseMoney } from "./finance/money";

/**
 * Field-level data-quality rules, shared by the server (authoritative) and the forms (instant feedback).
 * They target DIRTY DATA — phone numbers or links typed into a name, helpline text, HTML, invisible characters, absurd amounts/dates, malformed tags —
 * not business rules. Each check returns an error message, or null when the value is fine.
 */
const INVISIBLE = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u200B-\\u200F\\u2028-\\u202F\\u2060\\uFEFF]", "g");
/** Single-line text: Unicode-normalised, invisible/control characters removed, whitespace collapsed. */
export const cleanText = (s: string) => s.normalize("NFKC").replace(INVISIBLE, " ").replace(/\s+/g, " ").trim();
/** Multi-line text: same, but keeps line breaks. */
export const cleanMultiline = (s: string) => s.normalize("NFKC").replace(INVISIBLE, "").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

export type Check = string | null;

export function checkName(label: string, raw: string, o: { min?: number; max?: number; required?: boolean; payee?: boolean } = {}): Check {
  const { min = 2, max = 80, required = false, payee = false } = o; const v = cleanText(raw);
  if (!v) return required ? `${label} is required` : null;
  if (v.length < min) return `${label} must be at least ${min} characters`;
  if (v.length > max) return `${label} can't be longer than ${max} characters`;
  if (/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|in|org|net|io|co|app)\b|@)/i.test(v)) return `${label} looks like a link or email address — enter the name instead`;
  if (/\d{7,}/.test(v.replace(/[\s-]/g, ""))) return `${label} looks like a phone or reference number — enter the name instead`;
  if (!/\p{L}/u.test(v)) return `${label} must include letters`;
  if (!/^[\p{L}\p{M}\p{N} .,'&\-/()#+_*!:]+$/u.test(v)) return `${label} has characters that aren't allowed (like < > { } [ ] | ; = $ %)`;
  if (/(.)\1{4,}/u.test(v)) return `${label} looks like random characters`;
  if (payee && /\b(call|report|helpline|customer care|toll[- ]?free|dear customer|not you)\b/i.test(v)) return `${label} looks like part of a message, not a name`;
  return null;
}

export function checkAmount(raw: string, o: { required?: boolean } = {}): Check {
  const v = cleanText(raw); if (!v) return o.required === false ? null : "Amount is required";
  let m: number; try { m = parseMoney(v); } catch (e) { return /decimal/i.test((e as Error).message) ? "Use at most 2 decimal places" : "Enter the amount as a number, like 450 or 450.50"; }
  if (m <= 0) return "Amount must be greater than 0";
  if (m > 100_000_000_000) return "Amount can't exceed ₹100 crore";
  return null;
}

/** `local` is an HTML datetime-local / ISO string. Future dates (beyond a day of timezone slack) and pre-2000 dates are dirty data. */
export function checkDate(local: string, o: { required?: boolean; now?: Date; allowFuture?: boolean } = {}): Check {
  const v = local.trim(); if (!v) return o.required === false ? null : "Date and time are required";
  const t = Date.parse(v); if (isNaN(t)) return "Enter a valid date and time";
  if (new Date(t).getUTCFullYear() < 2000) return "Date can't be before the year 2000";
  if (!o.allowFuture && t > (o.now ?? new Date()).getTime() + 36 * 3600e3) return "Date can't be in the future"; // drafts are planned for later, so they may be future-dated
  return null;
}

/** Normalises tags (lowercase, hyphens, no symbols, de-duplicated) and reports what can't be fixed automatically. */
export function normalizeTags(raw: string): { tags: string[]; error: Check } {
  const tags: string[] = []; let error: Check = null;
  for (const part of raw.split(/[,;\n]/)) {
    const t = cleanText(part).toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "").replace(/^[-_]+|[-_]+$/g, ""); if (!t) continue;
    if (t.length < 2 || t.length > 24) { error ??= `Tag “${t.slice(0, 12)}${t.length > 12 ? "…" : ""}” must be 2–24 characters`; continue; }
    if (!tags.includes(t)) tags.push(t);
  }
  if (tags.length > 10) error ??= "Use at most 10 tags";
  return { tags: tags.slice(0, 10), error };
}

export function checkReference(raw: string): Check {
  const v = cleanText(raw); if (!v) return null; return /^[A-Za-z0-9._\-:/]{4,40}$/.test(v) ? null : "Reference must be 4–40 letters, numbers or . - _ : /";
}

export function checkNote(label: string, raw: string, max: number): Check {
  const v = cleanMultiline(raw); if (!v) return null;
  if (v.length > max) return `${label} can't be longer than ${max} characters`;
  if (/<\/?[a-z!][^>]*>/i.test(v) || /javascript:/i.test(v)) return `Remove HTML tags or code from ${label.toLowerCase()}`;
  return null;
}
