import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarDays, Flame, HeartPulse, Minus, Repeat, Sparkles, Target, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import type { Analysis, Kpi } from "@/lib/finance/analysis";
import { pctText } from "@/lib/finance/pct";
import type { Insight } from "@/lib/server/insights";
import { runAnalysis } from "@/app/actions/ai";
import { ActionForm } from "./action-form";
import { CumulativeChart } from "./charts-lazy";
import Link from "next/link";
import { Card, cn } from "./ui";

type Fmt = (minor: number) => string;
const band = (s: number) => (s >= 80 ? { c: "#10b981", t: "text-emerald-600 dark:text-emerald-300" } : s >= 60 ? { c: "#6366f1", t: "text-indigo-600 dark:text-indigo-300" } : s >= 40 ? { c: "#f59e0b", t: "text-amber-600 dark:text-amber-300" } : { c: "#ef4444", t: "text-red-600 dark:text-red-300" });

/** Circular financial-health gauge. */
export function HealthRing({ score, label }: { score: number; label: string }) {
  const r = 52, c = 2 * Math.PI * r, b = band(score);
  return (
    <div className="relative grid h-36 w-36 shrink-0 place-items-center" role="img" aria-label={`Financial health ${score} out of 100, ${label}`}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" style={{ filter: `drop-shadow(0 0 8px ${b.c}88)` }}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeOpacity={0.12} strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke={b.c} strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <div className="absolute text-center"><p className="tabnum text-4xl font-bold leading-none">{score}</p><p className={cn("mt-1 text-xs font-semibold", b.t)}>{label}</p></div>
    </div>
  );
}

function Delta({ k }: { k: Kpi }) {
  if (k.deltaPct === null) return <span className="text-xs text-muted">no earlier data</span>;
  const up = k.deltaPct > 0, flat = k.deltaPct === 0; const good = k.goodWhenUp === null || flat ? null : up === k.goodWhenUp;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold", good === null ? "bg-surface2 text-muted" : good ? "bg-good/15 text-good" : "bg-bad/15 text-bad")}><Icon size={12} aria-hidden />{k.unit === "pct" ? `${up ? "+" : "−"}${Math.min(100, Math.abs(k.deltaPct))}${Math.abs(k.deltaPct) > 100 ? "+" : ""} pts` : pctText(k.deltaPct, true)}</span>;
}
export function KpiTiles({ a, fmt }: { a: Analysis; fmt: Fmt }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {a.kpis.map((k) => (
        <Card key={k.key} className="p-3 sm:p-4"><p className="text-xs text-muted">{k.label}</p>
          <p className="tabnum mt-1 text-xl font-semibold">{k.unit === "money" ? fmt(k.value) : k.unit === "pct" ? (a.current.savingsRatePct === null ? "—" : pctText(k.value)) : k.value.toLocaleString("en-IN")}</p>
          <div className="mt-1.5"><Delta k={k} /></div></Card>
      ))}
    </div>
  );
}

const Section = ({ icon: Icon, title, hint, children, className }: { icon: typeof Flame; title: string; hint?: string; children: ReactNode; className?: string }) => (
  <Card className={cn("h-full", className)}><h2 className="flex items-center gap-2 font-medium"><span className="grid h-7 w-7 place-items-center rounded-lg bg-brand/12 text-brand"><Icon size={15} aria-hidden /></span>{title}</h2>{hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}<div className="mt-3">{children}</div></Card>
);

/** The headline card: health ring, one-sentence verdict, wins and the score breakdown. */
export function AnalysisHero({ a, fmt, periodLabel, badge }: { a: Analysis; fmt: Fmt; periodLabel: string; badge?: ReactNode }) {
  return (
    <section className="relative isolate overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(135deg,#1e1b4b,#312e81_55%,#4338ca)] p-5 text-white shadow-xl shadow-indigo-900/20 sm:p-7" aria-label="Financial health summary">
      <div className="pointer-events-none absolute -right-16 -top-20 -z-10 h-64 w-64 rounded-full bg-emerald-400/20 blur-3xl" aria-hidden /><div className="pointer-events-none absolute -bottom-24 left-10 -z-10 h-64 w-64 rounded-full bg-fuchsia-400/20 blur-3xl" aria-hidden />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
        <div className="flex items-center gap-5"><div className="text-white [&_circle:first-child]:stroke-white"><HealthRing score={a.health.score} label={a.health.label} /></div></div>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-wide text-indigo-200"><HeartPulse size={14} aria-hidden />Financial health · {periodLabel}{badge}</p>
          <h2 className="mt-1 text-xl font-semibold leading-snug sm:text-2xl">{a.headline}</h2>
          {a.wins.length > 0 && <ul className="mt-3 grid gap-1.5 text-sm text-indigo-50">{a.wins.slice(0, 3).map((w) => <li key={w} className="flex items-start gap-2"><span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-emerald-400/90 text-[10px] font-bold text-emerald-950">✓</span>{w}</li>)}</ul>}
        </div>
        <ul className="grid min-w-0 gap-2 text-xs lg:w-72" aria-label="Score breakdown">{a.health.parts.map((p) => (
          <li key={p.label}><div className="flex justify-between gap-2"><span className="text-indigo-100">{p.label}</span><span className="tabnum font-semibold">{p.score}/{p.max}</span></div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-gradient-to-r from-sky-300 to-emerald-300" style={{ width: `${(p.score / p.max) * 100}%` }} /></div>
            <p className="mt-0.5 text-[11px] text-indigo-200/80">{p.note}</p></li>))}</ul>
      </div>
      <span className="sr-only">Total spending {fmt(a.current.netExpenseMinor)}</span>
    </section>
  );
}

export function ForecastCard({ a, fmt }: { a: Analysis; fmt: Fmt }) {
  const f = a.forecast;
  return (
    <Section icon={TrendingUp} title="Where this period is heading" hint="An estimate from your daily pace so far — not a guarantee.">
      {!f ? <p className="text-sm text-muted">A forecast appears while a week-or-longer period is still running and you have at least 3 days of spending.</p> : (() => {
        const max = Math.max(f.projectedExpenseMinor, f.previousMinor, 1); const w = (v: number) => `${Math.max(2, Math.round((v / max) * 100))}%`;
        return <div className="grid gap-3 text-sm">
          <p className="tabnum text-3xl font-semibold">{fmt(f.projectedExpenseMinor)}<span className="ml-2 text-sm font-normal text-muted">projected spend</span></p>
          {([["Spent so far", f.spentMinor, "bg-indigo-500"], ["Projected", f.projectedExpenseMinor, "bg-gradient-to-r from-indigo-500 to-fuchsia-500"], ["Previous period", f.previousMinor, "bg-slate-400"]] as const).map(([l, v, c]) => (
            <div key={l}><div className="flex justify-between text-xs"><span className="text-muted">{l}</span><span className="tabnum font-medium">{fmt(v)}</span></div><div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface2"><div className={cn("h-full rounded-full", c)} style={{ width: w(v) }} /></div></div>))}
          <p className="text-xs text-muted">{f.remainingDays} days left · {fmt(f.perDayMinor)} a day{f.vsPreviousPct !== null && <> · <b className={f.vsPreviousPct > 0 ? "text-bad" : "text-good"}>{pctText(f.vsPreviousPct, true)}</b> vs the previous period</>}</p></div>; })()}
    </Section>
  );
}

export function SpendPace({ a }: { a: Analysis }) {
  return (
    <Section icon={Flame} title="Spending pace" hint="Running total, this period versus the previous one.">
      <CumulativeChart data={a.cumulative} />
    </Section>
  );
}

export function WeekdayBars({ a, fmt }: { a: Analysis; fmt: Fmt }) {
  const max = Math.max(...a.weekday.map((w) => w.avgMinor), 1);
  return (
    <Section icon={CalendarDays} title="Which days you spend" hint={a.peakWeekday ? `${a.peakWeekday} is your costliest day${a.weekendSharePct !== null ? ` · ${a.weekendSharePct}% of spending is on weekends` : ""}.` : undefined}>
      {!a.weekday.length ? <p className="text-sm text-muted">Needs at least a week of data.</p> : (
        <div className="flex h-40 items-end gap-2" role="img" aria-label="Average spending by weekday">{a.weekday.map((w) => (
          <div key={w.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${w.label}: ${fmt(w.avgMinor)} on average`}>
            <span className="tabnum text-[10px] text-muted">{w.avgMinor ? fmt(w.avgMinor).replace(/\.\d+$/, "") : ""}</span>
            <div className={cn("w-full rounded-t-lg", w.label === a.peakWeekday ? "bg-gradient-to-t from-rose-500 to-orange-400 shadow-[0_0_14px_rgba(244,63,94,0.5)]" : "bg-gradient-to-t from-indigo-500/80 to-sky-400/80")} style={{ height: `${Math.max(3, (w.avgMinor / max) * 100)}%` }} />
            <span className="text-xs font-medium">{w.label}</span></div>))}</div>)}
    </Section>
  );
}

export function Movers({ a, fmt }: { a: Analysis; fmt: Fmt }) {
  const all = [...a.movers.up, ...a.movers.down]; const max = Math.max(...all.map((m) => Math.abs(m.deltaMinor)), 1);
  const row = (m: Analysis["movers"]["up"][number]) => { const up = m.deltaMinor > 0; return (
    <li key={m.id}><div className="flex justify-between gap-2 text-sm"><span className="truncate">{m.name}</span><span className={cn("tabnum shrink-0 font-medium", up ? "text-bad" : "text-good")}>{up ? "+" : "−"}{fmt(Math.abs(m.deltaMinor))}{m.deltaPct !== null && <span className="ml-1 text-xs opacity-80">({pctText(m.deltaPct, true)})</span>}</span></div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface2"><div className={cn("h-full rounded-full", up ? "bg-gradient-to-r from-orange-400 to-rose-500" : "bg-gradient-to-r from-emerald-400 to-teal-500")} style={{ width: `${Math.max(4, (Math.abs(m.deltaMinor) / max) * 100)}%` }} /></div></li>); };
  return (
    <Section icon={TrendingUp} title="What changed" hint="Biggest category moves against the previous period.">
      {!all.length ? <p className="text-sm text-muted">No category moved by more than ₹100.</p> : <div className="grid gap-4 sm:grid-cols-2">
        <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-bad">Spending more</p>{a.movers.up.length ? <ul className="grid gap-3">{a.movers.up.map(row)}</ul> : <p className="text-sm text-muted">Nothing rose.</p>}</div>
        <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-good">Spending less</p>{a.movers.down.length ? <ul className="grid gap-3">{a.movers.down.map(row)}</ul> : <p className="text-sm text-muted">Nothing fell.</p>}</div></div>}
    </Section>
  );
}

export function Anomalies({ a, fmt }: { a: Analysis; fmt: Fmt }) {
  return (
    <Section icon={AlertTriangle} title="Worth a second look" hint="Spending that is higher than usual. It is often a planned or one-off purchase, so this is only a prompt to check.">
      {!a.anomalies.length ? <p className="text-sm text-muted">Nothing stood out. Your spending looks consistent.</p> : <ul className="grid gap-2">{a.anomalies.map((x, i) => (
        <li key={i} className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden />
          <div className="min-w-0"><p className="font-medium">{x.kind === "day" ? `${fmt(x.minor)} spent in one day` : `${fmt(x.minor)} · ${x.label}`} <span className="font-normal text-muted">· {new Date(x.when + "T00:00:00Z").toLocaleDateString("en-IN", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" })}</span></p>
            <p className="text-xs text-muted">{x.kind === "day" ? `A normal day is about ${fmt(x.typicalMinor)} (rent and regular bills not counted).` : `You usually spend about ${fmt(x.typicalMinor)} in this category.`}</p></div></li>))}</ul>}
      {a.recurring.items.length > 0 && <div className="mt-4 border-t border-line pt-3"><p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"><Repeat size={13} aria-hidden />Regular payments · about {fmt(a.recurring.monthlyMinor)} a month</p>
        <ul className="mt-2 grid gap-1 text-sm">{a.recurring.items.map((r) => <li key={r.name} className="flex justify-between gap-2"><span className="truncate">{r.name}</span><span className="tabnum shrink-0 text-muted">{fmt(r.minor)} · {r.frequency}</span></li>)}</ul></div>}
    </Section>
  );
}

export function NextSteps({ a, fmt, ai }: { a: Analysis; fmt: Fmt; ai?: Insight | null }) {
  const items = ai?.actions?.length ? ai.actions.map((x) => ({ title: x.title, detail: x.detail, impactMinor: undefined as number | undefined })) : a.actions;
  return (
    <Section icon={Target} title="What to do next" hint={ai?.actions?.length ? "Suggestions from the AI, checked against your numbers." : "Suggestions based on your numbers, not financial advice."}>
      {!items.length ? <p className="text-sm text-muted">You are on track. Nothing to change right now.</p> : <ol className="grid gap-2">{items.map((x, i) => (
        <li key={x.title} className="flex gap-3 rounded-xl border border-line bg-surface/60 p-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-bold text-brandfg">{i + 1}</span>
          <div className="min-w-0"><p className="text-sm font-medium">{x.title}{x.impactMinor ? <span className="ml-2 rounded-full bg-good/15 px-2 py-0.5 text-xs font-semibold text-good">≈ {fmt(x.impactMinor)}</span> : null}</p><p className="mt-0.5 text-sm text-muted">{x.detail}</p></div></li>))}</ol>}
    </Section>
  );
}

/** The written analysis for this period, in plain words. The button only appears when AI is connected (otherwise it would just repeat what is shown). */
export function Narrative({ insight, meta, aiConfigured, range, from, to }: { insight: Insight | null; meta?: { model: string | null; fallback: boolean; at: string } | null; aiConfigured: boolean; range: string; from?: string; to?: string }) {
  const isAi = !!meta && !meta.fallback;
  return (
    <Card className="border-brand/30">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex flex-wrap items-center gap-2 font-medium"><span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white"><Sparkles size={15} aria-hidden /></span>Your analysis in plain words
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", isAi ? "bg-info/15 text-info" : "bg-surface2 text-muted")}>{isAi ? `Written by AI · ${meta?.model}` : "Smart analysis"}</span></h2>
        {aiConfigured && <ActionForm action={runAnalysis} submit={isAi ? "Refresh AI summary" : "Write AI summary"} variant="outline" compact>
          <input type="hidden" name="range" value={range} />{from && <input type="hidden" name="from" value={from} />}{to && <input type="hidden" name="to" value={to} />}</ActionForm>}
      </div>
      {!insight ? <p className="mt-3 text-sm text-muted">Nothing to analyse yet. Add some transactions first.</p> : (
        <div className="mt-3 grid gap-5">
          <div>{insight.headline && <p className="text-lg font-semibold leading-snug">{insight.headline}</p>}<p className="mt-1 text-sm text-muted">{insight.summary}</p></div>
          <div className="grid gap-5 md:grid-cols-2">
            {insight.highlights.length > 0 && <div><h3 className="text-sm font-semibold text-brand">The key facts</h3><p className="text-xs text-muted">What your numbers say.</p>
              <ul className="mt-2 grid gap-2 text-sm">{insight.highlights.map((x) => <li key={x} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />{x}</li>)}</ul></div>}
            {insight.review.length > 0 && <div><h3 className="text-sm font-semibold text-amber-600 dark:text-amber-300">Worth a second look</h3><p className="text-xs text-muted">Higher than usual. Often just a planned purchase, so only check if it surprises you.</p>
              <ul className="mt-2 grid gap-2 text-sm">{insight.review.map((x) => <li key={x} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />{x}</li>)}</ul></div>}
          </div>
          {insight.forecast && <div className="rounded-xl bg-brand/8 px-4 py-3 text-sm"><p className="font-semibold">Looking ahead</p><p className="mt-0.5">{insight.forecast}</p></div>}
          <p className="text-xs text-muted">{isAi && meta?.at ? `Written ${meta.at}. ` : ""}Forecasts and suggestions are estimates, not financial advice.</p>
        </div>)}
    </Card>
  );
}

/** Analytics is the numbers; this teaser points to the written report on the AI analysis page. */
export function AiTeaser({ a, href }: { a: Analysis; href: string }) {
  const b = band(a.health.score);
  return (
    <Link href={href} className="glass group flex flex-wrap items-center gap-4 rounded-2xl p-4 transition hover:border-brand/60 sm:p-5">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-lg font-bold text-white" style={{ background: b.c, boxShadow: `0 0 14px ${b.c}88` }}>{a.health.score}</span>
      <span className="min-w-0 flex-1"><span className="block text-xs font-semibold uppercase tracking-wide text-muted">Financial health · {a.health.label}</span><span className="block font-medium leading-snug">{a.headline}</span></span>
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-3 py-2 text-sm font-medium text-white shadow-sm transition group-hover:brightness-110"><Sparkles size={15} aria-hidden />Read the AI analysis →</span>
    </Link>
  );
}

/** Suggested follow-up questions that open the assistant with the question already typed. */
export function AskFollowUp({ questions }: { questions: string[] }) {
  return (
    <Section icon={Sparkles} title="Ask a follow-up" hint="Tap a question to ask the AI assistant about your own records.">
      <div className="flex flex-wrap gap-2">{questions.map((q) => <Link key={q} href={`/ai/assistant?q=${encodeURIComponent(q)}`} className="rounded-full border border-brand/40 bg-brand/8 px-3 py-1.5 text-sm text-brand transition hover:bg-brand/15">{q}</Link>)}</div>
    </Section>
  );
}

export function SeeCharts({ href }: { href: string }) {
  return <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"><TrendingUp size={15} aria-hidden />See the charts and tables behind this in Analytics →</Link>;
}
