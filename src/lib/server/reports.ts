import "server-only";
import * as XLSX from "xlsx";
import PDFDocument from "pdfkit";
import Papa from "papaparse";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTxs } from "./data";
import { summarize } from "@/lib/finance/accounting";
import { formatMoney } from "@/lib/finance/money";
import type { Range } from "@/lib/finance/dates";

/** Neutralise spreadsheet formula injection in exported text cells. */
export const safeCell = (v: unknown) => (typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export async function buildReport(sb: SupabaseClient, range: Range, currency: string) {
  const { rows, txs, lookups } = await loadTxs(sb, undefined, range.start, range.end, true, "full");
  const cat = (id: string | null) => lookups.categories.find((c) => c.id === id)?.name ?? "";
  const pm = (id: string | null) => lookups.methods.find((m) => m.id === id)?.label ?? "";
  const lines = rows.map((r) => ({ Date: r.occurred_at.slice(0, 10), Type: r.type, Name: safeCell(r.name ?? ""), Merchant: safeCell(r.merchant ?? ""), Category: cat(r.category_id), "Payment method": pm(r.payment_method_id), Channel: r.channel ?? "", "Amount (INR)": Number(r.amount_minor) / 100 }));
  const s = summarize(txs.filter((t) => t.occurredAt !== "1970-01-01T00:00:00Z"), range);
  const summary = [["Income", s.incomeMinor], ["Gross expenses", s.grossExpenseMinor], ["Refunds", s.refundsMinor], ["Net expenses", s.netExpenseMinor], ["Net cash flow", s.netCashFlowMinor]] as const;
  return { lines, summary, s, currency };
}
type Rep = Awaited<ReturnType<typeof buildReport>>;
const range = (r: Range) => `${r.start.toISOString().slice(0, 10)}_${new Date(r.end.getTime() - 1).toISOString().slice(0, 10)}`;
export const reportName = (r: Range, ext: string) => `smartfin-${range(r)}.${ext}`;

export const toCsv = (rep: Rep) => Papa.unparse(rep.lines);
export function toXlsx(rep: Rep): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Metric", "Amount (INR)"], ...rep.summary.map(([k, v]) => [k, v / 100])]), "Summary");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rep.lines), "Transactions");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}
export function toPdf(rep: Rep, r: Range): Promise<Buffer> {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 40 }); const chunks: Buffer[] = []; doc.on("data", (c) => chunks.push(c)); doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.fontSize(18).text("SmartFin AI report"); doc.fontSize(10).fillColor("#555").text(`Period: ${range(r).replace("_", " to ")} · Transfers/adjustments excluded; refunds reduce expenses`).moveDown();
    doc.fillColor("#000").fontSize(12); rep.summary.forEach(([k, v]) => doc.text(`${k}: ${formatMoney(v, rep.currency).replace("₹", "Rs. ")}`));
    doc.moveDown().fontSize(9);
    rep.lines.slice(0, 300).forEach((l) => doc.text(`${l.Date}  ${String(l.Type).padEnd(8)}  ${String(l.Name || l.Merchant).slice(0, 40).padEnd(40)}  ${l.Category.padEnd(18)}  Rs. ${l["Amount (INR)"].toFixed(2)}`));
    if (rep.lines.length > 300) doc.text(`… ${rep.lines.length - 300} more rows (use CSV/XLSX for the full list)`);
    doc.end();
  });
}
