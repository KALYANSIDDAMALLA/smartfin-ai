import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/server/auth";
import { loadLookups } from "@/lib/server/data";
import { formatMoney } from "@/lib/finance/money";
import { confirmImport, remapImport, updateStagedRow, cancelImport } from "@/app/actions/imports";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import { NumInput } from "@/components/num-input";

export default async function Review({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const { supabase, profile } = await requireUser();
  const { data: b } = await supabase.from("import_batches").select("*").eq("id", id).maybeSingle(); if (!b) notFound(); if (b.status !== "preview") redirect("/imports");
  const [{ data: rows }, lookups] = await Promise.all([supabase.from("staged_import_transactions").select("*").eq("batch_id", id).order("row_index").limit(300), loadLookups(supabase)]);
  const headers = Object.keys((rows?.[0]?.raw as Record<string, string>) ?? {});
  const selected = (rows ?? []).filter((r) => r.include).length;
  const opt = (name: string, label: string) => <Field label={label}><Select name={name} defaultValue=""><option value="">— none —</option>{headers.map((h) => <option key={h}>{h}</option>)}</Select></Field>;
  return (
    <>
      <PageHeader title={`Review: ${b.file_name}`} desc={`${rows?.length ?? 0} rows found · ${selected} selected. Duplicates and incomplete rows are unchecked by default.`} />
      <div className="grid gap-6">
        {!["image", "aa"].includes(b.file_kind) && headers.length > 0 && <Card><details><summary className="cursor-pointer font-medium">Column mapping</summary><div className="mt-3"><ActionForm action={remapImport} submit="Apply mapping"><input type="hidden" name="id" value={id} />
          <div className="grid gap-3 sm:grid-cols-3">{opt("date", "Date")}{opt("description", "Description")}{opt("amount", "Amount (signed)")}{opt("debit", "Debit / withdrawal")}{opt("credit", "Credit / deposit")}{opt("ref", "Reference no.")}</div></ActionForm></div></details></Card>}
        <div className="grid gap-3">{(rows ?? []).map((r) => (
          <Card key={r.id} className={r.is_duplicate ? "border-warn/50" : ""}>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <Badge tone={Number(r.confidence) >= 0.8 ? "good" : "warn"}>confidence {Math.round(Number(r.confidence) * 100)}%</Badge>
              {r.is_duplicate && <Badge tone="warn">possible duplicate ({r.duplicate_reason?.replace("_", " ")})</Badge>}
              {(!r.amount_minor || !r.occurred_at) && <Badge tone="bad">needs fixing</Badge>}</div>
            <ActionForm action={updateStagedRow} submit="Update row" variant="outline"><input type="hidden" name="rowId" value={r.id} />
              <div className="grid gap-2 sm:grid-cols-6">
                <Field label="Date (DD/MM/YYYY)"><Input name="date" defaultValue={r.occurred_at ? new Date(r.occurred_at).toLocaleDateString("en-GB", { timeZone: profile.timezone }) : ""} /></Field>
                <div className="sm:col-span-2"><Field label="Description"><Input name="description" defaultValue={r.description ?? ""} /></Field></div>
                <Field label="Amount (₹)"><NumInput name="amount" defaultValue={r.amount_minor ? String(Number(r.amount_minor) / 100) : ""} /></Field>
                <Field label="Type"><Select name="txType" defaultValue={r.tx_type ?? "expense"}><option value="expense">Expense</option><option value="income">Income</option></Select></Field>
                <Field label="Category"><Select kind="category" name="categoryId" defaultValue={r.category_id ?? ""}><option value="">—</option>{lookups.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field></div>
              <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" name="include" defaultChecked={r.include} /> Import this row{r.amount_minor ? ` (${formatMoney(Number(r.amount_minor), profile.currency)})` : ""}</label>
            </ActionForm></Card>))}</div>
        <div className="flex flex-wrap gap-3"><ActionForm action={confirmImport} submit={`Confirm ${selected} selected rows`} confirm="Create transactions from the selected rows?"><input type="hidden" name="id" value={id} /></ActionForm>
          <ActionForm action={cancelImport} compact submit="Discard import" variant="outline" confirm="Discard this import?"><input type="hidden" name="id" value={id} /></ActionForm></div>
        <p className="text-xs text-muted">Save row edits (“Update row”) before confirming. When you confirm, we check again for duplicates among your existing transactions.</p>
      </div>
    </>
  );
}
