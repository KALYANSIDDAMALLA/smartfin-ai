import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/server/auth";
import { loadLookups } from "@/lib/server/data";
import { resolveRange, periodLabel, type SP } from "@/lib/server/range";
import { SummaryLine } from "@/components/summary-line";
import { formatMoney } from "@/lib/finance/money";
import { deleteTransaction } from "@/app/actions/transactions";
import { ConfirmAction } from "@/components/confirm-action";
import { TypeBadge, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { TxFilters } from "@/components/tx-filters";
import { Pagination } from "@/components/pagination";
import { AutoCategorize } from "@/components/auto-categorize";

const SIZES = [10, 25, 50, 100];

const SORTS: Record<string, [string, boolean]> = { newest: ["occurred_at", false], oldest: ["occurred_at", true], high: ["amount_minor", false], low: ["amount_minor", true] };

export default async function Transactions({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireUser();
  const { key: rangeKey, range } = resolveRange(sp, profile.timezone, new Date(), "year");
  const size = SIZES.includes(Number(sp.size)) ? Number(sp.size) : 25; let page = Math.max(1, Math.floor(Number(sp.page)) || 1);
  const [col, asc] = SORTS[sp.sort ?? "newest"] ?? SORTS.newest;

  const base = (head = false) => { let q = supabase.from("transactions").select(head ? "id" : "*", head ? { count: "exact", head: true } : { count: "exact" }).is("deleted_at", null)
    .gte("occurred_at", range.start.toISOString()).lt("occurred_at", range.end.toISOString());
  if (sp.type) q = q.eq("type", sp.type);
  if (sp.cat) q = q.eq("category_id", sp.cat);
  const minR = Number(sp.min), maxR = Number(sp.max); if (sp.min && minR >= 0) q = q.gte("amount_minor", Math.round(minR * 100)); if (sp.max && maxR >= 0) q = q.lte("amount_minor", Math.round(maxR * 100));
  if (sp.method) q = q.eq("payment_method_id", sp.method);
  if (sp.channel) q = q.eq("channel", sp.channel);
  if (sp.q) { const s = sp.q.replace(/[%_,()]/g, " ").trim().slice(0, 100); if (s) q = q.or(`name.ilike.%${s}%,merchant.ilike.%${s}%,description.ilike.%${s}%`); }
  return q; };
  const fetchPage = (pg: number) => base().order(col, { ascending: asc }).order("id").range((pg - 1) * size, pg * size - 1); // "id" makes the order unique, so no row repeats or vanishes between pages
  const [lookups, first] = await Promise.all([loadLookups(supabase), fetchPage(page)]); let res = first;
  if (res.error && res.error.code === "PGRST103") { // page number past the end: show the last real page instead of an error
    const total = (await base(true)).count ?? 0; page = Math.max(1, Math.ceil(total / size)); res = await fetchPage(page);
  }
  const { data, count, error } = res; const pages = Math.max(1, Math.ceil((count ?? 0) / size));
  const shownFrom = count ? (page - 1) * size + 1 : 0; const shownTo = Math.min(page * size, count ?? 0);
  const catName = (id: string | null) => lookups.categories.find((c) => c.id === id)?.name ?? "—";
  const methodName = (id: string | null) => lookups.methods.find((m) => m.id === id)?.label ?? "—";
  const pageHref = (n: number) => { const p = new URLSearchParams(); Object.entries(sp).forEach(([k, v]) => v && k !== "page" && p.set(k, v)); if (n > 1) p.set("page", String(n)); return `/transactions?${p}`; };

  return (
    <>
      <PageHeader title="Transactions" desc={!count ? <SummaryLine pill={["type", "cat", "method", "channel", "q", "min", "max"].some((k) => (sp as Record<string, string | undefined>)[k]) ? "No matches" : "No transactions"} items={[periodLabel(rangeKey, range, profile.timezone)]} /> : <SummaryLine pill={<><span className="tabnum">{count.toLocaleString("en-IN")}</span> transaction{count === 1 ? "" : "s"}{["type", "cat", "method", "channel", "q", "min", "max"].some((k) => (sp as Record<string, string | undefined>)[k]) ? " match your filters" : ""}</>} items={[periodLabel(rangeKey, range, profile.timezone), pages > 1 && { t: `on screen: ${shownFrom.toLocaleString("en-IN")}–${shownTo.toLocaleString("en-IN")}`, small: true }]} />}
        action={<Link href="/expenses/new" className="ml-auto mr-[17px] inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-brandfg transition duration-200 hover:-translate-y-0.5 hover:bg-brand/90 hover:shadow-lg hover:shadow-brand/50 hover:ring-2 hover:ring-brand/40 hover:brightness-110 focus-visible:-translate-y-0.5 focus-visible:shadow-lg focus-visible:shadow-brand/50 sm:mr-[21px]"><Plus size={16} aria-hidden />Add expense</Link>} />
      <AutoCategorize />
      <TxFilters categories={lookups.categories} methods={lookups.methods} count={count ?? 0} />
      {error ? <p role="alert" className="text-sm text-bad">Could not load transactions.</p> : !data?.length ? (
        <EmptyState title="No transactions match" hint="Try a different range or clear filters." />
      ) : (
        <Table><thead><tr><Th>Date</Th><Th>Name</Th><Th>Category</Th><Th>Method</Th><Th>Type</Th><Th className="text-right">Amount</Th><Th><span className="sr-only">Actions</span></Th></tr></thead><tbody>
          {data.map((r) => { const plus = r.type === "income" || r.type === "refund"; return (
            <tr key={r.id} data-id={r.id}>
              <Td className="whitespace-nowrap text-muted">{new Date(r.occurred_at).toLocaleDateString("en-IN", { timeZone: profile.timezone, day: "numeric", month: "short", year: "numeric" })}</Td>
              <Td>{r.name ?? r.merchant ?? "—"}{r.merchant && r.name && <span className="block text-xs text-muted">{r.merchant}</span>}</Td>
              <Td>{catName(r.category_id)}</Td><Td>{methodName(r.payment_method_id)}</Td>
              <Td><TypeBadge type={r.type} /></Td>
              <Td className={`tabnum text-right ${plus ? "text-good" : ""}`}>{plus ? "+" : ""}{formatMoney(Number(r.amount_minor), profile.currency)}</Td>
              <Td><ConfirmAction action={deleteTransaction} fields={{ id: r.id }} label={`Delete ${r.name ?? "transaction"}`} confirm={`${r.name ?? r.merchant ? `Delete “${r.name ?? r.merchant}” (${formatMoney(Number(r.amount_minor), profile.currency)})?` : `Delete this ${formatMoney(Number(r.amount_minor), profile.currency)} ${r.type}?`} It will no longer count in your totals.`} success="Transaction deleted.">Delete</ConfirmAction></Td>
            </tr>); })}
        </tbody></Table>
      )}
      <Pagination page={page} pages={pages} size={size} count={count ?? 0} sizes={SIZES} hrefFor={pageHref} />
    </>
  );
}
