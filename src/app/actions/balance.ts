"use server";
import { z } from "zod";
import { getUserOrNull } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/ratelimit";
import { accountBalance, pinProblem, type BalanceRow } from "@/lib/finance/account-balance";

const SETUP = "PIN protection needs a one-time database update (migration 20261101000012).";
/** The database functions are missing until the migration is run. */
const missing = (e: { code?: string; message: string }) => e.code === "42883" || e.code === "PGRST202" || /could not find the function|does not exist/i.test(e.message);
const LOCKED = "Too many wrong PINs. Try again in 15 minutes.";

/** Is a PIN already set for this user? (The PIN itself is never readable.) */
export async function balancePinState(): Promise<{ set: boolean } | { error: string }> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  const { data, error } = await a.supabase.rpc("has_balance_pin");
  if (error) return { error: missing(error) ? SETUP : "Could not check your PIN." };
  return { set: data === true };
}

/** Creates the PIN, or changes it (the current PIN is required to change it). */
export async function setBalancePin(pin: string, current?: string): Promise<{ ok: true } | { error: string }> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  const bad = pinProblem(String(pin)); if (bad) return { error: bad };
  if (!rateLimit(`pinset:${a.user.id}`, 10, 60 * 60_000).ok) return { error: "Too many attempts. Try again in a while." };
  const { data, error } = await a.supabase.rpc("set_balance_pin", { p_pin: String(pin), p_current: current ? String(current) : null });
  if (error) return { error: missing(error) ? SETUP : "Could not save your PIN." };
  if (data === "ok") return { ok: true };
  return { error: data === "locked" ? LOCKED : data === "wrong" ? "Your current PIN is wrong." : "A PIN is 4 to 6 digits." };
}

/**
 * Reveals one account's estimated balance, only after the PIN checks out. The PIN is verified in the database (which counts wrong tries and locks),
 * and the balance is worked out on the server from the caller's own rows (row-level security applies), never sent from the browser.
 */
export async function checkAccountBalance(accountId: string, pin: string): Promise<{ balanceMinor: number; asOf: string } | { error: string }> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  const id = z.string().uuid().safeParse(accountId); if (!id.success) return { error: "That account wasn't found." };
  if (pinProblem(String(pin))) return { error: "Enter your 4 to 6 digit PIN." };
  if (!rateLimit(`bal:${a.user.id}`, 60, 60 * 60_000).ok) return { error: "Too many balance checks. Try again in a while." };
  const { data: verdict, error: e1 } = await a.supabase.rpc("check_balance_pin", { p_pin: String(pin) });
  if (e1) return { error: missing(e1) ? SETUP : "Could not check your PIN." };
  if (verdict === "unset") return { error: "Create a PIN first." };
  if (verdict === "locked") return { error: LOCKED };
  if (verdict !== "ok") return { error: "Wrong PIN." };
  const { data: acct } = await a.supabase.from("accounts").select("id,opening_balance_minor").eq("id", id.data).eq("archived", false).maybeSingle();
  if (!acct) return { error: "That account wasn't found." };
  const { data: rows, error: e2 } = await a.supabase.from("transactions").select("id,type,amount_minor,from_account_id,to_account_id,direction,occurred_at")
    .is("deleted_at", null).or(`from_account_id.eq.${acct.id},to_account_id.eq.${acct.id}`).limit(20000);
  if (e2) return { error: "Could not work out the balance." };
  return { balanceMinor: accountBalance((rows ?? []) as BalanceRow[], acct.id, Number(acct.opening_balance_minor)), asOf: new Date().toISOString() };
}
