"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { ClipboardPaste, Loader2, Sparkles } from "lucide-react";
import { Badge, Button, Card, Textarea } from "./ui";
import { TxForm } from "./tx-form";
import { instantRead } from "@/lib/imports/instant";
import { smartRead } from "@/app/actions/suggest";
import type { SmartResult } from "@/lib/imports/smart";
import type { Lookups } from "@/lib/server/data";

/** Paste a bank/UPI alert → the form is pre-filled for review. Parsing happens in the browser; the message itself is never stored. */
export function PasteTx({ lookups, mode, ai = false, start, merchants }: { lookups: Lookups; mode: "expense" | "income"; ai?: boolean; start?: React.ComponentProps<typeof TxForm>["initial"]; merchants?: React.ComponentProps<typeof TxForm>["merchants"] }) {
  const [text, setText] = useState("");
  const [res, setRes] = useState<SmartResult>();
  const [n, setN] = useState(0); // remount the form each time a result is applied
  const [busy, setBusy] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined); const lastRead = useRef("");
  const todayLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

  /** Instant offline read first (fields appear immediately), then the history/AI-enriched server result replaces it when it arrives. */
  const read = async (t: string) => {
    lastRead.current = t; setBusy(true);
    const l = instantRead(t, mode, { today: todayLocal(), methods: lookups.methods, categories: lookups.categories });
    if (l.ok) { setRes(l); setN((x) => x + 1); }
    try {
      const r = await smartRead(t, mode);
      if (lastRead.current !== t) return; // the text changed while we were reading: ignore the stale answer
      if (r.ok || !l.ok) { if (r.ok && !r.date && r.time) r.date = todayLocal(); setRes(r); setN((x) => x + 1); }
    } catch { if (!l.ok) setRes({ ok: false, reason: "Couldn't read that right now.", confidence: "low", usedAI: false, notes: [] }); }
    finally { if (lastRead.current === t) setBusy(false); }
  };
  /** Auto-read: right after a paste, and ~1s after typing stops. Same text is never read twice. */
  const schedule = (t: string, delay: number) => { clearTimeout(timer.current); if (t.trim().length < 8 || t.trim() === lastRead.current.trim()) return; timer.current = setTimeout(() => void read(t.trim()), delay); };
  const wrongWay = res?.ok && res.type !== mode;
  const initial = res?.ok && !wrongWay ? {
    amount: res.amount, name: res.name ?? res.merchant ?? res.description, merchant: res.merchant, paymentMethodId: res.methodId, categoryId: res.categoryId, channel: res.channel, externalRef: res.ref,
    occurredAt: res.date ? `${res.date}T${res.time ?? "12:00"}` : undefined, description: res.description, tags: res.tags, notes: res.noteText, draftId: start?.draftId,
  } : start;
  return (
    <div className="grid gap-6">
      <Card>
        <h2 className="flex items-center gap-2 font-medium"><ClipboardPaste size={16} className="text-brand" aria-hidden />Paste or type — we fill the form for you</h2>
        <p className="mt-1 text-sm text-muted">Paste a bank/UPI alert or type it in your own words — it is read automatically. We fill the amount, name, date and time, merchant, payment method, category, tags and notes; highlighted fields are auto-filled, and you review before saving.
          {ai ? " AI helps read free text; the amount must appear in your text, and every field is checked." : " AI isn't connected, so the built-in reader handles bank alerts (add GEMINI_API_KEY for free-text understanding)."}</p>
        <label htmlFor="sms" className="sr-only">Bank or UPI message, or a description of the payment</label>
        <Textarea id="sms" rows={3} value={text} onChange={(e) => { setText(e.target.value); schedule(e.target.value, 1100); }} onPaste={(e) => { const el = e.currentTarget; setTimeout(() => schedule(el.value, 0), 0); }} maxLength={800} className="mt-3"
          placeholder={mode === "income" ? "e.g. Rs 50000 credited to A/c XX1234 on 01-11-26 by NEFT from ACME PVT LTD  —  or —  got 9000 from client for logo design yesterday" : "e.g. Rs.450.00 debited from A/c XX1234 on 01-11-26 to VPA swiggy@icici  —  or —  paid 250 to Ravi for lunch yesterday via GPay"} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => void read(text.trim())} disabled={busy || text.trim().length < 3}>{busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Sparkles size={16} aria-hidden />}{busy ? "Reading…" : res?.ok ? "Read again" : "Read message"}</Button>
          {text && !busy && <Button type="button" variant="ghost" onClick={() => { clearTimeout(timer.current); lastRead.current = ""; setText(""); setRes(undefined); setN((x) => x + 1); }}>Clear</Button>}
        </div>
        {res && !res.ok && <p role="alert" className="mt-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">{res.reason} You can still fill the form below by hand.</p>}
        {wrongWay && res.ok && <p role="alert" className="mt-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">This looks like money {res.type === "income" ? "received" : "spent"}. Add it on the <Link href={res.type === "income" ? "/income" : "/expenses/new"} className="font-medium underline">{res.type === "income" ? "Income" : "Add expense"}</Link> page instead.</p>}
        {res?.ok && !wrongWay && <div role="status" className="mt-3 grid gap-1 text-sm">
          <p className="flex flex-wrap items-center gap-2"><Badge tone={res.confidence === "high" ? "good" : "warn"}>{res.confidence} confidence</Badge><Badge tone={res.usedAI ? "info" : "neutral"}>{res.usedAI ? "AI-assisted" : "Built-in reader"}</Badge>Filled in below — check every field, then Save.</p>
          {res.notes.map((x) => <p key={x} className="text-xs text-muted">{x}</p>)}</div>}
      </Card>
      <Card><TxForm key={n} lookups={lookups} fixedType={mode} initial={initial} merchants={merchants} auto={res?.ok && !wrongWay ? res.filled : undefined} /></Card>
    </div>
  );
}
