"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getUserOrNull } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/ratelimit";
import { notify } from "@/lib/server/notify";
import { stage } from "@/lib/server/staging";
import { createConsent, createSession, getConsent, getSession, revokeConsent, setuConfigured, SetuError } from "@/lib/integrations/setu";
import { AA_MAPPING, extractAATransactions } from "@/lib/integrations/aa-map";
import { bankById } from "@/lib/banks";
import { DEMO_BANK, sampleBankRows } from "@/lib/integrations/demo";
import type { FormState } from "./auth";

const PROVIDER = "account_aggregator";
const SCOPES = ["account_summary", "transactions"];
const CONSENT_MONTHS = 12;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const providerErr = (e: unknown): FormState => {
  if (e instanceof SetuError) {
    console.error("setu:", e.status, e.code, e.message);
    if (e.code === "NotConfigured") return { error: "Bank connections aren't configured on this server." };
    if (e.status === 404) return { error: "The provider couldn't find that consent." };
    // 4xx other than 404/429 means the request or the app's provider settings are wrong: retrying won't help, so don't say so.
    if (e.status >= 400 && e.status < 500 && e.status !== 429) return { error: "Bank linking isn't fully set up yet, so this bank can't be linked right now. You can import a statement or try the demo bank instead." };
    return { error: "The bank-data provider is busy or unavailable. Please try again in a few minutes." };
  }
  console.error("integration error", (e as Error).message); return { error: "Something went wrong. Please try again." };
};

async function ownConnection(a: NonNullable<Awaited<ReturnType<typeof getUserOrNull>>>, id: string) {
  const { data } = await a.supabase.from("integration_connections").select("*").eq("id", id).eq("provider", PROVIDER).maybeSingle(); // RLS also scopes to the caller
  return data;
}

/** Step 1: ask the provider for a consent request and send the user to the provider's consent screen. Never asks for bank credentials. */
export async function connectBank(_: FormState, fd: FormData): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  if (!setuConfigured()) return { error: "Bank connections aren't configured on this server." };
  if (!rateLimit(`aa-connect:${a.user.id}`, 5, 60 * 60_000).ok) return { error: "Too many attempts. Try again later." };
  if (fd.get("agree") !== "on") return { error: "Please tick the box to give your consent." };
  const mobile = z.string().transform((v) => v.replace(/[\s+-]/g, "").replace(/^91(?=\d{10}$)/, "")).pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter the 10-digit mobile number linked to your bank")).safeParse(fd.get("mobile"));
  if (!mobile.success) return { error: mobile.error.issues[0].message };
  const bank = bankById(String(fd.get("bank") ?? "")); if (!bank) return { error: "Choose your bank from the list." };
  const to = new Date(); const from = new Date(to); from.setUTCMonth(from.getUTCMonth() - CONSENT_MONTHS);
  let consent; try { consent = await createConsent({ vua: mobile.data, from, to, months: CONSENT_MONTHS }); } catch (e) { return providerErr(e); }
  const id = randomUUID();
  const { error } = await a.supabase.from("integration_connections").insert({ id, user_id: a.user.id, provider: PROVIDER, status: "pending_consent", external_id: consent.id, meta: { bank: bank.name, mobileLast4: mobile.data.slice(-4), rangeFrom: from.toISOString(), rangeTo: to.toISOString() } });
  if (error) return { error: "Could not save the connection." };
  revalidatePath("/integrations");
  redirect(consent.url); // provider-hosted consent + bank login; we never see credentials
}

/** Step 2: after the user approves at the provider, read the consent state and mark the connection. */
export async function refreshConnection(_: FormState, fd: FormData): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  const conn = await ownConnection(a, String(fd.get("id"))); if (!conn?.external_id) return { error: "Connection not found." };
  let c; try { c = await getConsent(conn.external_id); } catch (e) { return providerErr(e); }
  const next = c.status === "ACTIVE" ? "connected" : c.status === "PENDING" ? "pending_consent" : c.status === "EXPIRED" || c.status === "PAUSED" ? "expired" : "revoked";
  const accounts = (c.detail?.accounts ?? []).map((x) => ({ masked: x.maskedAccNumber ?? "", fipId: x.fipId ?? "", type: x.accType ?? "" }));
  await a.supabase.from("integration_connections").update({ status: next, meta: { ...(conn.meta ?? {}), ...(accounts.length ? { accounts } : {}) } }).eq("id", conn.id);
  if (next === "connected" && conn.status !== "connected") await a.supabase.from("integration_consents").insert({ user_id: a.user.id, connection_id: conn.id, provider: PROVIDER, scopes: SCOPES, action: "granted" });
  revalidatePath("/integrations");
  return { ok: { connected: "Bank connected. You can sync now.", pending_consent: "Still waiting for your approval at the provider.", expired: "This consent has expired. Disconnect and connect again.", revoked: "This consent was rejected or revoked." }[next] };
}

/** Step 3: pull transactions, stage them for review (never straight into the ledger), record the run. */
export async function syncConnection(_: FormState, fd: FormData): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  if (!rateLimit(`aa-sync:${a.user.id}`, 10, 60 * 60_000).ok) return { error: "Too many syncs. Try again later." };
  const conn = await ownConnection(a, String(fd.get("id"))); if (!conn?.external_id) return { error: "Connection not found." };
  if (conn.status !== "connected") return { error: "Connect and approve the consent first." };
  const meta = (conn.meta ?? {}) as { rangeFrom?: string; pendingSession?: { id: string } };
  const now = new Date(); const floor = meta.rangeFrom ? new Date(meta.rangeFrom) : new Date(now.getTime() - 365 * 864e5);
  const from = new Date(Math.max(floor.getTime(), (conn.last_synced_at ? new Date(conn.last_synced_at).getTime() - 2 * 864e5 : floor.getTime())));
  const { data: run } = await a.supabase.from("sync_runs").insert({ user_id: a.user.id, connection_id: conn.id, status: "running" }).select("id").single();
  const finish = (status: "success" | "failed", extra: Record<string, unknown> = {}) => run && a.supabase.from("sync_runs").update({ status, finished_at: new Date().toISOString(), ...extra }).eq("id", run.id);
  try {
    let sessionId = meta.pendingSession?.id;
    if (!sessionId) sessionId = (await createSession({ consentId: conn.external_id, from, to: now })).id;
    let session = await getSession(sessionId);
    for (let i = 0; i < 6 && session.status === "PENDING"; i++) { await sleep(2500); session = await getSession(sessionId); }
    if (session.status === "PENDING") {
      await a.supabase.from("integration_connections").update({ meta: { ...meta, pendingSession: { id: sessionId } } }).eq("id", conn.id);
      await finish("success", { imported_count: 0 }); revalidatePath("/integrations");
      return { ok: "Your bank is still preparing the data. Press Sync again in a minute." };
    }
    if (session.status === "FAILED" || session.status === "EXPIRED") { await a.supabase.from("integration_connections").update({ meta: { ...meta, pendingSession: undefined } }).eq("id", conn.id); await finish("failed", { error: `session ${session.status}` }); return { error: "The bank couldn't provide data this time. Please try again." }; }

    const ex = extractAATransactions(session);
    await a.supabase.from("integration_connections").update({ last_synced_at: now.toISOString(), meta: { ...meta, pendingSession: undefined } }).eq("id", conn.id);
    if (!ex.rows.length) { await finish("success", { imported_count: 0 }); revalidatePath("/integrations"); return { ok: ex.failedAccounts ? "No transactions came through (some accounts didn't respond)." : "Synced — no new transactions in this period." }; }
    const { data: prof } = await a.supabase.from("profiles").select("timezone").eq("id", a.user.id).single();
    const batchId = randomUUID();
    const { error: be } = await a.supabase.from("import_batches").insert({ id: batchId, user_id: a.user.id, file_name: `Bank sync ${now.toISOString().slice(0, 10)} (${ex.accounts.map((x) => x.masked).join(", ") || "accounts"})`.slice(0, 200), file_kind: "aa", storage_path: `aa:${conn.id}`, size_bytes: Math.max(1, JSON.stringify(ex.rows).length), status: "processing" });
    if (be) throw new Error(be.message);
    await stage(a.supabase, a.user.id, batchId, ex.rows, AA_MAPPING, prof?.timezone ?? "Asia/Kolkata");
    await a.supabase.from("import_batches").update({ status: "preview" }).eq("id", batchId);
    const { count: dups } = await a.supabase.from("staged_import_transactions").select("id", { count: "exact", head: true }).eq("batch_id", batchId).eq("is_duplicate", true);
    await finish("success", { imported_count: ex.rows.length - (dups ?? 0), duplicate_count: dups ?? 0 });
    await notify(a.user.id, "import", "Bank sync ready to review", `${ex.rows.length} transactions fetched.`);
    revalidatePath("/integrations"); revalidatePath("/imports");
    redirect(`/imports/${batchId}`);
  } catch (e) {
    if ((e as Error & { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    await finish("failed", { error: (e instanceof SetuError ? `${e.code}` : "error").slice(0, 100) });
    return providerErr(e);
  }
}

/** "Check balance" for a linked bank, like payment apps. Demo connections answer from their seeded balance; live ones need the provider's balance call, which isn't wired yet. */
export async function checkBalance(id: string): Promise<{ balanceMinor: number; asOf: string } | { error: string }> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  if (!rateLimit(`bal:${a.user.id}`, 30, 60 * 60_000).ok) return { error: "Too many balance checks. Try again in a while." };
  const c = await ownConnection(a, id); if (!c || c.status !== "connected") return { error: "This bank isn't linked." };
  const meta = (c.meta ?? {}) as { demo?: boolean; balanceMinor?: number };
  if (meta.demo && typeof meta.balanceMinor === "number") return { balanceMinor: meta.balanceMinor, asOf: new Date().toISOString() };
  return { error: "Live balance isn't available yet. Fetch transactions to refresh your records." };
}

/** Revoke at the provider first (so access really stops), then record it. */
export async function disconnectBank(_: FormState, fd: FormData): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  const conn = await ownConnection(a, String(fd.get("id"))); if (!conn) return { error: "Connection not found." };
  const isDemo = !!(conn.meta as { demo?: boolean } | null)?.demo; // demo rows have no real consent at the provider
  if (!isDemo && conn.external_id && ["connected", "pending_consent"].includes(conn.status)) {
    try { await revokeConsent(conn.external_id); } catch (e) { if (!(e instanceof SetuError && e.status === 404)) return providerErr(e); }
  }
  await a.supabase.from("integration_connections").update({ status: "revoked" }).eq("id", conn.id);
  if (conn.status === "connected") await a.supabase.from("integration_consents").insert({ user_id: a.user.id, connection_id: conn.id, provider: PROVIDER, scopes: SCOPES, action: "revoked" });
  revalidatePath("/integrations"); return { ok: "Disconnected. The bank can no longer share data with SmartFin." };
}

/** Adds a clearly marked DEMO bank (sample accounts and balance, no real consent) so the whole flow can be tried without an Account Aggregator. */
export async function connectDemoBank(): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  if (!rateLimit(`aa-demo:${a.user.id}`, 5, 60 * 60_000).ok) return { error: "Too many attempts. Try again later." };
  const { data: existing } = await a.supabase.from("integration_connections").select("id,meta").eq("provider", PROVIDER).neq("status", "revoked");
  if ((existing ?? []).some((c) => (c.meta as { demo?: boolean } | null)?.demo)) return { error: "You already have a demo bank. Remove it first to add a new one." };
  const { error } = await a.supabase.from("integration_connections").insert({ user_id: a.user.id, provider: PROVIDER, status: "connected",
    meta: { bank: DEMO_BANK.name, demo: true, accounts: [{ masked: DEMO_BANK.masked, type: DEMO_BANK.type }], balanceMinor: DEMO_BANK.balanceMinor } });
  if (error) return { error: "Could not add the demo bank." };
  revalidatePath("/integrations"); return { ok: "Demo bank added. Press “Load sample transactions” to try the review step." };
}

/** Stages sample transactions for review (never straight into the ledger), exactly like a real bank sync. */
export async function loadDemoTransactions(_: FormState, fd: FormData): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  if (!rateLimit(`aa-demo-load:${a.user.id}`, 10, 60 * 60_000).ok) return { error: "Too many attempts. Try again later." };
  const conn = await ownConnection(a, String(fd.get("id")));
  if (!conn || conn.status !== "connected" || !(conn.meta as { demo?: boolean } | null)?.demo) return { error: "Demo bank not found." };
  const rows = sampleBankRows(); const now = new Date();
  const { data: prof } = await a.supabase.from("profiles").select("timezone").eq("id", a.user.id).single();
  const batchId = randomUUID();
  const { error: be } = await a.supabase.from("import_batches").insert({ id: batchId, user_id: a.user.id, file_name: `Demo bank sample ${now.toISOString().slice(0, 10)} (${DEMO_BANK.masked})`, file_kind: "aa", storage_path: `aa:${conn.id}`, size_bytes: Math.max(1, JSON.stringify(rows).length), status: "processing" });
  if (be) return { error: "Could not prepare the sample transactions." };
  try {
    await stage(a.supabase, a.user.id, batchId, rows, AA_MAPPING, prof?.timezone ?? "Asia/Kolkata");
    await a.supabase.from("import_batches").update({ status: "preview" }).eq("id", batchId);
    await a.supabase.from("integration_connections").update({ last_synced_at: now.toISOString() }).eq("id", conn.id);
  } catch (e) { console.error("demo load failed", (e as Error).message); return { error: "Could not load the sample transactions." }; }
  await notify(a.user.id, "import", "Sample bank transactions ready to review", `${rows.length} demo transactions loaded. They are sample data.`);
  revalidatePath("/integrations"); revalidatePath("/imports");
  redirect(`/imports/${batchId}`);
}
