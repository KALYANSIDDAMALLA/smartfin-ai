import { badPayee, findDate, stripBoilerplate, tidyName } from "./sms";

/**
 * Built-in reader for plain-English payment notes ("paid 250 to Ravi for lunch yesterday via GPay", "got 9000 from client for logo design on 5th Nov").
 * Deterministic and offline. It never guesses an amount: the number must be unambiguous, otherwise it fails and says why.
 */
export interface FreeText {
  ok: boolean; reason?: string; type?: "expense" | "income"; amount?: string; date?: string; time?: string; merchant?: string; name?: string; purpose?: string;
  methodCode?: string; channel?: "online" | "offline"; ref?: string; tags: string[]; confidence: "high" | "medium" | "low";
}

const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const pad = (n: number) => String(n).padStart(2, "0");
const addDays = (ymd: string, n: number) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const dow = (ymd: string) => new Date(ymd + "T00:00:00Z").getUTCDay();
const mult = (s?: string) => { const u = (s ?? "").toLowerCase(); return u === "k" ? 1e3 : /^(l|lakh|lakhs|lac|lacs)$/.test(u) ? 1e5 : /^(cr|crore|crores)$/.test(u) ? 1e7 : 1; };

/** HH:MM (24h) of the first time in the text: "14:32", "2:30 pm", "2.30pm", "3 pm". A bare "2.30" is an amount, not a time. */
export function findTime(t: string): string | undefined {
  for (const m of t.matchAll(/\b(\d{1,2})[:.](\d{2})(?::\d{2})?\s*([ap])\.?m\b\.?|\b(\d{1,2}):(\d{2})(?::\d{2})?\b|\b(\d{1,2})\s*([ap])\.?m\b\.?/gi)) {
    let h: number, min: number, ap: string | undefined;
    if (m[1]) { h = +m[1]; min = +m[2]; ap = m[3]; } else if (m[4]) { h = +m[4]; min = +m[5]; } else { h = +m[6]; min = 0; ap = m[7]; }
    if (ap) { const pm = ap.toLowerCase() === "p"; if (h < 1 || h > 12) continue; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
    if (h > 23 || min > 59) continue; return `${pad(h)}:${pad(min)}`;
  }
}

function relativeDate(t: string, today: string): string | undefined {
  const s = t.toLowerCase();
  if (/\bday before yesterday\b/.test(s)) return addDays(today, -2);
  if (/\byesterday\b/.test(s)) return addDays(today, -1);
  if (/\btoday\b|\bthis morning\b|\btonight\b|\bthis evening\b/.test(s)) return today;
  let m = /\b(\d{1,2}) days? ago\b/.exec(s); if (m) return addDays(today, -Number(m[1]));
  m = new RegExp(`\\b(?:last|on|this past)?\\s*(${DAYS.join("|")})\\b`).exec(s);
  if (m) { const back = (dow(today) - DAYS.indexOf(m[1]) + 7) % 7 || 7; return addDays(today, -back); }
  m = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MON.join("|")})[a-z]*\\b(?!\\s*,?\\s*\\d{2,4})`).exec(s) ?? new RegExp(`\\b(${MON.join("|")})[a-z]*\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?!\\s*,?\\s*\\d{2,4})`).exec(s);
  if (m) { const [day, mon] = /^\d/.test(m[1]) ? [+m[1], MON.indexOf(m[2])] : [+m[2], MON.indexOf(m[1])]; let y = +today.slice(0, 4); let c = `${y}-${pad(mon + 1)}-${pad(day)}`; if (c > today) c = `${--y}-${pad(mon + 1)}-${pad(day)}`; if (new Date(c + "T00:00:00Z").getUTCDate() === day) return c; }
  m = /\bon the (\d{1,2})(?:st|nd|rd|th)\b|\bon (\d{1,2})(?:st|nd|rd|th)\b/.exec(s);
  if (m) { const day = +(m[1] ?? m[2]); let y = +today.slice(0, 4), mo = +today.slice(5, 7); let c = `${y}-${pad(mo)}-${pad(day)}`; if (c > today) { mo -= 1; if (!mo) { mo = 12; y -= 1; } c = `${y}-${pad(mo)}-${pad(day)}`; } if (new Date(c + "T00:00:00Z").getUTCDate() === day) return c; }
}

const METHODS: [RegExp, string][] = [[/\bphone ?pe\b/i, "phonepe"], [/\b(gpay|google ?pay|g pay)\b/i, "gpay"], [/\bpaytm\b/i, "paytm"], [/\bbhim\b/i, "bhim"], [/\bupi\b/i, "upi"],
  [/\bcredit ?card\b|\bcc\b/i, "credit_card"], [/\bdebit ?card\b/i, "debit_card"], [/\bcard\b/i, "debit_card"], [/\bneft\b/i, "neft"], [/\bimps\b/i, "imps"], [/\brtgs\b/i, "rtgs"],
  [/\bnet ?banking\b/i, "net_banking"], [/\bwallet\b/i, "wallet"], [/\b(cash|in hand|by hand)\b/i, "cash"]];
const TAGS: [RegExp, string][] = [[/\bemi\b/i, "emi"], [/\brent\b/i, "rent"], [/\b(subscription|netflix|spotify|prime|hotstar)\b/i, "subscription"], [/\b(bill|electricity|water|gas)\b/i, "bill"],
  [/\brecharge\b/i, "recharge"], [/\bgift\b/i, "gift"], [/\breimburs/i, "reimbursable"], [/\b(office|work|client|business)\b/i, "work"], [/\b(trip|flight|hotel|travel)\b/i, "travel"],
  [/\b(salary|bonus)\b/i, "salary"], [/\b(grocer|vegetable|supermarket)/i, "groceries"], [/\b(medicine|doctor|hospital|pharmacy)\b/i, "health"], [/\bcashback\b/i, "cashback"]];
const NOT_NAMES = /^(me|my|you|him|her|them|us|it|the|a|an|this|that|self|myself|someone|somebody|one|home)$/i;
const STOP = "(?=\\s+(?:for|via|using|on|by|yesterday|today|tomorrow|last|this|at|from|to|in|through|thru|towards|with|and|ref|around|about|paid)\\b|[,.;!?()]|$)";
const title = (s: string) => (s === s.toLowerCase() ? s.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s).slice(0, 60);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function parseFreeText(raw: string, today: string, hint: "expense" | "income" = "expense"): FreeText {
  const t = raw.replace(/\s+/g, " ").trim(); const empty = { tags: [] as string[], confidence: "low" as const };
  if (t.length < 3) return { ok: false, reason: "Type a few words, like “paid 250 to Ravi for lunch”.", ...empty };
  if (/\b(otp|one[- ]time password|verification code)\b/i.test(t)) return { ok: false, reason: "That looks like an OTP message, not a payment.", ...empty };

  // Hide things that look like numbers but aren't the amount: dates, times, ordinals, long reference numbers.
  const work = t.replace(/\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b|\b\d{1,2}[-/. ][A-Za-z]{3}[a-z]*[-/. ,]*\d{2,4}\b/g, " ")
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?m\b\.?)?|\b\d{1,2}\.\d{2}\s*[ap]\.?m\b\.?|\b\d{1,2}\s*[ap]\.?m\b\.?/gi, " ").replace(/\b\d{1,3}(?:st|nd|rd|th)\b/gi, " ").replace(/\b\d{9,}\b/g, " ")
    .replace(/\b(\d{1,2})\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi, " ").replace(/\b\d+\s+days?\s+ago\b/gi, " ");
  const num = (n: string, u?: string) => Number(n.replace(/,/g, "")) * mult(u);
  const grab = (re: RegExp, a = 1, b = 2) => [...work.matchAll(re)].map((m) => num(m[a], m[b])).filter((v) => v > 0 && Number.isFinite(v));
  const currency = [...grab(/(?:₹|\brs\.?|\binr)\s*([\d,]+(?:\.\d+)?)\s*(k|lakhs?|lacs?|l|cr(?:ores?)?)?\b/gi), ...grab(/\b([\d,]+(?:\.\d+)?)\s*(k|lakhs?|lacs?|l|cr(?:ores?)?)?\s*(?:rs\b|inr\b|rupees\b|\/-)/gi)];
  const verbed = grab(/\b(?:paid|pay|spent|spend|got|received|earned|sent|gave|cost|costs|charged|worth|credited|debited|for|of)\s+(?:rs\.?\s*|₹\s*)?([\d,]+(?:\.\d+)?)\s*(k|lakhs?|lacs?|l|cr(?:ores?)?)?\b(?!\s*(?:%|days?|months?|years?|items?|pcs|pieces|kg|km|people|persons|x\b))/gi);
  const bare = grab(/(?<![\w.₹])([\d][\d,]*(?:\.\d+)?)\s*(k|lakhs?|lacs?)?(?![\w%.]\w)(?!\s*(?:%|days?|months?|years?|items?|pcs|pieces|kg|km|people))/gi);
  const uniq = (a: number[]) => [...new Set(a)];
  let value: number | undefined; let sure = true;
  if (currency.length) value = currency[0]; else if (uniq(verbed).length === 1) value = verbed[0]; else if (uniq(verbed).length > 1) return { ok: false, reason: "I found more than one amount — add the ₹ sign to the right one.", ...empty };
  else if (uniq(bare).length === 1) { value = bare[0]; sure = false; } else if (uniq(bare).length > 1) return { ok: false, reason: "I found several numbers — add the ₹ sign to the amount.", ...empty };
  if (!value) return { ok: false, reason: "Couldn't find an amount (like 250 or ₹1,200).", ...empty };
  if (value > 100_000_000_000) return { ok: false, reason: "That amount looks too large.", ...empty };

  const incomeWord = /\b(received|recieved|got|earned|credited|salary|income|sold|paid me|bonus|cashback|interest|dividend|payment from|came from)\b/i.test(t);
  const expenseWord = /\b(paid|pay|spent|spend|bought|buy|purchased|ordered|bill|recharge|rent|emi|sent|gave|debited|charged|subscription|booked)\b/i.test(t) && !/\bpaid me\b/i.test(t);
  const type: "expense" | "income" = incomeWord && !expenseWord ? "income" : expenseWord && !incomeWord ? "expense" : incomeWord && expenseWord ? (/\b(received|got|earned|credited|paid me)\b/i.test(t) ? "income" : "expense") : hint;
  const typeKnown = incomeWord || expenseWord;

  const date = findDate(t) ?? relativeDate(t, today); const time = findTime(t);
  const method = METHODS.find(([re]) => re.test(t))?.[1]; const channel = method ? (method === "cash" ? "offline" : "online") as "online" | "offline" : undefined;
  const ref = /\b(?:upi\s*)?ref(?:erence)?(?:\s*(?:no|number|id))?\.?\s*[:#-]?\s*(\d{9,18})\b/i.exec(t)?.[1];

  let merchant: string | undefined;
  for (const m of stripBoilerplate(t).matchAll(new RegExp(`\\b(?:towards|in favou?r of|beneficiary|payee|to|at|from|with)\\s+(.+?)${STOP}`, "gi"))) {
    const c = m[1].trim().replace(/^(?:my|the|a|an)\s+/i, ""); const first = c.split(" ")[0];
    if (!c || NOT_NAMES.test(c) || badPayee(c) || /^(?:a\/c|ac|acct|account|card|xx+\d|x{2,}|\*+\d)/i.test(c) || /\bxx+\d{2,}/i.test(c) || c.split(" ").length > 4 || /^\d/.test(c) || /^(?:upi|gpay|phonepe|paytm|cash|card|neft|imps|rtgs|bhim)\b/i.test(c) || MON.includes(first.toLowerCase().slice(0, 3)) && /^[a-z]+$/i.test(first) && first.length <= 9 && MON.some((x) => first.toLowerCase().startsWith(x)) && /\d/.test(t.slice(t.indexOf(c)))) continue;
    merchant = tidyName(title(c.replace(/[@].*$/, ""))); break;
  }
  const purpose = /\bfor\s+(.+?)(?=\s+(?:via|using|on|at|yesterday|today|by|from|with|to|last|this|ref)\b|[,.;!?()]|$)/i.exec(t)?.[1]?.trim();
  const lead = /^([A-Za-z][A-Za-z&'-]*(?: [A-Za-z&'-]+){0,3}?)\s+(?:₹\s*|rs\.?\s*|inr\s*)?\d/i.exec(t)?.[1]?.trim();
  const leadOk = lead && !/^(?:paid|pay|spent|spend|got|received|recieved|earned|bought|buy|sent|gave|credited|debited|rs|inr|from|to|at|for|on|rs\.?)\b/i.test(lead) ? cap(lead.slice(0, 60)) : undefined;
  const purposeOk = purpose && !/^[\d₹]/.test(purpose) && !NOT_NAMES.test(purpose) && purpose.split(" ").length <= 6 ? cap(purpose.slice(0, 80)) : undefined;
  const purposeName = purposeOk ?? leadOk; const name = purposeName ?? merchant;
  const tags = [...new Set(TAGS.filter(([re]) => re.test(t)).map(([, tag]) => tag))].slice(0, 5);

  const score = (sure ? 1 : 0) + (typeKnown ? 1 : 0) + (name ? 1 : 0) + (date || method ? 1 : 0);
  return { ok: true, type, amount: value.toFixed(2), date, time, merchant, name, purpose: purposeName, methodCode: method, channel, ref, tags, confidence: score >= 4 ? "high" : score >= 3 ? "medium" : "low" };
}
