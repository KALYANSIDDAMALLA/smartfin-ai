const BANKS: [RegExp, string, string][] = [[/\bkotak/i, "kotak", "Kotak"], [/\bhdfc/i, "hdfc", "HDFC"], [/\bicici/i, "icici", "ICICI"], [/\bsbi\b|state bank/i, "sbi", "SBI"], [/\baxis/i, "axis", "Axis"],
  [/\byes bank\b/i, "yes-bank", "Yes Bank"], [/\bidfc/i, "idfc", "IDFC"], [/\bpnb\b/i, "pnb", "PNB"], [/\bcanara/i, "canara", "Canara"], [/\bindusind/i, "indusind", "IndusInd"], [/\bfederal/i, "federal", "Federal"], [/\bunion bank\b/i, "union-bank", "Union Bank"]];

/**
 * Facts-only description and tags for a recognised bank/UPI alert ("UPI payment to Edunuri Varshitha via Kotak", tags upi, kotak).
 * Built only from what was parsed — nothing is guessed about what the payment was for.
 */
export function describeAlert(text: string, p: { type: "expense" | "income"; merchant?: string; methodCode?: string; methodLabel?: string }): { description?: string; tags: string[] } {
  const bank = BANKS.find(([re]) => re.test(text)); const tags = [p.methodCode && !/^(cash)$/.test(p.methodCode) ? p.methodCode.replace(/_/g, "-") : undefined, bank?.[1]].filter(Boolean) as string[];
  if (!p.merchant || !p.methodLabel) return { tags };
  const verb = p.type === "income" ? "received from" : "payment to";
  return { description: `${p.methodLabel} ${p.type === "income" ? "" : ""}${verb} ${p.merchant}${bank ? ` via ${bank[2]}` : ""}`.replace(/\s+/g, " ").trim(), tags };
}
