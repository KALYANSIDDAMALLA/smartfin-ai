"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserOrNull } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/ratelimit";
import { moneyField, nameField } from "@/lib/server/validation";
import { ACCOUNT_TYPES, accountName, bankById, kindOf, type AccountType } from "@/lib/banks";
import type { FormState } from "./auth";

const schema = z.object({
  bank: z.string().min(1, "Choose your bank."), type: z.enum(Object.keys(ACCOUNT_TYPES) as [AccountType, ...AccountType[]], { message: "Choose the account type." }),
  last4: z.string().optional().transform((v) => (v ?? "").replace(/\D/g, "")).refine((v) => v === "" || v.length === 4, "Enter exactly the last 4 digits, or leave it empty."),
  nickname: nameField("Nickname", { max: 60 }), opening: z.string().optional(),
});

/** Adds a bank account (or card, wallet, cash) you can pick for transfers. Works without any bank connection. */
export async function addBankAccount(_: FormState, fd: FormData): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  if (!rateLimit(`acct:${a.user.id}`, 20, 60 * 60_000).ok) return { error: "Too many changes. Try again in a while." };
  const p = schema.safeParse(Object.fromEntries(fd)); if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data; const bank = d.type === "cash" ? { name: "Cash" } : bankById(d.bank); if (!bank) return { error: "Choose your bank from the list." };
  const op = d.opening && d.opening.trim() ? moneyField.safeParse(d.opening) : null; if (op && !op.success) return { error: "Enter a valid opening balance, or leave it empty." };
  const name = accountName({ bank: bank.name, type: d.type, last4: d.last4, nickname: d.nickname || undefined });
  const { data: mine } = await a.supabase.from("accounts").select("name").eq("archived", false);
  if ((mine ?? []).length >= 30) return { error: "You have 30 accounts already. Archive one you no longer use first." };
  if ((mine ?? []).some((x) => x.name.toLowerCase() === name.toLowerCase())) return { error: `You already have an account called “${name}”.` };
  const { error } = await a.supabase.from("accounts").insert({ user_id: a.user.id, name, kind: kindOf(d.type), opening_balance_minor: op?.success ? op.data : 0 });
  if (error) return { error: "Could not add the account. Please try again." };
  revalidatePath("/integrations"); return { ok: `${name} added.` };
}

/** Hides an account from lists and pickers. Its past transfers stay, so nothing breaks. */
export async function archiveAccount(_: FormState, fd: FormData): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  const { error } = await a.supabase.from("accounts").update({ archived: true }).eq("id", String(fd.get("id") ?? "")); if (error) return { error: "Could not remove the account." };
  revalidatePath("/integrations"); return { ok: "Account removed from your list." };
}
