import { requireUser } from "@/lib/server/auth";
import { loadTxs } from "@/lib/server/data";
import { goalProgress } from "@/lib/finance/goals";
import { planSavings } from "@/lib/finance/savings";
import { summarize } from "@/lib/finance/accounting";
import { presetRange, localDate } from "@/lib/finance/dates";
import { formatMoney } from "@/lib/finance/money";
import { saveSavingsPlan } from "@/app/actions/plan";
import { ActionForm } from "@/components/action-form";
import { Card, Field, PageHeader } from "@/components/ui";
import { NumInput } from "@/components/num-input";
import { SummaryLine } from "@/components/summary-line";
import Link from "next/link";
import { addMonths } from "@/lib/finance/loans";
import { formatYmd } from "@/lib/finance/dates";

export default async function Savings() {
  const { supabase, profile } = await requireUser();
  // Suggested defaults come from last full 3 months of real data; the user's saved assumptions always win.
  const now = new Date(); const cur = presetRange("month", now, profile.timezone);
  const prevEnd = cur.start; const start = new Date(prevEnd); start.setUTCMonth(start.getUTCMonth() - 3);
  const [{ data: plan }, { data: goals }, { data: contribs }, { txs }] = await Promise.all([
    supabase.from("savings_plans").select("*").maybeSingle(),
    supabase.from("financial_goals").select("*").eq("status", "active"),
    supabase.from("goal_contributions").select("goal_id,amount_minor"),
    loadTxs(supabase, undefined, start, prevEnd),
  ]);
  const today = localDate(now, profile.timezone); const m = (v: number) => formatMoney(v, profile.currency);
  const hist = summarize(txs, { start, end: prevEnd });
  const hasHist = txs.some((t) => new Date(t.occurredAt) >= start && new Date(t.occurredAt) < prevEnd);
  const avg = (v: number) => Math.round(v / 3);
  const a = plan ? { income: Number(plan.monthly_income_minor), essential: Number(plan.essential_minor), disc: Number(plan.discretionary_minor), commit: Number(plan.commitments_minor), savings: Number(plan.current_savings_minor) } : null;
  const need = (goals ?? []).map((g) => { const total = (contribs ?? []).filter((c) => c.goal_id === g.id).reduce((s, c) => s + Number(c.amount_minor), 0); return { g, pr: goalProgress({ targetMinor: Number(g.target_minor), contributedMinor: total, targetDate: g.target_date, status: g.status }, today) }; });
  const res = a ? planSavings({ monthlyIncomeMinor: a.income, essentialMinor: a.essential, discretionaryMinor: a.disc, commitmentsMinor: a.commit, goalsRequiredMonthlyMinor: need.map((n) => n.pr.requiredMonthlyMinor) }) : null;
  const val = (v: number | undefined, d: number) => String((v ?? d) / 100);
  return (
    <>
      <PageHeader title="Savings planner" desc={<SummaryLine pill={res ? <>Save <span className="tabnum">{m(Math.round(res.recommendedMonthlyMinor / 100) * 100)}</span> a month</> : "Not set up yet"} items={res ? [`${need.length} active goal${need.length === 1 ? "" : "s"}`, res.isDeficit ? "spending is above income" : res.shortfallMonthlyMinor > 0 ? "goals need more than you can save" : "goals are within reach", { t: "based on the figures you entered", small: true }] : ["enter your monthly figures to see how much you can save"]} />} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><h2 className="mb-1 font-medium">Your monthly money</h2>
          <p className="mb-3 text-xs text-muted">{hasHist ? `Tell us about a normal month. We filled in the boxes from your last 3 months (on average you earned ${m(Math.round(avg(hist.incomeMinor) / 100) * 100)} and spent ${m(Math.round(avg(hist.netExpenseMinor) / 100) * 100)} a month). Change anything that is not right.` : "We have no records for the last 3 months yet, so please type your own figures."}</p>
          <ActionForm action={saveSavingsPlan} submit="Save and update my plan"><div className="grid gap-3 sm:grid-cols-2">
            <Field label="How much do you earn each month?" hint="Salary, business income, any money that comes in every month."><NumInput name="income" defaultValue={val(a?.income, avg(hist.incomeMinor))} /></Field>
            <Field label="Must-pay costs each month" hint="Rent, groceries, electricity and phone bills, travel to work, school fees."><NumInput name="essential" defaultValue={val(a?.essential, 0)} /></Field>
            <Field label="Extras and fun each month" hint="Eating out, shopping, movies, subscriptions. Things you could cut if needed."><NumInput name="discretionary" defaultValue={val(a?.disc, 0)} /></Field>
            <Field label="Loan EMIs and other fixed payments" hint="Add only what is not already in “Must-pay costs”."><NumInput name="commitments" defaultValue={val(a?.commit, 0)} /></Field>
            <Field label="Savings you already have" hint="Just for your reference. We do not use it to work out your plan."><NumInput name="savings" defaultValue={val(a?.savings, 0)} /></Field>
          </div></ActionForm></Card>
        <Card><h2 className="mb-3 font-medium">Your savings plan</h2>
          {!res ? <p className="text-sm text-muted">Fill in your monthly figures on the left and press “Save and update my plan” to see it.</p> : (() => {
            const r = (v: number) => m(Math.round(v / 100) * 100); // whole rupees read better than paise
            const short = res.shortfallMonthlyMinor > 0; const trim = Math.round((a?.disc ?? 0) / 10);
            const verdict = res.isDeficit ? { tone: "bad", text: `You are spending ${r(-res.surplusMinor)} more than you earn each month. Cut back first, then set savings targets.` }
              : !need.length ? { tone: "info", text: `You can save about ${r(res.recommendedMonthlyMinor)} a month. Add a goal to give it a purpose.` }
              : short ? { tone: "warn", text: `Your goals need ${r(res.shortfallMonthlyMinor)} more a month than you can save. Give them more time, or lower the target amounts.` }
              : { tone: "good", text: "Good news: you can reach all your goals with what you have left each month." };
            const box = { bad: "border-bad/40 bg-bad/10 text-bad", warn: "border-warn/40 bg-warn/10 text-warn", info: "border-info/40 bg-info/10 text-info", good: "border-good/40 bg-good/10 text-good" }[verdict.tone as "bad"];
            return <div className="grid gap-4 text-sm">
              <p role={verdict.tone === "good" || verdict.tone === "info" ? "status" : "alert"} className={`rounded-xl border px-4 py-3 font-medium ${box}`}>{verdict.text}</p>
              {a && a.income > 0 && (() => { const segs = [["Must-pay costs", a.essential, "bg-indigo-500"], ["Extras & fun", a.disc, "bg-fuchsia-400"], ["EMIs & fixed", a.commit, "bg-amber-400"], ["Left over", Math.max(0, res.surplusMinor), "bg-emerald-500"]] as const; const total = Math.max(a.income, a.essential + a.disc + a.commit) || 1;
                return <div><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Where your income goes</h3>
                  <div className="flex h-4 overflow-hidden rounded-full bg-surface2" role="img" aria-label="Share of income by use">{segs.map(([k, v, c]) => v > 0 && <div key={k} className={c} style={{ width: `${(v / total) * 100}%` }} title={`${k}: ${r(v)}`} />)}</div>
                  <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">{segs.map(([k, v, c]) => <li key={k} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${c}`} aria-hidden /><span className="text-muted">{k}</span><b className="tabnum ml-auto">{Math.round((v / a.income) * 100)}%</b></li>)}</ul></div>; })()}
              <dl className="grid gap-3 sm:grid-cols-3">
                {([["Left over each month", r(res.surplusMinor), "What remains after your must-pay costs, extras and EMIs."],
                  ["You can put aside", r(res.availableMonthlyMinor), trim > 0 ? `That is what is left over, plus ${r(trim)} from cutting 10% of your extras and fun spending.` : "What you can set aside each month."],
                  ["Your goals need", r(res.requiredMonthlyMinor), "Every month, to finish each goal by its date."]] as const).map(([k, v, h]) => (
                  <div key={k} className="rounded-xl border border-line bg-surface/60 p-3"><dt className="text-xs font-medium text-muted">{k}</dt><dd className="tabnum mt-1 text-xl font-semibold">{v}</dd><p className="mt-1 text-xs text-muted">{h}</p></div>))}
              </dl>
              {!res.isDeficit && <div className="rounded-xl bg-brand/8 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-brand">What we suggest</p>
                <p className="mt-1 text-2xl font-bold">Save <span className="tabnum">{r(res.recommendedMonthlyMinor)}</span> a month</p>
                <p className="mt-1 text-muted">That is about {r(res.recommendedWeeklyMinor)} a week, or {r(res.recommendedDailyMinor)} a day. In 12 months you would have <b className="tabnum text-fg">{r(res.yearlyProjectionMinor)}</b>.</p></div>}
              {need.length > 0 && <div><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Your goals</h3><ul className="grid gap-2">{need.map(({ g, pr }) => {
                const req = pr.requiredMonthlyMinor; const share = res.requiredMonthlyMinor > 0 ? (res.availableMonthlyMinor * req) / res.requiredMonthlyMinor : 0;
                const when = short && req > 0 && share > 0 ? formatYmd(addMonths(today, Math.ceil(pr.remainingMinor / share))) : null;
                return (<li key={g.id} className="rounded-xl border border-line bg-surface/60 px-3 py-2"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{g.name}</span>
                  <span className="text-muted">{req > 0 ? <>needs <b className="tabnum text-fg">{r(req)}</b> a month</> : g.target_date ? "on track, or already done" : "add a finish date to see what it needs"}</span></div>
                  {req > 0 && <p className={`mt-0.5 text-xs ${short ? "text-warn" : "text-good"}`}>{short ? (when ? `At your budget, this goal would finish around ${when}${g.target_date ? ` instead of ${formatYmd(g.target_date)}` : ""}.` : "You have nothing left to put towards this right now.") : "Your budget covers this."}</p>}</li>); })}</ul>
                {short && <p className="mt-3 text-sm">Want to free up more? <Link href="/ai/analysis" className="font-medium text-brand underline">Try the what-if coach</Link> to see where you could cut back.</p>}</div>}
              <p className="text-xs text-muted">Your existing savings are not counted as spendable. This is an estimate to help you plan, not financial advice.</p>
            </div>; })()}</Card>
      </div>
    </>
  );
}
