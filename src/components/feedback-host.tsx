"use client";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { onConfirm, onToast, type ConfirmOpts, type ToastMsg } from "@/lib/feedback-bus";
import { cn } from "./ui";

const TONE = {
  success: { icon: CheckCircle2, cls: "text-good", bar: "bg-good" },
  error: { icon: XCircle, cls: "text-bad", bar: "bg-bad" },
  info: { icon: Info, cls: "text-brand", bar: "bg-brand" },
} as const;

/** Mounted once in the root layout: success/error toasts that dismiss themselves, and the "Are you sure?" confirmation dialog. */
export function FeedbackHost() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [ask, setAsk] = useState<{ o: ConfirmOpts; done: (v: boolean) => void } | null>(null);
  const cancel = useRef<HTMLButtonElement>(null); const opener = useRef<HTMLElement | null>(null);

  useEffect(() => onToast((t) => { setToasts((p) => [...p.slice(-3), t]); setTimeout(() => setToasts((p) => p.filter((x) => x.id !== t.id)), t.ms); }), []);
  useEffect(() => onConfirm((o, done) => { opener.current = document.activeElement as HTMLElement | null; setAsk({ o, done }); }), []);
  useEffect(() => { if (ask) cancel.current?.focus(); }, [ask]); // safest default: Cancel is focused

  const finish = (v: boolean) => { ask?.done(v); setAsk(null); opener.current?.focus?.(); };
  const danger = (ask?.o.tone ?? "danger") === "danger";
  return (
    <>
      <div aria-live="polite" role="status" className="pointer-events-none fixed right-4 top-4 z-[200] grid w-[min(92vw,22rem)] gap-2">
        {toasts.map((t) => { const T = TONE[t.tone]; const Icon = T.icon;
          return (
            <div key={t.id} className="pop toast-in pointer-events-auto relative overflow-hidden rounded-xl py-3 pl-3 pr-9 text-sm">
              <div className="flex items-start gap-2.5"><Icon size={18} className={cn("mt-0.5 shrink-0", T.cls)} aria-hidden /><span className="min-w-0">{t.text}</span></div>
              <button type="button" aria-label="Dismiss" onClick={() => setToasts((p) => p.filter((x) => x.id !== t.id))} className="absolute right-2 top-2 rounded p-1 text-muted hover:text-fg"><X size={14} /></button>
              <span aria-hidden className={cn("toast-bar absolute bottom-0 left-0 h-0.5 w-full origin-left", T.bar)} style={{ animationDuration: `${t.ms}ms` }} />
            </div>); })}
      </div>
      {ask && (
        <div className="fixed inset-0 z-[210] grid place-items-center bg-black/40 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) finish(false); }}
          onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); finish(false); } if (e.key === "Tab") { const b = [...e.currentTarget.querySelectorAll("button")]; const i = b.indexOf(document.activeElement as HTMLButtonElement); e.preventDefault(); b[(i + (e.shiftKey ? -1 : 1) + b.length) % b.length]?.focus(); } }}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-msg" className="pop toast-in w-[min(92vw,26rem)] rounded-2xl p-6">
            <div className="flex items-start gap-3">
              <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full", danger ? "bg-bad/12 text-bad" : "bg-brand/12 text-brand")}><AlertTriangle size={20} aria-hidden /></span>
              <div><h2 id="confirm-title" className="text-base font-semibold">{ask.o.title ?? "Are you sure?"}</h2><p id="confirm-msg" className="mt-1 text-sm text-muted">{ask.o.message}</p></div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button ref={cancel} type="button" onClick={() => finish(false)} className="h-10 rounded-lg border border-line bg-surface/70 px-4 text-sm font-medium transition hover:border-brand/50">{ask.o.cancelLabel ?? "Cancel"}</button>
              <button type="button" onClick={() => finish(true)} className={cn("h-10 rounded-lg px-4 text-sm font-medium text-white transition hover:opacity-90 active:scale-[.98]", danger ? "bg-bad" : "bg-brand text-brandfg")}>{ask.o.confirmLabel ?? (danger ? "Yes, delete" : "Yes, continue")}</button>
            </div>
          </div>
        </div>)}
    </>
  );
}
