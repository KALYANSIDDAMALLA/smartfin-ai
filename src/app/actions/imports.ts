"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createHash, randomUUID } from "node:crypto";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { getUserOrNull } from "@/lib/server/auth";
import { rateLimit } from "@/lib/server/ratelimit";
import { loadTxs } from "@/lib/server/data";
import { FILE_LIMIT } from "@/lib/server/validation";
import { notify } from "@/lib/server/notify";
import { detectMapping, parseStatementText, sniffKind, type Mapping, type RawRow } from "@/lib/imports/parse";
import { detectDuplicates } from "@/lib/imports/dedupe";
import { stage, dupWindow } from "@/lib/server/staging";
import { analyzeReceipt } from "@/lib/server/ocr";
import type { FormState } from "./auth";

const EXT_OK = ["csv", "xlsx", "pdf", "png", "jpg", "jpeg"];
const MIME_OK: Record<string, string[]> = { csv: ["text/csv", "application/vnd.ms-excel", "text/plain", ""], xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], pdf: ["application/pdf"], png: ["image/png"], jpg: ["image/jpeg"], jpeg: ["image/jpeg"] };
const MAX_ROWS = 5000;
/** Reads every row of a query. The database answers at most 1,000 rows per request, so a long statement would silently lose rows without paging. */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = []; for (let from = 0; ; from += 1000) { const { data, error } = await page(from, from + 999); if (error) throw new Error("Could not read the import rows."); out.push(...(data ?? [])); if ((data?.length ?? 0) < 1000) return out; }
}

export async function uploadImport(_: FormState, fd: FormData): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  if (!rateLimit(`import:${a.user.id}`, 10, 10 * 60_000).ok) return { error: "Too many uploads. Please wait a few minutes." };
  const file = fd.get("file"); if (!(file instanceof File) || !file.size) return { error: "Choose a file." };
  if (file.size > FILE_LIMIT) return { error: "File is larger than 10 MB." };
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!EXT_OK.includes(ext)) return { error: "Unsupported file type. Use CSV, XLSX, PDF, PNG or JPG." };
  if (!MIME_OK[ext].includes(file.type)) return { error: "File type does not match its extension." };
  const buf = new Uint8Array(await file.arrayBuffer());
  // Password-protected Excel files are an old OLE container, not a zip, so they would be rejected below as "not a valid .xlsx". Say what is really wrong.
  if (ext === "xlsx" && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) return { error: "This Excel file is password-protected, and protected Excel files can't be opened here. In Excel use File > Info > Protect Workbook > Encrypt with Password, clear the password, save, and upload again. Or upload the bank's PDF or CSV statement instead." };
  const filePassword = String(fd.get("password") ?? "").slice(0, 200); // used only to open this PDF in memory; never stored or logged
  const kind = sniffKind(buf, ext); if (!kind) return { error: "File content does not look like a valid ." + ext + " file." };
  const { data: prof } = await a.supabase.from("profiles").select("timezone").eq("id", a.user.id).single(); const tz = prof?.timezone ?? "Asia/Kolkata";
  const id = randomUUID(); const path = `${a.user.id}/imports/${id}.${ext}`; // server-generated name; user filename is metadata only
  const up = await a.supabase.storage.from("private-files").upload(path, buf, { contentType: file.type || "application/octet-stream", upsert: false });
  if (up.error) return { error: "Could not store the file." };
  const safeName = file.name.replace(/[^\w.\- ]/g, "_").slice(0, 150);
  const { error: be } = await a.supabase.from("import_batches").insert({ id, user_id: a.user.id, file_name: safeName, file_kind: kind, storage_path: path, size_bytes: file.size, sha256: createHash("sha256").update(buf).digest("hex"), status: "processing" });
  if (be) { await a.supabase.storage.from("private-files").remove([path]); return { error: "Could not record the import." }; }
  try {
    let raws: RawRow[] = []; let map: Mapping = {}; let pre: { confidence?: number }[] | undefined;
    if (kind === "csv") {
      const r = Papa.parse<RawRow>(new TextDecoder().decode(buf), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
      raws = r.data.slice(0, MAX_ROWS); map = detectMapping(r.meta.fields ?? []);
    } else if (kind === "xlsx") {
      const wb = XLSX.read(buf, { type: "array", cellFormula: false, cellHTML: false, cellStyles: false, sheetRows: MAX_ROWS + 1 });
      const sheet = wb.Sheets[wb.SheetNames[0]]; raws = XLSX.utils.sheet_to_json<RawRow>(sheet, { raw: false, defval: "" }); map = detectMapping(Object.keys(raws[0] ?? {}));
    } else if (kind === "pdf") {
      const { PDFParse } = await import("pdf-parse"); const parser = new PDFParse({ data: buf, ...(filePassword ? { password: filePassword } : {}) }); let t; try { t = await parser.getText(); } finally { await parser.destroy().catch(() => {}); }
      raws = parseStatementText(t.text).slice(0, MAX_ROWS); map = detectMapping(["Date", "Description", "Amount"]);
      pre = raws.map(() => ({ confidence: 0.7 })); // text-extraction of PDFs is heuristic: always needs review
    } else {
      const r = await analyzeReceipt(buf, file.type); if (!r.ok) throw new Error(r.error);
      raws = [{ Date: r.date ?? "", Description: r.merchant ?? "", Amount: r.total ?? "" }]; map = detectMapping(["Date", "Description", "Amount"]); pre = [{ confidence: r.confidence }];
    }
    if (!raws.length) throw new Error("No transactions could be found in this file.");
    await stage(a.supabase, a.user.id, id, raws, map, tz, pre);
    await a.supabase.from("import_batches").update({ status: "preview" }).eq("id", id);
  } catch (e) {
    if (kind === "pdf" && (/password/i.test((e as Error).name) || /password/i.test((e as Error).message))) { // locked PDF: don't leave a failed import behind, just ask for the password
      await a.supabase.storage.from("private-files").remove([path]); await a.supabase.from("import_batches").delete().eq("id", id);
      return { error: filePassword ? "That password didn't open the PDF. Check it and try again. Banks often use your date of birth (DDMMYYYY or DDMMYY), customer ID, mobile number or the first letters of your name plus your birth date." : "This PDF is password-protected. Enter its password in the box below the file and upload again." };
    }
    await a.supabase.from("import_batches").update({ status: "failed", error: (e as Error).message.slice(0, 300) }).eq("id", id);
    await notify(a.user.id, "import", "Import failed", safeName);
    revalidatePath("/imports"); return { error: `Could not read this file: ${(e as Error).message.slice(0, 200)}` };
  }
  revalidatePath("/imports"); redirect(`/imports/${id}`);
}

export async function remapImport(_: FormState, fd: FormData): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  const id = String(fd.get("id"));
  const { data: b } = await a.supabase.from("import_batches").select("id,status").eq("id", id).maybeSingle(); if (!b || b.status !== "preview") return { error: "Import not available." };
  let staged; try { staged = await fetchAll((f, t) => a.supabase.from("staged_import_transactions").select("raw").eq("batch_id", id).order("row_index").range(f, t)); } catch { return { error: "Could not read the import rows. Please try again." }; }
  const g = (k: string) => (String(fd.get(k) ?? "") || undefined);
  const map: Mapping = { date: g("date"), description: g("description"), amount: g("amount"), debit: g("debit"), credit: g("credit"), ref: g("ref") };
  const { data: prof } = await a.supabase.from("profiles").select("timezone").eq("id", a.user.id).single();
  try { await stage(a.supabase, a.user.id, id, (staged ?? []).map((s) => s.raw as RawRow), map, prof?.timezone ?? "Asia/Kolkata"); } catch { return { error: "Could not apply mapping." }; }
  revalidatePath(`/imports/${id}`); return { ok: "Columns re-mapped." };
}

/** Per-row corrections before confirmation. */
export async function updateStagedRow(_: FormState, fd: FormData): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  const { parseMoney } = await import("@/lib/finance/money"); const { parseDate } = await import("@/lib/imports/parse");
  const id = String(fd.get("rowId")); const upd: Record<string, unknown> = {};
  try {
    if (fd.has("amount")) { const m = parseMoney(String(fd.get("amount"))); if (m <= 0) throw new Error("Amount must be positive"); upd.amount_minor = m; }
    if (fd.has("date")) { const d = parseDate(String(fd.get("date"))); if (!d) throw new Error("Invalid date"); upd.occurred_at = d; }
  } catch (e) { return { error: (e as Error).message }; }
  if (fd.has("description")) { upd.description = String(fd.get("description")).slice(0, 300); upd.merchant = upd.description; }
  if (fd.has("txType")) { const t = String(fd.get("txType")); if (!["income", "expense"].includes(t)) return { error: "Invalid type" }; upd.tx_type = t; }
  if (fd.has("categoryId")) upd.category_id = String(fd.get("categoryId")) || null;
  upd.include = fd.get("include") === "on"; upd.confidence = 1;
  const { error } = await a.supabase.from("staged_import_transactions").update(upd).eq("id", id); if (error) return { error: "Could not update row." };
  return { ok: "Row updated." };
}

export async function confirmImport(_: FormState, fd: FormData): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  const id = String(fd.get("id"));
  const { data: b } = await a.supabase.from("import_batches").select("id,status,file_kind").eq("id", id).maybeSingle();
  if (!b) return { error: "Import not found." }; if (b.status !== "preview") return { error: "This import was already processed." };
  let rows; try { rows = await fetchAll((f, t) => a.supabase.from("staged_import_transactions").select("*").eq("batch_id", id).eq("include", true).order("row_index").range(f, t)); } catch { return { error: "Could not read the import rows. Please try again." }; }
  const ok = (rows ?? []).filter((r) => r.amount_minor && r.occurred_at);
  if (!ok.length) return { error: "No complete rows selected." };
  // Re-run duplicate check at confirmation time so double-confirm / concurrent imports can't create dupes.
  const { data: prof } = await a.supabase.from("profiles").select("timezone").eq("id", a.user.id).single(); const tz = prof?.timezone ?? "Asia/Kolkata";
  const { txs } = await loadTxs(a.supabase, undefined, ...dupWindow(ok.map((r) => r.occurred_at)), false);
  const dups = detectDuplicates(ok.map((r) => ({ amountMinor: Number(r.amount_minor), occurredAt: r.occurred_at, description: r.description, externalRef: r.external_ref })), txs.map((t) => ({ amountMinor: t.amountMinor, occurredAt: t.occurredAt, merchant: t.merchant ?? t.description, externalRef: t.externalRef })), tz);
  const src = { csv: "import_csv", xlsx: "import_xlsx", pdf: "import_pdf", image: "receipt_ocr", aa: "integration", sms: "integration" }[b.file_kind as "csv"];
  const fresh = ok.filter((_, i) => !dups[i].duplicate);
  const ins = fresh.map((r) => ({ user_id: a.user.id, type: r.tx_type ?? "expense", amount_minor: r.amount_minor, occurred_at: r.occurred_at, name: r.description?.slice(0, 200) ?? null, merchant: r.merchant?.slice(0, 200) ?? null, description: r.description, category_id: r.category_id, external_ref: r.external_ref, source: src, import_batch_id: id }));
  for (let i = 0; i < ins.length; i += 500) { const { error } = await a.supabase.from("transactions").insert(ins.slice(i, i + 500)); if (error) return { error: error.code === "23505" ? "Some rows already exist; review duplicates." : "Could not create transactions." }; }
  await a.supabase.from("import_batches").update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("id", id);
  await notify(a.user.id, "import", "Import complete", `${ins.length} transactions added, ${ok.length - ins.length} duplicates skipped.`);
  revalidatePath("/imports"); revalidatePath("/transactions"); revalidatePath("/dashboard");
  redirect("/imports");
}

export async function cancelImport(_: FormState, fd: FormData): Promise<FormState> {
  const a = await getUserOrNull(); if (!a) return { error: "Please log in again." };
  const id = String(fd.get("id")); const { data: b } = await a.supabase.from("import_batches").select("storage_path,status").eq("id", id).maybeSingle(); if (!b) return { error: "Not found." };
  await a.supabase.storage.from("private-files").remove([b.storage_path]);
  // Confirmed batches keep their transactions (ledger history is preserved); only the file + staging rows are removed.
  if (b.status === "confirmed") await a.supabase.from("staged_import_transactions").delete().eq("batch_id", id);
  const { error } = b.status === "confirmed"
    ? await a.supabase.from("import_batches").update({ storage_path: "removed" }).eq("id", id) // transactions keep an FK to the batch; keep the record, drop the file
    : await a.supabase.from("import_batches").delete().eq("id", id);
  if (error) return { error: "Could not remove import." };
  revalidatePath("/imports"); redirect("/imports");
}
