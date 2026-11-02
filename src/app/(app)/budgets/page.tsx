import { requireUser } from "@/lib/server/auth";
import { loadLookups, loadTxs } from "@/lib/server/data";
import { earliestBudgetStart } from "@/lib/server/range";
import { suggestBudgets } from "@/lib/finance/automation";
import { Sparkles } from "lucide-react";
import { presetRange, localDate, type Preset } from "@/lib/finance/dates";
import { evaluateBudget, type BudgetDef } from "@/lib/finance/budget";
import { formatMoney } from "@/lib/finance/money";
import { saveBudget, deleteBudget, toggleBudget } from "@/app/actions/plan";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, EmptyState, Field, Input, PageHeader, Progress, Select } from "@/components/ui";
import { NumInput } from "@/components/num-input";
import { ThresholdPicker } from "@/components/threshold-picker";

const PRESET: Record<string, Preset> = { daily: "today", weekly: "week", monthly: "month", yearly: "year" };
const TONE = { on_track: "good", warning: "warn", critical: "warn", exceeded: "bad" } as const;

function BudgetFields({ cats, b }: { cats: { id: string; name: string; kind: string }[]; b?: Record<string, any> }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {b && <input type="hidden" name="id" value={b.id} />}
    <Field label="Name"><Input name="name" required defaultValue={b?.name} /></Field>
    <Field label="Limit (₹)"><NumInput name="amount" required defaultValue={b ? String(Number(b.amount_minor) / 100) : ""} /></Field>
    <Field label="Period"><Select name="period" defaultValue={b?.period ?? "monthly"}>{["daily", "weekly", "monthly", "yearly"].map((p) => <option key={p}>{p}</option>)}</Select></Field>
    <Field label="Category (optional)"><Select kind="category" name="categoryId" defaultValue={b?.category_id ?? ""}><option value="">All spending</option>{cats.filter((c) => c.kind === "expense").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
    <Field label="Channel (optional)"><Select name="channel" defaultValue={b?.channel ?? ""}><option value="">Online & offline</option><option value="online">Online only</option><option value="offline">Offline only</option></Select></Field>
    <div className="grid min-w-0 content-start gap-1.5 text-sm"><span className="flex min-h-[22px] items-center font-medium">Alert me at (% of the limit)</span><ThresholdPicker name="thresholds" defaultValue={b?.alert_thresholds ?? [50, 75, 90, 100]} /><span className="text-xs text-muted">Tap the levels you want. You get a notification when spending reaches each one.</span></div>
  </div>);
}

/** Start of a look-back window (module-level helper keeps the page component pure). */
const daysAgo = (n: number) => new Date(new Date().getTime() - n * 864e5);

import { SummaryLine } from "@/components/summary-line";

export default async function Budgets() {
  const { supabase, profile } = await requireUser();
  const [lookups, { data: budgets }] = await Promise.all([loadLookups(supabase), supabase.from("budgets").select("*").order("created_at")]);
  const from = earliestBudgetStart((budgets ?? []).map((b) => b.period), profile.timezone);
  // One ledger read covers both the budgets' current periods and the 90-day window used for suggestions (it is a subset), instead of two sequential reads.
  const since = daysAgo(92); const { txs: all } = await loadTxs(supabase, undefined, from && from < since ? from : since, undefined, true, "slim");
  const txs = from ? all : []; const recentTxs = all.filter((t) => t.occurredAt >= since.toISOString());
  // AI-style suggestions: last-90-day monthly average per category (+5%), skipping categories that already have a budget.
  const suggestions = suggestBudgets(recentTxs, lookups.categories, (budgets ?? []).filter((b) => b.period === "monthly").map((b) => b.category_id).filter(Boolean) as string[]);
  return (
    <>
      <PageHeader title="Budgets" desc={<SummaryLine pill={budgets?.length ? <><span className="tabnum">{budgets.length}</span> budget{budgets.length === 1 ? "" : "s"}</> : "No budgets yet"} items={budgets?.length ? [`${budgets.filter((b) => b.active).length} active`, budgets.some((b) => !b.active) && `${budgets.filter((b) => !b.active).length} paused`, { t: "refunds reduce spending; transfers are not counted", small: true }] : ["set a cap for a category and get warned before you pass it"]} />} />
      <div className="grid gap-6">
        <Card><h2 className="mb-3 font-medium">New budget</h2><ActionForm action={saveBudget} submit="Create budget"><BudgetFields cats={lookups.categories} /></ActionForm></Card>
        {suggestions.length > 0 && <Card><h2 className="mb-1 flex items-center gap-2 font-medium"><Sparkles size={16} className="text-brand" aria-hidden />Suggested budgets from your last 90 days</h2>
          <p className="mb-3 text-sm text-muted">Monthly average per category plus a 5% buffer. An estimate to start from — adjust any time.</p>
          <ul className="grid gap-2 sm:grid-cols-2">{suggestions.map((s) => (
            <li key={s.categoryId} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-sm">
              <span><b>{s.name}</b><span className="block text-xs text-muted">you average {formatMoney(s.avgMinor, profile.currency)}/month</span></span>
              <ActionForm action={saveBudget} submit={`Add ${formatMoney(s.amountMinor, profile.currency)}`} variant="outline"><input type="hidden" name="name" value={s.name} /><input type="hidden" name="period" value="monthly" /><input type="hidden" name="amount" value={String(s.amountMinor / 100)} /><input type="hidden" name="categoryId" value={s.categoryId} /></ActionForm></li>))}</ul></Card>}
        {!budgets?.length ? <EmptyState title="No budgets yet" hint="Create one above to track spending against a limit." /> :
          <div className="grid gap-4 lg:grid-cols-2">{budgets.map((b) => {
            const range = presetRange(PRESET[b.period], new Date(), profile.timezone);
            const def: BudgetDef = { id: b.id, amountMinor: Number(b.amount_minor), period: b.period, categoryId: b.category_id, channel: b.channel, alertThresholds: b.alert_thresholds };
            const ev = evaluateBudget(def, txs, range); const m = (v: number) => formatMoney(v, profile.currency);
            return (<Card key={b.id}>
              <div className="flex items-start justify-between gap-2"><div><h3 className="font-medium">{b.name}</h3>
                <p className="text-xs text-muted">{b.period} · {localDate(range.start, profile.timezone)} → {localDate(new Date(range.end.getTime() - 1), profile.timezone)}{b.category_id && ` · ${lookups.categories.find((c) => c.id === b.category_id)?.name}`}{b.channel && ` · ${b.channel}`}</p></div>
                {b.active ? <Badge tone={TONE[ev.status]}>{ev.status.replace("_", " ")}</Badge> : <Badge>paused</Badge>}</div>
              <div className="my-3"><Progress pct={ev.pctUsed} tone={ev.pctUsed >= 100 ? "bad" : ev.pctUsed >= 75 ? "warn" : "brand"} /></div>
              <p className="tabnum text-sm">{m(ev.spentMinor)} of {m(ev.amountMinor)} · <b>{ev.pctUsed}%</b> · {ev.remainingMinor >= 0 ? `${m(ev.remainingMinor)} left` : `${m(-ev.remainingMinor)} over`}</p>
              <details className="mt-3"><summary className="cursor-pointer text-sm text-brand">Edit</summary><div className="mt-3"><ActionForm action={saveBudget} submit="Update"><BudgetFields cats={lookups.categories} b={b} /></ActionForm></div></details>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <ActionForm action={toggleBudget} compact submit={b.active ? "Pause" : "Resume"} variant="outline"><input type="hidden" name="id" value={b.id} /><input type="hidden" name="active" value={String(!b.active)} /></ActionForm>
                <ActionForm action={deleteBudget} compact submit="Delete" variant="danger" confirm={`Delete budget "${b.name}"?`}><input type="hidden" name="id" value={b.id} /></ActionForm>
              </div></Card>);
          })}</div>}
      </div>
    </>
  );
}
