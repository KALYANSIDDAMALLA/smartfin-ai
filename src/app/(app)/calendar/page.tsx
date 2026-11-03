import Link from "next/link";
import { CalendarClock, ChevronLeft, ChevronRight, Flag, History, Landmark, PartyPopper, PencilLine, Repeat, Trash2 } from "lucide-react";
import { requireUser } from "@/lib/server/auth";
import { loadCalendar, type CalEvent } from "@/lib/server/calendar";
import { deleteDraft } from "@/app/actions/drafts";
import { ConfirmAction } from "@/components/confirm-action";
import { localDate, formatYmd } from "@/lib/finance/dates";
import { monthName } from "@/lib/finance/calendar";
import { FESTIVAL_YEARS, KIND_LABEL, bankClosed, holidaysOn, monthStats, upcomingHolidays, type HolidayKind } from "@/lib/finance/holidays";
import { formatMoney } from "@/lib/finance/money";
import { Badge, Card, PageHeader, Select } from "@/components/ui";
import { cn } from "@/components/ui";

export const metadata = { title: "Calendar & drafts" };
const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });
const short = (minor: number) => "₹" + compact.format(Math.abs(minor) / 100);
const ICON = { recurring: Repeat, goal: Flag, draft: PencilLine } as const;
const DOT = { recurring: "bg-info", goal: "bg-warn", draft: "bg-brand" } as const;
// Holiday colours: government = saffron, festival = rose, regional = teal, observance = slate.
const HOL: Record<HolidayKind, string> = { govt: "bg-amber-500/15 text-amber-700 dark:text-amber-300", festival: "bg-rose-500/15 text-rose-700 dark:text-rose-300", regional: "bg-teal-500/15 text-teal-700 dark:text-teal-300", observance: "bg-slate-500/15 text-slate-600 dark:text-slate-300" };
const HDOT: Record<HolidayKind, string> = { govt: "bg-amber-500", festival: "bg-rose-500", regional: "bg-teal-500", observance: "bg-slate-400" };
const LAYERS: { key: string; label: string; kind?: HolidayKind }[] = [{ key: "g", label: "Govt holidays", kind: "govt" }, { key: "f", label: "Festivals", kind: "festival" }, { key: "r", label: "Regional", kind: "regional" }, { key: "o", label: "Observances", kind: "observance" }, { key: "b", label: "Bank closures" }];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const when = (n: number) => (n === 0 ? "Today" : n === 1 ? "Tomorrow" : `in ${n} days`);

function EventRow({ e, m }: { e: CalEvent; m: (v: number) => string }) {
  const Icon = ICON[e.kind]; const closed = e.kind === "recurring" && !e.overdue ? bankClosed(e.ymd) : { closed: false }; // a bill due on a bank holiday is easy to miss
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-lg border border-line/70 px-3 py-2 text-sm">
      <Icon size={14} className="shrink-0 text-muted" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{e.title}{e.amountMinor != null && <span className="tabnum text-muted"> · {m(e.amountMinor)}</span>}</span>
      <span className="text-xs text-muted">{formatYmd(e.ymd)}</span>
      {e.overdue && <Badge tone="bad">{e.kind === "draft" ? "past date" : "overdue"}</Badge>}
      {closed.closed && <span title={`Banks are closed (${closed.reason}). Pay a day early.`}><Badge tone="warn">bank holiday</Badge></span>}
      {e.kind === "recurring" && <Link href="/repayments" className="tap text-xs text-brand underline">Open</Link>}
      {e.kind === "goal" && <Link href="/goals" className="tap text-xs text-brand underline">Open</Link>}
      {e.kind === "draft" && <><Link href={`${e.draftType === "income" ? "/income" : "/expenses/new"}?draft=${e.id}`} className="text-xs font-medium text-brand underline">Finish</Link>
        <ConfirmAction bare action={deleteDraft} fields={{ id: e.id ?? "" }} label={`Delete draft ${e.title}`} className="rounded p-1 text-muted hover:text-bad" confirm={`Delete the draft “${e.title}”?`} success="Draft deleted."><Trash2 size={14} /></ConfirmAction></>}
    </li>
  );
}

import { SummaryLine } from "@/components/summary-line";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string; d?: string; month?: string; year?: string; show?: string }> }) {
  const sp0 = await searchParams; const sp = { ...sp0, m: sp0.month && sp0.year && /^\d{4}$/.test(sp0.year) && /^(0?[1-9]|1[0-2])$/.test(sp0.month) ? `${sp0.year}-${sp0.month.padStart(2, "0")}` : sp0.m }; // "Jump to" form sends month + year
  const { supabase, profile } = await requireUser(); const tz = profile.timezone;
  const c = await loadCalendar(supabase, tz, sp); const m = (v: number) => formatMoney(v, profile.currency);
  const dayRows = c.rows.filter((r) => localDate(r.occurred_at, tz) === c.sel);
  const dayEvents = c.byDay[c.sel] ?? []; const dt = c.totals[c.sel];
  const show = new Set((sp0.show ?? "gfrb").split("")); const kinds = LAYERS.filter((l) => l.kind && show.has(l.key)).map((l) => l.kind!);
  const showParam = [...show].join(""); const nav = (ym: string) => `/calendar?m=${ym}&show=${showParam}`;
  const toggle = (key: string) => { const n = new Set(show); if (n.has(key)) n.delete(key); else n.add(key); return `/calendar?m=${c.ym}&d=${c.sel}&show=${[...n].join("") || "x"}`; };
  const stats = monthStats(c.ym); const selHolidays = holidaysOn(c.sel); const selBank = bankClosed(c.sel); const upHol = upcomingHolidays(c.today, 6, kinds.length ? kinds : ["govt"]);
  const year = Number(c.ym.slice(0, 4)); const years = Array.from({ length: 5 }, (_, i) => year - 2 + i);
  return (
    <>
      <PageHeader title="Calendar & drafts" desc={<SummaryLine pill={new Date(c.ym + "-01T00:00:00Z").toLocaleDateString("en-IN", { timeZone: "UTC", month: "long", year: "numeric" })} items={[`${m(c.month.incomeMinor)} in · ${m(c.month.expenseMinor)} out`, `${c.upcoming.length} coming up`, c.upcoming.some((e) => e.overdue) && `${c.upcoming.filter((e) => e.overdue).length} overdue`, c.unscheduled.length > 0 && `${c.unscheduled.length} draft${c.unscheduled.length === 1 ? "" : "s"} to schedule`]} />} action={
        <div className="flex flex-wrap items-center gap-2">
          <Link href={nav(c.prev)} aria-label="Previous month" className="icon-btn"><ChevronLeft size={18} /></Link>
          <Link href={`/calendar?m=${c.today.slice(0, 7)}&d=${c.today}&show=${showParam}`} className="inline-flex h-10 items-center rounded-xl border border-line px-3 text-sm hover:bg-surface2/60">Today</Link>
          <Link href={nav(c.next)} aria-label="Next month" className="icon-btn"><ChevronRight size={18} /></Link>
          <form action="/calendar" className="flex items-center gap-2"><input type="hidden" name="show" value={showParam} />
            <Select name="month" defaultValue={c.ym.slice(5)} aria-label="Month" className="w-36">{MONTHS.map((n, i) => <option key={n} value={String(i + 1).padStart(2, "0")}>{n}</option>)}</Select>
            <Select name="year" defaultValue={String(year)} aria-label="Year" className="w-24">{years.map((y) => <option key={y} value={String(y)}>{y}</option>)}</Select>
            <button className="inline-flex h-10 items-center rounded-xl bg-brand px-3 text-sm font-medium text-brandfg">Go</button></form>
        </div>} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">{monthName(c.ym)}</h2>
            <p className="text-sm text-muted">Income <b className="text-good">{m(c.month.incomeMinor)}</b> · Net spending <b>{m(c.month.expenseMinor)}</b> · {c.month.days} active day{c.month.days === 1 ? "" : "s"}</p>
          </div>
          <p className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted"><span><b className="text-fg">{stats.working}</b> bank working days</span><span><b className="text-fg">{stats.closed}</b> bank-closed days</span><span><b className="text-amber-600 dark:text-amber-300">{stats.govt}</b> government holiday{stats.govt === 1 ? "" : "s"}</span><span><b className="text-rose-600 dark:text-rose-300">{stats.festivals}</b> festival{stats.festivals === 1 ? "" : "s"}</span></p>
          <div role="group" aria-label="Show on calendar" className="mb-3 flex flex-wrap gap-1.5">
            {LAYERS.map((l) => { const on = show.has(l.key); return <Link key={l.key} href={toggle(l.key)} aria-pressed={on} className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition", on ? "border-brand/50 bg-brand/10 text-brand" : "border-line text-muted hover:border-brand/40")}><span className={cn("h-2 w-2 rounded-full", l.kind ? HDOT[l.kind] : "bg-surface2 ring-1 ring-line")} />{l.label}</Link>; })}
          </div>
          <div role="grid" aria-label={`${monthName(c.ym)} calendar`} className="grid grid-cols-7 gap-1 text-xs">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} role="columnheader" className="px-1 pb-1 text-center font-medium text-muted">{d}</div>)}
            {c.grid.flat().map(({ ymd, inMonth }) => {
              const t = c.totals[ymd]; const ev = c.byDay[ymd] ?? []; const isSel = ymd === c.sel; const isToday = ymd === c.today;
              const hol = holidaysOn(ymd).filter((h) => kinds.includes(h.kind)); const closed = show.has("b") && bankClosed(ymd).closed;
              return (
                <Link key={ymd} role="gridcell" href={`/calendar?m=${c.ym}&d=${ymd}`} aria-current={isToday ? "date" : undefined} aria-selected={isSel}
                  aria-label={`${formatYmd(ymd)}${hol.length ? `, ${hol.map((h) => h.name).join(", ")}` : ""}${t ? `, spent ${m(t.expenseMinor)}, income ${m(t.incomeMinor)}` : ""}${ev.length ? `, ${ev.length} event${ev.length > 1 ? "s" : ""}` : ""}`}
                  className={cn("flex min-h-[4.5rem] flex-col rounded-lg border p-1.5 transition hover:border-brand/60 hover:bg-brand/5 sm:min-h-[6.5rem]", inMonth ? "border-line/70" : "border-transparent opacity-45", closed && inMonth && "bg-surface2/60", hol.some((h) => h.kind === "govt") && inMonth && "border-amber-500/40", isSel && "border-brand bg-brand/10 ring-1 ring-brand/40")}>
                  <span className="flex items-center justify-between"><span className={cn("grid h-5 w-5 place-items-center rounded-full text-[11px] font-medium", isToday && "bg-brand text-brandfg", !isToday && closed && "text-bad/80")}>{Number(ymd.slice(8))}</span>{hol.length > 0 && <span className="flex gap-0.5 sm:hidden">{hol.slice(0, 3).map((h, i) => <span key={i} className={cn("h-1.5 w-1.5 rounded-full", HDOT[h.kind])} />)}</span>}</span>
                  {hol.length > 0 && <span className="mt-0.5 hidden gap-0.5 sm:grid">{hol.slice(0, 2).map((h, i) => <span key={i} title={`${h.name} — ${KIND_LABEL[h.kind]}`} className={cn("block truncate rounded px-1 text-[10px] font-medium leading-4", HOL[h.kind])}>{h.name}</span>)}{hol.length > 2 && <span className="px-1 text-[10px] text-muted">+{hol.length - 2} more</span>}</span>}
                  {t && <span className="mt-auto hidden leading-tight sm:block">{t.expenseMinor !== 0 && <span className="tabnum block text-bad">−{short(t.expenseMinor)}</span>}{t.incomeMinor > 0 && <span className="tabnum block text-good">+{short(t.incomeMinor)}</span>}</span>}
                  {t && <span className="mt-auto flex gap-0.5 sm:hidden">{t.expenseMinor > 0 && <span className="h-1.5 w-1.5 rounded-full bg-bad" />}{t.incomeMinor > 0 && <span className="h-1.5 w-1.5 rounded-full bg-good" />}</span>}
                  {ev.length > 0 && <span className="mt-1 flex flex-wrap gap-0.5">{ev.slice(0, 4).map((e, i) => <span key={i} className={cn("h-1.5 w-1.5 rounded-full", DOT[e.kind])} />)}</span>}
                </Link>
              );
            })}
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-bad" />spent</span><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-good" />income</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-info" />recurring due</span><span><span className="mr-1 inline-block h-3 w-3 rounded bg-surface2 ring-1 ring-line" />banks closed</span><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-warn" />goal target</span><span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-brand" />draft</span>
            <span>Transfers and adjustments aren&apos;t counted.</span>
          </p>
          <p className="mt-2 text-xs text-muted">Government holidays follow the Central Government list; banks also close on every Sunday and the 2nd and 4th Saturday (RBI). Lunar festival dates can shift by a day with moon sighting or by state — check the official notice.{FESTIVAL_YEARS.includes(year) ? "" : ` Festival dates for ${year} aren't loaded yet — only fixed national days are shown.`}</p>
        </Card>

        <div className="grid content-start gap-6">
          <Card>
            <h2 className="font-medium">{c.selLabel}</h2>
            <p className="mt-0.5 text-sm text-muted">{dt ? <>Spent <b className="text-fg">{m(dt.expenseMinor)}</b> · Income <b className="text-good">{m(dt.incomeMinor)}</b></> : "No income or spending recorded."}</p>
            {(selHolidays.length > 0 || selBank.closed) && <ul className="mt-3 grid gap-1.5">
              {selHolidays.map((h) => <li key={h.name} className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium", HOL[h.kind])}><PartyPopper size={15} aria-hidden /><span className="min-w-0 flex-1">{h.name}</span><span className="text-xs font-normal opacity-80">{KIND_LABEL[h.kind]}</span></li>)}
              {selBank.closed && <li className="flex items-center gap-2 rounded-lg border border-line/70 px-3 py-2 text-sm"><Landmark size={15} className="text-muted" aria-hidden />Banks closed <span className="text-muted">· {selBank.reason}</span></li>}
            </ul>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/expenses/new?date=${c.sel}`} className="rounded-lg bg-brand px-3 py-2.5 text-xs font-medium text-brandfg sm:py-1.5">Add expense</Link>
              <Link href={`/income?date=${c.sel}`} className="rounded-lg border border-line px-3 py-2.5 text-xs font-medium hover:bg-surface2/60 sm:py-1.5">Add income</Link>
            </div>
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-surface2/50 px-3 py-2 text-xs text-muted"><History size={14} className="mt-0.5 shrink-0" aria-hidden /><span><b className="text-fg">On this day last year</b> ({formatYmd(c.lastYear.date)}): {c.lastYear.totals ? <>spent <b className="text-fg">{m(c.lastYear.totals.expenseMinor)}</b>, income <b className="text-good">{m(c.lastYear.totals.incomeMinor)}</b> · {c.lastYear.totals.count} transaction{c.lastYear.totals.count === 1 ? "" : "s"}</> : "nothing recorded."}</span></p>
            {dayEvents.length > 0 && <><h3 className="mb-1 mt-4 text-xs font-medium uppercase tracking-wide text-muted">Due & planned</h3><ul className="grid gap-1.5">{dayEvents.map((e, i) => <EventRow key={i} e={e} m={m} />)}</ul></>}
            {dayRows.length > 0 && <><h3 className="mb-1 mt-4 text-xs font-medium uppercase tracking-wide text-muted">Transactions ({dayRows.length})</h3>
              <ul className="grid max-h-80 gap-1 overflow-y-auto text-sm">{dayRows.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 border-b border-line/50 py-1.5"><span className="min-w-0 truncate">{r.name ?? r.merchant ?? r.type}{(r.type === "transfer" || r.type === "adjustment") && <span className="ml-1 text-xs text-muted">({r.type})</span>}</span>
                  <span className={cn("tabnum shrink-0", (r.type === "income" || r.type === "refund") && "text-good")}>{r.type === "income" || r.type === "refund" ? "+" : ""}{m(Number(r.amount_minor))}</span></li>))}</ul></>}
          </Card>

          <Card>
            <h2 className="flex items-center gap-2 font-medium"><PartyPopper size={16} className="text-brand" aria-hidden />Upcoming holidays & festivals</h2>
            {upHol.length ? <ul className="mt-3 grid gap-1.5">{upHol.map((h) => (
              <li key={h.date + h.name}><Link href={`/calendar?m=${h.date.slice(0, 7)}&d=${h.date}&show=${showParam}`} className="flex items-center gap-2.5 rounded-lg border border-line/70 px-3 py-2 text-sm transition hover:border-brand/50">
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", HDOT[h.kind])} /><span className="min-w-0 flex-1"><span className="block truncate">{h.name}</span><span className="block text-xs text-muted">{formatYmd(h.date)} · {new Date(h.date + "T00:00:00Z").toLocaleDateString("en-IN", { timeZone: "UTC", weekday: "short" })}</span></span>
                <span className="shrink-0 text-xs font-medium text-muted">{when(h.inDays)}</span></Link></li>))}</ul> : <p className="mt-3 text-sm text-muted">No upcoming holidays for the selected layers.</p>}
          </Card>

          <Card>
            <h2 className="flex items-center gap-2 font-medium"><CalendarClock size={16} className="text-brand" aria-hidden />Upcoming & overdue</h2>
            <p className="mt-0.5 text-xs text-muted">Next 30 days, plus anything past its date.</p>
            {c.upcoming.length ? <ul className="mt-3 grid gap-1.5">{c.upcoming.slice(0, 12).map((e, i) => <EventRow key={i} e={e} m={m} />)}</ul> : <p className="mt-3 text-sm text-muted">Nothing due in the next 30 days.</p>}
          </Card>

          <Card>
            <h2 className="flex items-center gap-2 font-medium"><PencilLine size={16} className="text-brand" aria-hidden />Drafts without a date</h2>
            {c.unscheduled.length ? <ul className="mt-3 grid gap-1.5">{c.unscheduled.map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded-lg border border-line/70 px-3 py-2 text-sm"><span className="min-w-0 flex-1 truncate">{d.name ?? d.merchant ?? "Untitled draft"}{d.amount_minor != null && <span className="tabnum text-muted"> · {m(Number(d.amount_minor))}</span>}</span>
                <Link href={`${d.type === "income" ? "/income" : "/expenses/new"}?draft=${d.id}`} className="text-xs font-medium text-brand underline">Finish</Link>
                <ConfirmAction bare action={deleteDraft} fields={{ id: d.id }} label={`Delete draft ${d.name ?? ""}`} className="rounded p-1 text-muted hover:text-bad" confirm={`Delete the draft “${d.name ?? d.merchant ?? "Untitled"}”?`} success="Draft deleted."><Trash2 size={14} /></ConfirmAction></li>))}</ul>
              : <p className="mt-3 text-sm text-muted">No undated drafts. Use <b>Save as draft</b> on the Add expense or Income form.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
