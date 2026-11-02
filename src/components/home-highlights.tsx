import { ArrowDown, CalendarDays, ClipboardPaste, PiggyBank, Sparkles } from "lucide-react";

const chip = "rounded-full border px-2.5 py-1 text-xs font-medium";
/** "See it in action": three small, static illustrations of real features. Example data only. */
export function HomeHighlights() {
  const days: [string, string, string?][] = [["Fri", "6", "bg-rose-500"], ["Sat", "7"], ["Sun", "8", "bg-amber-500"], ["Mon", "9", "bg-rose-500"], ["Tue", "10"], ["Wed", "11", "bg-rose-500"], ["Thu", "12"]];
  const legend: [string, string, string][] = [["bg-rose-500", "Fri 6", "Dhanteras"], ["bg-amber-500", "Sun 8", "Diwali · government holiday · banks closed"], ["bg-rose-500", "Mon 9", "Govardhan Puja"], ["bg-rose-500", "Wed 11", "Bhai Dooj"]];
  return (
    <section id="showcase" aria-labelledby="showcase-h" className="scroll-mt-14 mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <p className="text-center text-sm font-medium uppercase tracking-wide text-brand">See it in action</p>
      <h2 id="showcase-h" className="mx-auto mt-2 max-w-2xl text-center text-3xl font-semibold tracking-tight">Less typing. More clarity.</h2>
      <p className="mx-auto mt-3 max-w-2xl text-center text-muted">A few of the things that make day-to-day tracking quick. The examples below use sample data.</p>
      <ul className="mt-10 grid gap-5 lg:grid-cols-3">
        <li className="glass flex flex-col rounded-2xl p-5">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand/10 text-brand"><ClipboardPaste size={20} aria-hidden /></span>
          <h3 className="mt-4 font-semibold">Paste a bank SMS, skip the form</h3>
          <p className="mb-4 mt-1 text-sm text-muted">Paste an alert or type it your own way. Amount, merchant, date, payment method and category fill in; you review and save.</p>
          <div aria-hidden className="mt-auto grid gap-2 rounded-xl bg-surface2/60 p-3 text-xs">
            <p className="rounded-lg bg-surface px-3 py-2 text-muted">Rs.450.00 debited from A/c XX1234 on 01-11-26 to VPA swiggy@icici</p>
            <ArrowDown size={14} className="mx-auto text-brand" />
            <div className="flex flex-wrap gap-1.5">{[["₹450.00", "border-good/40 bg-good/10 text-good"], ["Swiggy", "border-brand/40 bg-brand/10 text-brand"], ["UPI", "border-brand/40 bg-brand/10 text-brand"], ["Food and groceries", "border-brand/40 bg-brand/10 text-brand"], ["1 Nov", "border-brand/40 bg-brand/10 text-brand"]].map(([t, c]) => <span key={t} className={`${chip} ${c}`}>{t}</span>)}</div>
            <p className="flex items-center gap-1.5 text-muted"><Sparkles size={12} className="text-brand" />Auto-filled. You stay in control.</p>
          </div>
        </li>
        <li className="glass flex flex-col rounded-2xl p-5 lg:col-span-1">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand/10 text-brand"><CalendarDays size={20} aria-hidden /></span>
          <h3 className="mt-4 font-semibold">A calendar that knows Indian holidays</h3>
          <p className="mt-1 text-sm text-muted">Festivals, government holidays and bank closures sit beside your spending and due dates, so a bill never lands on a closed day unnoticed.</p>
          <div aria-hidden className="mt-auto pt-4"><div className="rounded-xl bg-surface2/60 p-3 text-xs">
            <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
              {days.map(([d, n, c]) => (
                <div key={n} className={`rounded-lg border px-0.5 py-1.5 ${d === "Sun" ? "border-line/70 bg-surface2" : "border-line/60 bg-surface"}`}><p className="text-muted">{d}</p><p className="text-sm font-semibold">{n}</p>
                  <span className={`mx-auto mt-1 block h-1.5 w-1.5 rounded-full ${c ?? "bg-transparent"}`} /></div>))}
            </div>
            <ul className="mt-3 grid gap-1.5">{legend.map(([c, d, t]) => <li key={d} className="flex items-start gap-2"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${c}`} /><span><b className="font-semibold">{d}</b> <span className="text-muted">{t}</span></span></li>)}</ul>
          </div></div>
        </li>
        <li className="glass flex flex-col rounded-2xl p-5">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand/10 text-brand"><PiggyBank size={20} aria-hidden /></span>
          <h3 className="mt-4 font-semibold">Budgets that warn you once</h3>
          <p className="mb-4 mt-1 text-sm text-muted">Pick the alert levels you want. You get one notification as each level is crossed, never a stream of repeats.</p>
          <div aria-hidden className="mt-auto grid gap-3 rounded-xl bg-surface2/60 p-3 text-xs">
            <div><div className="mb-1 flex justify-between"><span className="font-medium">Food &amp; dining</span><span className="tabnum text-muted">₹8,640 of ₹12,000</span></div><div className="h-2 rounded-full bg-surface"><div className="h-full w-[72%] rounded-full bg-gradient-to-r from-indigo-500 to-amber-400" /></div></div>
            <div className="flex flex-wrap gap-1.5">{[["25%", false], ["50%", true], ["75%", true], ["90%", true], ["100%", true]].map(([t, on]) => <span key={t as string} className={`${chip} ${on ? "border-brand bg-brand/12 text-brand" : "border-line text-muted"}`}>{on ? "✓ " : ""}{t}</span>)}</div>
          </div>
        </li>
      </ul>
    </section>
  );
}
