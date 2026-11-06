import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isYmd } from "@/lib/finance/calendar";

/** Starting values for the add form: a saved draft (?draft=id) or a chosen calendar day (?date=YYYY-MM-DD). RLS limits drafts to the caller. */
export async function draftStart(sb: SupabaseClient, sp: { draft?: string; date?: string; amount?: string }) {
  if (sp.draft && /^[0-9a-f-]{36}$/i.test(sp.draft)) {
    const { data: d } = await sb.from("transaction_drafts").select("*").eq("id", sp.draft).maybeSingle();
    if (d) return { draftId: d.id as string, amount: d.amount_minor != null ? (Number(d.amount_minor) / 100).toFixed(2) : undefined, name: d.name ?? undefined, merchant: d.merchant ?? undefined, notes: d.notes ?? undefined,
      categoryId: d.category_id ?? undefined, paymentMethodId: d.payment_method_id ?? undefined, channel: d.channel ?? undefined, occurredAt: d.planned_for ? `${d.planned_for}T12:00` : undefined, type: d.type as string };
  }
  const amount = sp.amount && /^\d{1,12}(\.\d{1,2})?$/.test(sp.amount) ? sp.amount : undefined; // e.g. from the calculator
  if (isYmd(sp.date) || amount) return { occurredAt: isYmd(sp.date) ? `${sp.date}T12:00` : undefined, amount };
  return undefined;
}
