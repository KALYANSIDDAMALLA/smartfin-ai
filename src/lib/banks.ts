/** Banks people in India commonly use, for the "choose your bank" pickers. Names only; no logos or trademarks are used. */
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
