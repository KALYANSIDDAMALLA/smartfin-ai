"use server";
import { revalidatePath } from "next/cache";
import { forgetUser } from "@/lib/server/memo";
import { getUserOrNull } from "@/lib/server/auth";
import { txSchema } from "@/lib/server/validation";
import { checkBudgetAlerts } from "@/lib/server/budget-alerts";
import { notify } from "@/lib/server/notify";
import { isUnusual } from "@/lib/finance/automation";
import { formatMoney } from "@/lib/finance/money";
import type { FormState } from "./auth";

/** user_id is ALWAYS taken from the verified session, never from the form. RLS + composite FKs re-check ownership of every referenced id. */
function row(d: ReturnType<typeof txSchema.parse>, userId: string) {
  return {
    user_id: userId, type: d.type, amount_minor: d.amount, occurred_at: d.occurredAt, name: d.name ?? d.merchant, merchant: d.merchant, // a blank label falls back to the merchant
    description: d.description, notes: d.notes, subcategory: d.subcategory, category_id: d.categoryId ?? null, external_ref: d.externalRef ?? null,
    payment_method_id: d.paymentMethodId ?? null, channel: d.channel ?? null, tags: d.tags,
    from_account_id: d.fromAccountId ?? null, to_account_id: d.toAccountId ?? null, refund_of_id: d.refundOfId ?? null, direction: d.direction ?? null,
  };
}

export async function saveTransaction(_: FormState, fd: FormData): Promise<FormState> {
  const auth = await getUserOrNull(); if (!auth) return { error: "Please log in again." };
  const p = txSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) { const fields: Record<string, string> = {}; for (const i of p.error.issues) { const k = String(i.path[0] ?? ""); if (k && !fields[k]) fields[k] = i.message; } return { error: p.error.issues[0].message, fields }; }
  const d = p.data; const id = fd.get("id") as string | null;
  if (d.type === "refund" && !d.refundOfId) return { error: "Choose the expense this refund is for." };
  if (d.type === "transfer" && (!d.fromAccountId || !d.toAccountId)) return { error: "Transfers need both accounts." };
  if (d.type === "adjustment" && !d.direction) return { error: "Choose whether the adjustment adds or removes money." };
  if (d.type === "refund" && d.refundOfId) {
    const { data: o } = await auth.supabase.from("transactions").select("type,amount_minor").eq("id", d.refundOfId).maybeSingle();
    if (!o || o.type !== "expense") return { error: "Refunds must reference one of your expenses." };
    const { data: prior } = await auth.supabase.from("transactions").select("id,amount_minor").eq("refund_of_id", d.refundOfId).is("deleted_at", null);
    const already = (prior ?? []).filter((r) => r.id !== id).reduce((a, r) => a + Number(r.amount_minor), 0);
    if (already + d.amount > Number(o.amount_minor)) return { error: "Total refunds can't exceed the original expense." };
  }
  const values = row(d, auth.user.id);
  const res = id
    ? await auth.supabase.from("transactions").update({ ...values, user_id: undefined }).eq("id", id) // update triggers audit history
    : await auth.supabase.from("transactions").insert(values);
  if (res.error) return { error: res.error.code === "23505" ? "A transaction with this reference already exists." : "Could not save the transaction." };
  const { data: prof } = await auth.supabase.from("profiles").select("timezone").eq("id", auth.user.id).single();
  if (d.type === "expense" && d.categoryId && !id) { // new expense: compare with this category's history (a prompt to review, never "fraud")
    const { data: hist } = await auth.supabase.from("transactions").select("amount_minor").eq("type", "expense").eq("category_id", d.categoryId).is("deleted_at", null).order("occurred_at", { ascending: false }).limit(200);
    const u = isUnusual(d.amount, (hist ?? []).map((r) => Number(r.amount_minor)).slice(1)); // slice(1): the row we just inserted is the newest
    if (u.unusual) await notify(auth.user.id, "unusual", "Unusual spending to review", `${formatMoney(d.amount)} is much higher than your typical ${formatMoney(u.typicalMinor)} in this category. This is a prompt to review, not a finding of fraud.`);
  }
  if (!id && d.type === "income") await notify(auth.user.id, "income", `Income received: ${formatMoney(d.amount)}`, d.name || d.merchant ? `From ${d.name || d.merchant}. Nice — your savings rate just improved.` : "Nice — your savings rate just improved.");
  if (!id && d.type === "refund") await notify(auth.user.id, "refund", `Refund recorded: ${formatMoney(d.amount)}`, "It reduces your net spending for the period.");
  if (d.type === "expense" || d.type === "refund") await checkBudgetAlerts(auth.supabase, auth.user.id, prof?.timezone ?? "Asia/Kolkata");
  forgetUser(auth.user.id); // the merchant suggestions include this payment now
  const draftId = String(fd.get("draftId") ?? ""); // finishing a draft removes it, so it isn't counted twice
  if (/^[0-9a-f-]{36}$/i.test(draftId)) await auth.supabase.from("transaction_drafts").delete().eq("id", draftId);
  ["/dashboard", "/transactions", "/income", "/budgets", "/calendar"].forEach((p) => revalidatePath(p));
  return { ok: id ? "Transaction updated." : "Transaction saved." };
}

/** Soft delete so history stays auditable. */
export async function deleteTransaction(fd: FormData) {
  const auth = await getUserOrNull(); if (!auth) return;
  const id = String(fd.get("id") ?? "");
  await auth.supabase.from("transactions").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/transactions"); revalidatePath("/dashboard");
}

export async function markRecurringPaid(fd: FormData) {
  const auth = await getUserOrNull(); if (!auth) return;
  const id = String(fd.get("id") ?? "");
  const { data: r } = await auth.supabase.from("recurring_rules").select("*").eq("id", id).maybeSingle();
  if (!r) return;
  // Only an explicit "mark paid" creates a real transaction — reminders never do.
  await auth.supabase.from("transactions").insert({
    user_id: auth.user.id, type: r.tx_type, amount_minor: r.estimated_amount_minor, occurred_at: new Date().toISOString(), name: r.name,
    category_id: r.category_id, payment_method_id: r.payment_method_id, source: "recurring", recurring_rule_id: r.id,
  });
  const d = new Date(r.next_due_date + "T00:00:00Z");
  const step = { daily: () => d.setUTCDate(d.getUTCDate() + 1), weekly: () => d.setUTCDate(d.getUTCDate() + 7), monthly: () => d.setUTCMonth(d.getUTCMonth() + 1), quarterly: () => d.setUTCMonth(d.getUTCMonth() + 3), yearly: () => d.setUTCFullYear(d.getUTCFullYear() + 1) }[r.frequency as "daily"];
  step();
  await auth.supabase.from("recurring_rules").update({ next_due_date: d.toISOString().slice(0, 10) }).eq("id", id);
  await notify(auth.user.id, "recurring", `Marked "${r.name}" as paid`);
  revalidatePath("/repayments"); revalidatePath("/dashboard"); revalidatePath("/transactions");
}
