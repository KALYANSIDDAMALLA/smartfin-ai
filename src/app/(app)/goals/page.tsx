import { requireUser } from "@/lib/server/auth";
import { goalProgress, estimatedCompletion, monthsBetween, MILESTONES } from "@/lib/finance/goals";
import { formatMoney } from "@/lib/finance/money";
import { localDate, formatYmd } from "@/lib/finance/dates";
import { saveGoal, setGoalStatus, deleteGoal, addContribution } from "@/app/actions/plan";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, EmptyState, Field, Input, PageHeader, Select, cn } from "@/components/ui";
import { NumInput } from "@/components/num-input";
import { DateBox } from "@/components/date-box";

import { SummaryLine } from "@/components/summary-line";

const KINDS = ["emergency_fund", "house", "vehicle", "education", "travel", "medical_reserve", "debt_repayment", "retirement", "business_investment", "custom"];
const KIND_ICON: Record<string, string> = { emergency_fund: "🛟", house: "🏠", vehicle: "🚗", education: "🎓", travel: "✈️", medical_reserve: "🩺", debt_repayment: "💳", retirement: "🌴", business_investment: "📈", custom: "🎯" };
const label = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function GoalFields({ g }: { g?: Record<string, any> }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {g && <input type="hidden" name="id" value={g.id} />}
    <Field label="Name"><Input name="name" required defaultValue={g?.name} /></Field>
    <Field label="Type"><Select name="kind" defaultValue={g?.kind ?? "custom"}>{KINDS.map((k) => <option key={k} value={k}>{label(k)}</option>)}</Select></Field>
    <Field label="Amount you need (₹)"><NumInput name="target" required defaultValue={g ? String(Number(g.target_minor) / 100) : ""} /></Field>
    <Field label="Finish by"><DateBox name="targetDate" label="Finish by" defaultValue={g?.target_date ?? ""} /></Field>
    <Field label="How often will you save?"><Select name="frequency" defaultValue={g?.contribution_frequency ?? ""}><option value="">—</option>{["daily", "weekly", "monthly", "yearly"].map((f) => <option key={f}>{f}</option>)}</Select></Field>
    <Field label="Why this goal? (optional)"><Input name="description" defaultValue={g?.description ?? ""} /></Field>
  </div>);
}

export default async function Goals() {
  const { supabase, profile } = await requireUser();
  const [{ data: goals }, { data: contribs }] = await Promise.all([supabase.from("financial_goals").select("*").order("created_at"), supabase.from("goal_contributions").select("*").order("contributed_on", { ascending: false })]);
  const today = localDate(new Date(), profile.timezone); const m = (v: number) => formatMoney(v, profile.currency);
  return (
    <>
      <PageHeader title="Financial goals" desc={<SummaryLine pill={goals?.length ? <><span className="tabnum">{goals.length}</span> goal{goals.length === 1 ? "" : "s"}</> : "No goals yet"} items={goals?.length ? [`${goals.filter((g) => g.status === "active").length} active`, goals.some((g) => g.status === "completed") && `${goals.filter((g) => g.status === "completed").length} achieved`, goals.some((g) => g.status === "paused") && `${goals.filter((g) => g.status === "paused").length} paused`, `${m((contribs ?? []).reduce((s, c) => s + Number(c.amount_minor), 0))} saved so far`] : ["add something to save for, then add money to it as you go"]} />} />
      <div className="grid gap-6">
        <Card><h2 className="mb-3 font-medium">New goal</h2><ActionForm action={saveGoal} submit="Create goal"><GoalFields /></ActionForm></Card>
        {!goals?.length ? <EmptyState title="No goals yet" hint="Set a target and track contributions toward it." /> :
          <div className="grid gap-4 lg:grid-cols-2">{goals.map((g) => {
            const mine = (contribs ?? []).filter((c) => c.goal_id === g.id); const total = mine.reduce((s, c) => s + Number(c.amount_minor), 0);
            const gi = { targetMinor: Number(g.target_minor), contributedMinor: total, targetDate: g.target_date, status: g.status };
            const pr = goalProgress(gi, today);
            const last90 = mine.filter((c) => c.amount_minor > 0 && c.contributed_on >= new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10)).reduce((s, c) => s + Number(c.amount_minor), 0);
            const eta = estimatedCompletion(gi, Math.floor(last90 / 3), today);
            const pace = Math.floor(last90 / 3); const need = pr.requiredMonthlyMinor; const done = g.status === "completed" || pr.remainingMinor === 0;
            const lateBy = eta && g.target_date && eta > g.target_date ? monthsBetween(g.target_date, eta) : 0; const earlyBy = eta && g.target_date && eta < g.target_date ? monthsBetween(eta, g.target_date) : 0;
            const health = done ? { t: "Done", c: "good" } : !g.target_date ? { t: "No deadline", c: "neutral" } : total === 0 ? { t: "Not started", c: "neutral" } : pace >= need ? { t: earlyBy >= 2 ? "Ahead" : "On track", c: "good" } : { t: "Behind", c: "warn" };
            const whole = (v: number) => m(Math.round(v / 100) * 100); const oneTap = Math.min(need, pr.remainingMinor); const monthsLeft = pr.monthsLeft;
            return (<Card key={g.id}>
              <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand/10 text-xl" aria-hidden>{KIND_ICON[g.kind] ?? "🎯"}</span><div className="min-w-0"><h3 className="truncate text-lg font-semibold">{g.name}</h3><p className="text-xs text-muted">{label(g.kind)}{g.target_date && ` · finish by ${formatYmd(g.target_date)}`}{monthsLeft !== null && monthsLeft > 0 && !done ? ` · ${monthsLeft} month${monthsLeft === 1 ? "" : "s"} left` : ""}</p></div></div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">{g.status === "paused" && <Badge>paused</Badge>}<Badge tone={health.c as "good"}>{health.t}</Badge></div></div>
              <div className="mt-4"><p className="tabnum"><span className="text-2xl font-bold">{m(total)}</span><span className="text-sm text-muted"> saved of {m(Number(g.target_minor))}</span></p>
                <div className="relative mt-2 h-3 rounded-full bg-surface2" role="progressbar" aria-valuenow={pr.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.name} progress`}>
                  <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-400" style={{ width: `${Math.max(pr.pct, total > 0 ? 2 : 0)}%` }} />
                  {[25, 50, 75].map((t) => <span key={t} className="absolute top-0 h-3 w-px bg-white/70" style={{ left: `${t}%` }} aria-hidden />)}</div>
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted"><span><b className="text-fg">{pr.pct}%</b> done · {m(pr.remainingMinor)} to go</span>
                  <span className="flex gap-1.5" aria-label="Milestones">{MILESTONES.map((t) => <span key={t} className={cn("rounded-full px-1.5 py-0.5", pr.reachedMilestones.includes(t) ? "bg-good/15 font-semibold text-good" : "bg-surface2")}>{pr.reachedMilestones.includes(t) ? "✓ " : ""}{t}%</span>)}</span></div></div>
              {!done && <div className="mt-3 rounded-xl bg-brand/8 p-3 text-sm">
                {need > 0 ? <p>To finish by <b>{formatYmd(g.target_date!)}</b>, put aside about <b className="tabnum">{whole(need)}</b> a month.</p> : g.target_date ? <p>Set a finish date earlier than today to see what it needs.</p> : <p>Add a “Finish by” date (under Change goal details) to see how much to save each month.</p>}
                {eta ? <p className="mt-1 text-muted">At the pace you have been saving ({whole(pace)} a month) you would finish around <b className="text-fg">{formatYmd(eta)}</b>{lateBy > 0 ? `, about ${lateBy} month${lateBy === 1 ? "" : "s"} late.` : earlyBy > 0 ? `, about ${earlyBy} month${earlyBy === 1 ? "" : "s"} early.` : "."}</p> : <p className="mt-1 text-muted">Save regularly for a few weeks and we will estimate when you will finish.</p>}</div>}
              {g.status === "active" && oneTap > 0 && <ActionForm action={addContribution} submit={`Add ${whole(oneTap)} now`} variant="outline" className="mt-3"><input type="hidden" name="goalId" value={g.id} /><input type="hidden" name="kind" value="contribute" /><input type="hidden" name="amount" value={String(Math.ceil(oneTap / 100))} /><input type="hidden" name="date" value={today} /><input type="hidden" name="note" value="Monthly saving" /></ActionForm>}
              {g.status !== "completed" && <details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-brand">Add or take out a different amount</summary><ActionForm action={addContribution} submit="Save entry" className="mt-3"><input type="hidden" name="goalId" value={g.id} />
                <div className="grid items-start gap-3 sm:grid-cols-2"><Field label="Amount (₹)"><NumInput name="amount" required /></Field><Field label="What are you doing?"><Select name="kind"><option value="contribute">Adding money to this goal</option><option value="withdraw">Taking money out</option></Select></Field><Field label="Date"><Input name="date" type="date" defaultValue={today} /></Field><Field label="Note (optional)"><Input name="note" maxLength={200} placeholder="e.g. bonus" /></Field></div></ActionForm></details>}
              {mine.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-sm text-brand">Payments so far ({mine.length})</summary><ul className="mt-2 grid gap-1 text-sm">{mine.slice(0, 20).map((c) => <li key={c.id} className="flex justify-between gap-3"><span className="text-muted">{formatYmd(c.contributed_on)}{c.note && ` · ${c.note}`}</span><span className={`tabnum ${c.amount_minor < 0 ? "text-bad" : "text-good"}`}>{c.amount_minor < 0 ? "−" : "+"}{m(Math.abs(Number(c.amount_minor)))}</span></li>)}</ul></details>}
              <details className="mt-2"><summary className="cursor-pointer text-sm text-brand">Change goal details</summary><div className="mt-3"><ActionForm action={saveGoal} submit="Save changes"><GoalFields g={g} /></ActionForm></div></details>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                {g.status === "active" && <ActionForm action={setGoalStatus} compact submit="Pause goal" variant="outline"><input type="hidden" name="id" value={g.id} /><input type="hidden" name="status" value="paused" /></ActionForm>}
                {g.status === "paused" && <ActionForm action={setGoalStatus} compact submit="Resume goal" variant="outline"><input type="hidden" name="id" value={g.id} /><input type="hidden" name="status" value="active" /></ActionForm>}
                {g.status !== "completed" && <ActionForm action={setGoalStatus} compact submit="Mark as achieved" variant="outline" confirm="Mark this goal as achieved?"><input type="hidden" name="id" value={g.id} /><input type="hidden" name="status" value="completed" /></ActionForm>}
                <ActionForm action={deleteGoal} compact submit="Delete" variant="danger" confirm={`Delete goal "${g.name}" and its contribution history?`}><input type="hidden" name="id" value={g.id} /></ActionForm>
              </div></Card>);
          })}</div>}
      </div>
    </>
  );
}
