"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Calculator as CalcIcon, Delete, X } from "lucide-react";
import { evaluate, emi, gst } from "@/lib/calc";
import { cn } from "./ui";
import { Select } from "./select";
import { NumInput } from "./num-input";

type Tab = "basic" | "emi" | "gst";
const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
const KEYS = ["C", "(", ")", "÷", "7", "8", "9", "×", "4", "5", "6", "-", "1", "2", "3", "+", "0", ".", "%", "="];
const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };
const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/,/g, "")));

/** Header calculator: basic arithmetic (typed or keypad), loan EMI and GST. Everything runs in the browser; nothing is saved. */
export function CalculatorButton() {
  const [open, setOpen] = useState(false); const [tab, setTab] = useState<Tab>("basic");
  const [expr, setExpr] = useState(""); const [done, setDone] = useState<number | null>(null); const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node) && !(e.target as HTMLElement).closest("[role=listbox]")) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const live = expr ? safe(() => evaluate(expr)) : null;
  const press = (k: string) => {
    if (k === "C") { setExpr(""); setDone(null); return; }
    if (k === "=") { if (live !== null) { setExpr(String(live)); setDone(live); } return; }
    setExpr((e) => (done !== null && /\d|\./.test(k) ? k : e + k)); setDone(null); // typing a digit after "=" starts fresh
  };
  const [loan, setLoan] = useState(""); const [rate, setRate] = useState(""); const [tenure, setTenure] = useState(""); const [unit, setUnit] = useState<"months" | "years">("years");
  const months = num(tenure) * (unit === "years" ? 12 : 1);
  const e = safe(() => emi(num(loan), num(rate), months));
  const [amt, setAmt] = useState(""); const [gr, setGr] = useState("18"); const [mode, setMode] = useState<"exclusive" | "inclusive">("exclusive");
  const g = safe(() => gst(num(amt), num(gr), mode));
  const tabBtn = (t: Tab, label: string) => <button type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition", tab === t ? "bg-brand text-brandfg" : "hover:bg-surface2/60")}>{label}</button>;
  const row = (k: string, v: string, strong?: boolean) => <div key={k} className="flex justify-between gap-3"><span className="text-muted">{k}</span><span className={cn("tabnum", strong && "font-semibold")}>{v}</span></div>;

  return (
    <div className="relative" ref={box}>
      <button type="button" aria-label="Calculator" aria-expanded={open} data-tip="Calculator" className="icon-btn" onClick={() => setOpen((o) => !o)}><CalcIcon size={18} /></button>
      {open && (
        <div role="dialog" aria-label="Calculator" className="pop fixed right-3 top-[4.75rem] z-50 w-[min(calc(100vw-2.5rem),19rem)] rounded-2xl p-3 sm:absolute sm:right-0 sm:top-full sm:mt-2">
          <div className="mb-2 flex items-center justify-between"><div role="tablist" aria-label="Calculator type" className="flex flex-1 gap-1 rounded-xl bg-surface2/50 p-1">{tabBtn("basic", "Basic")}{tabBtn("emi", "Loan EMI")}{tabBtn("gst", "GST")}</div>
            <button type="button" aria-label="Close calculator" onClick={() => setOpen(false)} className="ml-2 rounded-lg p-1.5 hover:bg-surface2/60"><X size={16} /></button></div>

          {tab === "basic" && <div>
            <input aria-label="Expression" inputMode="decimal" autoFocus value={expr} onChange={(ev) => { setExpr(ev.target.value.replace(/[^\d+\-×÷*/%().,\s₹]/g, "")); setDone(null); }} onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); press("="); } }}
              placeholder="e.g. 1250 + 18% or 450 × 3" className="h-11 w-full rounded-lg border border-line bg-bg/60 px-3 text-right text-lg tabnum outline-none focus:bg-bg" />
            <p aria-live="polite" className="mt-1 h-5 text-right text-sm text-muted tabnum">{expr && (live === null ? "…" : `= ${live.toLocaleString("en-IN", { maximumFractionDigits: 6 })}`)}</p>
            <div className="mt-1 grid grid-cols-4 gap-1.5">
              {KEYS.map((k) => <button key={k} type="button" onClick={() => press(k)} aria-label={k === "÷" ? "divide" : k === "×" ? "multiply" : k === "-" ? "minus" : k}
                className={cn("h-10 rounded-lg border border-line text-sm font-medium transition hover:bg-brand/10 active:scale-95", k === "=" && "bg-brand text-brandfg hover:bg-brand/90", /[÷×+\-%]/.test(k) && "text-brand", k === "C" && "text-bad")}>{k}</button>)}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <button type="button" onClick={() => setExpr((x) => x.slice(0, -1))} aria-label="Backspace" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted hover:bg-surface2/60"><Delete size={14} />Back</button>
              {live !== null && live > 0 && <Link href={`/expenses/new?amount=${live}`} onClick={() => setOpen(false)} className="text-xs font-medium text-brand underline">Use {inr(live)} in a new expense</Link>}
            </div>
          </div>}

          {tab === "emi" && <div className="grid gap-2 text-sm">
            <label className="grid gap-1">Loan amount (₹)<NumInput mode="money" className="h-9 text-sm" value={loan} onValueChange={setLoan} placeholder="10,00,000" /></label>
            <label className="grid gap-1">Interest rate (% per year)<NumInput mode="decimal" className="h-9 text-sm" value={rate} onValueChange={setRate} placeholder="9" /></label>
            <div className="grid grid-cols-[1fr_auto] items-end gap-2"><label className="grid gap-1">Tenure<NumInput mode="int" className="h-9 text-sm" value={tenure} onValueChange={setTenure} placeholder="10" /></label>
              <Select aria-label="Tenure unit" value={unit} onChange={(ev) => setUnit(ev.target.value as "months" | "years")}><option value="years">years</option><option value="months">months</option></Select></div>
            <div aria-live="polite" className="mt-1 grid gap-1 rounded-xl bg-surface2/50 p-3">
              {e ? [row("Monthly EMI", inr(e.monthly), true), row("Total interest", inr(e.interest)), row("Total payable", inr(e.total))] : <p className="text-muted">Enter the amount, rate and tenure.</p>}</div>
            <p className="text-xs text-muted">Reducing-balance estimate; your lender&apos;s figure may differ slightly (fees, rounding).</p>
          </div>}

          {tab === "gst" && <div className="grid gap-2 text-sm">
            <label className="grid gap-1">Amount (₹)<NumInput mode="money" className="h-9 text-sm" value={amt} onValueChange={setAmt} placeholder="1,000" /></label>
            <div className="grid grid-cols-2 gap-2"><label className="grid gap-1">GST rate<Select value={["0", "5", "12", "18", "28"].includes(gr) ? gr : "custom"} onChange={(ev) => setGr(ev.target.value === "custom" ? "" : ev.target.value)}>{["0", "5", "12", "18", "28"].map((r) => <option key={r} value={r}>{r}%</option>)}<option value="custom">Other…</option></Select></label>
              <label className="grid gap-1">Amount is<Select value={mode} onChange={(ev) => setMode(ev.target.value as "exclusive" | "inclusive")}><option value="exclusive">Without GST</option><option value="inclusive">With GST</option></Select></label></div>
            {!["0", "5", "12", "18", "28"].includes(gr) && <label className="grid gap-1">Custom rate (%)<NumInput mode="decimal" className="h-9 text-sm" value={gr} onValueChange={setGr} placeholder="e.g. 3" /></label>}
            <div aria-live="polite" className="mt-1 grid gap-1 rounded-xl bg-surface2/50 p-3">
              {g ? [row("Amount before GST", inr(g.net)), row("CGST", inr(g.cgst)), row("SGST", inr(g.sgst)), row("Total GST", inr(g.tax)), row("Total with GST", inr(g.gross), true)] : <p className="text-muted">Enter an amount.</p>}</div>
            <p className="text-xs text-muted">CGST + SGST shown for within-state sales; for inter-state sales the same total is IGST.</p>
          </div>}
        </div>
      )}
    </div>
  );
}
