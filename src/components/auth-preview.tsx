import { Sparkles, TrendingUp } from "lucide-react";

const BARS = [38, 62, 45, 80, 54, 92, 68];
/** A static, clearly-labelled sample of the dashboard for the sign-in side panel. No real data; purely decorative. */
export function AuthPreview() {
  return (
    <div className="relative" role="img" aria-label="Example preview of the SmartFin AI dashboard with sample numbers">
      <div aria-hidden className="float-slow rounded-2xl border border-white/20 bg-white/10 p-4 shadow-2xl shadow-black/25 backdrop-blur-md">
        <div className="mb-3 flex items-center justify-between text-xs text-white/70"><span className="font-medium text-white">This month</span><span className="rounded-full bg-white/15 px-2 py-0.5">Example data</span></div>
        <div className="grid grid-cols-3 gap-2">
          {[["Income", "₹85,000", "text-emerald-300"], ["Spent", "₹52,340", "text-rose-300"], ["Saved", "38%", "text-amber-300"]].map(([l, v, c]) => (
            <div key={l} className="rounded-xl bg-black/20 px-3 py-2"><p className="text-[11px] text-white/60">{l}</p><p className={`tabnum text-base font-semibold ${c}`}>{v}</p></div>))}
        </div>
        <div className="mt-3 flex h-16 items-end gap-1.5 rounded-xl bg-black/15 px-3 pb-2 pt-3">
          {BARS.map((h, i) => <span key={i} className="flex-1 rounded-t bg-gradient-to-t from-indigo-300/60 to-white/80" style={{ height: `${h}%` }} />)}
        </div>
        <div className="mt-3 grid gap-2 text-xs text-white/80">
          {[["Food & dining", 72, "bg-amber-300"], ["Transport", 41, "bg-emerald-300"]].map(([l, p, c]) => (
            <div key={l as string}><div className="mb-1 flex justify-between"><span>{l}</span><span className="tabnum">{p}% of budget</span></div><div className="h-1.5 rounded-full bg-white/15"><div className={`h-full rounded-full ${c}`} style={{ width: `${p}%` }} /></div></div>))}
        </div>
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-white/12 px-3 py-2 text-xs text-white"><Sparkles size={14} className="mt-0.5 shrink-0 text-amber-300" />Dining is 12% lower than last month. Nice work.</p>
      </div>
      <span aria-hidden className="absolute -right-3 -top-3 grid h-9 w-9 place-items-center rounded-full bg-emerald-400 text-emerald-950 shadow-lg"><TrendingUp size={18} /></span>
    </div>
  );
}
