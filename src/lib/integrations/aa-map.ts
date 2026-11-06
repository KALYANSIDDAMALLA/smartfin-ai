import type { RawRow } from "../imports/parse";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface AAExtract { rows: RawRow[]; accounts: { masked: string; fipId: string }[]; skipped: number; failedAccounts: number }

/** Flattens a Setu data-session payload into import rows (Date/Description/Debit/Credit/Reference). Defensive about missing fields. */
export function extractAATransactions(session: any): AAExtract {
  const rows: RawRow[] = []; const accounts: AAExtract["accounts"] = []; let skipped = 0; let failedAccounts = 0;
  for (const fip of session?.fips ?? []) for (const acc of fip?.accounts ?? []) {
    const status = acc?.FIstatus ?? acc?.FIStatus ?? acc?.status;
    const account = acc?.data?.account;
    if (!account) { if (status && !["DELIVERED", "READY"].includes(String(status))) failedAccounts++; continue; }
    const masked = String(acc.maskedAccNumber ?? account.maskedAccNumber ?? "XXXX");
    accounts.push({ masked, fipId: String(fip.fipID ?? "") });
    const txns: any[] = account?.transactions?.transaction ?? [];
    for (const t of txns) {
      const amount = Number(t?.amount); const kind = String(t?.type ?? "").toUpperCase();
      const when = String(t?.transactionTimestamp ?? t?.valueDate ?? "");
      if (!(amount > 0) || !["DEBIT", "CREDIT"].includes(kind) || !/^\d{4}-\d{2}-\d{2}/.test(when)) { skipped++; continue; }
      const amt = amount.toFixed(2);
      rows.push({
        Date: when.slice(0, 10), Description: String(t.narration ?? t.mode ?? "").trim().slice(0, 300),
        Debit: kind === "DEBIT" ? amt : "", Credit: kind === "CREDIT" ? amt : "",
        Reference: t.txnId ? `${masked}-${String(t.txnId)}`.slice(0, 100) : "", Account: masked,
      });
    }
  }
  return { rows, accounts, skipped, failedAccounts };
}
export const AA_MAPPING = { date: "Date", description: "Description", debit: "Debit", credit: "Credit", ref: "Reference" } as const;
