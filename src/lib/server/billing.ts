import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type FulfilResult = "paid" | "duplicate" | "mismatch" | "unknown" | "conflict";
/** The ONE way an order becomes paid (the database function locks the row, checks amount + currency and is idempotent). Server only. */
export async function fulfilPayment(orderId: string, paymentId: string, amountMinor: number, currency: string): Promise<FulfilResult> {
  const { data, error } = await createAdminClient().rpc("fulfil_payment", { p_order_id: orderId, p_payment_id: paymentId, p_amount_minor: amountMinor, p_currency: currency });
  if (error) throw new Error(`fulfil_payment: ${error.message}`);
  return data as FulfilResult;
}

export interface PlanInfo { plan: "free" | "pro"; proUntil: string | null }
/** The caller's plan. Anyone with no row, or whose Pro period has ended, is on free. Reads through RLS (own row only). */
export async function getPlan(supabase: { from: (t: string) => any }, uid: string): Promise<PlanInfo> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data } = await supabase.from("user_plans").select("plan,pro_until").eq("user_id", uid).maybeSingle();
  if (data?.plan === "pro" && data.pro_until && new Date(data.pro_until) > new Date()) return { plan: "pro", proUntil: data.pro_until };
  return { plan: "free", proUntil: null };
}
