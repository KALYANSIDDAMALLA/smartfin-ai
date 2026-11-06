import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { summarize } from "@/lib/finance/accounting";
import { presetRange, previousRange, type Preset } from "@/lib/finance/dates";
import { goalProgress, estimatedCompletion } from "@/lib/finance/goals";
import { formatMoney } from "@/lib/finance/money";
import { localDate } from "@/lib/finance/dates";
import { loadTxs } from "./data";
import { askJson } from "./ai";

const inr = (v: number) => formatMoney(v);
const Plan = z.object({
  intent: z.enum(["spend_total", "spend_category", "spend_method", "spend_channel", "compare_periods", "top_category", "biggest_increase", "recurring_list", "goal_contribution", "goal_feasibility", "budget_suggestion", "income_total", "unsupported"]),
  period: z.enum(["today", "week", "month", "year", "last_month"]).default("month"), category: z.string().max(60).nullish(), method: z.string().max(40).nullish(), goal: z.string().max(80).nullish(), channel: z.enum(["online", "offline"]).nullish(),
});
export type QueryPlan = z.infer<typeof Plan>;

/** Keyword planner used when the model is unavailable (and as a sanity net). Understands the documented example questions. */
export function keywordPlan(q: string): QueryPlan {
  const s = q.toLowerCase();
  const period: QueryPlan["period"] = /last month|previous month/.test(s) ? "last_month" : /today/.test(s) ? "today" : /this week|week/.test(s) ? "week" : /year/.test(s) ? "year" : "month";
  const base = { period, category: null, method: null, goal: null, channel: null } as QueryPlan;
  if (/recurring|subscription/.test(s)) return { ...base, intent: "recurring_list" };
  if (/compare/.test(s)) return { ...base, intent: "compare_periods", period: "month" };
  if (/increase/.test(s)) return { ...base, intent: "biggest_increase", period: "month" };
  if (/reach|by the target|on track/.test(s)) return { ...base, intent: "goal_feasibility", goal: /emergency/.test(s) ? "emergency" : null };
  if (/contribut/.test(s)) return { ...base, intent: "goal_contribution", goal: /emergency/.test(s) ? "emergency" : /house/.test(s) ? "house" : null };
  if (/budget/.test(s)) return { ...base, intent: "budget_suggestion" };
  if (/highest|most|top/.test(s)) return { ...base, intent: "top_category" };
  if (/upi|card|cash|netbanking|wallet|gpay|phonepe|paytm/.test(s)) return { ...base, intent: "spend_method", method: (/upi|gpay|phonepe|paytm/.exec(s)?.[0] ?? /card|cash|netbanking|wallet/.exec(s)![0]) };
  if (/online/.test(s)) return { ...base, intent: "spend_channel", channel: "online" };
  if (/offline/.test(s)) return { ...base, intent: "spend_channel", channel: "offline" };
  if (/income|earn/.test(s)) return { ...base, intent: "income_total" };
  const cat = /(?:on|for)\s+([a-z &]+?)(?:\s+(?:this|last|today|in)\b|\?|$)/.exec(s)?.[1]?.trim();
  if (cat && !/^(me|my|it)$/.test(cat)) return { ...base, intent: "spend_category", category: cat };
  if (/spend|spent/.test(s)) return { ...base, intent: "spend_total" };
  return { ...base, intent: "unsupported" };
}

/** Numbers in `text`, normalised (commas and trailing zeros removed) so "₹1,250.50" and "1250.5" compare equal. */
export const numbersIn = (text: string) => new Set((text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => String(Number(n.replace(/,/g, "")))));
/** The AI may only re-word: if its reply contains any number that is not in the verified text, it is discarded. */
export function groundedRewrite(verified: string, rewrite: string): string | null {
  const ok = numbersIn(verified); for (const n of numbersIn(rewrite)) if (!ok.has(n)) return null; return rewrite.trim() || null;
}
const Rewrite = z.object({ answer: z.string().min(1).max(700) });

export interface Answer { text: string; facts: Record<string, unknown>; period: string; usedAI: boolean }

/** All numbers come from deterministic code. The model may only choose the intent and (optionally) rephrase facts. */
export async function answerQuestion(sb: SupabaseClient, tz: string, question: string): Promise<Answer> {
  const ai = await askJson('Convert the question to JSON {"intent","period","category","method","goal","channel"} choosing intent from: spend_total, spend_category, spend_method, spend_channel, compare_periods, top_category, biggest_increase, recurring_list, goal_contribution, goal_feasibility, budget_suggestion, income_total, unsupported.', { question: question.slice(0, 300) }, Plan, 150);
  const plan = ai?.value ?? keywordPlan(question);
  const now = new Date(); const { txs, lookups } = await loadTxs(sb, undefined, new Date(now.getTime() - 800 * 864e5)); // covers year-vs-previous-year
  const mk = (p: QueryPlan["period"]) => { if (p === "last_month") { const cur = presetRange("month", now, tz); const prev = previousRange(cur, "month", tz); return { range: prev, prev: previousRange(prev, "month", tz) }; } const r = presetRange(p as Preset, now, tz); return { range: r, prev: previousRange(r, p as Preset, tz) }; };
  const { range, prev } = mk(plan.period); const s = summarize(txs, range), o = summarize(txs, prev);
  const label = `${localDate(range.start, tz)} to ${localDate(new Date(range.end.getTime() - 1), tz)}`;
  const catId = (n?: string | null) => n ? lookups.categories.find((c) => c.kind === "expense" && (c.name.toLowerCase().includes(n.toLowerCase()) || n.toLowerCase().includes(c.name.toLowerCase().split(" ")[0])))?.id : undefined;
  const cname = (id: string) => lookups.categories.find((c) => c.id === id)?.name ?? "Uncategorised";
  let text: string; let facts: Record<string, unknown> = {};
  switch (plan.intent) {
    case "spend_total": text = `You spent ${inr(s.netExpenseMinor)} (net of refunds) in ${label}.`; facts = { netExpenseMinor: s.netExpenseMinor }; break;
    case "income_total": text = `Your income was ${inr(s.incomeMinor)} in ${label}.`; facts = { incomeMinor: s.incomeMinor }; break;
    case "spend_category": { const id = catId(plan.category); if (!id) { text = `I couldn't match “${plan.category}” to one of your categories.`; break; } const v = s.byCategory[id] ?? 0; text = `You spent ${inr(v)} on ${cname(id)} in ${label}.`; facts = { category: cname(id), minor: v }; break; }
    case "spend_method": { const code = lookups.methods.find((m) => m.code.includes(plan.method ?? "~") || m.label.toLowerCase().includes(plan.method ?? "~"))?.code; const v = code ? (s.byPaymentMethod[code] ?? 0) : 0; text = code ? `You spent ${inr(v)} via ${lookups.methods.find((m) => m.code === code)!.label} in ${label}.` : `I couldn't find a payment method matching “${plan.method}”.`; facts = { method: code, minor: v }; break; }
    case "spend_channel": { const v = plan.channel === "online" ? s.onlineMinor : s.offlineMinor; text = `Your ${plan.channel} spending was ${inr(v)} in ${label}.`; facts = { channel: plan.channel, minor: v }; break; }
    case "compare_periods": { const d = o.netExpenseMinor ? Math.round(((s.netExpenseMinor - o.netExpenseMinor) * 100) / o.netExpenseMinor) : null; text = `Net spending: ${inr(s.netExpenseMinor)} this period vs ${inr(o.netExpenseMinor)} previously${d === null ? "" : ` (${d >= 0 ? "+" : ""}${d}%)`}. Income: ${inr(s.incomeMinor)} vs ${inr(o.incomeMinor)}.`; facts = { cur: s.netExpenseMinor, prev: o.netExpenseMinor }; break; }
    case "top_category": { const t = Object.entries(s.byCategory).sort((a, b) => b[1] - a[1])[0]; text = t && t[1] > 0 ? `Your highest category in ${label} was ${cname(t[0])} at ${inr(t[1])}.` : `No spending recorded in ${label}.`; facts = { top: t }; break; }
    case "biggest_increase": { const inc = Object.entries(s.byCategory).map(([id, v]) => [id, v - (o.byCategory[id] ?? 0)] as const).sort((a, b) => b[1] - a[1])[0]; text = inc && inc[1] > 0 ? `${cname(inc[0])} increased the most: +${inr(inc[1])} versus the previous period.` : "No category increased versus the previous period."; facts = { inc }; break; }
    case "recurring_list": { const { data } = await sb.from("recurring_rules").select("name,estimated_amount_minor,frequency,next_due_date,paused,tx_type"); const l = (data ?? []).filter((r) => !r.paused); text = l.length ? `Your recurring items:\n${l.map((r) => `• ${r.name} — ${inr(Number(r.estimated_amount_minor))} ${r.frequency}, next ${r.next_due_date}`).join("\n")}` : "You have no active recurring items."; facts = { count: l.length }; break; }
    case "goal_contribution": case "goal_feasibility": {
      const { data: goals } = await sb.from("financial_goals").select("*"); const { data: cs } = await sb.from("goal_contributions").select("goal_id,amount_minor,contributed_on");
      const g = (goals ?? []).find((x) => !plan.goal || x.name.toLowerCase().includes(plan.goal.toLowerCase()) || x.kind.includes(plan.goal.toLowerCase())) ?? (goals ?? [])[0];
      if (!g) { text = "You haven't created any goals yet."; break; }
      const mine = (cs ?? []).filter((c) => c.goal_id === g.id); const total = mine.reduce((a, c) => a + Number(c.amount_minor), 0); const today = localDate(now, tz);
      const gi = { targetMinor: Number(g.target_minor), contributedMinor: total, targetDate: g.target_date, status: g.status }; const pr = goalProgress(gi, today);
      if (plan.intent === "goal_contribution") { text = `You've contributed ${inr(total)} to “${g.name}” (${pr.pct}% of ${inr(Number(g.target_minor))}).`; break; }
      const since = new Date(now.getTime() - 90 * 864e5).toISOString().slice(0, 10); const pace = Math.floor(mine.filter((c) => c.contributed_on >= since && c.amount_minor > 0).reduce((a, c) => a + Number(c.amount_minor), 0) / 3);
      const eta = estimatedCompletion(gi, pace, today);
      text = !g.target_date ? `“${g.name}” has no target date. ${pr.pct}% done; ${inr(pr.remainingMinor)} remaining.` : pace <= 0 ? `Not enough recent contributions to estimate. To reach “${g.name}” by ${g.target_date} you'd need about ${inr(pr.requiredMonthlyMinor)}/month.` : `At your recent pace of ~${inr(pace)}/month, “${g.name}” would complete around ${eta} (estimate). Target date: ${g.target_date}; needed: ${inr(pr.requiredMonthlyMinor)}/month — ${eta! <= g.target_date ? "looks achievable" : "you may fall short"}.`;
      facts = { goal: g.name, pace, required: pr.requiredMonthlyMinor }; break; }
    case "budget_suggestion": { const three = summarize(txs, { start: new Date(now.getTime() - 90 * 864e5), end: now }); const rows = Object.entries(three.byCategory).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, v]) => `• ${cname(id)}: ${inr(Math.round((v / 3) * 1.05 / 10000) * 10000)}/month`); text = rows.length ? `Based on the last 90 days (average + 5% buffer, an estimate):\n${rows.join("\n")}` : "Not enough recent spending to suggest budgets."; facts = { basis: "90-day average" }; break; }
    default: text = "I can answer questions about your spending, income, categories, payment methods, recurring items, goals and budgets. Try “How much did I spend this month?”";
  }
  // Optional natural-language polish by the AI provider — numbers are checked against the verified answer.
  let usedAI = !!ai;
  if (plan.intent !== "unsupported") {
    const nice = await askJson("Re-word this verified answer for the user in a friendly, concise way (max 3 short sentences or a short list). Keep every number exactly as given; add no new numbers, advice or claims. Return JSON {\"answer\": string}.", { question: question.slice(0, 300), verifiedAnswer: text }, Rewrite, 300);
    const safe = nice ? groundedRewrite(text, nice.value.answer) : null;
    if (safe) { text = safe; usedAI = true; }
  }
  return { text, facts, period: label, usedAI };
}
