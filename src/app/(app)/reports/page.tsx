import { requireUser } from "@/lib/server/auth";
import { formatYmd } from "@/lib/finance/dates";
import { SummaryLine } from "@/components/summary-line";
import { resolveRange, periodLabel, type SP } from "@/lib/server/range";
import { Card, PageHeader } from "@/components/ui";
import { RangeFilter } from "@/components/range-filter";

export default async function Reports({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams; const { profile } = await requireUser();
  const { key, range } = resolveRange(sp, profile.timezone);
  const q = new URLSearchParams({ range: key, ...(sp.from && sp.to ? { from: sp.from, to: sp.to } : {}) });
  const btn = "inline-flex h-10 items-center rounded-lg border border-line bg-surface px-4 text-sm font-medium hover:bg-surface2";
  return (
    <>
      <PageHeader title="Reports & exports" desc={<SummaryLine pill="Reports & exports" items={[periodLabel(key, range, profile.timezone), { t: "transfers and adjustments are left out; refunds reduce spending", small: true }]} />} action={<RangeFilter base="/reports" sp={sp} active={key} />} />
      <Card><p className="mb-3 text-sm">Period: <b>{formatYmd(range.start.toISOString())}</b> to <b>{formatYmd(new Date(range.end.getTime() - 1).toISOString())}</b></p>
        <div className="flex flex-wrap gap-2">{(["csv", "xlsx", "pdf"] as const).map((f) => <a key={f} className={btn} href={`/api/reports?${q}&format=${f}`} download>Download {f.toUpperCase()}</a>)}</div>
        <p className="mt-3 text-xs text-muted">PDF lists up to 300 rows; CSV and XLSX contain everything in the period.</p></Card>
    </>
  );
}
