import "server-only";

/**
 * Setu Account Aggregator (FIU) client — https://docs.setu.co/data/account-aggregator
 * Credentials live only in server env vars. UNVERIFIED against a live sandbox: header names and the /v2 path prefix follow Setu's docs,
 * which are inconsistent in places; confirm with their Postman collection (see docs/ACCOUNT_AGGREGATOR.md).
 */
export class SetuError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }

const cfg = () => ({
  base: (process.env.SETU_BASE_URL ?? "https://fiu-sandbox.setu.co").replace(/\/$/, ""),
  prefix: process.env.SETU_API_PREFIX ?? "/v2",
  id: process.env.SETU_CLIENT_ID, secret: process.env.SETU_CLIENT_SECRET, product: process.env.SETU_PRODUCT_INSTANCE_ID,
});
export const setuConfigured = () => { const c = cfg(); return !!(c.id && c.secret && c.product); };

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const c = cfg(); if (!c.id || !c.secret || !c.product) throw new SetuError(0, "NotConfigured", "Setu credentials are not configured");
  const res = await fetch(`${c.base}${c.prefix}${path}`, {
    method, cache: "no-store", signal: AbortSignal.timeout(15_000), body: body ? JSON.stringify(body) : undefined,
    headers: { "Content-Type": "application/json", "x-client-id": c.id, "x-client-secret": c.secret, "x-product-instance-id": c.product },
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new SetuError(res.status, String(json?.errorCode ?? json?.error?.code ?? "ProviderError"), String(json?.errorMsg ?? json?.error?.message ?? `HTTP ${res.status}`));
  return json as T;
}

export interface SetuConsent { id: string; url: string; status: "PENDING" | "ACTIVE" | "REJECTED" | "REVOKED" | "PAUSED" | "EXPIRED" | string; detail?: { accounts?: { maskedAccNumber?: string; fipId?: string; accType?: string }[] }; accountsLinked?: unknown[] }
export interface SetuSession { id: string; status: "PENDING" | "PARTIAL" | "COMPLETED" | "EXPIRED" | "FAILED" | string; fips?: unknown[] | null }

export const createConsent = (p: { vua: string; from: Date; to: Date; months: number }) =>
  call<SetuConsent>("POST", "/consents", {
    consentDuration: { unit: "MONTH", value: String(p.months) }, vua: p.vua,
    dataRange: { from: p.from.toISOString(), to: p.to.toISOString() }, context: [],
  });
export const getConsent = (id: string) => call<SetuConsent>("GET", `/consents/${encodeURIComponent(id)}?expanded=true`);
export const revokeConsent = (id: string) => call<{ status: string }>("POST", `/consents/${encodeURIComponent(id)}/revoke`);
export const createSession = (p: { consentId: string; from: Date; to: Date }) =>
  call<SetuSession>("POST", "/sessions", { consentId: p.consentId, dataRange: { from: p.from.toISOString(), to: p.to.toISOString() }, format: "json" });
export const getSession = (id: string) => call<SetuSession>("GET", `/sessions/${encodeURIComponent(id)}`);
