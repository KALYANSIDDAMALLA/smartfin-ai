import { requireUser } from "@/lib/server/auth";
import { loadTxs } from "@/lib/server/data";
import { resolveRange, periodLabel, type SP } from "@/lib/server/range";
import { SummaryLine } from "./summary-line";
import { summarize } from "@/lib/finance/accounting";
import { trend, lastKeys } from "@/lib/finance/trends";
import { formatMoney } from "@/lib/finance/money";
import { BarsChart, DonutChart } from "./charts-lazy";
import { RangeFilter } from "./range-filter";
import { Card, EmptyState, PageHeader, Table, Td, Th } from "./ui";

/** Online/offline view: only transactions whose (explicit or method-derived) channel matches. Unclassified ones are listed separately so users can fix them. */
export async function PaymentsView({ channel, sp }: { channel: "online" | "offline"; sp: SP }) {
  const { supabase, profile } = await requireUser(); const tz = profile.timezone;
  const { key, range, prev } = resolveRange(sp, tz);
  const keys = lastKeys(new Date(), "monthly", 6, tz);
  const from = new Date(Math.min(prev.start.getTime(), Date.parse(`${keys[0]}-01T00:00:00Z`) - 36 * 3600_000));
  const { txs, lookups } = await loadTxs(supabase, undefined, from);
  const mine = txs.filter((t) => t.channel === channel || (t.type === "refund" && t.channel === channel));
  const s = summarize(mine, range, txs); const m = (v: number) => formatMoney(v, profile.currency);
  const inCount = mine.filter((t) => t.occurredAt >= range.start.toISOString() && t.occurredAt < range.end.toISOString()).length;
  const unclassified = txs.filter((t) => t.type === "expense" && !t.channel).length;
  const series = trend(mine, "monthly", tz, keys).map((b) => ({ label: b.label, Spend: b.expenseMinor / 100 }));
  const cats = Object.entries(s.byCategory).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([id, v]) => ({ name: lookups.categories.find((c) => c.id === id)?.name ?? "Uncategorised", value: v / 100 }));
  const methods = Object.entries(s.byPaymentMethod).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  return (<>
    <PageHeader title={channel === "online" ? "Online payments" : "Offline payments"} desc={<SummaryLine pill={<><span className="tabnum">{inCount.toLocaleString("en-IN")}</span> {channel} transaction{inCount === 1 ? "" : "s"}</>} items={[periodLabel(key, range, tz), `net spend ${m(s.netExpenseMinor)}`]} />} action={<RangeFilter base={`/payments/${channel}`} sp={sp} active={key} />} />
    <div className="grid gap-6">
      <Card><p className="text-sm text-muted">Net {channel} spend this period</p><p className="tabnum text-3xl font-semibold">{m(s.netExpenseMinor)}</p>
        {unclassified > 0 && <p className="mt-1 text-xs text-warn">{unclassified} expense(s) have no online/offline classification. Edit them in Transactions to include them here.</p>}</Card>
      {!mine.length ? <EmptyState title={`No ${channel} transactions yet`} hint="Choose a payment method or channel when adding an expense." /> : <>
        <Card><h2 className="mb-3 font-medium">Monthly trend</h2><BarsChart data={series} keys={[{ key: "Spend", label: "Spend" }]} /></Card>
        <div className="grid gap-6 lg:grid-cols-2"><Card><h2 className="mb-3 font-medium">By category</h2><DonutChart data={cats} /></Card>
          <Card><h2 className="mb-3 font-medium">By payment method</h2><Table><thead><tr><Th>Method</Th><Th className="text-right">Spend</Th></tr></thead><tbody>{methods.map(([k, v]) => <tr key={k}><Td>{lookups.methods.find((x) => x.code === k)?.label ?? "Unspecified"}</Td><Td className="tabnum text-right">{m(v)}</Td></tr>)}</tbody></Table></Card></div></>}
    <p className="mt-6 text-xs text-muted">Payment methods are labels you record. SmartFin never fetches your history from UPI apps or banks automatically.</p>
    </div></>);
}
