import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/server/auth";
import { loadLookups, loadMerchants } from "@/lib/server/data";
import { isoToLocalInput } from "@/lib/finance/dates";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { TxForm } from "@/components/tx-form";

const back = <Link href="/transactions" className="ml-auto mr-[17px] inline-flex h-10 items-center gap-2 text-sm font-medium text-brand hover:underline sm:mr-[21px]"><ArrowLeft size={16} aria-hidden />Back to transactions</Link>;

export default async function EditTransaction({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, profile } = await requireUser();
  // RLS scopes this to the signed-in user's own rows; a deleted or someone else's id is simply "not found".
  const { data: r } = await supabase.from("transactions").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!r) notFound();
  // Only plain expenses and income are editable here: refunds, adjustments and transfers carry links (original expense, accounts) this form doesn't edit.
  if (r.type !== "expense" && r.type !== "income") return (<><PageHeader title="Edit transaction" action={back} /><EmptyState title={`${r.type[0].toUpperCase()}${r.type.slice(1)}s can't be edited yet`} hint="Delete it and add it again if something is wrong." /></>);
  const [lookups, merchants] = await Promise.all([loadLookups(supabase), loadMerchants(supabase, r.type)]);
  const initial = {
    id: r.id, type: r.type, amount: (Number(r.amount_minor) / 100).toFixed(2), occurredAt: isoToLocalInput(r.occurred_at, profile.timezone),
    name: r.name ?? undefined, merchant: r.merchant ?? undefined, description: r.description ?? undefined, notes: r.notes ?? undefined,
    categoryId: r.category_id ?? undefined, paymentMethodId: r.payment_method_id ?? undefined, channel: r.channel ?? undefined,
    tags: Array.isArray(r.tags) ? r.tags.join(", ") : undefined, externalRef: r.external_ref ?? undefined, // kept so editing an imported row doesn't clear its import reference
  };
  return (<><PageHeader title={r.type === "income" ? "Edit income" : "Edit expense"} desc="Change any detail, then press Update. Your totals and budgets adjust automatically." action={back} />
    <Card><TxForm lookups={lookups} fixedType={r.type} initial={initial} merchants={merchants} /></Card></>);
}
