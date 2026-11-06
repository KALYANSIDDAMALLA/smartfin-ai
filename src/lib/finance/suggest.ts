import { normalizeText } from "../imports/dedupe";

export interface PastTx { merchant?: string | null; name?: string | null; categoryId?: string | null; paymentMethodId?: string | null; channel?: "online" | "offline" | null }
export interface Suggestion {
  categoryId?: string; paymentMethodId?: string; channel?: "online" | "offline";
  confidence: number; source: "history" | "rules" | "ai"; reason: string;
}

const key = (t: PastTx) => normalizeText(t.merchant || t.name);
const tally = (xs: (string | null | undefined)[]) => { const m = new Map<string, number>(); xs.forEach((x) => x && m.set(x, (m.get(x) ?? 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]); };

/** Learns from the user's own past transactions: same/similar merchant → its usual category, method and channel. */
export function suggestFromHistory(history: PastTx[], text: string): Suggestion | null {
  const t = normalizeText(text); if (t.length < 3) return null;
  const hits = history.filter((h) => { const k = key(h); return k.length >= 3 && (k === t || k.includes(t) || t.includes(k)); });
  if (!hits.length) return null;
  const cats = tally(hits.map((h) => h.categoryId)); const meths = tally(hits.map((h) => h.paymentMethodId)); const chans = tally(hits.map((h) => h.channel));
  const n = hits.length; const sizeFactor = n >= 3 ? 0.97 : n === 2 ? 0.85 : 0.7;
  const out: Suggestion = { confidence: 0, source: "history", reason: `based on ${n} similar past ${n === 1 ? "entry" : "entries"}` };
  let conf = 0;
  if (cats[0]) { out.categoryId = cats[0][0]; conf = (cats[0][1] / hits.filter((h) => h.categoryId).length) * sizeFactor; }
  // Only suggest a method/channel when it is clearly the habit (>= 2/3 of the entries that have one).
  if (meths[0] && meths[0][1] / meths.reduce((a, b) => a + b[1], 0) >= 2 / 3) out.paymentMethodId = meths[0][0];
  if (chans[0] && chans[0][1] / chans.reduce((a, b) => a + b[1], 0) >= 2 / 3) out.channel = chans[0][0] as "online" | "offline";
  if (!out.categoryId && !out.paymentMethodId && !out.channel) return null;
  out.confidence = Math.round((out.categoryId ? conf : 0.6) * 100) / 100; return out;
}

/** Well-known Indian merchants/words → category NAME (resolved against the user's own categories). */
const RULES: { cat: string; kind: "expense" | "income"; words: string[]; strong?: boolean }[] = [
  { cat: "Food and groceries", kind: "expense", strong: true, words: ["swiggy", "zomato", "bigbasket", "blinkit", "zepto", "instamart", "dmart", "dominos", "pizza hut", "mcdonald", "kfc", "burger king", "starbucks", "cafe coffee day", "restaurant", "grocery", "supermarket", "bakery", "hotel"] },
  { cat: "Transportation", kind: "expense", strong: true, words: ["uber", "ola cabs", "ola ", "rapido", "namma metro", "metro rail", "fastag", "petrol", "diesel", "fuel", "hpcl", "bpcl", "indian oil", "iocl", "shell"] },
  { cat: "Travel", kind: "expense", strong: true, words: ["irctc", "makemytrip", "goibibo", "cleartrip", "indigo", "air india", "vistara", "redbus", "oyo", "airbnb", "yatra", "ixigo"] },
  { cat: "Shopping", kind: "expense", strong: true, words: ["amazon", "flipkart", "myntra", "ajio", "nykaa", "meesho", "tata cliq", "reliance digital", "croma", "decathlon", "lifestyle", "pantaloons"] },
  { cat: "Subscriptions", kind: "expense", strong: true, words: ["netflix", "spotify", "hotstar", "prime video", "youtube premium", "sonyliv", "zee5", "apple music", "icloud", "google one", "subscription", "linkedin premium"] },
  { cat: "Entertainment", kind: "expense", words: ["bookmyshow", "pvr", "inox", "cinema", "movie", "gaming", "steam", "concert"] },
  { cat: "Utilities", kind: "expense", words: ["electricity", "bescom", "tneb", "mseb", "tata power", "adani electricity", "airtel", "jio", "vodafone", "vi recharge", "bsnl", "broadband", "act fibernet", "water bill", "gas bill", "piped gas", "recharge", "dth", "tata play"] },
  { cat: "Healthcare", kind: "expense", words: ["apollo", "pharmacy", "medplus", "pharmeasy", "1mg", "practo", "hospital", "clinic", "diagnostic", "lab test", "dental", "doctor"] },
  { cat: "Education", kind: "expense", words: ["udemy", "coursera", "byju", "unacademy", "school fee", "college", "tuition", "exam fee", "university", "upgrad"] },
  { cat: "Rent", kind: "expense", words: ["rent", "landlord", "house rent", "pg rent"] },
  { cat: "Insurance", kind: "expense", words: ["lic ", "insurance", "policybazaar", "hdfc life", "icici prudential", "star health", "premium paid"] },
  { cat: "Loan payments", kind: "expense", words: ["emi", "loan", "bajaj finserv", "credit card bill"] },
  { cat: "Salary", kind: "income", words: ["salary", "payroll", "wages"] },
  { cat: "Freelance", kind: "income", words: ["freelance", "consulting", "invoice payment"] },
  { cat: "Interest", kind: "income", words: ["interest credit", "interest", "fd maturity"] },
  { cat: "Investment", kind: "income", words: ["dividend", "mutual fund redemption", "stock sale", "zerodha", "groww"] },
  { cat: "Rental", kind: "income", words: ["rent received", "tenant"] },
];

/** Deterministic keyword rules. Longest matching word wins; resolves to the user's own category by name. */
/** Everyday words (not just brand names) so plain-English notes like "lunch" or "cab" get a category. */
const EVERYDAY: [string, "expense" | "income", string[]][] = [
  ["Food and groceries", "expense", ["lunch", "dinner", "breakfast", "snack", "snacks", "tea", "coffee", "chai", "groceries", "vegetables", "fruits", "milk", "biryani", "juice", "food", "meal", "bakery", "canteen", "mess"]],
  ["Transportation", "expense", ["cab", "taxi", "auto", "bus", "metro", "parking", "toll", "bike", "commute"]],
  ["Travel", "expense", ["flight", "train", "hotel", "trip", "tickets", "ticket"]],
  ["Shopping", "expense", ["clothes", "shirt", "shoes", "dress", "jeans", "bag", "gadget", "headphones", "purchase"]],
  ["Healthcare", "expense", ["medicine", "medicines", "medical", "checkup", "consultation", "tablet"]],
  ["Personal", "expense", ["salon", "haircut", "spa", "gym", "grooming"]],
  ["Education", "expense", ["books", "course", "fees", "stationery", "classes"]],
  ["Utilities", "expense", ["wifi", "mobile bill", "internet", "dth", "cylinder", "maintenance"]],
  ["Entertainment", "expense", ["party", "outing", "games", "netflix night"]],
  ["Business", "income", ["sales", "sale", "customer", "client payment", "wholesale", "order payment"]],
  ["Interest", "income", ["interest"]], ["Investment", "income", ["dividend", "mutual fund", "stocks"]], ["Gift", "income", ["gift", "birthday money", "allowance"]],
];
for (const [cat, kind, words] of EVERYDAY) { const r = RULES.find((x) => x.cat === cat && x.kind === kind); if (r) r.words.push(...words); else RULES.push({ cat, kind, words: [...words] }); }

export function suggestFromRules(text: string, categories: { id: string; name: string; kind: string }[], kind: "expense" | "income"): Suggestion | null {
  const t = ` ${normalizeText(text)} `; if (t.trim().length < 3) return null;
  let best: { rule: (typeof RULES)[number]; word: string } | null = null;
  for (const rule of RULES) if (rule.kind === kind) for (const w of rule.words) { const nw = normalizeText(w); if (nw && t.includes(` ${nw}`) && (!best || nw.length > best.word.length)) best = { rule, word: nw }; }
  if (!best) return null;
  const cat = categories.find((c) => c.kind === kind && c.name.toLowerCase() === best!.rule.cat.toLowerCase()); if (!cat) return null;
  return { categoryId: cat.id, confidence: best.rule.strong ? 0.88 : 0.78, source: "rules", reason: `“${best.word.trim()}” usually means ${cat.name}` };
}

/** Payment method mentioned in the text itself (e.g. "swiggy upi", "cash at shop"). */
export function methodFromText(text: string, methods: { id: string; code: string }[]): string | undefined {
  const t = normalizeText(text); const has = (re: RegExp) => re.test(t);
  const code = has(/\bphonepe\b/) ? "phonepe" : has(/\bgpay\b|google pay/) ? "gpay" : has(/\bpaytm\b/) ? "paytm" : has(/\bupi\b/) ? "upi" : has(/\bcredit card\b/) ? "credit_card" : has(/\bdebit card\b/) ? "debit_card" : has(/\bcash\b/) ? "cash" : has(/\bnetbanking\b|net banking/) ? "net_banking" : undefined;
  return code ? methods.find((m) => m.code === code)?.id : undefined;
}

const BUSINESS_WORDS = /\b(pvt|ltd|llp|inc|corp|store|stores|mart|traders|trading|enterprises?|hotel|cafe|restaurant|bakery|pharmacy|medical|clinic|hospital|school|college|university|bank|services?|solutions|shop|supermarket|mall|fuel|petrol|gas|electric(?:ity)?|telecom|recharge|insurance|finance|payments?|wallet|travels?|airlines?|motors|agency|institute|academy|foods?|kitchen|sweets|mess|canteen|salon|spa|gym|studio|labs?|tech|technologies|systems|retail|wholesale|distributors?|marketplace|\.com|\.in)\b|@|\d/i;
/** True for a name that reads like an individual ("Edunuri Varshitha", "Ravi Kumar"), not a business or brand. */
export function looksLikePerson(name?: string | null): boolean {
  const n = (name ?? "").trim(); if (!n || n.length > 40 || BUSINESS_WORDS.test(n)) return false;
  const words = n.split(/\s+/); return words.length >= 1 && words.length <= 4 && words.every((w) => /^[A-Za-z][A-Za-z.'-]*$/.test(w));
}
/** Name of the category for payments to / from individuals. */
export const PERSON_CATEGORY = "Person";
const personCat = (categories: { id: string; name: string; kind: string }[], kind: "expense" | "income") => categories.find((x) => x.kind === kind && x.name.toLowerCase() === PERSON_CATEGORY.toLowerCase());

/** Single words that are never a person's name in a narration: generic words, wallets/apps and well-known brands. */
const NOT_A_PERSON = new Set(("self own my your me the account accounts card cash bank atm payment payments transfer upi imps neft rtgs refund reversal interest charges charge fee fees salary rent emi loan bill bills recharge purchase pos sent received paid pay credit debit " +
  "paytm phonepe gpay googlepay bharatpe amazon flipkart swiggy zomato uber ola rapido netflix spotify hotstar jio airtel vi bsnl irctc redbus makemytrip zepto blinkit bigbasket dmart myntra ajio nykaa lenskart meesho cred razorpay phonepay").split(" "));

/**
 * The person's name in a bank narration, wherever it is: "UPI/TALLAM LAXMI/562304193419/Payment from PhonePe", "IMPS/123456789012/RAVI KUMAR/…",
 * "UPI-RAVI KUMAR-ravi@okaxis-…", or free text such as "Transfer to RAVI KUMAR" / "Received from Suresh Babu". It must read like a person's name
 * (no business words, brands or digits). On UPI/IMPS lines a one-word name counts too; elsewhere two or more words are needed.
 */
export function personFromNarration(text?: string | null): string | null {
  const t = (text ?? "").trim(); if (!t) return null;
  const ok = (n: string, minWords: number) => { const words = n.split(/\s+/); return words.length >= minWords && !/[@\d]/.test(n) && looksLikePerson(n) && !words.some((w) => NOT_A_PERSON.has(w.toLowerCase().replace(/[^a-z]/g, ""))); };
  const m = /^(UPI|IMPS|NEFT|RTGS)\b/i.exec(t);
  if (m) { // structured: the first part after the payment type that is not just a number
    const parts = t.split(t.includes("/") ? "/" : "-").map((p) => p.trim()).slice(1); const name = parts.find((p) => /[A-Za-z]/.test(p) && !/^\d+$/.test(p));
    if (name && ok(name, /^(UPI|IMPS)$/i.test(m[1]) ? 1 : 2)) return name;
  }
  // free text: "to Ravi Kumar", "from SURESH BABU", "by Anita Rao"
  for (const f of t.matchAll(/\b(?:to|from|by)\s+(?=([A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*){1,3}))/gi)) { const cand = f[1].replace(/\s+(?:on|via|at|for|ref|using|through|a\/c)\b.*$/i, "").trim(); if (ok(cand, 2)) return cand; }
  return null;
}
/** A payment to/from an individual (named in the bank narration) → the "Person" category, when no history or rule said otherwise. */
export function personSuggestion(text: string | null | undefined, categories: { id: string; name: string; kind: string }[], kind: "expense" | "income"): Suggestion | null {
  const name = personFromNarration(text); const c = name ? personCat(categories, kind) : undefined;
  return c && name ? { categoryId: c.id, confidence: 0.7, source: "rules", reason: `“${name}” looks like a person` } : null;
}
/** A payment to an individual when nothing says what it was for: the "Person" category (or "Other" if that does not exist yet). Never overrides a real match. */
export function personFallback(categories: { id: string; name: string; kind: string }[], kind: "expense" | "income", merchant?: string | null): { categoryId: string; reason: string } | null {
  if (!looksLikePerson(merchant)) return null;
  const c = personCat(categories, kind) ?? categories.find((x) => x.kind === kind && x.name.toLowerCase() === "other");
  return c ? { categoryId: c.id, reason: `Payment to an individual (${merchant}) — set to “${c.name}”; change it if it was for something specific.` } : null;
}
