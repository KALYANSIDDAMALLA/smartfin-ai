import { requireUser } from "@/lib/server/auth";
import { loadAnalysis, latestInsight, narrativeFor } from "@/lib/server/insights";
import { aiStatus } from "@/lib/server/ai";
import { AnalysisHero, Anomalies, ForecastCard, KpiTiles, Movers, Narrative, NextSteps, SpendPace, WeekdayBars } from "@/components/insight-panels";
import { resolveRange, periodLabel, type SP } from "@/lib/server/range";
import { SummaryLine } from "@/components/summary-line";
import { summarize } from "@/lib/finance/accounting";
import { trend, lastKeys, type Grain } from "@/lib/finance/trends";
import { formatMoney } from "@/lib/finance/money";
import { BarsChart, DonutChart } from "@/components/charts-lazy";
import { RangeFilter } from "@/components/range-filter";
import Link from "next/link";
import { formatYmd } from "@/lib/finance/dates";
import { Card, PageHeader, cn, Table, Td, EmptyState } from "@/components/ui";

const GRAIN: Record<string, { grain: Grain; n: number; def: "today" | "week" | "month" | "year"; title: string }> = {
  daily: { grain: "daily", n: 30, def: "today", title: "Daily analytics" }, weekly: { grain: "weekly", n: 12, def: "week", title: "Weekly analytics" },
  monthly: { grain: "monthly", n: 12, def: "month", title: "Monthly analytics" }, yearly: { grain: "yearly", n: 5, def: "year", title: "Yearly analytics" },
};

const VIEWS = [["daily", "Daily"], ["weekly", "Weekly"], ["monthly", "Monthly"], ["yearly", "Yearly"]] as const;

export default async function Analytics({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams; const period = (VIEWS.some(([k]) => k === sp.view) ? sp.view : "monthly") as string; const cfg = GRAIN[period];
  const { supabase, profile } = await requireUser(); const tz = profile.timezone;
  const { key, range, prev } = resolveRange(sp, tz, new Date(), cfg.def);
  const keys = lastKeys(new Date(), cfg.grain, cfg.n, tz);
  // Load only what the chart window and the comparison need (key start minus a day of timezone margin).
  const keyStart = new Date(Date.parse(`${keys[0].length === 4 ? keys[0] + "-01-01" : keys[0].length === 7 ? keys[0] + "-01" : keys[0]}T00:00:00Z`) - 36 * 3600_000);
  const { txs, lookups, analysis: a } = await loadAnalysis(supabase, range, prev, tz, profile.currency, new Date(Math.min(prev.start.getTime(), keyStart.getTime())));
  const cur = summarize(txs, range); const m = (v: number) => formatMoney(v, profile.currency);
  const series = trend(txs, cfg.grain, tz, keys).map((b) => ({ label: b.label, Income: b.incomeMinor / 100, Expenses: b.expenseMinor / 100 }));
  const name = (id: string) => lookups.categories.find((c) => c.id === id)?.name ?? "Uncategorised";
  const cats = Object.entries(cur.byCategory).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const merchants = Object.entries(cur.byMerchant).filter(([k, v]) => v > 0 && k !== "uncategorized").sort((a, b) => b[1] - a[1]).slice(0, 8);
  const methods = Object.entries(cur.byPaymentMethod).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const nar = narrativeFor(a, m, await latestInsight(supabase, a, tz)); const label = `${formatYmd(a.period.start)} – ${formatYmd(a.period.end)}`;
  const has = txs.length > 0;
  return (
    <>
      <PageHeader title="Analytics" desc={<SummaryLine pill={a.txCount ? <><span className="tabnum">{a.txCount.toLocaleString("en-IN")}</span> transaction{a.txCount === 1 ? "" : "s"} analysed</> : "No transactions"} items={[periodLabel(key, range, tz), { t: `${VIEWS.find(([k]) => k === period)?.[1] ?? "Monthly"} view`, small: true }]} />} action={<RangeFilter base="/analytics" sp={{ ...sp, view: period }} active={key} />} />
      <nav aria-label="Analytics view" className="mb-5 inline-flex gap-1 rounded-xl border border-line bg-surface/70 p-1">{VIEWS.map(([k, l]) => <Link key={k} href={`/analytics?view=${k}`} aria-current={period === k ? "page" : undefined} className={cn("rounded-lg px-4 py-1.5 text-sm font-medium transition", period === k ? "bg-brand text-brandfg shadow-sm" : "hover:bg-surface2")}>{l}</Link>)}</nav>
      {!has ? <EmptyState title="No data yet" hint="Add transactions to see analytics." /> : <div className="grid gap-6">
        <AnalysisHero a={a} fmt={m} periodLabel={label} />
        <KpiTiles a={a} fmt={m} />
        <Narrative insight={nar.insight} meta={nar.meta} aiConfigured={aiStatus().configured} range={key} from={sp.from} to={sp.to} />
        <div className="grid gap-6 lg:grid-cols-2"><NextSteps a={a} fmt={m} ai={nar.meta.fallback ? null : nar.insight} /><Anomalies a={a} fmt={m} /></div>
        <Card><h2 className="mb-3 font-medium">Income vs expenses (last {cfg.n} {cfg.grain === "daily" ? "days" : cfg.grain === "weekly" ? "weeks" : cfg.grain === "monthly" ? "months" : "years"})</h2><BarsChart data={series} keys={[{ key: "Income", label: "Income", color: "#059669" }, { key: "Expenses", label: "Expenses", color: "#4338ca" }]} /></Card>
        <div className="grid gap-6 lg:grid-cols-2"><SpendPace a={a} /><ForecastCard a={a} fmt={m} /></div>
        <div className="grid gap-6 lg:grid-cols-2"><Movers a={a} fmt={m} /><WeekdayBars a={a} fmt={m} /></div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card><h2 className="mb-3 font-medium">Categories</h2><DonutChart data={cats.map(([id, v]) => ({ name: name(id), value: v / 100 }))} /></Card>
          <Card><h2 className="mb-3 font-medium">Top merchants</h2>{merchants.length ? <Table><tbody>{merchants.map(([k, v]) => <tr key={k}><Td className="capitalize">{k}</Td><Td className="tabnum text-right">{m(v)}</Td></tr>)}</tbody></Table> : <p className="text-sm text-muted">No merchant data in this period.</p>}
            <h2 className="mb-2 mt-5 font-medium">Payment methods</h2>{methods.length ? <Table><tbody>{methods.map(([k, v]) => <tr key={k}><Td>{lookups.methods.find((x) => x.code === k)?.label ?? "Unspecified"}</Td><Td className="tabnum text-right">{m(v)}</Td></tr>)}</tbody></Table> : <p className="text-sm text-muted">No data.</p>}</Card>
        </div></div>}
    </>
  );
}
