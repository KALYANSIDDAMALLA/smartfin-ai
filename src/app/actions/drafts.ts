"use server";
import { revalidatePath } from "next/cache";
import { notify } from "@/lib/server/notify";
import { z } from "zod";
import { getUserOrNull } from "@/lib/server/auth";
import { parseMoney } from "@/lib/finance/money";
import { nameField, noteField } from "@/lib/server/validation";
import type { FormState } from "./auth";

const id = z.string().uuid().optional().or(z.literal("").transform(() => undefined));
const draftSchema = z.object({
  type: z.enum(["expense", "income"]), draftId: id,
  amount: z.string().trim().optional().transform((v, ctx) => {
    if (!v) return null; try { return parseMoney(v); } catch { ctx.addIssue({ code: "custom", message: "Enter the amount as a number, e.g. 450 or 450.50" }); return z.NEVER; }
  }),
  name: nameField("Name", { max: 100 }).transform((x) => x ?? null), merchant: nameField("Merchant / recipient", { payee: true }).transform((x) => x ?? null), notes: noteField("Notes", 2000).transform((x) => x ?? null), categoryId: id, paymentMethodId: id,
  channel: z.enum(["online", "offline"]).optional().or(z.literal("").transform(() => undefined)),
  occurredAt: z.string().optional().transform((v) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null)), // the form's date becomes the planned date
});

/** Saves an unfinished entry. Drafts are not ledger entries: they never count in totals and need no amount. user_id comes from the session only. */
export async function saveDraft(_: FormState, fd: FormData): Promise<FormState> {
  const auth = await getUserOrNull(); if (!auth) return { error: "Please log in again." };
  const p = draftSchema.safeParse(Object.fromEntries(fd)); if (!p.success) return { error: p.error.issues[0].message };
  const d = p.data;
  if (!d.amount && !d.name && !d.merchant && !d.notes) return { error: "Add at least an amount, a name or a note to save a draft." };
  const values = { type: d.type, amount_minor: d.amount, name: d.name, merchant: d.merchant, notes: d.notes, category_id: d.categoryId ?? null, payment_method_id: d.paymentMethodId ?? null, channel: d.channel ?? null, planned_for: d.occurredAt, updated_at: new Date().toISOString() };
  const res = d.draftId
    ? await auth.supabase.from("transaction_drafts").update(values).eq("id", d.draftId)
    : await auth.supabase.from("transaction_drafts").insert({ ...values, user_id: auth.user.id });
  if (res.error) return { error: "Could not save the draft." };
  if (!d.draftId) await notify(auth.user.id, "draft", "Draft saved", `${d.name || d.merchant || "Your draft"} is on your Calendar${values.planned_for ? ` for ${values.planned_for}` : ""}. Finish it any time.`);
  revalidatePath("/calendar");
  return { ok: d.draftId ? "Draft updated. It's on your Calendar." : "Draft saved. Finish it any time from your Calendar." };
}

export async function deleteDraft(fd: FormData) {
  const auth = await getUserOrNull(); if (!auth) return;
  const idv = z.string().uuid().safeParse(String(fd.get("id") ?? "")); if (!idv.success) return;
  await auth.supabase.from("transaction_drafts").delete().eq("id", idv.data);
  revalidatePath("/calendar");
}
