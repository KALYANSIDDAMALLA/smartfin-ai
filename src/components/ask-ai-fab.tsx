"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Send, Sparkles, X } from "lucide-react";
import { quickAsk } from "@/app/actions/automation";
import { Button, ErrorNote } from "./ui";

const EXAMPLES = ["How much did I spend this month?", "Compare this month with last month", "What recurring payments do I have?"];

/** Floating "Ask AI" on every signed-in page: quick questions answered from verified calculations (nothing is stored). */
export function AskAiFab() {
  const [open, setOpen] = useState(false); const [q, setQ] = useState(""); const [pending, start] = useTransition();
  const [ans, setAns] = useState<{ q: string; text?: string; period?: string; error?: string }>(); const input = useRef<HTMLInputElement>(null); const box = useRef<HTMLDivElement>(null);
  // Closes on an outside click or Esc, like the other pop-ups.
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node) && !(e.target as HTMLElement).closest("[role=alertdialog]")) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  const ask = (question: string) => { if (question.trim().length < 3) return; start(async () => { const r = await quickAsk(question); setAns({ q: question, ...r }); setQ(""); }); };
  return (
    <div className="fixed bottom-4 right-4 z-40" ref={box}>
      {open && (
        <div role="dialog" aria-label="Ask AI" className="pop mb-3 w-[min(92vw,22rem)] rounded-2xl p-4">
          <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 font-medium"><Sparkles size={16} className="text-brand" aria-hidden />Ask AI</h2><button type="button" aria-label="Close" onClick={() => setOpen(false)} className="icon-btn !h-8 !w-8"><X size={14} /></button></div>
          <div aria-live="polite" className="mt-3 max-h-64 overflow-y-auto text-sm">
            {pending && <p className="text-muted">Thinking…</p>}
            {!pending && ans && (ans.error ? <ErrorNote>{ans.error}</ErrorNote> : <div className="grid gap-1"><p className="text-xs text-muted">{ans.q}</p><p className="whitespace-pre-line rounded-xl bg-surface2 px-3 py-2">{ans.text}</p>{ans.period && <p className="text-xs text-muted">Period: {ans.period}</p>}</div>)}
            {!pending && !ans && <div className="grid gap-1.5">{EXAMPLES.map((e) => <button key={e} type="button" onClick={() => ask(e)} className="rounded-lg border border-line px-3 py-1.5 text-left text-xs hover:bg-surface2/60">{e}</button>)}</div>}
          </div>
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} aria-label="Your question" placeholder="Ask about your money…" className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface/70 px-3 text-sm" />
            <Button size="sm" disabled={pending || q.trim().length < 3} aria-label="Send"><Send size={14} /></Button>
          </form>
          <Link href="/ai/assistant" className="mt-2 block text-xs text-brand underline">Open the full assistant</Link>
        </div>
      )}
      <button type="button" onClick={() => { setOpen((o) => !o); setTimeout(() => input.current?.focus(), 50); }} aria-expanded={open}
        aria-label="Ask AI" className="btn-shine glow ml-auto flex h-12 w-12 items-center justify-center gap-2 rounded-full bg-linear-to-b from-brand to-brand/85 text-sm font-semibold text-brandfg sm:w-auto sm:px-4"><Sparkles size={18} aria-hidden /><span className="hidden sm:inline">Ask AI</span></button>
    </div>
  );
}
