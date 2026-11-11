import Link from "next/link";
import { requireUser } from "@/lib/server/auth";
import { uploadImport, cancelImport } from "@/app/actions/imports";
import { ActionForm } from "@/components/action-form";
import { ImportFileField } from "@/components/import-file-field";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";

const TONE = { confirmed: "good", failed: "bad", preview: "warn", cancelled: "neutral", uploaded: "info", processing: "info" } as const;

import { SummaryLine } from "@/components/summary-line";
import { formatYmd, localDate } from "@/lib/finance/dates";

export default async function Imports() {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("import_batches").select("*").order("created_at", { ascending: false }).limit(50);
  return (
    <>
      <PageHeader title="Imports & receipts" desc={<SummaryLine pill={data?.length ? <><span className="tabnum">{data.length}</span> import{data.length === 1 ? "" : "s"}</> : "No imports yet"} items={[!!data?.length && `last on ${formatYmd(localDate(data[0].created_at))}`, { t: "nothing is added until you review and confirm", small: true }]} />} />
      <div className="grid gap-6">
        <Card><ActionForm action={uploadImport} submit="Upload & preview"><ImportFileField /></ActionForm>
          <p className="mt-3 text-xs text-muted">PDF and receipt extraction is heuristic: expect to review every row. Receipt OCR requires an AI provider key.</p></Card>
        <Card><h2 className="mb-3 font-medium">Import history</h2>
          {!data?.length ? <EmptyState title="No imports yet" /> : <Table><thead><tr><Th>File</Th><Th>Status</Th><Th className="hidden md:table-cell">Uploaded</Th><Th><span className="sr-only">Actions</span></Th></tr></thead><tbody>
            {data.map((b) => <tr key={b.id}><Td>{b.file_name}<span className="block text-xs text-muted">{b.file_kind} · {(b.size_bytes / 1024).toFixed(0)} KB{b.error && ` · ${b.error}`}</span><span className="block text-xs text-muted md:hidden">{new Date(b.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span></Td><Td><Badge tone={TONE[b.status as keyof typeof TONE]}>{b.status}</Badge></Td>
              <Td className="hidden text-muted md:table-cell">{new Date(b.created_at).toLocaleString("en-IN")}</Td>
              <Td><div className="flex gap-2">{b.status === "preview" && <Link href={`/imports/${b.id}`} className="text-sm text-brand">Review</Link>}
                {b.storage_path !== "removed" && <ActionForm action={cancelImport} compact submit="Remove file" variant="ghost" confirm={b.status === "confirmed" ? "Remove the stored file? Imported transactions are kept." : "Discard this import?"}><input type="hidden" name="id" value={b.id} /></ActionForm>}</div></Td></tr>)}
          </tbody></Table>}</Card>
      </div>
    </>
  );
}
