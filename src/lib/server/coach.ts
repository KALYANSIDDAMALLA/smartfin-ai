import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { coachBase, whatIf, type CoachBase, type GoalLite } from "@/lib/finance/coach";
import { allowedFrom, groundText } from "@/lib/finance/ground";
import { formatMoney } from "@/lib/finance/money";
import { localDate } from "@/lib/finance/dates";
import { pctText } from "@/lib/finance/pct";
import { loadTxs } from "./data";
import { askJson } from "./ai";
import { List, Text } from "./insights";

/** Loads a typical month (last 90 days vs the 90 before) and the goal you are closest to finishing. */
export async function loadCoach(sb: SupabaseClient) {
  const now = new Date(); const from = new Date(+now - 190 * 864e5);
  const [{ txs, lookups }, goals, contribs] = await Promise.all([
    loadTxs(sb, undefined, from, undefined, true, "slim"),
    sb.from("financial_goals").select("id,name,target_minor,target_date").eq("status", "active"),
    sb.from("goal_contributions").select("goal_id,amount_minor"),
  ]);
  const base = coachBase(txs, lookups.categories, now);
  const got = new Map<string, number>(); for (const c of contribs.data ?? []) got.set(c.goal_id, (got.get(c.goal_id) ?? 0) + Number(c.amount_minor));
  const open = (goals.data ?? []).map((g) => ({ name: g.name as string, remainingMinor: Number(g.target_minor) - (got.get(g.id) ?? 0), date: (g.target_date as string | null) ?? "9999" })).filter((g) => g.remainingMinor > 0).sort((a, b) => a.date.localeCompare(b.date));
  const goal: GoalLite | null = open[0] ? { name: open[0].name, remainingMinor: open[0].remainingMinor } : null;
  return { base, goal };
}

export const PlanSchema = z.object({ headline: Text(160).default(""), summary: Text(500).default(""), steps: List(z.object({ title: Text(100), detail: Text(320) }), 5).default([]), encouragement: Text(220).default("") });
export type Plan = z.infer<typeof PlanSchema>;

/** Built-in 30-day plan from the coach figures, used when AI is off or fails. */
export function fallbackPlan(base: CoachBase, goal: GoalLite | null, fmt: (m: number) => string): Plan {
  const top = base.opportunities.filter((o) => o.suggestedCutPct > 0).slice(0, 3); const w = whatIf(base, Object.fromEntries(base.opportunities.map((o) => [o.id, o.suggestedCutPct])), goal);
  if (!top.length) return { headline: "Your spending is already lean.", summary: "We could not find a flexible category worth trimming right now. Keep tracking and check back after a few more weeks.", steps: [], encouragement: "Steady habits beat big gestures." };
  const steps = top.map((o, i) => ({ title: `Week ${i + 1}: trim ${o.name} by ${o.suggestedCutPct}%`, detail: `You spend about ${fmt(o.monthlyMinor)} a month here${o.trendPct !== null && o.trendPct >= 10 ? `, up ${pctText(o.trendPct)} on before` : ""}. Cutting ${o.suggestedCutPct}% saves about ${fmt(o.savesMonthlyMinor)} a month, or ${fmt(o.savesYearlyMinor)} a year.` }));
  steps.push({ title: "Week 4: lock it in", detail: `Set a monthly budget for these categories and move the ${fmt(w.extraMonthlyMinor)} you save to ${goal ? `your “${goal.name}” goal` : "savings"} on payday, before you can spend it.` });
  return { headline: `You could free up about ${fmt(w.extraMonthlyMinor)} a month.`, summary: `That is ${fmt(w.extraYearlyMinor)} a year${w.goal?.monthsSooner ? `, and it would get you to “${w.goal.name}” ${w.goal.monthsSooner} month${w.goal.monthsSooner === 1 ? "" : "s"} sooner` : ""}, without touching rent, loans or other fixed costs.`, steps, encouragement: "Small changes, repeated every month, add up quickly." };
}

const groundPlan = (ai: Plan, fb: Plan, data: unknown): Plan => {
  const ok = allowedFrom(data); const one = (t: string, f: string) => groundText(t, ok) || f;
  const steps = ai.steps.map((x) => ({ title: groundText(x.title, ok), detail: groundText(x.detail, ok) })).filter((x) => x.title && x.detail);
  return { headline: one(ai.headline, fb.headline), summary: one(ai.summary, fb.summary), steps: steps.length ? steps : fb.steps, encouragement: one(ai.encouragement, fb.encouragement) };
};

export async function generateCoachPlan(sb: SupabaseClient, userId: string, tz: string, currency = "INR") {
  const { base, goal } = await loadCoach(sb); const fmt = (m: number) => formatMoney(m, currency); const fb = fallbackPlan(base, goal, fmt);
  const w = whatIf(base, Object.fromEntries(base.opportunities.map((o) => [o.id, o.suggestedCutPct])), goal);
  const slim = { typicalMonth: { income: base.incomeMonthlyMinor, spending: base.expenseMonthlyMinor, saved: base.savingsMonthlyMinor, savingsRatePct: base.savingsRatePct, fixedCosts: base.fixedMonthlyMinor, flexibleSpending: base.flexibleMonthlyMinor },
    canTrim: base.opportunities.map((o) => ({ category: o.name, monthly: o.monthlyMinor, trendPct: o.trendPct, suggestedCutPct: o.suggestedCutPct, savesMonthly: o.savesMonthlyMinor, savesYearly: o.savesYearlyMinor })),
    total: { savesMonthly: base.suggestedSavesMonthlyMinor, savesYearly: base.suggestedSavesYearlyMinor }, goal: w.goal ? { name: w.goal.name, remaining: goal?.remainingMinor, monthsNow: w.goal.monthsNow, monthsNew: w.goal.monthsNew, monthsSooner: w.goal.monthsSooner } : null };
  const task = 'You are a friendly money coach for an everyday person. Write a realistic 30-day plan as JSON {"headline","summary","steps":[{"title","detail"}],"encouragement"}. Use 3 to 5 steps, one per week, simple everyday English, no jargon. '
    + 'Only suggest trimming the categories in "canTrim" by the given percentages; never touch fixed or essential costs. Every rupee amount and percentage you write MUST appear in the data, and never write a percentage above 100 (say "more than double" instead); do not invent or calculate new figures. Amounts are paise: write rupees with the ₹ sign and Indian digit grouping (for example ₹8,25,290).';
  const ai = base.opportunities.length ? await askJson(task, slim, PlanSchema, 1200) : null; const plan = ai ? groundPlan(ai.value, fb, slim) : fb;
  await sb.from("ai_insights").insert({ user_id: userId, period_start: localDate(new Date(), tz), period_end: localDate(new Date(), tz), metrics: { kind: "coach" }, insights: plan, model: ai?.model ?? null, is_fallback: !ai });
  return { plan, fallback: !ai };
}

/** The most recent saved AI plan (null if none, or if it was a built-in one). */
export async function latestPlan(sb: SupabaseClient, tz: string) {
  const { data } = await sb.from("ai_insights").select("insights,model,is_fallback,created_at").eq("metrics->>kind", "coach").eq("is_fallback", false).order("created_at", { ascending: false }).limit(1);
  const r = data?.[0]; const p = r ? PlanSchema.safeParse(r.insights) : null; if (!r || !p?.success) return null;
  return { plan: p.data, model: r.model as string | null, at: new Date(r.created_at).toLocaleString("en-IN", { timeZone: tz, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) };
}
