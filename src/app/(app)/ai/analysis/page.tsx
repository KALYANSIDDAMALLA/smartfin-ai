import { Sparkles } from "lucide-react";
import { requireUser } from "@/lib/server/auth";
import { fallbackPlan, latestPlan, loadCoach } from "@/lib/server/coach";
import { aiStatus } from "@/lib/server/ai";
import { writeCoachPlan } from "@/app/actions/ai";
import { formatMoney } from "@/lib/finance/money";
import { ActionForm } from "@/components/action-form";
import { AiStatus } from "@/components/ai-status";
import { CoachSimulator } from "@/components/coach-simulator";
import { AskFollowUp } from "@/components/insight-panels";
import { Card, EmptyState, PageHeader, cn } from "@/components/ui";
import { SummaryLine } from "@/components/summary-line";

export default async function AiAnalysis() {
  const { supabase, profile } = await requireUser(); const { base, goal } = await loadCoach(supabase); const fmt = (v: number) => formatMoney(v, profile.currency);
  const saved = await latestPlan(supabase, profile.timezone); const plan = saved?.plan ?? fallbackPlan(base, goal, fmt); const ai = aiStatus().configured;
  const tiles: [string, string][] = [["You earn", fmt(base.incomeMonthlyMinor)], ["You spend", fmt(base.expenseMonthlyMinor)], [base.savingsMonthlyMinor >= 0 ? "You keep" : "You overspend by", fmt(Math.abs(base.savingsMonthlyMinor))], ["Savings rate", base.savingsRatePct === null ? "—" : `${base.savingsRatePct}%`]];
  return (
    <>
      <PageHeader title="AI analysis" desc={<SummaryLine pill="Your last 3 months" items={[base.txCount > 0 ? `${base.txCount.toLocaleString("en-IN")} transactions analysed` : "not enough history yet", { t: "move the sliders, get a 30-day plan, set budgets in one tap", small: true }]} />} />
      <AiStatus />
      {base.txCount < 5 ? <EmptyState title="The coach needs a little history" hint="Add a few weeks of income and spending and it will show you where you could save." /> : (
        <div className="grid gap-6">
          <div><h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">A typical month for you</h2>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{tiles.map(([k, v]) => <Card key={k} className="p-3 sm:p-4"><p className="text-xs text-muted">{k}</p><p className={cn("tabnum mt-1 text-xl font-semibold", k === "You overspend by" && "text-bad")}>{v}</p></Card>)}</div></div>
          <CoachSimulator base={base} goal={goal} currency={profile.currency} />
          <Card className="border-brand/30">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex flex-wrap items-center gap-2 font-medium"><span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white"><Sparkles size={15} aria-hidden /></span>Your 30-day plan
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", saved ? "bg-info/15 text-info" : "bg-surface2 text-muted")}>{saved ? `Written by AI · ${saved.model}` : "Built from your numbers"}</span></h2>
              {ai && base.opportunities.length > 0 && <ActionForm action={writeCoachPlan} submit={saved ? "Write a fresh plan" : "Write my plan with AI"} variant="outline" compact>{null}</ActionForm>}
            </div>
            <p className="mt-3 text-lg font-semibold leading-snug">{plan.headline}</p><p className="mt-1 text-sm text-muted">{plan.summary}</p>
            {plan.steps.length > 0 && <ol className="mt-4 grid gap-3 md:grid-cols-2">{plan.steps.map((s, i) => (
              <li key={s.title} className="flex gap-3 rounded-xl border border-line bg-surface/60 p-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-brandfg">{i + 1}</span>
                <div className="min-w-0"><p className="text-sm font-medium">{s.title}</p><p className="mt-0.5 text-sm text-muted">{s.detail}</p></div></li>))}</ol>}
            {plan.encouragement && <p className="mt-4 rounded-xl bg-brand/8 px-4 py-2 text-sm font-medium">{plan.encouragement}</p>}
            <p className="mt-3 text-xs text-muted">{saved ? `Written ${saved.at}. ` : ""}Suggestions are estimates based on your past spending, not financial advice.</p>
          </Card>
          <AskFollowUp questions={["Which category increased the most?", "Suggest a realistic budget based on my recent spending", "How much did I spend using UPI?", "Compare this month with last month"]} />
        </div>)}
    </>
  );
}
