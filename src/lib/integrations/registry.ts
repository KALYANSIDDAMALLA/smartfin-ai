/** Provider adapter registry. An adapter is "available" only if its env credentials exist AND it implements connect(). No adapter is implemented yet, so none can be connected — we never fake connectivity. */
export interface ProviderInfo { id: string; name: string; category: string; description: string; dataAccessed: string[]; envVars: string[]; implemented: boolean; blocker: string }
export const PROVIDERS: ProviderInfo[] = [
  { id: "account_aggregator", name: "Bank accounts via Account Aggregator (India)", category: "Bank-data access", description: "Consent-based sharing of bank statements through an RBI-regulated Account Aggregator.",
    dataAccessed: ["Account summary", "Transactions for the consented date range"], envVars: ["SETU_CLIENT_ID", "SETU_CLIENT_SECRET", "SETU_PRODUCT_INSTANCE_ID"], implemented: true,
    blocker: "Needs Setu (Account Aggregator provider) credentials: create a free sandbox FIU on Setu Bridge. Going live needs Setu production approval." },
  { id: "accounting_export", name: "Accounting software", category: "Accounting", description: "Future sync with supported accounting providers.", dataAccessed: ["Categorised transactions (export only)"], envVars: ["ACCOUNTING_CLIENT_ID", "ACCOUNTING_CLIENT_SECRET"], implemented: false, blocker: "No provider selected; requires provider developer approval." },
];
export const isConfigured = (p: ProviderInfo) => p.envVars.every((v) => !!process.env[v]);
export const isAvailable = (p: ProviderInfo) => p.implemented && isConfigured(p);
