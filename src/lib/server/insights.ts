import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { analyze, type Analysis } from "@/lib/finance/analysis";
import { allowedFrom, groundText } from "@/lib/finance/ground";
import { formatMoney } from "@/lib/finance/money";
import { likeForLike, type Range } from "@/lib/finance/dates";
import { loadTxs } from "./data";
import { askJson } from "./ai";

/** Loads the ledger slice the analysis needs (previous period + a year of history for baselines) and runs the engine. */
export async function loadAnalysis(sb: SupabaseClient, range: Range, prev: Range, tz: string, currency = "INR", extraFrom?: Date) {
  const now = new Date(); const from = new Date(Math.min(prev.start.getTime(), now.getTime() - 365 * 864e5, extraFrom?.getTime() ?? Infinity));
  const { txs, lookups } = await loadTxs(sb, undefined, from, range.end);
  const catName = (id: string) => lookups.categories.find((c) => c.id === id)?.name ?? "Uncategorised";
  const analysis = analyze({ txs, range, prev, prevLike: likeForLike(range, prev, now), tz, now, catName, fmt: (m) => formatMoney(m, currency) });
  return { analysis, lookups, txs };
}

/** The most recent saved narrative for exactly this period, if any (older rows missing newer fields still parse). */
export async function latestInsight(sb: SupabaseClient, a: Analysis, tz: string) {
  const { data } = await sb.from("ai_insights").select("insights,model,is_fallback,created_at").eq("period_start", a.period.start).eq("period_end", a.period.end).order("created_at", { ascending: false }).limit(1);
  const row = data?.[0]; const parsed = row ? InsightSchema.safeParse(row.insights) : null; if (!row || !parsed?.success) return null;
  return { insight: parsed.data, meta: { model: row.model as string | null, fallback: !!row.is_fallback, at: new Date(row.created_at).toLocaleString("en-IN", { timeZone: tz, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) } };
}

// Lenient on purpose: an over-long sentence or a sixth bullet is trimmed instead of throwing the whole reply away.
export const Text = (n: number) => z.string().transform((v) => (v.length > n ? v.slice(0, n - 1).trimEnd() + "…" : v));
export const List = <T extends z.ZodType>(item: T, max: number) => z.array(item).transform((a) => a.slice(0, max));
export const InsightSchema = z.object({
  headline: Text(180).default(""), summary: Text(900).default(""), highlights: List(Text(300), 6).default([]), wins: List(Text(240), 4).default([]),
  recommendations: List(Text(300), 5).default([]), review: List(Text(300), 5).default([]), forecast: Text(320).default(""),
  actions: List(z.object({ title: Text(100), detail: Text(300) }), 4).default([]),
});
export type Insight = z.infer<typeof InsightSchema>;

const FULL_DAY: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const nice = (ymd: string, withYear = true) => { const [y, m, d] = ymd.split("-").map(Number); return `${d} ${MON[m - 1]}${withYear ? ` ${y}` : ""}`; };
const times = (v: number, typical: number) => { const x = typical > 0 ? Math.round(v / typical) : 0; return x >= 2 ? `about ${x} times` : "well above"; };

/** Deterministic narrative in plain language, used when the AI provider is off or down. Every number comes straight from the analysis. */
export function fallbackInsight(a: Analysis, fmt: (minor: number) => string): Insight {
  const c = a.current, hl: string[] = [];
  const left = c.netCashFlowMinor;
  hl.push(`You earned ${fmt(c.incomeMinor)} and spent ${fmt(c.netExpenseMinor)}, ${left >= 0 ? `so you kept ${fmt(left)}` : `so you spent ${fmt(-left)} more than you earned`}.`);
  const t = a.topCategories[0]; if (t) hl.push(`${t.name} took the biggest share of your spending: ${fmt(t.minor)}, which is ${t.sharePct}% of everything you spent.`);
  if (a.biggest) hl.push(`Your largest single expense was ${fmt(a.biggest.minor)} (${a.biggest.label}) on ${nice(a.biggest.when)}.`);
  if (a.peakWeekday) hl.push(`You spend the most on ${FULL_DAY[a.peakWeekday] ?? a.peakWeekday}s${a.weekendSharePct !== null ? `, and ${a.weekendSharePct}% of your spending happens on weekends` : ""}.`);
  const f = a.forecast;
  return {
    headline: a.headline,
    summary: a.txCount ? `Here is how ${nice(a.period.start)} to ${nice(a.period.end)} went, based on ${a.txCount} transactions. Your financial health score is ${a.health.score} out of 100 (${a.health.label}).` : "No transactions in this period yet.",
    highlights: hl, wins: a.wins.slice(0, 4),
    recommendations: a.actions.slice(0, 4).map((x) => `${x.title}: ${x.detail}`),
    review: a.anomalies.map((u) => u.kind === "day"
      ? `On ${nice(u.when)} you spent ${fmt(u.minor)} in one day, ${times(u.minor, u.typicalMinor)} a normal day (about ${fmt(u.typicalMinor)}). Rent and other regular bills are not counted here.`
      : `${fmt(u.minor)} on ${u.label} (${nice(u.when)}) is ${times(u.minor, u.typicalMinor)} what you usually spend in this category (${fmt(u.typicalMinor)}).`),
    forecast: f ? `You are spending about ${fmt(f.perDayMinor)} a day. If that continues, this period will end near ${fmt(f.projectedExpenseMinor)}. This is an estimate, not a promise.` : "",
    actions: a.actions.slice(0, 4).map((x) => ({ title: x.title, detail: x.detail })),
  };
}

/** What to show for a period: a saved AI narrative if there is one, otherwise the built-in analysis computed live (so it is never out of date). */
export function narrativeFor(a: Analysis, fmt: (minor: number) => string, stored: Awaited<ReturnType<typeof latestInsight>>) {
  if (stored && !stored.meta.fallback) return stored;
  return { insight: fallbackInsight(a, fmt), meta: { model: null as string | null, fallback: true, at: "" } };
}

/** Drops any AI sentence that mentions an amount or percentage the engine did not compute; falls back per field. */
export function groundInsight(ai: Insight, fb: Insight, data: unknown): Insight {
  const ok = allowedFrom(data); const one = (t: string, f: string) => groundText(t, ok) || f;
  const many = (l: string[], f: string[]) => { const g = l.map((x) => groundText(x, ok)).filter(Boolean); return g.length ? g : f; };
  const acts = ai.actions.map((x) => ({ title: groundText(x.title, ok), detail: groundText(x.detail, ok) })).filter((x) => x.title && x.detail);
  return { headline: one(ai.headline, fb.headline), summary: one(ai.summary, fb.summary), highlights: many(ai.highlights, fb.highlights), wins: ai.wins.length ? many(ai.wins, fb.wins) : fb.wins,
    recommendations: many(ai.recommendations, fb.recommendations), review: ai.review.length ? many(ai.review, fb.review) : fb.review, forecast: ai.forecast ? one(ai.forecast, fb.forecast) : fb.forecast, actions: acts.length ? acts : fb.actions };
}

export async function generateInsight(sb: SupabaseClient, userId: string, range: Range, prev: Range, tz: string, currency = "INR") {
  const { analysis: a } = await loadAnalysis(sb, range, prev, tz, currency); const fmt = (m: number) => formatMoney(m, currency);
  const fb = fallbackInsight(a, fmt);
  // What the model sees: the verified analysis, without the bulky series and raw maps.
  const friendly = a.anomalies.map((u) => ({ ...u, when: nice(u.when), label: u.kind === "day" ? "a day with unusually high spending" : u.label })); // plain dates and wording, so the AI doesn't echo internal labels
  const slim = { period: { ...a.period, start: nice(a.period.start), end: nice(a.period.end) }, txCount: a.txCount, kpis: a.kpis, health: a.health, forecast: a.forecast, topCategories: a.topCategories, movers: a.movers, anomalies: friendly,
    recurring: a.recurring, biggest: a.biggest, peakWeekday: a.peakWeekday, weekendSharePct: a.weekendSharePct, wins: a.wins, actions: a.actions };
  const task = 'Write for an everyday person with no finance background: short, simple sentences, no jargon, dates like "27 Oct 2026", and never quote field names or labels in quotation marks. Write a warm, personal, specific analysis as JSON {"headline","summary","highlights":[],"wins":[],"recommendations":[],"review":[],"forecast","actions":[{"title","detail"}]}. '
    + 'headline = one punchy sentence. wins = genuine positives only. review = unusual items worth checking (never "fraud"). forecast = one sentence, labelled an estimate. actions = concrete next steps. '
    + 'Every rupee amount and percentage you write MUST appear in the data, and never write a percentage above 100 (say "more than double" instead); do not invent or calculate new figures. Amounts in the data are paise: write rupees with the ₹ sign.';
  const ai = a.txCount ? await askJson(task, slim, InsightSchema, 1100) : null;
  const insight = ai ? groundInsight(ai.value, fb, slim) : fb;
  await sb.from("ai_insights").insert({ user_id: userId, period_start: a.period.start, period_end: a.period.end, metrics: { current: a.current, previous: a.previous, topCategories: a.topCategories, health: a.health }, insights: insight, model: ai?.model ?? null, is_fallback: !ai });
  return { insight, analysis: a, fallback: !ai };
}
