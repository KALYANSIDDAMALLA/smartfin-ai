/** Banks people in India commonly use, for the "choose your bank" pickers. Each has its website domain so the picker can show the bank's own icon. */
export interface Bank { id: string; name: string; group: "Popular" | "Public sector" | "Private" | "Small finance & payments banks" | "Other" }
const B = (group: Bank["group"], names: string[]): Bank[] => names.map((name) => ({ id: name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), name, group }));
export const BANKS: Bank[] = [
  ...B("Popular", ["State Bank of India", "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak Mahindra Bank", "Punjab National Bank"]),
  ...B("Public sector", ["Bank of Baroda", "Canara Bank", "Union Bank of India", "Bank of India", "Indian Bank", "Central Bank of India", "UCO Bank", "Indian Overseas Bank", "Bank of Maharashtra", "Punjab & Sind Bank"]),
  ...B("Private", ["IDFC FIRST Bank", "IndusInd Bank", "Yes Bank", "Federal Bank", "RBL Bank", "South Indian Bank", "Karur Vysya Bank", "City Union Bank", "Tamilnad Mercantile Bank", "DCB Bank", "Karnataka Bank", "Jammu & Kashmir Bank", "Dhanlaxmi Bank", "CSB Bank"]),
  ...B("Small finance & payments banks", ["AU Small Finance Bank", "Equitas Small Finance Bank", "Ujjivan Small Finance Bank", "Bandhan Bank", "Jana Small Finance Bank", "Paytm Payments Bank", "Airtel Payments Bank", "India Post Payments Bank", "Fino Payments Bank", "Jio Payments Bank"]),
  { id: "other", name: "Other bank", group: "Other" },
];
export const bankById = (id: string) => BANKS.find((b) => b.id === id);

/** Website of each bank, used only to look up its icon. */
const DOMAINS: Record<string, string> = {
  "state-bank-of-india": "sbi.co.in", "hdfc-bank": "hdfcbank.com", "icici-bank": "icicibank.com", "axis-bank": "axisbank.com", "kotak-mahindra-bank": "kotak.com", "punjab-national-bank": "pnbindia.in",
  "bank-of-baroda": "bankofbaroda.in", "canara-bank": "canarabank.com", "union-bank-of-india": "unionbankofindia.co.in", "bank-of-india": "bankofindia.co.in", "indian-bank": "indianbank.in", "central-bank-of-india": "centralbankofindia.co.in",
  "uco-bank": "ucobank.com", "indian-overseas-bank": "iob.in", "bank-of-maharashtra": "bankofmaharashtra.in", "punjab-and-sind-bank": "psbindia.com",
  "idfc-first-bank": "idfcfirstbank.com", "indusind-bank": "indusind.com", "yes-bank": "yesbank.in", "federal-bank": "federalbank.co.in", "rbl-bank": "rblbank.com", "south-indian-bank": "southindianbank.com", "karur-vysya-bank": "kvb.co.in",
  "city-union-bank": "cityunionbank.com", "tamilnad-mercantile-bank": "tmb.in", "dcb-bank": "dcbbank.com", "karnataka-bank": "karnatakabank.com", "jammu-and-kashmir-bank": "jkbank.com", "dhanlaxmi-bank": "dhanbank.com", "csb-bank": "csb.co.in",
  "au-small-finance-bank": "aubank.in", "equitas-small-finance-bank": "equitasbank.com", "ujjivan-small-finance-bank": "ujjivansfb.in", "bandhan-bank": "bandhanbank.com", "jana-small-finance-bank": "janabank.com",
  "paytm-payments-bank": "paytmbank.com", "airtel-payments-bank": "airtelbank.com", "india-post-payments-bank": "ippbonline.com", "fino-payments-bank": "finobank.com", "jio-payments-bank": "jiopaymentsbank.com",
};
/**
 * The bank's own icon, from Google's public icon service (no key; `fallback_opts` makes it answer "not found" instead of a generic globe). It is only requested when a bank picker or list is shown, and the browser is told not to send
 * the page address along. If the service has no icon for a bank, the picture fails to load and the screen falls back to its coloured building icon.
 */
export const bankLogoUrl = (id: string) => (DOMAINS[id] ? `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${DOMAINS[id]}&size=128` : undefined);
/** Finds the bank from a name like "HDFC Bank" or an account label like "HDFC Bank ••4321 (Current)". */
export const bankFromName = (label: string) => { const l = label.trim().toLowerCase(); return BANKS.find((b) => b.id !== "other" && l.startsWith(b.name.toLowerCase())); };
/** A stable colour for a bank's tile (0–359), so each bank always looks the same. */
export const bankHue = (name: string) => { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

export const ACCOUNT_TYPES = { savings: "Savings account", current: "Current account", credit_card: "Credit card", wallet: "Wallet", cash: "Cash" } as const;
export type AccountType = keyof typeof ACCOUNT_TYPES;
/** The account's database kind (savings and current are both "bank"). */
export const kindOf = (t: AccountType) => (t === "savings" || t === "current" ? "bank" : t);

/** How the account is named in lists and in the transfer picker: your nickname if you gave one, otherwise "HDFC Bank ••4321 (Current)". */
export function accountName(o: { bank: string; type: AccountType; last4?: string; nickname?: string }): string {
  const nick = o.nickname?.trim(); if (nick) return nick.slice(0, 100);
  if (o.type === "cash") return "Cash";
  const base = `${o.bank}${o.last4 ? ` ••${o.last4}` : ""}`; const suffix = o.type === "current" ? " (Current)" : o.type === "credit_card" ? " (Credit card)" : o.type === "wallet" ? " (Wallet)" : "";
  return (base + suffix).slice(0, 100);
}
