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
import type { FormState } from "./auth";

const PROVIDER = "account_aggregator";
const SCOPES = ["account_summary", "transactions"];
const CONSENT_MONTHS = 12;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const providerErr = (e: unknown): FormState => {
  if (e instanceof SetuError) { console.error("setu:", e.status, e.code, e.message); return { error: e.code === "NotConfigured" ? "Bank connections aren't configured on this server." : e.status === 404 ? "The provider couldn't find that consent." : "The bank-data provider returned an error. Please try again shortly." }; }
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

/** Revoke at the provider first (so access really stops), then record it. */
export async function disconnectBank(_: FormState, fd: FormData): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  const conn = await ownConnection(a, String(fd.get("id"))); if (!conn) return { error: "Connection not found." };
  if (conn.external_id && ["connected", "pending_consent"].includes(conn.status)) {
    try { await revokeConsent(conn.external_id); } catch (e) { if (!(e instanceof SetuError && e.status === 404)) return providerErr(e); }
  }
  await a.supabase.from("integration_connections").update({ status: "revoked" }).eq("id", conn.id);
  if (conn.status === "connected") await a.supabase.from("integration_consents").insert({ user_id: a.user.id, connection_id: conn.id, provider: PROVIDER, scopes: SCOPES, action: "revoked" });
  revalidatePath("/integrations"); return { ok: "Disconnected. The bank can no longer share data with SmartFin." };
}
