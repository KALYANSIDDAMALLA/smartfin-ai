import { normalizeText } from "../imports/dedupe";
import { localDate, presetRange, previousRange } from "./dates";

export interface SearchCtx { categories: { id: string; name: string; kind: string }[]; methods: { id: string; code: string; label: string; channel: "online" | "offline" }[]; today?: Date; tz?: string }
export interface ParsedSearch { q: string; type?: string; cat?: string; method?: string; channel?: string; from?: string; to?: string; min?: number; max?: number; chips: string[] }

const addDays = (ymd: string, n: number) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const METHOD_WORDS: Record<string, string[]> = { upi: ["upi"], gpay: ["gpay", "google pay"], phonepe: ["phonepe"], paytm: ["paytm"], cash: ["cash"], credit_card: ["credit card"], debit_card: ["debit card"], net_banking: ["netbanking", "net banking"], neft: ["neft"], imps: ["imps"], rtgs: ["rtgs"] };

/** Turns a plain-English query ("swiggy over 500 last month", "cash groceries this year") into filters + leftover search text. Deterministic. */
export function parseSearchQuery(input: string, ctx: SearchCtx): ParsedSearch {
  let t = ` ${normalizeText(input)} `; const out: ParsedSearch = { q: "", chips: [] }; const tz = ctx.tz ?? "Asia/Kolkata"; const now = ctx.today ?? new Date();
  const take = (re: RegExp): RegExpExecArray | null => { const m = re.exec(t); if (m) t = t.replace(m[0], " "); return m; };
  // amounts
  let m = take(/\b(?:over|above|more than|greater than|at least|min)\s+(?:rs |inr )?(\d[\d,]*(?:\.\d+)?)\b/); if (m) { out.min = Number(m[1].replace(/,/g, "")); out.chips.push(`≥ ₹${out.min}`); }
  m = take(/\b(?:under|below|less than|at most|max)\s+(?:rs |inr )?(\d[\d,]*(?:\.\d+)?)\b/); if (m) { out.max = Number(m[1].replace(/,/g, "")); out.chips.push(`≤ ₹${out.max}`); }
  // periods
  const today = localDate(now, tz); const setRange = (from: string, to: string, label: string) => { out.from = from; out.to = to; out.chips.push(label); };
  const rng = (preset: "today" | "week" | "month" | "year", prev: boolean, label: string) => {
    let r = presetRange(preset, now, tz); if (prev) r = previousRange(r, preset, tz); setRange(localDate(r.start, tz), localDate(new Date(r.end.getTime() - 1), tz), label);
  };
  if ((m = take(/\blast (\d{1,3}) days?\b/))) setRange(addDays(today, -(Number(m[1]) - 1)), today, `last ${m[1]} days`);
  else if (take(/\byesterday\b/)) setRange(addDays(today, -1), addDays(today, -1), "yesterday");
  else if (take(/\btoday\b/)) rng("today", false, "today");
  else if (take(/\blast week\b/)) rng("week", true, "last week"); else if (take(/\bthis week\b/)) rng("week", false, "this week");
  else if (take(/\blast month\b/)) rng("month", true, "last month"); else if (take(/\bthis month\b/)) rng("month", false, "this month");
  else if (take(/\blast year\b/)) rng("year", true, "last year"); else if (take(/\bthis year\b/)) rng("year", false, "this year");
  // type / channel
  if (take(/\b(income|earned|received|salary|credited)\b/)) { out.type = "income"; out.chips.push("income"); }
  else if (take(/\b(refunds?)\b/)) { out.type = "refund"; out.chips.push("refunds"); }
  else if (take(/\b(transfers?)\b/)) { out.type = "transfer"; out.chips.push("transfers"); }
  else if (take(/\b(expenses?|spent|spending|paid|payments?)\b/)) { out.type = "expense"; out.chips.push("expenses"); }
  if (take(/\bonline\b/)) { out.channel = "online"; out.chips.push("online"); } else if (take(/\boffline\b/)) { out.channel = "offline"; out.chips.push("offline"); }
  // payment method (longest phrase first)
  for (const [code, words] of Object.entries(METHOD_WORDS)) for (const w of words) { const mt = ctx.methods.find((x) => x.code === code); if (mt && !out.method && t.includes(` ${w} `)) { out.method = mt.id; t = t.replace(` ${w} `, " "); out.chips.push(mt.label); } }
  // category: match a whole category name, else a distinctive word of it (e.g. "groceries" -> Food and groceries)
  const cats = ctx.categories; let cat = cats.find((c) => t.includes(` ${normalizeText(c.name)} `));
  if (!cat) for (const c of cats) { const words = normalizeText(c.name).split(" ").filter((w) => w.length >= 4 && w !== "and" && w !== "other"); const w = words.find((x) => t.includes(` ${x} `)); if (w) { cat = c; t = t.replace(` ${w} `, " "); break; } }
  else t = t.replace(` ${normalizeText(cat.name)} `, " ");
  if (cat) { out.cat = cat.id; out.chips.push(cat.name); }
  out.q = t.replace(/\b(in|on|at|for|from|of|the|my|show|find|all|me|with|by|via|using)\b/g, " ").replace(/\s+/g, " ").trim();
  return out;
}

/** Query string for /transactions. */
export function searchHref(p: ParsedSearch): string {
  const s = new URLSearchParams();
  if (p.q) s.set("q", p.q); if (p.type) s.set("type", p.type); if (p.cat) s.set("cat", p.cat); if (p.method) s.set("method", p.method); if (p.channel) s.set("channel", p.channel);
  if (p.from && p.to) { s.set("range", "custom"); s.set("from", p.from); s.set("to", p.to); } else s.set("range", "year");
  if (p.min != null) s.set("min", String(p.min)); if (p.max != null) s.set("max", String(p.max));
  return `/transactions?${s}`;
}
