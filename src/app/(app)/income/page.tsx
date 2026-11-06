import { requireUser } from "@/lib/server/auth";
import { loadLookups, loadMerchants } from "@/lib/server/data";
import { formatMoney } from "@/lib/finance/money";
import { Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { PasteTx } from "@/components/paste-tx";
import { aiStatus } from "@/lib/server/ai";
import { draftStart } from "@/lib/server/drafts";
import { resolveRange, periodLabel, type SP } from "@/lib/server/range";
import { SummaryLine } from "@/components/summary-line";
import { RangeFilter } from "@/components/range-filter";

export default async function Income({ searchParams }: { searchParams: Promise<SP & { draft?: string; date?: string; amount?: string }> }) {
  const sp = await searchParams; const { supabase, profile } = await requireUser();
  const { key, range } = resolveRange(sp, profile.timezone, new Date(), "year");
  const [lookups, start, merchants, { data }] = await Promise.all([loadLookups(supabase), draftStart(supabase, sp), loadMerchants(supabase, "income"), supabase.from("transactions").select("id,name,merchant,amount_minor,occurred_at,category_id").eq("type", "income").is("deleted_at", null).gte("occurred_at", range.start.toISOString()).lt("occurred_at", range.end.toISOString()).order("occurred_at", { ascending: false }).limit(500)]);
  return (
    <>
      <PageHeader title={start?.draftId ? "Finish your draft" : "Income"} desc={start?.draftId ? "Check the details, then save it as a real transaction." : <SummaryLine pill={data?.length ? <><span className="tabnum">{data.length.toLocaleString("en-IN")}{data.length === 500 ? "+" : ""}</span> entr{data.length === 1 ? "y" : "ies"}</> : "No income"} items={[periodLabel(key, range, profile.timezone), !!data?.length && data.length < 500 && `${formatMoney(data.reduce((a, r) => a + Number(r.amount_minor), 0), profile.currency)} received`, data?.length === 500 && { t: "showing the latest 500", small: true }]} />} action={<RangeFilter base="/income" sp={sp} active={key} />} />
      <div className="grid gap-6">
        <PasteTx lookups={lookups} mode="income" ai={aiStatus().configured} start={start} merchants={merchants} />
        <Card><div className="mb-3 flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-medium">Income in this period</h2>{data?.length === 500 && <p className="text-sm text-warn">Showing the latest 500 — narrow the dates to see everything.</p>}{!!data?.length && data.length < 500 && <p className="text-sm text-muted">{data.length} entr{data.length === 1 ? "y" : "ies"} · total <b className="tabnum text-good">{formatMoney(data.reduce((a, r) => a + Number(r.amount_minor), 0), profile.currency)}</b></p>}</div>
          {!data?.length ? <EmptyState title="No income in this period" hint="Pick another date range above, or add income." /> : <Table><thead><tr><Th>Date</Th><Th>Name</Th><Th className="hidden md:table-cell">Category</Th><Th className="text-right">Amount</Th></tr></thead><tbody>
            {data.map((r) => <tr key={r.id}><Td className="whitespace-nowrap text-muted">{new Date(r.occurred_at).toLocaleDateString("en-IN", { timeZone: profile.timezone, day: "numeric", month: "short", year: "numeric" })}</Td>
              <Td>{r.name ?? r.merchant ?? "—"}<span className="block text-xs text-muted md:hidden">{lookups.categories.find((c) => c.id === r.category_id)?.name ?? ""}</span></Td><Td className="hidden md:table-cell">{lookups.categories.find((c) => c.id === r.category_id)?.name ?? "—"}</Td>
              <Td className="tabnum text-right text-good">{formatMoney(Number(r.amount_minor), profile.currency)}</Td></tr>)}
          </tbody></Table>}
        </Card>
      </div>
    </>
  );
}
