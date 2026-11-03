import Link from "next/link";
import { requireUser } from "@/lib/server/auth";
import { loadTxs } from "@/lib/server/data";
import { resolveRange, periodLabel, type SP } from "@/lib/server/range";
import { SummaryLine } from "@/components/summary-line";
import { summarize, type Summary } from "@/lib/finance/accounting";
import { localDate } from "@/lib/finance/dates";
import { quickInsights } from "@/lib/finance/automation";
import { pctText } from "@/lib/finance/pct";
import { isFlexible } from "@/lib/finance/coach";
import { Sparkles } from "lucide-react";
import { loadDaily } from "@/lib/server/daily";
import { daysInMonthOf } from "@/lib/finance/daily";
import { formatMoney } from "@/lib/finance/money";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { DonutChart } from "@/components/charts-lazy";
import { RangeFilter } from "@/components/range-filter";

const delta = (cur: number, prev: number) => (prev === 0 ? null : Math.round(((cur - prev) * 100) / Math.abs(prev)));

function Stat({ label, value, cur, prev, goodWhenUp = true, partial = false }: { label: string; value: string; cur: number; prev: number; goodWhenUp?: boolean; partial?: boolean }) {
  const d = delta(cur, prev);
  return (
    <Card>
      <p className="text-sm text-muted">{label}</p>
      <p className="tabnum mt-1 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted">{d === null ? "No prior period data" : <Badge tone={d === 0 ? "neutral" : (d > 0) === goodWhenUp ? "good" : "bad"}>{pctText(d, true)}</Badge>} {d !== null && (partial ? "vs same days of previous period" : "vs previous period")}</p>
    </Card>
  );
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser();
  const { key, range, prev, prevLike } = resolveRange(sp, profile.timezone);
  // Only the selected + previous period is loaded; the recent list and the "has any data" check run in parallel.
  const [{ txs, lookups }, recentRes, countRes, daily] = await Promise.all([
    loadTxs(supabase, undefined, prev.start, range.end),
    supabase.from("transactions").select("id,name,merchant,type,amount_minor,occurred_at").is("deleted_at", null).order("occurred_at", { ascending: false }).limit(8),
    supabase.from("transactions").select("id", { count: "exact", head: true }).is("deleted_at", null),
    loadDaily(supabase, profile.timezone).catch(() => null),
  ]);
  const cur: Summary = summarize(txs, range), old: Summary = summarize(txs, prevLike);
  const catName = (id: string) => lookups.categories.find((c) => c.id === id)?.name ?? "Uncategorised";
  const donut = Object.entries(cur.byCategory).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ name: catName(id), value: v / 100 }));
  const recent = recentRes.data ?? [];
  const partial = prevLike.end.getTime() !== prev.end.getTime();
  const m = (v: number) => formatMoney(v, profile.currency);
  const insights = quickInsights(cur, old, catName, m);
  // A taste of the AI analysis page (the what-if coach): the biggest flexible category and what a 10% trim would be worth.
  const flex = Object.entries(cur.byCategory).filter(([id, v]) => id !== "uncategorized" && v >= 50_000 && isFlexible(catName(id))).sort((a, b) => b[1] - a[1])[0];
  if (flex) insights.push({ tone: "info", tag: "tip", text: `Cutting ${catName(flex[0])} by 10% would save about ${m(Math.round(flex[1] / 10 / 100) * 100)} in this period. Try other cuts in the what-if coach.` });
  const tz = profile.timezone; const fmt = (d: Date) => d.toLocaleDateString("en-IN", { timeZone: tz, day: "numeric", month: "short", year: "numeric" });
  const label = `${fmt(range.start)} – ${fmt(new Date(range.end.getTime() - 1))}`;
  // Nothing in the selected period but data elsewhere: say so and link straight to the period that has it.
  const inPeriod = txs.filter((t) => t.occurredAt >= range.start.toISOString() && t.occurredAt < range.end.toISOString()).length;
  const latest = recent[0]?.occurred_at as string | undefined;
  const latestMonth = latest ? (() => { const ymd = localDate(latest, tz); const [y, mo] = ymd.split("-").map(Number); const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    return { name: new Date(latest).toLocaleDateString("en-IN", { timeZone: tz, month: "long", year: "numeric" }), href: `/dashboard?range=custom&from=${y}-${String(mo).padStart(2, "0")}-01&to=${y}-${String(mo).padStart(2, "0")}-${last}`, on: fmt(new Date(latest)) }; })() : null;

  return (
    <>
      <PageHeader title="Dashboard" desc={<SummaryLine pill={inPeriod ? <><span className="tabnum">{inPeriod.toLocaleString("en-IN")}</span> transaction{inPeriod === 1 ? "" : "s"}</> : "No transactions"} items={[periodLabel(key, range, profile.timezone), { t: "your income, spending and savings", small: true }]} />} action={<RangeFilter base="/dashboard" sp={sp} active={key} />} />
      {(countRes.count ?? 0) === 0 ? (
        <EmptyState title="No transactions yet" hint="Add your first expense or income to see insights here."
          action={<Link href="/expenses/new" className="inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-brandfg">Add expense</Link>} />
      ) : (
        <div className="grid gap-6">
          {inPeriod === 0 && latestMonth && (
            <div role="status" className="glass flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 text-sm">
              <span>No transactions in <b>{label}</b>. Your latest entry is on <b>{latestMonth.on}</b>.</span>
              <span className="ml-auto flex flex-wrap gap-2">
                <Link href={latestMonth.href} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-brandfg">View {latestMonth.name}</Link>
                <Link href="/dashboard?range=year" className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium hover:bg-surface2/60">View this year</Link>
              </span>
            </div>
          )}
          {daily && (() => { const s = daily.status; const bar = s.state === "over" ? "bg-bad" : s.state === "close" ? "bg-amber-500" : "bg-good";
            return <Card className="border-brand/30"><div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-sm text-muted">Today&apos;s budget · {m(daily.incomeMinor)} a month ÷ {daysInMonthOf(daily.today)} days</p>
              <p className={`tabnum mt-1 text-3xl font-semibold ${s.state === "over" ? "text-bad" : ""}`}>{s.state === "over" ? `−${m(-s.leftMinor)}` : m(s.leftMinor)}<span className="ml-2 text-sm font-normal text-muted">{s.state === "over" ? "over today's budget" : "left today"}</span></p></div>
              <p className="tabnum text-sm text-muted">Spent {m(s.spentMinor)} of {m(s.allowanceMinor)}</p></div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface2" role="progressbar" aria-valuenow={Math.min(100, s.usedPct)} aria-valuemin={0} aria-valuemax={100} aria-label="Share of today's budget spent"><div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, s.usedPct)}%` }} /></div>
              <p className="mt-2 text-xs text-muted">{s.state === "fresh" ? "No spends yet today. Easy." : s.state === "over" ? "Over budget today — tomorrow is a fresh start." : s.state === "close" ? "Almost at today's limit." : "On track."} {daily.source === "recorded" && <>Based on income recorded this month; set your income in <Link href="/savings" className="text-brand">Savings plan</Link> for a steadier number.</>}</p></Card>; })()}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Income" value={m(cur.incomeMinor)} cur={cur.incomeMinor} prev={old.incomeMinor} partial={partial} />
            <Stat label="Net expenses" value={m(cur.netExpenseMinor)} cur={cur.netExpenseMinor} prev={old.netExpenseMinor} partial={partial} goodWhenUp={false} />
            <Stat label="Tracked savings" value={m(cur.trackedSavingsMinor)} cur={cur.trackedSavingsMinor} prev={old.trackedSavingsMinor} partial={partial} />
            <Card><p className="text-sm text-muted">Savings rate</p><p className="tabnum mt-1 text-2xl font-semibold">{cur.savingsRatePct === null ? "—" : pctText(cur.savingsRatePct)}</p>
              <p className="mt-1 text-xs text-muted">Online {m(cur.onlineMinor)} · Offline {m(cur.offlineMinor)}</p></Card>
          </div>
          {insights.length > 0 && <Card className="border-brand/30"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 font-medium"><Sparkles size={16} className="text-brand" aria-hidden />Smart insights</h2><Link href="/ai/analysis" className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm shadow-indigo-500/30 transition hover:brightness-110"><Sparkles size={14} aria-hidden />Full AI analysis →</Link></div>
            <ul className="grid gap-1.5 text-sm">{insights.map((i) => <li key={i.text} className="flex items-start gap-2"><Badge tone={i.tone}>{i.tag ?? (i.tone === "good" ? "good" : i.tone === "warn" ? "watch" : "info")}</Badge><span>{i.text}</span></li>)}</ul>
            <p className="mt-3 border-t border-line pt-3 text-xs text-muted">Want to see how small cuts add up? <b className="font-medium text-fg">AI analysis</b> has a what-if simulator, a 30-day savings plan and one-tap budgets.</p></Card>}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card><h2 className="mb-3 font-medium">Spending by category</h2><DonutChart data={donut} /></Card>
            <Card><div className="mb-3 flex items-center justify-between"><h2 className="font-medium">Recent transactions</h2><Link href="/transactions" className="tap text-sm text-brand">View all</Link></div>
              <Table><thead><tr><Th>Date</Th><Th>Name</Th><Th className="text-right">Amount</Th></tr></thead><tbody>
                {recent.map((r) => (<tr key={r.id}><Td className="whitespace-nowrap text-muted">{new Date(r.occurred_at).toLocaleDateString("en-IN", { timeZone: profile.timezone, day: "numeric", month: "short" })}</Td>
                  <Td>{r.name ?? r.merchant ?? r.type}</Td>
                  <Td className={`tabnum text-right ${r.type === "income" || r.type === "refund" ? "text-good" : ""}`}>{r.type === "income" || r.type === "refund" ? "+" : ""}{m(Number(r.amount_minor))}</Td></tr>))}
              </tbody></Table></Card>
          </div>
        </div>
      )}
    </>
  );
}
