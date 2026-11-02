import { CalendarDays, Check, Sparkles } from "lucide-react";

/** An example AI conversation (sample data), with two floating cards unless `compact`. Shown on the log in / sign up side panel. */
export function AssistantShowcase({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "relative mx-auto w-full max-w-md" : "relative mx-auto w-full max-w-md pb-16"} role="img" aria-label="Example: asking the SmartFin AI assistant about food spending and upcoming bills">
      <div aria-hidden className="float-slow rounded-2xl border border-white/20 bg-white/10 p-4 shadow-2xl shadow-black/25 backdrop-blur-md">
        <div className="mb-3 flex items-center justify-between text-xs text-white/70"><span className="flex items-center gap-1.5 font-medium text-white"><Sparkles size={14} className="text-amber-300" />Ask SmartFin AI</span><span className="rounded-full bg-white/15 px-2 py-0.5">Example</span></div>
        <div className="grid gap-2.5 text-sm">
          <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-white px-3 py-2 text-indigo-950">How much did I spend on food last month?</p>
          <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-black/25 px-3 py-2.5 text-white/95">
            <p>You spent <b className="text-amber-300">₹14,820</b> on Food &amp; groceries across 37 transactions, about 17% of your income.</p>
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-white/60"><Check size={12} className="text-emerald-300" />Calculated from your records, not guessed</p>
          </div>
          <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-white px-3 py-2 text-indigo-950">Which bills are due this week?</p>
          <div className="max-w-[92%] rounded-2xl rounded-bl-md bg-black/25 px-3 py-2.5 text-white/95">
            <ul className="grid gap-1 text-[13px]">{[["Broadband", "₹1,049", "Wed"], ["Netflix", "₹649", "Fri"], ["Electricity", "₹1,840", "Sun"]].map(([n, a, d]) => <li key={n} className="flex justify-between gap-3"><span>{n}</span><span className="tabnum text-white/70">{a} · {d}</span></li>)}</ul>
          </div>
        </div>
      </div>
      {!compact && <><div aria-hidden className="float-slow absolute bottom-0 left-0 hidden items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 text-slate-800 shadow-2xl shadow-black/30 sm:flex" style={{ animationDelay: "-2s" }}>
        <span className="h-9 w-9 shrink-0 rounded-full" style={{ background: "conic-gradient(#4f46e5 0 34%, #f59e0b 0 60%, #10b981 0 74%, #ec4899 0 86%, #cbd5e1 0)" }}><span className="m-[7px] block h-[22px] w-[22px] rounded-full bg-white" /></span>
        <span className="text-xs leading-tight"><b className="block text-[13px]">Spending by category</b>Food 34% · Rent 26%</span>
      </div>
      <div aria-hidden className="float-slow absolute bottom-0 right-0 hidden items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 text-slate-800 shadow-2xl shadow-black/30 lg:flex" style={{ animationDelay: "-4s" }}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rose-100 text-rose-600"><CalendarDays size={17} /></span>
        <span className="text-xs leading-tight"><b className="block text-[13px]">Diwali · Sun 8 Nov</b>Banks closed, plan ahead</span>
      </div></>}
    </div>
  );
}
