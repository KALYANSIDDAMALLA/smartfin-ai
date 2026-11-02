"use client";
import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, PiggyBank, RotateCcw, Target, TrendingUp } from "lucide-react";
import { whatIf, type CoachBase, type GoalLite } from "@/lib/finance/coach";
import { formatMoney } from "@/lib/finance/money";
import { pctText } from "@/lib/finance/pct";
import { saveBudget } from "@/app/actions/plan";
import { ActionForm } from "./action-form";
import { Card, cn } from "./ui";

const PRESETS = [["Gentle", 10], ["Balanced", 20], ["Ambitious", 30]] as const;

/** Move a slider per flexible category and see, instantly, what it adds to monthly savings, the savings rate and your nearest goal. */
export function CoachSimulator({ base, goal, currency }: { base: CoachBase; goal: GoalLite | null; currency: string }) {
  const suggested = () => Object.fromEntries(base.opportunities.map((o) => [o.id, o.suggestedCutPct])); const [cuts, setCuts] = useState<Record<string, number>>(suggested);
  const set = (id: string, v: number) => setCuts((c) => ({ ...c, [id]: v })); const all = (v: number) => setCuts(Object.fromEntries(base.opportunities.map((o) => [o.id, v])));
  const w = whatIf(base, cuts, goal); const m = (v: number) => formatMoney(v, currency); const up = w.extraMonthlyMinor > 0;
  return (
    <div className="grid gap-4">
      <section className="relative isolate overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(135deg,#064e3b,#047857_55%,#0d9488)] p-5 text-white shadow-xl shadow-emerald-900/20 sm:p-7" aria-live="polite" aria-label="What your changes add up to">
        <div className="pointer-events-none absolute -right-16 -top-20 -z-10 h-64 w-64 rounded-full bg-lime-300/20 blur-3xl" aria-hidden />
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-emerald-100"><PiggyBank size={14} aria-hidden />If you make these changes</p>
        <p className="tabnum mt-1 text-4xl font-bold sm:text-5xl">+{m(w.extraMonthlyMinor)}<span className="ml-2 text-base font-medium text-emerald-100">more saved every month</span></p>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-xl bg-white/10 p-3"><p className="text-xs text-emerald-100">Over a year</p><p className="tabnum text-lg font-semibold">{m(w.extraYearlyMinor)}</p></div>
          <div className="rounded-xl bg-white/10 p-3"><p className="text-xs text-emerald-100">Savings rate</p><p className="tabnum flex items-center gap-1.5 text-lg font-semibold">{base.savingsRatePct === null ? "—" : pctText(base.savingsRatePct)} <span aria-hidden>→</span> {w.newRatePct === null ? "—" : pctText(w.newRatePct)}{up && <ArrowUpRight size={16} aria-hidden />}</p></div>
          <div className="rounded-xl bg-white/10 p-3"><p className="flex items-center gap-1 text-xs text-emerald-100"><Target size={12} aria-hidden />{w.goal ? `“${w.goal.name}” goal` : "Your goals"}</p>
            <p className="text-lg font-semibold">{!w.goal ? "No active goal" : w.goal.monthsSooner && w.goal.monthsSooner > 0 ? `${w.goal.monthsSooner} month${w.goal.monthsSooner === 1 ? "" : "s"} sooner` : w.goal.monthsNew ? `In about ${w.goal.monthsNew} months` : "Start saving to reach it"}</p>
            {w.goal?.monthsNow && w.goal.monthsNew && w.goal.monthsNow !== w.goal.monthsNew && <p className="text-xs text-emerald-100">{w.goal.monthsNow} → {w.goal.monthsNew} months</p>}</div>
        </div>
      </section>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-medium"><TrendingUp size={16} className="text-brand" aria-hidden />Try cutting back</h2>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Quick presets">
            {PRESETS.map(([l, v]) => <button key={l} type="button" onClick={() => all(v)} className="rounded-full border border-line bg-surface/70 px-3 py-1 text-sm transition hover:border-brand/60 hover:bg-brand/10">{l} · {v}%</button>)}
            <button type="button" onClick={() => setCuts(suggested())} className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm text-brand hover:bg-brand/10 md:py-1"><RotateCcw size={13} aria-hidden />Suggested</button>
            <button type="button" onClick={() => all(0)} className="rounded-full px-3 py-2 text-sm text-muted hover:bg-surface2 md:py-1">Clear</button></div></div>
        <p className="mt-1 text-xs text-muted">Based on your last 3 months. Rent, loans, salaries, stock and other essential costs ({m(base.fixedMonthlyMinor)} a month) are left out, since they are hard to cut.</p>
        {!base.opportunities.length ? <p className="mt-4 text-sm text-muted">No flexible category is big enough to trim yet. Keep adding transactions and check back soon.</p> : (
          <ul className="mt-4 grid gap-3">{base.opportunities.map((o) => { const cut = cuts[o.id] ?? 0; const saves = Math.round((o.monthlyMinor * cut) / 100 / 100) * 100; const budget = Math.ceil((o.monthlyMinor * (100 - cut)) / 100 / 10000) * 100; return (
            <li key={o.id} className="rounded-xl border border-line bg-surface/60 p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{o.name}</p>
                <p className="flex items-center gap-2 text-sm"><span className="tabnum">{m(o.monthlyMinor)}<span className="text-muted"> a month</span></span>
                  {o.trendPct !== null && Math.abs(o.trendPct) >= 5 && <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold", o.trendPct > 0 ? "bg-bad/15 text-bad" : "bg-good/15 text-good")}>{o.trendPct > 0 ? <ArrowUpRight size={12} aria-hidden /> : <ArrowDownRight size={12} aria-hidden />}{pctText(o.trendPct, true)}</span>}</p></div>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input type="range" min={0} max={50} step={5} value={cut} onChange={(e) => set(o.id, Number(e.target.value))} aria-label={`Cut ${o.name} by percent`} className="h-2 min-w-[10rem] flex-1 cursor-pointer accent-emerald-500" />
                <span className="tabnum w-12 text-right text-sm font-semibold">{cut}%</span>
                <span className={cn("tabnum w-40 text-sm", cut ? "font-medium text-good" : "text-muted")}>{cut ? `saves ${m(saves)} a month` : "no change"}</span>
                {cut > 0 && <ActionForm action={saveBudget} compact submit={`Set ${m(budget * 100)} budget`} variant="outline">
                  <input type="hidden" name="name" value={`${o.name} budget`} /><input type="hidden" name="period" value="monthly" /><input type="hidden" name="amount" value={String(budget)} /><input type="hidden" name="categoryId" value={o.id} /><input type="hidden" name="thresholds" value="50,75,90,100" /></ActionForm>}
              </div></li>); })}</ul>)}
      </Card>
    </div>
  );
}
