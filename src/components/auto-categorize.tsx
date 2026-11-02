"use client";
import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, ErrorNote } from "./ui";
import { applyCategories, previewAutoCategorize, type CatProposal } from "@/app/actions/automation";
import { formatMoney } from "@/lib/finance/money";

/** One-click auto-categorisation: previews suggestions with confidence; nothing changes until you apply. */
export function AutoCategorize() {
  const router = useRouter(); const [pending, start] = useTransition();
  const [props, setProps] = useState<CatProposal[] | null>(null); const [total, setTotal] = useState(0); const [pick, setPick] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<string>(); const [err, setErr] = useState<string>();
  const run = () => { setErr(undefined); setMsg(undefined); start(async () => { const r = await previewAutoCategorize(); if (r.error) { setErr(r.error); return; } setProps(r.proposals); setTotal(r.total); setPick(Object.fromEntries(r.proposals.map((p) => [p.id, p.confidence >= 0.7]))); if (!r.total) setMsg("Everything is already categorised."); else if (!r.proposals.length) setMsg(`${r.total} uncategorised, but no confident suggestions yet.`); }); };
  const apply = () => { const items = (props ?? []).filter((p) => pick[p.id]).map((p) => ({ id: p.id, categoryId: p.categoryId })); start(async () => { const r = await applyCategories(items); if (r.error) setErr(r.error); else { setMsg(`Categorised ${r.applied} transactions.`); setProps(null); router.refresh(); } }); };
  return (
    <Card className="mb-4 !p-3 sm:!px-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-1 items-start gap-3"><span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand/12 text-brand"><Sparkles size={16} aria-hidden /></span>
          <div className="min-w-0"><p className="text-sm font-medium">Auto-categorise uncategorised transactions</p><p className="text-xs text-muted">Uses your past entries, built-in rules and AI. You approve before anything changes.</p></div></div>
        <Button type="button" size="sm" onClick={run} disabled={pending} className="shrink-0">{pending && !props ? "Looking…" : "Suggest categories"}</Button></div>
      {err && <div className="mt-2"><ErrorNote>{err}</ErrorNote></div>}{msg && <p role="status" className="mt-2 text-sm text-good">{msg}</p>}
      {props && props.length > 0 && <div className="mt-3 grid gap-2"><p className="text-sm text-muted">{props.length} suggestions for {total} uncategorised.</p>
        <ul className="grid gap-1.5">{props.map((p) => (<li key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!pick[p.id]} onChange={(e) => setPick((s) => ({ ...s, [p.id]: e.target.checked }))} />{p.label}</label>
          <span className="text-muted">{formatMoney(p.amountMinor)}</span><span className="ml-auto flex items-center gap-2">→ <b>{p.categoryName}</b><Badge tone={p.confidence >= 0.85 ? "good" : "warn"}>{Math.round(p.confidence * 100)}%</Badge><Badge tone={p.source === "ai" ? "info" : "neutral"}>{p.source === "ai" ? "AI" : p.source === "history" ? "your history" : "rule"}</Badge></span></li>))}</ul>
        <div className="flex gap-2"><Button type="button" onClick={apply} disabled={pending || !Object.values(pick).some(Boolean)}>{pending ? "Applying…" : `Apply ${Object.values(pick).filter(Boolean).length} selected`}</Button><Button type="button" variant="outline" onClick={() => setProps(null)}>Cancel</Button></div></div>}
    </Card>
  );
}
