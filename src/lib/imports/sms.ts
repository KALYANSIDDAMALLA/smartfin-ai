import { parseMoney } from "../finance/money";

export interface SmsResult {
  ok: boolean; reason?: string;
  type?: "expense" | "income"; amount?: string; date?: string; // date = YYYY-MM-DD (as written in the message)
  merchant?: string; methodCode?: string; channel?: "online" | "offline"; ref?: string; confidence: "high" | "medium" | "low";
}

const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** First valid date in the text: dd-mm-yy(yy), dd/mm/yyyy, dd-Mon-yy, yyyy-mm-dd. Day-first (Indian convention). */
export function findDate(t: string): string | undefined {
  const re = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b|\b(\d{1,2})[-/. ]([A-Za-z]{3})[a-z]*[-/. ,]*(\d{2,4})\b|\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g;
  for (const m of t.matchAll(re)) {
    let y: number, mo: number, d: number;
    if (m[1]) [y, mo, d] = [+m[1], +m[2], +m[3]];
    else if (m[5]) { d = +m[4]; mo = MON.indexOf(m[5].toLowerCase()) + 1; y = +m[6]; if (y < 100) y += 2000; }
    else { d = +m[7]; mo = +m[8]; y = +m[9]; if (y < 100) y += 2000; }
    if (mo < 1 || mo > 12 || d < 1 || y < 2000 || y > 2100) continue;
    if (new Date(Date.UTC(y, mo - 1, d)).getUTCDate() !== d) continue;
    return `${y}-${pad(mo)}-${pad(d)}`;
  }
}

/** Sentences that are disclaimers/helplines, never the payee ("If this wasn't you, call 1800 4100 to report"). */
const BOILER = /\b(if (?:this|the|any) (?:transaction|txn|payment)|not (?:done|made|authori[sz]ed|initiated) by you|wasn'?t (?:done|made|you)|not you\b|call\b|contact\b|to report|report (?:it|this)|dispute|block (?:your|the)|customer care|helpline|toll[- ]?free|do not share|never share|click\b|download\b|visit\b|t&c|terms and conditions)/i;
export function stripBoilerplate(t: string): string { const kept = t.split(/(?<=[.!?])\s+(?=[A-Z])/).filter((s) => !BOILER.test(s)).join(" "); return kept.trim() || t; }
/** A payee can't be a phone/helpline number or an instruction. */
export const badPayee = (s: string) => /^\d|\b(report|helpline|care|support|customer|toll|free)\b/i.test(s);
/** ALL-CAPS bank names read better in Title Case ("EDUNURI VARSHITHA" -> "Edunuri Varshitha"). */
export const tidyName = (s: string) => (/[A-Z]/.test(s) && s === s.toUpperCase() && !s.includes("@") ? s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s);
const clean = (s: string) => s.replace(/[.,;:)\]]+$/, "").replace(/\s+/g, " ").trim().slice(0, 80);

/** Reads a bank/UPI alert (SMS or email text). Runs entirely in the browser; nothing is stored or sent. */
export function parseBankMessage(raw: string): SmsResult {
  const t = raw.replace(/\s+/g, " ").trim();
  if (t.length < 10) return { ok: false, reason: "Paste the full message.", confidence: "low" };
  if (/\b(otp|one[- ]time password|verification code)\b/i.test(t) && !/\b(debited|credited|spent|paid)\b/i.test(t)) return { ok: false, reason: "That looks like an OTP message, not a transaction. Don't share OTPs.", confidence: "low" };

  const amt = /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i.exec(t) ?? /\b([\d,]+(?:\.\d{1,2})?)\s*(?:rs\b|inr\b)/i.exec(t);
  if (!amt) return { ok: false, reason: "Couldn't find an amount (like Rs 450.00).", confidence: "low" };
  let amount: string; try { const m = parseMoney(amt[1]); if (m <= 0) throw new Error(); amount = (m / 100).toFixed(2); } catch { return { ok: false, reason: "Couldn't read the amount.", confidence: "low" }; }

  const debit = /\b(debited|spent|sent|paid|payment of|purchase|withdrawn|txn of|transferred)\b/i.test(t);
  const credit = /\b(credited|received|deposited|refund(?:ed)? of)\b/i.test(t);
  if (!debit && !credit) return { ok: false, reason: "Couldn't tell whether money went out or came in.", confidence: "low" };
  const type = credit && !debit ? "income" : "expense";

  const ref = /\b(?:upi\s*)?ref(?:erence)?(?:\s*(?:no|number|id))?\.?\s*[:#-]?\s*(\d{9,18})\b/i.exec(t)?.[1] ?? /\b(?:utr|rrn|txn\s*id)\s*[:#-]?\s*([A-Za-z0-9]{8,22})\b/i.exec(t)?.[1];

  // Merchant: "to VPA x@y", "at MERCHANT", "to NAME", "trf to NAME", "from NAME" (credits). Stops at on/ref/dated/(.
  const stop = "(?=\\s+(?:on|ref|upi|dated|via|using|avl|bal|if|not|through|thru|with|for|by)\\b|\\s*[(.,;]|$)";
  const body = stripBoilerplate(t); const pick = (re: RegExp) => re.exec(body)?.[1];
  const towards = pick(new RegExp(`\\b(?:towards|in favou?r of|beneficiary(?: name)?[:\\s]|payee(?: name)?[:\\s]|paid to|sent to)\\s+([A-Za-z0-9&'*._ \\-]{2,40}?)${stop}`, "i"));
  const vpa = pick(/\bVPA\s+([\w.\-]+@[\w]+)/i) ?? pick(/\bto\s+([\w.\-]+@[\w]+)/i);
  const at = pick(new RegExp(`\\bat\\s+([A-Za-z0-9&'*._ \\-]{2,40}?)${stop}`, "i"));
  const to = pick(new RegExp(`\\b(?:to|trf to)\\s+(?!A/c|a/c|account|VPA|your)([A-Za-z0-9&'*._ \\-]{2,40}?)${stop}`, "i"));
  const from = type === "income" ? pick(new RegExp(`\\bfrom\\s+(?!A/c|a/c|account)([A-Za-z0-9&'*._@ \\-]{2,40}?)${stop}`, "i")) : undefined;
  const rawMerchant = clean(vpa ? vpa.split("@")[0].replace(/[._-]+/g, " ") : (towards ?? at ?? to ?? from ?? ""));
  const merchant = rawMerchant && !badPayee(rawMerchant) ? (vpa ? rawMerchant : tidyName(rawMerchant)) : undefined;

  const upi = /\b(upi|vpa|gpay|google pay|phonepe|paytm|bhim)\b/i.test(t);
  const methodCode = /\bphonepe\b/i.test(t) ? "phonepe" : /\b(gpay|google pay)\b/i.test(t) ? "gpay" : /\bpaytm\b/i.test(t) ? "paytm" : /\bbhim\b/i.test(t) ? "bhim" : upi ? "upi"
    : /\bcredit card\b/i.test(t) ? "credit_card" : /\bdebit card\b/i.test(t) ? "debit_card" : /\bcard\b/i.test(t) ? "debit_card"
    : /\bneft\b/i.test(t) ? "neft" : /\bimps\b/i.test(t) ? "imps" : /\brtgs\b/i.test(t) ? "rtgs" : /\b(net ?banking|netbanking)\b/i.test(t) ? "net_banking"
    : /\batm\b|\bcash withdrawal\b/i.test(t) ? "cash" : undefined;
  const channel = methodCode ? (methodCode === "cash" ? "offline" : "online") : undefined;
  const date = findDate(t);
  const score = (merchant ? 1 : 0) + (date ? 1 : 0) + (methodCode ? 1 : 0);
  return { ok: true, type, amount, date, merchant, methodCode, channel, ref, confidence: score >= 3 ? "high" : score >= 2 ? "medium" : "low" };
}
