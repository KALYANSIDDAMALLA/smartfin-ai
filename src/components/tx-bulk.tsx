"use client";
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteAllMatching, deleteTransactions } from "@/app/actions/transactions";
import { askConfirm, toast } from "@/lib/feedback-bus";
import type { SP } from "@/lib/server/range";
import { cn } from "./ui";

/** The tick box shown in front of every row (and, with `all`, in the table header). The surrounding <TxBulk> reads them, so the table itself stays a server component. */
export function MarkBox({ id, all, label }: { id?: string; all?: boolean; label: string }) {
  return <input type="checkbox" aria-label={label} value={id} {...(all ? { "data-mark-all": "" } : { "data-mark-row": "" })} className="h-4 w-4 cursor-pointer accent-[var(--brand)]" />;
}

/**
 * Mark rows with their tick boxes, mark all on this page, then "Delete marked" or "Delete all" (everything in the current view: its period and filters, on every page).
 * Both ask first. Deleted transactions leave the totals right away.
 */
export function TxBulk({ children, total, sp }: { children: ReactNode; total: number; sp: SP }) {
  const router = useRouter(); const box = useRef<HTMLDivElement>(null); const [pending, start] = useTransition();
  const [ids, setIds] = useState<string[]>([]); const [rows, setRows] = useState(0);
  const sync = useCallback(() => {
    const el = box.current; if (!el) return;
    const all = [...el.querySelectorAll<HTMLInputElement>("input[data-mark-row]")]; const on = all.filter((i) => i.checked);
    setIds(on.map((i) => i.value)); setRows(all.length);
    for (const h of el.querySelectorAll<HTMLInputElement>("input[data-mark-all]")) { h.checked = all.length > 0 && on.length === all.length; h.indeterminate = on.length > 0 && on.length < all.length; }
  }, []);
  useEffect(() => { sync(); }, [children, sync]);
  const markAll = (checked: boolean) => { for (const i of box.current?.querySelectorAll<HTMLInputElement>("input[data-mark-row]") ?? []) i.checked = checked; sync(); };
  const n = ids.length; const view = describeView(sp);

  const delMarked = () => void askConfirm({ title: `Delete ${n} transaction${n === 1 ? "" : "s"}?`, message: `The ${n === 1 ? "transaction" : `${n} marked transactions`} will be deleted and no longer counted in your totals.`, tone: "danger", confirmLabel: `Yes, delete ${n}` }).then((ok) => {
    if (!ok) return; start(async () => { const r = await deleteTransactions(ids); if (r.error) toast(r.error, "error", 5000); else { toast(`${r.deleted} transaction${r.deleted === 1 ? "" : "s"} deleted.`); setIds([]); router.refresh(); } });
  });
  const delAll = () => void askConfirm({ title: `Delete ALL ${total.toLocaleString("en-IN")} transactions?`, message: `This deletes every transaction in this view (${view}), on all pages, not only the ones you can see. They will no longer be counted in your totals.`, tone: "danger", confirmLabel: `Yes, delete all ${total.toLocaleString("en-IN")}` }).then((ok) => {
    if (!ok) return; start(async () => { const r = await deleteAllMatching(sp, total); if (r.error) toast(r.error, "error", 6000); else { toast(`${r.deleted.toLocaleString("en-IN")} transactions deleted.`); setIds([]); router.refresh(); } });
  });

  const btn = "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45";
  return (
    <div ref={box} onChange={(e) => { const t = e.target as HTMLInputElement; if (t.matches("input[data-mark-all]")) markAll(t.checked); else if (t.matches("input[data-mark-row]")) sync(); }}>
      <div role="toolbar" aria-label="Mark and delete transactions" className={cn("mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-3 py-2 text-sm transition", n ? "border-brand/40 bg-brand/10" : "border-line bg-surface/50")}>
        <label className="inline-flex cursor-pointer items-center gap-2 font-medium"><input type="checkbox" aria-label="Mark all on this page" checked={rows > 0 && n === rows} ref={(el) => { if (el) el.indeterminate = n > 0 && n < rows; }} onChange={(e) => markAll(e.target.checked)} className="h-4 w-4 cursor-pointer accent-[var(--brand)]" />Mark all</label>
        <span aria-live="polite" className="text-muted">{n ? <><b className="tabnum text-fg">{n}</b> marked</> : "Tick rows to mark them"}</span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={delMarked} disabled={!n || pending} className={cn(btn, "border-bad/50 text-bad hover:bg-bad/10")}><Trash2 size={15} aria-hidden />Delete marked{n ? ` (${n})` : ""}</button>
          <button type="button" onClick={delAll} disabled={!total || pending} className={cn(btn, "border-bad bg-bad text-white hover:brightness-110")}><Trash2 size={15} aria-hidden />Delete all {total.toLocaleString("en-IN")}</button>
        </span>
      </div>
      {children}
    </div>
  );
}

const RANGES: Record<string, string> = { today: "today", week: "this week", month: "this month", year: "this year" };
/** Plain words for what "Delete all" will remove: the period plus any filters. */
function describeView(sp: SP): string {
  const parts = [sp.range === "custom" && sp.from && sp.to ? `${sp.from} to ${sp.to}` : RANGES[sp.range ?? ""] ?? "this year"];
  if (sp.q) parts.push(`matching “${sp.q}”`); if (sp.type) parts.push(`type: ${sp.type}`); if (sp.cat) parts.push("one category"); if (sp.method) parts.push("one payment method"); if (sp.channel) parts.push(sp.channel);
  if (sp.min || sp.max) parts.push("amount range");
  return parts.join(", ");
}
