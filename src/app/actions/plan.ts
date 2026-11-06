"use server";
import { forgetUser } from "@/lib/server/memo";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUserOrNull } from "@/lib/server/auth";
import { budgetSchema, goalSchema, recurringSchema, moneyField } from "@/lib/server/validation";
import { crossedMilestones } from "@/lib/finance/goals";
import { notify } from "@/lib/server/notify";
import type { FormState } from "./auth";

const need = async () => (await getUserOrNull());
const fail = (e: { message: string }): FormState => ({ error: "Could not save. Check your input and try again." + (process.env.NODE_ENV === "development" ? ` (${e.message})` : "") });
const first = (p: { error: { issues: { message: string }[] } }): FormState => ({ error: p.error.issues[0].message });

// ---- budgets
export async function saveBudget(_: FormState, fd: FormData): Promise<FormState> {
  const a = await need(); if (!a) return { error: "Please log in again." };
  const p = budgetSchema.safeParse(Object.fromEntries(fd)); if (!p.success) return first(p);
  const d = p.data; const id = fd.get("id") as string | null;
  const v = { name: d.name, period: d.period, amount_minor: d.amount, category_id: d.categoryId ?? null, channel: d.channel ?? null, alert_thresholds: d.thresholds };
  const r = id ? await a.supabase.from("budgets").update(v).eq("id", id) : await a.supabase.from("budgets").insert({ ...v, user_id: a.user.id });
  if (r.error) return fail(r.error);
  if (!id) await notify(a.user.id, "budget", `Budget created: ${d.name}`, "You'll get an alert as you approach your limit.");
  revalidatePath("/budgets"); return { ok: id ? "Budget updated." : "Budget created." };
}
export async function deleteBudget(_: FormState, fd: FormData): Promise<FormState> {
  const a = await need(); if (!a) return { error: "Please log in again." };
  const { error } = await a.supabase.from("budgets").delete().eq("id", String(fd.get("id"))); if (error) return fail(error);
  revalidatePath("/budgets"); return { ok: "Budget deleted." };
}
export async function toggleBudget(_: FormState, fd: FormData): Promise<FormState> {
  const a = await need(); if (!a) return { error: "Please log in again." };
  const { error } = await a.supabase.from("budgets").update({ active: fd.get("active") === "true" }).eq("id", String(fd.get("id"))); if (error) return fail(error);
  revalidatePath("/budgets"); return { ok: fd.get("active") === "true" ? "Budget resumed." : "Budget paused." };
}

// ---- goals (contributions are allocations, never transactions)
export async function saveGoal(_: FormState, fd: FormData): Promise<FormState> {
  const a = await need(); if (!a) return { error: "Please log in again." };
  const p = goalSchema.safeParse(Object.fromEntries(fd)); if (!p.success) return first(p);
  const d = p.data; const id = fd.get("id") as string | null;
  const v = { name: d.name, kind: d.kind, description: d.description ?? null, target_minor: d.target, target_date: d.targetDate ?? null, contribution_frequency: d.frequency ?? null };
  const r = id ? await a.supabase.from("financial_goals").update(v).eq("id", id) : await a.supabase.from("financial_goals").insert({ ...v, user_id: a.user.id });
  if (r.error) return fail(r.error);
  if (!id) await notify(a.user.id, "goal", `New goal: ${d.name}`, "Small, regular contributions get you there. You've got this!");
  revalidatePath("/goals"); return { ok: id ? "Goal updated." : "Goal created." };
}
export async function setGoalStatus(_: FormState, fd: FormData): Promise<FormState> {
  const a = await need(); if (!a) return { error: "Please log in again." };
  const s = z.enum(["active", "paused", "completed"]).safeParse(fd.get("status")); if (!s.success) return { error: "Invalid status." };
  const { error } = await a.supabase.from("financial_goals").update({ status: s.data }).eq("id", String(fd.get("id"))); if (error) return fail(error);
  if (s.data === "completed") { const { data: g } = await a.supabase.from("financial_goals").select("name").eq("id", String(fd.get("id"))).single(); await notify(a.user.id, "goal", `Goal achieved: ${g?.name ?? "your goal"}`, "Congratulations — that's a real milestone. Set the next one!"); }
  revalidatePath("/goals"); return { ok: { completed: "Goal marked complete. Well done!", paused: "Goal paused.", active: "Goal resumed." }[String(fd.get("status"))] ?? "Goal updated." };
}
export async function deleteGoal(_: FormState, fd: FormData): Promise<FormState> {
  const a = await need(); if (!a) return { error: "Please log in again." };
  const { error } = await a.supabase.from("financial_goals").delete().eq("id", String(fd.get("id"))); if (error) return fail(error);
  revalidatePath("/goals"); return { ok: "Goal deleted." };
}
/** kind=contribute adds money; kind=withdraw records a negative allocation (cannot exceed what's contributed). */
export async function addContribution(_: FormState, fd: FormData): Promise<FormState> {
  const a = await need(); if (!a) return { error: "Please log in again." };
  const m = moneyField.safeParse(fd.get("amount")); if (!m.success) return first(m);
  const goalId = String(fd.get("goalId")); const withdraw = fd.get("kind") === "withdraw";
  const { data: g } = await a.supabase.from("financial_goals").select("id,name,target_minor,status").eq("id", goalId).maybeSingle();
  if (!g) return { error: "Goal not found." };
  if (g.status === "paused") return { error: "Resume this goal before contributing." };
  const { data: cs } = await a.supabase.from("goal_contributions").select("amount_minor").eq("goal_id", goalId);
  const before = (cs ?? []).reduce((s, c) => s + Number(c.amount_minor), 0);
  const delta = withdraw ? -m.data : m.data; const after = before + delta;
  if (after < 0) return { error: "Withdrawal is more than the amount contributed." };
  const date = String(fd.get("date") || "") || undefined;
  const { error } = await a.supabase.from("goal_contributions").insert({ user_id: a.user.id, goal_id: goalId, amount_minor: delta, note: String(fd.get("note") ?? "").slice(0, 200) || null, ...(date ? { contributed_on: date } : {}) });
  if (error) return fail(error);
  for (const ms of crossedMilestones(Number(g.target_minor), before, after)) await notify(a.user.id, "goal", `${g.name}: ${ms}% reached`);
  revalidatePath("/goals"); revalidatePath("/dashboard"); return { ok: withdraw ? "Withdrawal recorded." : "Contribution recorded." };
}

// ---- recurring (a rule is a reminder; only markRecurringPaid creates a transaction)
export async function saveRecurring(_: FormState, fd: FormData): Promise<FormState> {
  const a = await need(); if (!a) return { error: "Please log in again." };
  const p = recurringSchema.safeParse(Object.fromEntries(fd)); if (!p.success) return first(p);
  const d = p.data; const id = fd.get("id") as string | null;
  const v = { name: d.name, tx_type: d.txType, estimated_amount_minor: d.amount, category_id: d.categoryId ?? null, payment_method_id: d.paymentMethodId ?? null, frequency: d.frequency, next_due_date: d.nextDue };
  const r = id ? await a.supabase.from("recurring_rules").update(v).eq("id", id) : await a.supabase.from("recurring_rules").insert({ ...v, user_id: a.user.id });
  if (r.error) return fail(r.error);
  if (!id) await notify(a.user.id, "recurring", `Reminder set: ${d.name}`, `We'll remind you before it's due on ${d.nextDue}.`);
  revalidatePath("/repayments"); return { ok: "Saved." };
}
export async function toggleRecurring(_: FormState, fd: FormData): Promise<FormState> {
  const a = await need(); if (!a) return { error: "Please log in again." };
  const { error } = await a.supabase.from("recurring_rules").update({ paused: fd.get("paused") === "true" }).eq("id", String(fd.get("id"))); if (error) return fail(error);
  revalidatePath("/repayments"); return { ok: fd.get("paused") === "true" ? "Reminder paused." : "Reminder resumed." };
}
export async function deleteRecurring(_: FormState, fd: FormData): Promise<FormState> {
  const a = await need(); if (!a) return { error: "Please log in again." };
  const { error } = await a.supabase.from("recurring_rules").delete().eq("id", String(fd.get("id"))); if (error) return fail(error);
  revalidatePath("/repayments"); return { ok: "Deleted." };
}

// ---- savings planner assumptions
export async function saveSavingsPlan(_: FormState, fd: FormData): Promise<FormState> {
  const a = await need(); if (!a) return { error: "Please log in again." };
  const z0 = z.string().trim().transform((v) => v || "0").pipe(z.string()).transform((v) => { const n = Number(v.replace(/[,₹\s]/g, "")); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN; });
  const out: Record<string, number> = {};
  for (const [f, col] of [["income", "monthly_income_minor"], ["essential", "essential_minor"], ["discretionary", "discretionary_minor"], ["commitments", "commitments_minor"], ["savings", "current_savings_minor"]] as const) {
    const r = z0.safeParse(fd.get(f) ?? "0"); if (!r.success || Number.isNaN(r.data)) return { error: "Enter valid non-negative amounts." }; out[col] = r.data;
  }
  const { error } = await a.supabase.from("savings_plans").upsert({ user_id: a.user.id, ...out, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return fail(error);
  await notify(a.user.id, "savings", "Savings plan updated", "Your projections now use the new assumptions.");
  revalidatePath("/savings"); return { ok: "Assumptions saved." };
}

// ---- profile / preferences / notifications
export async function saveSettings(_: FormState, fd: FormData): Promise<FormState> {
  const a = await need(); if (!a) return { error: "Please log in again." };
  const p = z.object({ name: z.string().trim().max(80).optional(), timezone: z.string().refine((t) => { try { new Intl.DateTimeFormat("en", { timeZone: t }); return true; } catch { return false; } }, "Unknown timezone"), currency: z.enum(["INR"]) }).safeParse(Object.fromEntries(fd));
  if (!p.success) return first(p);
  const e1 = await a.supabase.from("profiles").update({ ...(p.data.name !== undefined ? { display_name: p.data.name || null } : {}), timezone: p.data.timezone, currency: p.data.currency }).eq("id", a.user.id);
  if (e1.error) return fail(e1.error);
  forgetUser(a.user.id); revalidatePath("/", "layout"); return { ok: "Settings saved." };
}
/** Notification choices live in their own card, so saving the profile never resets them (and the other way round). */
export async function saveNotificationPrefs(_: FormState, fd: FormData): Promise<FormState> {
  const a = await need(); if (!a) return { error: "Please log in again." };
  const on = (k: string) => fd.get(k) === "on";
  const e = await a.supabase.from("user_preferences").upsert({ user_id: a.user.id, email_notifications: on("email"), push_notifications: on("push"), notify_daily: on("daily"), notify_weekly: on("weekly"), notify_monthly: on("monthly"), notify_yearly: on("yearly"), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (e.error) return fail(e.error);
  revalidatePath("/settings"); return { ok: "Notification preferences saved." };
}
export async function markNotificationsRead(_: FormState, fd: FormData): Promise<FormState> {
  const a = await need(); if (!a) return { error: "Please log in again." };
  const id = fd.get("id") as string | null; let q = a.supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  if (id) q = q.eq("id", id); const { error } = await q; if (error) return fail(error);
  forgetUser(a.user.id); revalidatePath("/", "layout"); return { ok: "Marked as read." };
}
